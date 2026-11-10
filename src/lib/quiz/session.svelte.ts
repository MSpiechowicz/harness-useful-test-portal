import type { Catalog, CatalogQuestion } from '../content/catalog';
import { entryFromScore } from '../history/history';
import { recordResult } from '../history/history.svelte';
import { t, tn } from '../i18n';
import type { Settings } from '../settings/schema';
import { errorCode, loadDocument, saveDocument } from '../shell/shell';
import { isAnswered, scoreQuiz, type Answer, type Score } from './score';
import { filterPool, prepareQuiz, selectQuestions } from './select';
import { shuffle } from './shuffle';
import { restoreSnapshot, toSnapshot } from './snapshot';
import {
  applyAnswer,
  createSession,
  finish,
  idleSession,
  moveTo,
  newSessionId,
  reveal,
  toggleFlag as flip,
  wrongQuestions,
  type QuizMode,
  type SessionData,
} from './state';
import { remainingMs, timeUsedMs } from './timer';

const SAVE_DEBOUNCE_MS = 400;
const SNAPSHOT_INTERVAL_MS = 10_000;

/**
 * The test in progress or just finished. While it runs a snapshot of it (ids and positions, never question text)
 * is saved after every change, so a closed app can pick it up again from `resumable`.
 */
export const session = $state<SessionData>(idleSession());

/** The saved test that can be resumed, if any. `summary.current` is the question number to show (one-based). */
export const resumable = $state<{
  loaded: boolean;
  summary: { current: number; total: number; answered: number; remainingMs: number | null; mode: QuizMode } | null;
  notice: string | null;
}>({ loaded: false, summary: null, notice: null });

// Saves run one after another, so the last one queued is the last one written. Each job carries the value to
// write, taken when it was queued, so a late job can never write a newer state over an older one's replacement.
let queue: Promise<void> = Promise.resolve();
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let lastSnapshotAt = 0;

// What `resumeQuiz` rebuilds from: the stored snapshot, rebuilt against the catalog at resume time so the clock starts then.
let held: unknown = null;
let heldCatalog: Catalog | null = null;

function enqueueSave(value: unknown): void {
  queue = queue.then(async () => {
    try {
      await saveDocument('session', value);
    } catch {
      /* best effort: a test that cannot be saved still runs, it just cannot be resumed */
    }
  });
}

function cancelPendingSave(): void {
  clearTimeout(saveTimer);
  saveTimer = undefined;
}

function enqueueSnapshot(now: number): void {
  lastSnapshotAt = now;
  enqueueSave(toSnapshot(session, now));
}

/** Saves the running test shortly, once a burst of changes has settled. */
function scheduleSave(): void {
  if (session.phase !== 'running') return;

  cancelPendingSave();
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    if (session.phase === 'running') enqueueSnapshot(Date.now());
  }, SAVE_DEBOUNCE_MS);
}

function setField<K extends keyof SessionData>(key: K, value: SessionData[K]): void {
  session[key] = value;
}

/** Copies the fields of `next` that differ into the reactive session, leaving the rest untouched. */
function apply(next: SessionData): void {
  for (const key of Object.keys(next) as (keyof SessionData)[]) {
    if (session[key] !== next[key]) setField(key, next[key]);
  }
}

function summaryOf(data: SessionData, now: number): NonNullable<typeof resumable.summary> {
  return {
    current: data.current + 1,
    total: data.questions.length,
    answered: data.questions.filter((entry) => isAnswered(data.answers[entry.question.id])).length,
    remainingMs: data.deadline === null ? null : remainingMs(data.deadline, now),
    mode: data.mode,
  };
}

function begin(data: SessionData): void {
  cancelPendingSave();
  apply(data);

  held = null;
  resumable.summary = null;
  resumable.notice = null;
  lastSnapshotAt = Date.now();
  scheduleSave();
}

/** Builds a test from the settings and starts it. Returns false when no question matches. */
export function startQuiz(catalog: Catalog, settings: Settings, mode: QuizMode): boolean {
  const pool = filterPool(catalog.questions, settings);

  if (pool.length === 0) return false;

  const questions = selectQuestions(pool, settings);
  const options = {
    mode,
    timerMinutes: settings.timerMinutes,
    shuffleQuestions: settings.shuffleQuestions,
    shuffleOptions: settings.shuffleOptions,
  };

  begin(createSession(questions, options, Date.now(), newSessionId()));

  return true;
}

/** A new test of `questions` in the mode and with the shuffle and timer settings of the one just finished. */
function restart(questions: CatalogQuestion[]): boolean {
  if (questions.length === 0) return false;

  const options = {
    mode: session.mode,
    timerMinutes: session.timerMinutes,
    shuffleQuestions: session.shuffleQuestions,
    shuffleOptions: session.shuffleOptions,
  };
  const ordered = options.shuffleQuestions ? shuffle(questions) : questions;

  begin(createSession(prepareQuiz(ordered, options.shuffleOptions), options, Date.now(), newSessionId()));

  return true;
}

/** The same questions again, laid out afresh according to the shuffle settings the test used. */
export function retrySameSet(): boolean {
  return restart(session.questions.map((entry) => $state.snapshot(entry.question) as CatalogQuestion));
}

