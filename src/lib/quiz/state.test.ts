import { describe, expect, test } from 'bun:test';
import { catalogQuestion } from '../content/__fixtures__/samples';
import { prepareQuiz } from './select';
import {
  applyAnswer,
  createSession,
  finish,
  moveTo,
  newSessionId,
  reveal,
  SESSION_ID_RE,
  toggleFlag,
  wrongQuestions,
  type SessionOptions,
} from './state';

const single = catalogQuestion('s1', 'alpha');
const multi = catalogQuestion('m1', 'alpha', { type: 'multi' });
const truth = catalogQuestion('t1', 'beta', { type: 'true-false' });

const exam: SessionOptions = { mode: 'exam', timerMinutes: 30, shuffleQuestions: false, shuffleOptions: false };
const practice: SessionOptions = { ...exam, mode: 'practice' };

function start(options = exam) {
  return createSession(prepareQuiz([single, multi, truth], false), options, 1_000, 'session-0001');
}

describe('createSession', () => {
  test('starts a running exam at question one with a deadline from the timer', () => {
    const session = start();

    expect(session).toMatchObject({
      id: 'session-0001',
      mode: 'exam',
      phase: 'running',
      current: 0,
      startedAt: 1_000,
      deadline: 1_000 + 30 * 60_000,
      timerMinutes: 30,
      answers: {},
      flagged: [],
      revealed: [],
      expired: false,
    });
    expect(session.questions).toHaveLength(3);
  });

  test('an exam with the timer off has no deadline', () => {
    expect(start({ ...exam, timerMinutes: 0 }).deadline).toBeNull();
  });

  test('practice has no deadline whatever the timer setting says', () => {
    const session = start(practice);

    expect(session.mode).toBe('practice');
    expect(session.deadline).toBeNull();
    expect(session.timerMinutes).toBe(0);
  });
});

describe('applyAnswer', () => {
  test('stores and replaces an answer without touching the original', () => {
    const session = start();
    const first = applyAnswer(session, 's1', ['a']);
    const second = applyAnswer(first, 's1', ['b']);

    expect(session.answers).toEqual({});
    expect(first.answers).toEqual({ s1: ['a'] });
    expect(second.answers).toEqual({ s1: ['b'] });
  });

  test('undefined clears the answer; false is an answer', () => {
    const answered = applyAnswer(applyAnswer(start(), 's1', ['a']), 't1', false);

    expect(answered.answers).toEqual({ s1: ['a'], t1: false });
    expect(applyAnswer(answered, 's1', undefined).answers).toEqual({ t1: false });
  });

  test('ignores questions that are not in the test and tests that are not running', () => {
    const session = start();

    expect(applyAnswer(session, 'other', ['a'])).toBe(session);

    const finished = finish(session, false, 5_000);

    expect(applyAnswer(finished, 's1', ['a'])).toBe(finished);
  });

  test('is locked once the question was checked', () => {
    const checked = reveal(applyAnswer(start(practice), 's1', ['a']), 's1');

    expect(applyAnswer(checked, 's1', ['b'])).toBe(checked);
    expect(applyAnswer(checked, 'm1', ['a', 'b']).answers.m1).toEqual(['a', 'b']);
  });
});

describe('toggleFlag', () => {
  test('flags and unflags a question', () => {
    const flagged = toggleFlag(toggleFlag(start(), 's1'), 't1');

    expect(flagged.flagged).toEqual(['s1', 't1']);
    expect(toggleFlag(flagged, 's1').flagged).toEqual(['t1']);
  });

  test('ignores unknown questions and finished tests', () => {
    const session = start();

    expect(toggleFlag(session, 'other')).toBe(session);

    const finished = finish(session, false, 5_000);

    expect(toggleFlag(finished, 's1')).toBe(finished);
  });
});

describe('reveal', () => {
  test('checks an answered practice question', () => {
    const answered = applyAnswer(start(practice), 's1', ['a']);

    expect(reveal(answered, 's1').revealed).toEqual(['s1']);
    expect(reveal(reveal(answered, 's1'), 's1').revealed).toEqual(['s1']);
  });

  test('needs an answer, practice mode and a known question', () => {
    const unanswered = start(practice);
    const examAnswered = applyAnswer(start(), 's1', ['a']);

    expect(reveal(unanswered, 's1')).toBe(unanswered);
    expect(reveal(examAnswered, 's1')).toBe(examAnswered);
    expect(reveal(unanswered, 'other')).toBe(unanswered);
  });
});

describe('moveTo and finish', () => {
  test('moveTo stays within the test', () => {
    const session = start();

    expect(moveTo(session, 2).current).toBe(2);
    expect(moveTo(session, 99).current).toBe(2);
    expect(moveTo(session, -4)).toBe(session);
  });

  test('finish freezes the test once', () => {
    const finished = finish(start(), true, 9_000);

    expect(finished).toMatchObject({ phase: 'finished', expired: true, endedAt: 9_000 });
    expect(finish(finished, false, 10_000)).toBe(finished);
  });
});

describe('wrongQuestions', () => {
  test('lists wrong and unanswered questions in test order, as catalog questions', () => {
    const session = applyAnswer(applyAnswer(start(), 's1', ['b']), 'm1', ['a', 'b']);

    expect(wrongQuestions(session)).toEqual([single, truth]);
  });

  test('is empty when everything is right', () => {
    const session = applyAnswer(applyAnswer(applyAnswer(start(), 's1', ['a']), 'm1', ['b', 'a']), 't1', true);

    expect(wrongQuestions(session)).toEqual([]);
  });
});

describe('newSessionId', () => {
  test('is 32 hex digits and different each time', () => {
    const ids = new Set(Array.from({ length: 20 }, () => newSessionId()));

    expect(ids.size).toBe(20);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{32}$/);
      expect(SESSION_ID_RE.test(id)).toBe(true);
    }
  });
});
