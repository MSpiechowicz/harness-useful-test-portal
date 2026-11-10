import { describe, expect, test } from 'bun:test';
import { catalogQuestion } from '../content/__fixtures__/samples';
import type { Catalog, CatalogQuestion } from '../content/catalog';
import type { Option } from '../content/schema';
import { restoreSnapshot, toSnapshot, type Snapshot } from './snapshot';
import { applyAnswer, createSession, reveal, toggleFlag, type SessionData } from './state';

const single = catalogQuestion('s1', 'alpha');
const multi = catalogQuestion('m1', 'alpha', { type: 'multi' });
const truth = catalogQuestion('t1', 'beta', { type: 'true-false' });

function optionsOf(question: CatalogQuestion): Option[] {
  if (question.type === 'true-false') throw new Error('true-false questions have no options');

  return question.options;
}

function catalogOf(...questions: CatalogQuestion[]): Catalog {
  return { topics: [], questions };
}

/** A shuffled-looking layout so option order has something to preserve. */
function layout(question: CatalogQuestion, ids: string[]) {
  if (question.type === 'true-false') return { question, options: [] };

  return { question, options: ids.map((id) => question.options.find((option) => option.id === id)!) };
}

function running(mode: 'exam' | 'practice' = 'exam'): SessionData {
  const base = createSession(
    [layout(single, ['c', 'a', 'b']), layout(multi, ['b', 'c', 'a']), layout(truth, [])],
    { mode, timerMinutes: 30, shuffleQuestions: true, shuffleOptions: true },
    10_000,
    'session-0001',
  );

  return { ...base, current: 1 };
}

function stored(session: SessionData, now = 70_000): Snapshot {
  return JSON.parse(JSON.stringify(toSnapshot(session, now))) as Snapshot;
}

describe('round trip', () => {
  test('restores the test with the layout, answers, flags and position', () => {
    let session = running('practice');

    session = applyAnswer(session, 's1', ['b']);
    session = reveal(session, 's1');
    session = applyAnswer(session, 'm1', ['a', 'c']);
    session = applyAnswer(session, 't1', false);
    session = toggleFlag(session, 't1');

    const result = restoreSnapshot(stored(session), catalogOf(single, multi, truth), 500_000);

    if (!result.session) throw new Error('expected a session');

    expect(result.droppedQuestions).toBe(0);
    expect(result.session).toMatchObject({
      id: 'session-0001',
      mode: 'practice',
      phase: 'running',
      current: 1,
      answers: { s1: ['b'], m1: ['a', 'c'], t1: false },
      flagged: ['t1'],
      revealed: ['s1'],
      deadline: null,
      endedAt: 0,
      expired: false,
    });
    expect(result.session.questions.map((entry) => entry.question)).toEqual([single, multi, truth]);
    expect(result.session.questions.map((entry) => entry.options.map((option) => option.id))).toEqual([
      ['c', 'a', 'b'],
      ['b', 'c', 'a'],
      [],
    ]);
  });

  test('stores ids only, never question text', () => {
    const text = JSON.stringify(stored(running()));

    expect(text).not.toContain('Pick');
    expect(text).not.toContain('explanation');
  });

  test('an untouched test with nothing stored for the optional parts still restores', () => {
    const result = restoreSnapshot(stored(running()), catalogOf(single, multi, truth), 1_000);

    expect(result.session?.answers).toEqual({});
  });
});

