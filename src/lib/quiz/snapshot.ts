import { z } from 'zod';
import type { Catalog, CatalogQuestion } from '../content/catalog';
import { OPTION_ID_RE, SLUG_RE, type Option } from '../content/schema';
import { SETTINGS_BOUNDS } from '../settings/schema';
import { isAnswered, type Answer, type AnswerMap } from './score';
import type { QuizQuestion } from './select';
import { QUIZ_MODES, SESSION_ID_RE, type SessionData } from './state';
import { remainingMs } from './timer';

/** What is stored for a test in progress: ids and positions only. Question text always comes from the catalog. */

export const SNAPSHOT_VERSION = 1;

const MAX_QUESTIONS = 100;
const MAX_OPTIONS = 8;
const MAX_TIMER_MS = SETTINGS_BOUNDS.timerMinutes.max * 60_000;
/** A test left open for a week is already stranger than any stored value should be. */
const MAX_ELAPSED_MS = 7 * 24 * 3_600_000;

const slug = z.string().max(64).regex(SLUG_RE);
const optionId = z.string().regex(OPTION_ID_RE);
const answer = z.union([z.boolean(), z.array(optionId).max(MAX_OPTIONS)]);

// A `__proto__` key would be dropped silently by the record below; refuse the whole snapshot instead.
const answers = z
  .unknown()
  .refine((value) => typeof value !== 'object' || value === null || !Object.hasOwn(value, '__proto__'), 'forbidden key')
  .pipe(z.record(slug, answer))
  .refine((value) => Object.keys(value).length <= MAX_QUESTIONS, 'too many answers');

export const snapshotSchema = z.strictObject({
  version: z.literal(SNAPSHOT_VERSION),
  id: z.string().regex(SESSION_ID_RE),
  mode: z.enum(QUIZ_MODES),
  questions: z
    .array(z.strictObject({ id: slug, options: z.array(optionId).max(MAX_OPTIONS) }))
    .min(1)
    .max(MAX_QUESTIONS),
  answers,
  current: z
    .number()
    .int()
    .min(0)
    .max(MAX_QUESTIONS - 1),
  flagged: z.array(slug).max(MAX_QUESTIONS),
  revealed: z.array(slug).max(MAX_QUESTIONS),
  timerMinutes: z.number().int().min(SETTINGS_BOUNDS.timerMinutes.min).max(SETTINGS_BOUNDS.timerMinutes.max),
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
  elapsedMs: z.number().int().min(0).max(MAX_ELAPSED_MS),
  remainingMs: z.number().int().min(0).max(MAX_TIMER_MS).nullable(),
  savedAt: z.number().int().min(0),
});

export type Snapshot = z.infer<typeof snapshotSchema>;

export type RestoreFailure = 'none' | 'invalid' | 'emptied';

export type RestoreResult = { session: SessionData; droppedQuestions: number } | { session: null; reason: RestoreFailure };

/** The storable form of a running test. Time is stored as elapsed and remaining so a pause does not eat into it. */
export function toSnapshot(session: SessionData, now: number): Snapshot {
  const ids = new Set(session.questions.map((entry) => entry.question.id));
  const answers: Snapshot['answers'] = {};

  for (const entry of session.questions) {
    const value = Object.hasOwn(session.answers, entry.question.id) ? session.answers[entry.question.id] : undefined;

    if (!isAnswered(value)) continue;

    answers[entry.question.id] = typeof value === 'boolean' ? value : [...(value as string[])];
  }

  return {
    version: SNAPSHOT_VERSION,
    id: session.id,
    mode: session.mode,
    questions: session.questions.map((entry) => ({ id: entry.question.id, options: entry.options.map((option) => option.id) })),
    answers,
    current: session.current,
    flagged: session.flagged.filter((id) => ids.has(id)),
    revealed: session.revealed.filter((id) => ids.has(id)),
    timerMinutes: session.timerMinutes,
    shuffleQuestions: session.shuffleQuestions,
    shuffleOptions: session.shuffleOptions,
    elapsedMs: Math.min(MAX_ELAPSED_MS, Math.max(0, Math.floor(now - session.startedAt))),
    remainingMs: session.deadline === null ? null : Math.floor(remainingMs(session.deadline, now)),
    savedAt: Math.floor(now),
  };
}

