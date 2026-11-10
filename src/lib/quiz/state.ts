import type { CatalogQuestion } from '../content/catalog';
import { isAnswered, isCorrect, type Answer, type AnswerMap } from './score';
import type { QuizQuestion } from './select';
import { deadlineFor } from './timer';

export const QUIZ_MODES = ['exam', 'practice'] as const;

/** Exam: answers stay hidden until the end and the timer runs. Practice: no timer, check an answer as you go. */
export type QuizMode = (typeof QUIZ_MODES)[number];

/** Ids of sessions and history entries: 32 lowercase hex digits from `newSessionId`, with room for other lowercase ids. */
export const SESSION_ID_RE = /^[a-z0-9-]{8,64}$/;

/** The test in progress or just finished. Every function below returns a new value and never mutates its input. */
export interface SessionData {
  id: string;
  mode: QuizMode;
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
  /** Ids of questions marked for another look. */
  flagged: string[];
  /** Ids of practice questions whose answer was checked; their answer is locked. */
  revealed: string[];
}

export interface SessionOptions {
  mode: QuizMode;
  timerMinutes: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
}

export function idleSession(): SessionData {
  return {
    id: '',
    mode: 'exam',
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
    flagged: [],
    revealed: [],
  };
}

/** A running session at question one. Practice never has a time limit, whatever the timer setting says. */
export function createSession(questions: QuizQuestion[], options: SessionOptions, now: number, id: string): SessionData {
  const timerMinutes = options.mode === 'practice' ? 0 : options.timerMinutes;

  return {
    ...idleSession(),
    id,
    mode: options.mode,
    phase: 'running',
    questions,
    startedAt: now,
    deadline: deadlineFor(now, timerMinutes),
    timerMinutes,
    shuffleQuestions: options.shuffleQuestions,
    shuffleOptions: options.shuffleOptions,
  };
}

function hasQuestion(session: SessionData, questionId: string): boolean {
  return session.questions.some((entry) => entry.question.id === questionId);
}

/** Stores an answer. Does nothing unless the test is running, the question is in it and its answer is not locked by a check. */
export function applyAnswer(session: SessionData, questionId: string, answer: Answer | undefined): SessionData {
  if (session.phase !== 'running') return session;
  if (!hasQuestion(session, questionId)) return session;
  if (session.revealed.includes(questionId)) return session;

  const answers = { ...session.answers };

  if (answer === undefined) delete answers[questionId];
  else answers[questionId] = answer;

  return { ...session, answers };
}

export function toggleFlag(session: SessionData, questionId: string): SessionData {
  if (session.phase !== 'running') return session;
  if (!hasQuestion(session, questionId)) return session;

  const flagged = session.flagged.includes(questionId)
    ? session.flagged.filter((id) => id !== questionId)
    : [...session.flagged, questionId];

  return { ...session, flagged };
}

/** Checks an answered practice question, which locks its answer. Exam tests and unanswered questions are left alone. */
export function reveal(session: SessionData, questionId: string): SessionData {
  if (session.phase !== 'running' || session.mode !== 'practice') return session;
  if (!hasQuestion(session, questionId)) return session;
  if (session.revealed.includes(questionId)) return session;
  if (!isAnswered(session.answers[questionId])) return session;

  return { ...session, revealed: [...session.revealed, questionId] };
}

export function moveTo(session: SessionData, index: number): SessionData {
  const current = Math.min(session.questions.length - 1, Math.max(0, index));

  return current === session.current || session.questions.length === 0 ? session : { ...session, current };
}

/** Ends a running test; answers are frozen from here on. */
export function finish(session: SessionData, expired: boolean, now: number): SessionData {
  if (session.phase !== 'running') return session;

  return { ...session, phase: 'finished', expired, endedAt: now };
}

/** The questions answered wrongly or not at all, in test order, as plain catalog questions. */
export function wrongQuestions(session: SessionData): CatalogQuestion[] {
  return session.questions.map((entry) => entry.question).filter((question) => !isCorrect(question, session.answers[question.id]));
}

/** A fresh random id: 128 random bits as 32 hex digits. */
export function newSessionId(): string {
  const bytes = new Uint8Array(16);

  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
