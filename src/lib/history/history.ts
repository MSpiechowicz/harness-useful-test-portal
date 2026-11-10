import { z } from 'zod';
import { SLUG_RE } from '../content/schema';
import type { Score } from '../quiz/score';
import { QUIZ_MODES, SESSION_ID_RE, type QuizMode } from '../quiz/state';
import { SETTINGS_BOUNDS } from '../settings/schema';

export const HISTORY_VERSION = 1;
export const HISTORY_LIMIT = 200;
/** Kept well under the 2 MiB the storage accepts, so a save never fails for size. */
export const HISTORY_BUDGET_BYTES = 1_500_000;

const MAX_QUESTIONS = 100;
/** A test left open for a week is already stranger than any stored value should be. */
const MAX_DURATION_MS = 7 * 24 * 3_600_000;

const slug = z.string().max(64).regex(SLUG_RE);
const count = z.number().int().min(0).max(MAX_QUESTIONS);
const total = z.number().int().min(1).max(MAX_QUESTIONS);

export const historyEntrySchema = z
  .strictObject({
    id: z.string().regex(SESSION_ID_RE),
    // The largest time a Date can hold: anything later cannot be shown.
    finishedAt: z.number().int().min(0).max(8_640_000_000_000_000),
    mode: z.enum(QUIZ_MODES),
    correct: count,
    total,
    durationMs: z.number().int().min(0).max(MAX_DURATION_MS),
    expired: z.boolean(),
    timerMinutes: z.number().int().min(SETTINGS_BOUNDS.timerMinutes.min).max(SETTINGS_BOUNDS.timerMinutes.max),
    topics: z.array(z.strictObject({ topic: slug, correct: count, total })).max(MAX_QUESTIONS),
    questions: z.array(z.strictObject({ id: slug, topic: slug, correct: z.boolean() })).max(MAX_QUESTIONS),
  })
  .refine((entry) => entry.correct <= entry.total, 'more correct answers than questions')
  .refine((entry) => entry.topics.every((topic) => topic.correct <= topic.total), 'more correct answers than questions in a topic');

/** One finished test. The percentage is not stored: `entryPercent` derives it. */
export type HistoryEntry = z.infer<typeof historyEntrySchema>;

export interface ParsedHistory {
  /** Newest first, without duplicate ids, at most `HISTORY_LIMIT`. */
  entries: HistoryEntry[];
  /** Stored entries that were unusable and left out. */
  dropped: number;
  /** The file is from a newer version (or not recognizable): show what can be read, but never write over it. */
  readOnly: boolean;
}

/** Whole percent, rounded half up like `scoreQuiz`. */
export function entryPercent(entry: Pick<HistoryEntry, 'correct' | 'total'>): number {
  return entry.total === 0 ? 0 : Math.round((entry.correct / entry.total) * 100);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function newestFirst(a: HistoryEntry, b: HistoryEntry): number {
  return b.finishedAt - a.finishedAt;
}

/**
 * History from untrusted stored data. Nothing stored is an empty history; entries are checked one by one so a bad
 * one never costs the rest; a version newer than this one (or a file that does not say) is read-only.
 */
export function parseHistory(raw: unknown): ParsedHistory {
  if (raw === null || raw === undefined) return { entries: [], dropped: 0, readOnly: false };
  if (!isRecord(raw)) return { entries: [], dropped: 0, readOnly: true };

  const version = raw.version;
  const readOnly = typeof version !== 'number' || !Number.isInteger(version) || version !== HISTORY_VERSION;
  const stored = Array.isArray(raw.entries) ? (raw.entries as unknown[]) : [];
  const seen = new Set<string>();
  const entries: HistoryEntry[] = [];
  let dropped = 0;

  for (const item of stored) {
    const result = historyEntrySchema.safeParse(item);

    if (!result.success || seen.has(result.data.id)) {
      dropped += 1;

      continue;
    }

    seen.add(result.data.id);
    entries.push(result.data);
  }

  return { entries: entries.sort(newestFirst).slice(0, HISTORY_LIMIT), dropped, readOnly };
}

/** The value to store for these entries. */
export function serializeHistory(entries: readonly HistoryEntry[]): { version: number; entries: HistoryEntry[] } {
  return { version: HISTORY_VERSION, entries: [...entries] };
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

/**
 * `entry` added as the newest. An id already present leaves the history as it was. The oldest entries go once there
 * are more than `HISTORY_LIMIT` or the stored size would pass `HISTORY_BUDGET_BYTES`; the new entry always stays.
 */
export function appendEntry(entries: readonly HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  if (entries.some((existing) => existing.id === entry.id)) return [...entries];

  const kept = [entry, ...entries].slice(0, HISTORY_LIMIT);
  const sizes = kept.map((item) => byteLength(JSON.stringify(item)));
  const wrapper = byteLength(JSON.stringify({ version: HISTORY_VERSION, entries: [] }));
  let bytes = wrapper + sizes.reduce((sum, size) => sum + size, 0) + Math.max(0, kept.length - 1);

  while (kept.length > 1 && bytes > HISTORY_BUDGET_BYTES) {
    bytes -= (sizes.pop() as number) + 1;
    kept.pop();
  }

  return kept;
}

export interface EntryInput {
  id: string;
  mode: QuizMode;
  score: Score;
  durationMs: number;
  expired: boolean;
  timerMinutes: number;
  finishedAt: number;
}

/** The history entry for a finished test. Only ids, topics and right/wrong are kept, never question text. */
export function entryFromScore(input: EntryInput): HistoryEntry {
  const { score } = input;

  return {
    id: input.id,
    finishedAt: Math.max(0, Math.floor(input.finishedAt)),
    mode: input.mode,
    correct: score.correct,
    total: score.total,
    durationMs: Math.min(MAX_DURATION_MS, Math.max(0, Math.floor(input.durationMs))),
    expired: input.expired,
    timerMinutes: input.timerMinutes,
    topics: score.topics.map((topic) => ({ topic: topic.topic, correct: topic.correct, total: topic.total })),
    questions: score.results.map((result) => ({ id: result.question.id, topic: result.question.topic, correct: result.correct })),
  };
}

/** True when `entry` would pass the same checks as stored data, so it is safe to keep and save. */
export function isValidEntry(entry: unknown): entry is HistoryEntry {
  return historyEntrySchema.safeParse(entry).success;
}