/** Stored options that still exist, in their stored order, then options added since, in catalog order. */
function arrangeOptions(question: CatalogQuestion, storedIds: readonly string[]): Option[] {
  if (question.type === 'true-false') return [];

  const byId = new Map(question.options.map((option) => [option.id, option]));
  const placed = new Set<string>();
  const arranged: Option[] = [];

  for (const id of storedIds) {
    const option = byId.get(id);

    if (!option || placed.has(id)) continue;

    placed.add(id);
    arranged.push(option);
  }

  for (const option of question.options) {
    if (!placed.has(option.id)) arranged.push(option);
  }

  return arranged;
}

/** The stored answer if it still fits the question as it is now; otherwise undefined. */
function fittingAnswer(question: CatalogQuestion, stored: boolean | string[] | undefined): Answer | undefined {
  if (stored === undefined) return undefined;

  if (question.type === 'true-false') return typeof stored === 'boolean' ? stored : undefined;
  if (typeof stored === 'boolean' || stored.length === 0) return undefined;

  const ids = new Set(question.options.map((option) => option.id));
  const chosen = [...new Set(stored)];

  if (!chosen.every((id) => ids.has(id))) return undefined;
  if (question.type === 'single' && chosen.length !== 1) return undefined;

  return chosen;
}

/**
 * A running test rebuilt from untrusted stored data and the current catalog. Questions that are gone are dropped
 * (and counted), options and answers that no longer fit are dropped, and the clock restarts from the stored
 * elapsed and remaining time as of `now`.
 */
export function restoreSnapshot(raw: unknown, catalog: Catalog, now: number): RestoreResult {
  if (raw === null || raw === undefined) return { session: null, reason: 'none' };

  const parsed = snapshotSchema.safeParse(raw);

  if (!parsed.success) return { session: null, reason: 'invalid' };

  const stored = parsed.data;
  const known = new Map(catalog.questions.map((question) => [question.id, question]));
  const seen = new Set<string>();
  const questions: QuizQuestion[] = [];
  let before = 0;
  let dropped = 0;

  stored.questions.forEach((entry, index) => {
    const question = known.get(entry.id);

    if (!question || seen.has(entry.id)) {
      dropped += 1;

      return;
    }

    seen.add(entry.id);
    if (index < stored.current) before += 1;
    questions.push({ question, options: arrangeOptions(question, entry.options) });
  });

  if (questions.length === 0) return { session: null, reason: 'emptied' };

  const answers: AnswerMap = {};
  const kept = new Set<string>();

  for (const { question } of questions) {
    const fitting = fittingAnswer(question, Object.hasOwn(stored.answers, question.id) ? stored.answers[question.id] : undefined);

    if (fitting !== undefined) answers[question.id] = fitting;
    kept.add(question.id);
  }

  const timed = stored.mode === 'exam' && stored.remainingMs !== null;
  const session: SessionData = {
    id: stored.id,
    mode: stored.mode,
    phase: 'running',
    questions,
    answers,
    current: Math.min(before, questions.length - 1),
    startedAt: now - stored.elapsedMs,
    deadline: timed ? now + (stored.remainingMs as number) : null,
    endedAt: 0,
    expired: false,
    timerMinutes: stored.mode === 'practice' ? 0 : stored.timerMinutes,
    shuffleQuestions: stored.shuffleQuestions,
    shuffleOptions: stored.shuffleOptions,
    flagged: [...new Set(stored.flagged)].filter((id) => kept.has(id)),
    // A check only counts while its answer survived; practice is the only mode with checks.
    revealed: stored.mode === 'practice' ? [...new Set(stored.revealed)].filter((id) => kept.has(id) && Object.hasOwn(answers, id)) : [],
  };

  return { session, droppedQuestions: dropped };
}