describe('time', () => {
  test('a test left open for longer than a snapshot may record still saves a snapshot that restores', () => {
    const practice = running('practice');
    const result = restoreSnapshot(stored(practice, practice.startedAt + 30 * 24 * 3_600_000), catalogOf(single, multi, truth), 1_000);

    expect(result.session?.questions).toHaveLength(3);
  });

  test('a timed exam keeps its remaining time and elapsed time as of the restore', () => {
    // started at 10 s, saved at 70 s: one minute elapsed of 30
    const snapshot = stored(running());

    expect(snapshot.elapsedMs).toBe(60_000);
    expect(snapshot.remainingMs).toBe(30 * 60_000 - 60_000);

    const result = restoreSnapshot(snapshot, catalogOf(single, multi, truth), 1_000_000);

    expect(result.session?.startedAt).toBe(1_000_000 - 60_000);
    expect(result.session?.deadline).toBe(1_000_000 + 29 * 60_000);
  });

  test('time spent away does not count', () => {
    const snapshot = stored(running(), 70_000);
    const early = restoreSnapshot(snapshot, catalogOf(single, multi, truth), 100_000);
    const late = restoreSnapshot(snapshot, catalogOf(single, multi, truth), 9_000_000);

    expect((early.session?.deadline ?? 0) - 100_000).toBe((late.session?.deadline ?? 0) - 9_000_000);
  });

  test('no time left restores an already expired deadline', () => {
    const snapshot = { ...stored(running()), remainingMs: 0 };
    const result = restoreSnapshot(snapshot, catalogOf(single, multi, truth), 123_456);

    expect(result.session?.deadline).toBe(123_456);
  });

  test('an exam without a timer has no deadline', () => {
    const session = createSession(
      [layout(single, ['a', 'b', 'c'])],
      { mode: 'exam', timerMinutes: 0, shuffleQuestions: false, shuffleOptions: false },
      0,
      'session-0002',
    );
    const snapshot = stored(session, 5_000);

    expect(snapshot.remainingMs).toBeNull();
    expect(restoreSnapshot(snapshot, catalogOf(single), 9_000).session?.deadline).toBeNull();
  });

  test('remaining time never goes below zero when saved after the deadline', () => {
    expect(stored(running(), 10_000 + 31 * 60_000).remainingMs).toBe(0);
  });
});

describe('a changed catalog', () => {
  test('a removed question is dropped and counted, and the position follows the question', () => {
    const session = { ...running(), current: 2 };
    const result = restoreSnapshot(stored(applyAnswer(session, 's1', ['a'])), catalogOf(multi, truth), 1_000);

    if (!result.session) throw new Error('expected a session');

    expect(result.droppedQuestions).toBe(1);
    expect(result.session.questions.map((entry) => entry.question.id)).toEqual(['m1', 't1']);
    expect(result.session.current).toBe(1);
    expect(result.session.answers).toEqual({});
  });

  test('when the current question is removed the position moves to the next one that is left', () => {
    const result = restoreSnapshot(stored(running()), catalogOf(single, truth), 1_000);

    expect(result.session?.questions[result.session.current].question.id).toBe('t1');
  });

  test('flags and checks of removed questions are dropped', () => {
    const session = reveal(toggleFlag(applyAnswer(running('practice'), 's1', ['a']), 's1'), 's1');
    const result = restoreSnapshot(stored(session), catalogOf(multi, truth), 1_000);

    expect(result.session?.flagged).toEqual([]);
    expect(result.session?.revealed).toEqual([]);
  });

  test('a removed option drops the answer that used it and keeps the order of the rest', () => {
    const trimmed = { ...multi, options: optionsOf(multi).filter((option) => option.id !== 'a') } as CatalogQuestion;
    const session = applyAnswer(applyAnswer(running(), 'm1', ['a', 'b']), 's1', ['b']);
    const result = restoreSnapshot(stored(session), catalogOf(single, trimmed, truth), 1_000);

    expect(result.session?.answers).toEqual({ s1: ['b'] });
    expect(result.session?.questions[1].options.map((option) => option.id)).toEqual(['b', 'c']);
  });

  test('an added option goes after the stored ones, in catalog order', () => {
    const grown = { ...single, options: [...optionsOf(single), { id: 'd', text: 'D' }, { id: 'e', text: 'E' }] } as CatalogQuestion;
    const result = restoreSnapshot(stored(running()), catalogOf(grown, multi, truth), 1_000);

    expect(result.session?.questions[0].options.map((option) => option.id)).toEqual(['c', 'a', 'b', 'd', 'e']);
  });

  test('a question whose type changed takes its text from the catalog and drops an answer that no longer fits', () => {
    const nowTrueFalse = catalogQuestion('s1', 'alpha', { type: 'true-false' });
    const nowSingle = catalogQuestion('t1', 'beta');
    const session = applyAnswer(applyAnswer(running(), 's1', ['a']), 't1', true);
    const result = restoreSnapshot(stored(session), catalogOf(nowTrueFalse, multi, nowSingle), 1_000);

    if (!result.session) throw new Error('expected a session');

    expect(result.session.answers).toEqual({});
    expect(result.session.questions[0]).toEqual({ question: nowTrueFalse, options: [] });
    expect(result.session.questions[2].options.map((option) => option.id)).toEqual(['a', 'b', 'c']);
  });

  test('a single question stored with two chosen options does not fit', () => {
    const snapshot = stored(running());

    snapshot.answers = { s1: ['a', 'b'] };

    expect(restoreSnapshot(snapshot, catalogOf(single, multi, truth), 1_000).session?.answers).toEqual({});
  });

  test('every question gone is "emptied"', () => {
    expect(restoreSnapshot(stored(running()), catalogOf(catalogQuestion('other', 'alpha')), 1_000)).toEqual({
      session: null,
      reason: 'emptied',
    });
  });
});