/** Only the questions answered wrongly or not at all. Returns false when there are none. */
export function retryWrong(): boolean {
  return restart($state.snapshot(wrongQuestions(session)) as CatalogQuestion[]);
}

export function setAnswer(questionId: string, answer: Answer | undefined): void {
  apply(applyAnswer(session, questionId, answer));
  scheduleSave();
}

export function goTo(index: number): void {
  apply(moveTo(session, index));
  scheduleSave();
}

export function toggleFlag(questionId: string): void {
  apply(flip(session, questionId));
  scheduleSave();
}

/** Checks the current practice question: its answer is locked and the explanation can be shown. */
export function revealCurrent(): void {
  const entry = session.questions[session.current];

  if (!entry) return;

  apply(reveal(session, entry.question.id));
  scheduleSave();
}

/**
 * Ends the test. `expired` marks one the timer ended. Answers are frozen from here on. The result is added to the
 * history once (it carries the session id) and the saved test is cleared, after any save still waiting.
 */
export function finishQuiz(expired: boolean): void {
  if (session.phase !== 'running') return;

  cancelPendingSave();
  apply(finish(session, expired, Date.now()));

  recordResult(
    entryFromScore({
      id: session.id,
      mode: session.mode,
      score: sessionScore(),
      durationMs: sessionTimeUsedMs(),
      expired: session.expired,
      timerMinutes: session.timerMinutes,
      finishedAt: session.endedAt,
    }),
  );

  enqueueSave(null);
}

/** Leaves a running test for later: its progress is saved now, the test leaves memory and shows up in `resumable`. */
export function pauseQuiz(): void {
  if (session.phase !== 'running') return;

  const now = Date.now();
  const snapshot = toSnapshot(session, now);

  cancelPendingSave();
  enqueueSave(snapshot);

  held = snapshot;
  resumable.loaded = true;
  resumable.summary = summaryOf(session, now);
  resumable.notice = null;

  resetSession();
}

/** Drops the test from memory, for leaving it after a result or starting over. A saved copy is left as it is. */
export function resetSession(): void {
  cancelPendingSave();
  apply(idleSession());
}

export function sessionScore(): Score {
  return scoreQuiz(
    session.questions.map((entry) => entry.question),
    session.answers,
  );
}

/** Time spent, capped at the deadline. */
export function sessionTimeUsedMs(): number {
  return timeUsedMs(session.startedAt, session.endedAt, session.deadline);
}

/** Called often by the quiz page's clock: saves a snapshot every ten seconds so the remaining time stays current. */
export function snapshotTick(now: number): void {
  if (session.phase !== 'running') return;
  if (now - lastSnapshotAt < SNAPSHOT_INTERVAL_MS) return;

  enqueueSnapshot(now);
}

function dropSaved(): void {
  held = null;
  resumable.summary = null;
  enqueueSave(null);
}

/**
 * Stops offering a saved test that cannot be resumed. One with no questions left is removed. One that cannot be
 * read (it may come from a newer version of the app) stays on disk until a new test or a discard replaces it.
 */
function forget(reason: 'none' | 'invalid' | 'emptied'): void {
  if (reason === 'emptied') {
    dropSaved();

    return;
  }

  held = null;
  resumable.summary = null;
}

/** Looks for a test saved earlier. Call once at start, after the history is loaded; the catalog is what it is checked against. */
export async function initResume(catalog: Catalog): Promise<void> {
  // Kept even when a test paused before this ran has already filled `resumable`: resuming needs the catalog.
  heldCatalog = catalog;

  if (resumable.loaded) return;

  let stored: unknown;

  try {
    stored = await loadDocument('session');
  } catch (error) {
    // A damaged file was moved aside by the store; anything else leaves the file alone.
    if (held === null) resumable.notice = errorCode(error) === 'invalidInput' ? t('home.resume.invalid') : t('home.resume.unreadable');
    resumable.loaded = true;

    return;
  }

  // A test started or paused while this was loading replaces the saved one.
  if (session.phase === 'running' || held !== null) {
    resumable.loaded = true;

    return;
  }

  held = stored;

  const result = restoreSnapshot(held, catalog, Date.now());

  if (result.session) {
    resumable.summary = summaryOf(result.session, Date.now());
    if (result.droppedQuestions > 0) resumable.notice = tn(result.droppedQuestions, 'home.resume.droppedOne', 'home.resume.droppedMany');
  } else if (result.reason !== 'none') {
    resumable.notice = result.reason === 'emptied' ? t('home.resume.emptied') : t('home.resume.invalid');
    forget(result.reason);
  }

  resumable.loaded = true;
}

/** Continues the saved test from where it was left, with the clock restarting now. False when it cannot be resumed. */
export function resumeQuiz(): boolean {
  if (held === null || heldCatalog === null || session.phase === 'running') return false;

  const result = restoreSnapshot(held, heldCatalog, Date.now());

  if (!result.session) {
    if (result.reason !== 'none') resumable.notice = result.reason === 'emptied' ? t('home.resume.emptied') : t('home.resume.invalid');
    forget(result.reason);

    return false;
  }

  begin(result.session);

  return true;
}

/** Throws away the saved test. */
export function discardResume(): void {
  resumable.notice = null;
  dropSaved();
}
