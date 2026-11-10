import type { Catalog, CatalogQuestion } from '../content/catalog';
import type { Settings } from '../settings/schema';
import { filterPool, prepareQuiz, selectQuestions, type QuizQuestion } from './select';
import { shuffle } from './shuffle';
import { scoreQuiz, type Answer, type AnswerMap, type Score } from './score';
import { deadlineFor, timeUsedMs } from './timer';

/** The test in progress or just finished. Held in memory only: nothing about a test is persisted. */
export const session = $state<{
  phase: 'idle' | 'running' | 'finished';
  questions: QuizQuestion[];
  answers: AnswerMap;
  current: number;
  startedAt: number;
  deadline: number | null;
  endedAt: number;
  expired: boolean;
  timerMinutes: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
}>({
  phase: 'idle',
  questions: [],
  answers: {},
  current: 0,
  startedAt: 0,
  deadline: null,
  endedAt: 0,
  expired: false,
  timerMinutes: 0,
  shuffleQuestions: true,
  shuffleOptions: true,
});

function begin(questions: QuizQuestion[], settings: Pick<Settings, 'timerMinutes' | 'shuffleQuestions' | 'shuffleOptions'>): void {
  const startedAt = Date.now();

  session.phase = 'running';
  session.questions = questions;
  session.answers = {};
  session.current = 0;
  session.startedAt = startedAt;
  session.deadline = deadlineFor(startedAt, settings.timerMinutes);
  session.endedAt = 0;
  session.expired = false;
  session.timerMinutes = settings.timerMinutes;
  session.shuffleQuestions = settings.shuffleQuestions;
  session.shuffleOptions = settings.shuffleOptions;
}

/** Builds a test from the settings and starts it. Returns false when no question matches. */
export function startQuiz(catalog: Catalog, settings: Settings): boolean {
  const pool = filterPool(catalog.questions, settings);

  if (pool.length === 0) return false;

  begin(selectQuestions(pool, settings), settings);

  return true;
}

/** The same questions again, laid out afresh according to the shuffle settings the test used. */
export function retrySameSet(): boolean {
  const questions: CatalogQuestion[] = session.questions.map((entry) => $state.snapshot(entry.question) as CatalogQuestion);

  if (questions.length === 0) return false;

  const settings = {
    timerMinutes: session.timerMinutes,
    shuffleQuestions: session.shuffleQuestions,
    shuffleOptions: session.shuffleOptions,
  };
  const ordered = settings.shuffleQuestions ? shuffle(questions) : questions;

  begin(prepareQuiz(ordered, settings.shuffleOptions), settings);

  return true;
}

export function setAnswer(questionId: string, answer: Answer | undefined): void {
  if (session.phase !== 'running') return;

  session.answers[questionId] = answer;
}

export function goTo(index: number): void {
  session.current = Math.min(session.questions.length - 1, Math.max(0, index));
}

/** Ends the test. `expired` marks one the timer ended. Answers are frozen from here on. */
export function finishQuiz(expired: boolean): void {
  if (session.phase !== 'running') return;

  session.phase = 'finished';
  session.expired = expired;
  session.endedAt = Date.now();
}

/** Drops the test, for leaving it or starting over. */
export function resetSession(): void {
  session.phase = 'idle';
  session.questions = [];
  session.answers = {};
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