describe('untrusted data', () => {
  const catalog = catalogOf(single, multi, truth);

  test('nothing stored is "none"', () => {
    expect(restoreSnapshot(null, catalog, 0)).toEqual({ session: null, reason: 'none' });
    expect(restoreSnapshot(undefined, catalog, 0)).toEqual({ session: null, reason: 'none' });
  });

  test('garbage is "invalid"', () => {
    for (const raw of ['x', 7, [], {}, { version: 1 }, { ...stored(running()), version: 2 }, { ...stored(running()), extra: true }]) {
      expect(restoreSnapshot(raw, catalog, 0)).toEqual({ session: null, reason: 'invalid' });
    }
  });

  test('out of range or badly shaped fields are "invalid"', () => {
    const base = stored(running());
    const bad: unknown[] = [
      { ...base, id: 'X' },
      { ...base, mode: 'cram' },
      { ...base, questions: [] },
      { ...base, questions: [{ id: 'Not A Slug', options: [] }] },
      { ...base, questions: [{ id: 's1', options: ['UPPER'] }] },
      { ...base, questions: Array.from({ length: 101 }, (_, index) => ({ id: `q${index}`, options: [] })) },
      { ...base, answers: { s1: ['A'] } },
      { ...base, answers: { 'Bad Key': true } },
      { ...base, answers: { s1: 'a' } },
      { ...base, current: -1 },
      { ...base, remainingMs: -5 },
      { ...base, elapsedMs: 1.5 },
      { ...base, timerMinutes: 500 },
    ];

    for (const raw of bad) expect(restoreSnapshot(raw, catalog, 0)).toEqual({ session: null, reason: 'invalid' });
  });

  test('a __proto__ answer key is rejected and pollutes nothing', () => {
    const raw = JSON.parse(JSON.stringify(stored(running())).replace('"answers":{}', '"answers":{"__proto__":["a"]}')) as unknown;

    expect(restoreSnapshot(raw, catalog, 0)).toEqual({ session: null, reason: 'invalid' });
    expect(({} as Record<string, unknown>).a).toBeUndefined();
  });

  test('an answer under an id that is also an Object property does not leak the property', () => {
    const odd = catalogQuestion('constructor', 'alpha');
    const session = createSession(
      [layout(odd, ['a', 'b', 'c'])],
      { mode: 'exam', timerMinutes: 0, shuffleQuestions: false, shuffleOptions: false },
      0,
      'session-0003',
    );
    const result = restoreSnapshot(stored(session), catalogOf(odd), 0);

    expect(result.session?.answers).toEqual({});
  });

  test('exam snapshots ignore stored checks', () => {
    const snapshot = { ...stored(applyAnswer(running(), 's1', ['a'])), revealed: ['s1'] };

    expect(restoreSnapshot(snapshot, catalog, 0).session?.revealed).toEqual([]);
  });
});
