import { describe, expect, test } from 'bun:test';
import { catalogQuestion } from '../content/__fixtures__/samples';
import { scoreQuiz } from '../quiz/score';
import {
  appendEntry,
  entryFromScore,
  entryPercent,
  HISTORY_BUDGET_BYTES,
  HISTORY_LIMIT,
  HISTORY_VERSION,
  parseHistory,
  serializeHistory,
  type HistoryEntry,
} from './history';

function entry(n: number, extra: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: `entry-${String(n).padStart(6, '0')}`,
    finishedAt: 1_000_000 + n,
    mode: 'exam',
    correct: 3,
    total: 4,
    durationMs: 120_000,
    expired: false,
    timerMinutes: 30,
    topics: [{ topic: 'alpha', correct: 3, total: 4 }],
    questions: [
      { id: 'q-one', topic: 'alpha', correct: true },
      { id: 'q-two', topic: 'alpha', correct: true },
      { id: 'q-three', topic: 'alpha', correct: true },
      { id: 'q-four', topic: 'alpha', correct: false },
    ],
    ...extra,
  };
}

/** A maximum-size entry: 100 questions across 100 topics, with long ids. */
function bigEntry(n: number): HistoryEntry {
  const questions = Array.from({ length: 100 }, (_, index) => ({
    id: `question-${'x'.repeat(40)}-${index}`,
    topic: `topic-${'y'.repeat(40)}-${index}`,
    correct: index % 2 === 0,
  }));

  return entry(n, {
    correct: 50,
    total: 100,
    topics: questions.map((question) => ({ topic: question.topic, correct: question.correct ? 1 : 0, total: 1 })),
    questions,
  });
}

describe('parseHistory', () => {
  test('nothing stored is an empty, writable history', () => {
    expect(parseHistory(null)).toEqual({ entries: [], dropped: 0, readOnly: false });
    expect(parseHistory(undefined)).toEqual({ entries: [], dropped: 0, readOnly: false });
    expect(parseHistory({ version: HISTORY_VERSION, entries: [] })).toEqual({ entries: [], dropped: 0, readOnly: false });
  });

  test('keeps valid entries, newest first', () => {
    const parsed = parseHistory({ version: 1, entries: [entry(1), entry(3), entry(2)] });

    expect(parsed.entries.map((item) => item.id)).toEqual([entry(3).id, entry(2).id, entry(1).id]);
    expect(parsed.readOnly).toBe(false);
  });

  test('a finish time later than a date can hold is dropped, so it can never break the page that shows it', () => {
    const parsed = parseHistory({ version: HISTORY_VERSION, entries: [entry(1), entry(2, { finishedAt: 9e15 })] });

    expect(parsed.entries.map((item) => item.id)).toEqual([entry(1).id]);
    expect(parsed.dropped).toBe(1);
  });

  test('salvages entry by entry: a bad one is dropped and counted', () => {
    const parsed = parseHistory({
      version: 1,
      entries: [entry(1), { ...entry(2), total: 0 }, 'junk', null, { ...entry(3), mode: 'cram' }, { ...entry(4), extra: 1 }, entry(5)],
    });

    expect(parsed.entries.map((item) => item.id)).toEqual([entry(5).id, entry(1).id]);
    expect(parsed.dropped).toBe(5);
  });

  test('rejects values outside their bounds', () => {
    const bad = [
      { ...entry(1), total: 101 },
      { ...entry(1), correct: 5, total: 4 },
      { ...entry(1), id: 'UPPER-CASE-ID' },
      { ...entry(1), finishedAt: -1 },
      { ...entry(1), durationMs: 1.5 },
      { ...entry(1), timerMinutes: 181 },
      { ...entry(1), topics: [{ topic: 'Bad Slug', correct: 1, total: 1 }] },
      { ...entry(1), topics: [{ topic: 'alpha', correct: 2, total: 1 }] },
      { ...entry(1), questions: [{ id: 'q', topic: 'alpha', correct: 'yes' }] },
      { ...entry(1), questions: Array.from({ length: 101 }, () => ({ id: 'q', topic: 'alpha', correct: true })) },
    ];

    expect(parseHistory({ version: 1, entries: bad })).toMatchObject({ entries: [], dropped: bad.length });
  });

  test('a newer version is read-only, with what can still be read', () => {
    const parsed = parseHistory({ version: 2, entries: [entry(1), { ...entry(2), shiny: true }] });

    expect(parsed.readOnly).toBe(true);
    expect(parsed.entries.map((item) => item.id)).toEqual([entry(1).id]);
  });

  test('a file that does not look like a history is read-only rather than overwritten', () => {
    for (const raw of ['text', 7, [], {}, { version: 'x', entries: [] }, { version: 0, entries: [] }, { version: 1.5, entries: [] }]) {
      expect(parseHistory(raw)).toMatchObject({ entries: [], readOnly: true });
    }
  });

  test('a missing or malformed entries list is empty', () => {
    expect(parseHistory({ version: 1 })).toEqual({ entries: [], dropped: 0, readOnly: false });
    expect(parseHistory({ version: 1, entries: 'x' })).toEqual({ entries: [], dropped: 0, readOnly: false });
  });

  test('a duplicate id keeps the first and counts the rest as dropped', () => {
    const parsed = parseHistory({ version: 1, entries: [entry(1), entry(1, { correct: 0 }), entry(2)] });

    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries.find((item) => item.id === entry(1).id)?.correct).toBe(3);
    expect(parsed.dropped).toBe(1);
  });

  test('keeps at most the newest 200', () => {
    const entries = Array.from({ length: HISTORY_LIMIT + 25 }, (_, index) => entry(index));
    const parsed = parseHistory({ version: 1, entries });

    expect(parsed.entries).toHaveLength(HISTORY_LIMIT);
    expect(parsed.entries[0].id).toBe(entry(HISTORY_LIMIT + 24).id);
  });
});

describe('appendEntry', () => {
  test('adds the entry as the newest', () => {
    expect(appendEntry([entry(1)], entry(2)).map((item) => item.id)).toEqual([entry(2).id, entry(1).id]);
    expect(appendEntry([], entry(1))).toEqual([entry(1)]);
  });

  test('an id already present leaves the history as it was', () => {
    const entries = [entry(2), entry(1)];

    expect(appendEntry(entries, entry(1, { correct: 0 }))).toEqual(entries);
  });

  test('does not change the history it is given', () => {
    const entries = [entry(1)];

    appendEntry(entries, entry(2));

    expect(entries).toHaveLength(1);
  });

  test('keeps 200, dropping the oldest', () => {
    let entries: HistoryEntry[] = [];

    for (let index = 0; index < HISTORY_LIMIT + 10; index += 1) entries = appendEntry(entries, entry(index));

    expect(entries).toHaveLength(HISTORY_LIMIT);
    expect(entries[0].id).toBe(entry(HISTORY_LIMIT + 9).id);
    expect(entries[entries.length - 1].id).toBe(entry(10).id);
  });

  test('100-question entries stay within the byte budget, dropping the oldest first', () => {
    let entries: HistoryEntry[] = [];

    for (let index = 0; index < 200; index += 1) entries = appendEntry(entries, bigEntry(index));

    const bytes = new TextEncoder().encode(JSON.stringify(serializeHistory(entries))).byteLength;

    expect(bytes).toBeLessThanOrEqual(HISTORY_BUDGET_BYTES);
    expect(entries.length).toBeLessThan(HISTORY_LIMIT);
    expect(entries.length).toBeGreaterThan(50);
    expect(entries[0].id).toBe(bigEntry(199).id);
    // what is kept is the newest run, without gaps
    expect(entries.map((item) => item.finishedAt)).toEqual([...entries.map((item) => item.finishedAt)].sort((a, b) => b - a));
  });

  test('the new entry is kept even when it alone is over the budget', () => {
    expect(appendEntry([entry(1)], bigEntry(2)).map((item) => item.id)).toContain(bigEntry(2).id);
  });
});

describe('serializeHistory', () => {
  test('wraps the entries with the version and parses back', () => {
    const entries = [entry(2), entry(1)];
    const stored = JSON.parse(JSON.stringify(serializeHistory(entries))) as unknown;

    expect(stored).toEqual({ version: HISTORY_VERSION, entries });
    expect(parseHistory(stored)).toEqual({ entries, dropped: 0, readOnly: false });
  });
});

describe('entryFromScore', () => {
  const questions = [
    catalogQuestion('s1', 'alpha'),
    catalogQuestion('m1', 'alpha', { type: 'multi' }),
    catalogQuestion('t1', 'beta', { type: 'true-false' }),
  ];

  test('keeps ids, topics and right or wrong, never question text', () => {
    const score = scoreQuiz(questions, { s1: ['a'], m1: ['a'], t1: true });
    const result = entryFromScore({
      id: 'entry-aaaaaaaa',
      mode: 'practice',
      score,
      durationMs: 61_000.7,
      expired: false,
      timerMinutes: 0,
      finishedAt: 5_000,
    });

    expect(result).toEqual({
      id: 'entry-aaaaaaaa',
      finishedAt: 5_000,
      mode: 'practice',
      correct: 2,
      total: 3,
      durationMs: 61_000,
      expired: false,
      timerMinutes: 0,
      topics: [
        { topic: 'alpha', correct: 1, total: 2 },
        { topic: 'beta', correct: 1, total: 1 },
      ],
      questions: [
        { id: 's1', topic: 'alpha', correct: true },
        { id: 'm1', topic: 'alpha', correct: false },
        { id: 't1', topic: 'beta', correct: true },
      ],
    });
    expect(parseHistory({ version: 1, entries: [result] }).entries).toEqual([result]);
  });

  test('an absurd duration is capped so the entry stays valid', () => {
    const score = scoreQuiz(questions, {});
    const result = entryFromScore({
      id: 'entry-aaaaaaaa',
      mode: 'exam',
      score,
      durationMs: 1e15,
      expired: true,
      timerMinutes: 30,
      finishedAt: 1,
    });

    expect(parseHistory({ version: 1, entries: [result] }).entries).toHaveLength(1);
  });
});

describe('entryPercent', () => {
  test('uses the same rounding as scoreQuiz', () => {
    const questions = [
      catalogQuestion('s1', 'alpha'),
      catalogQuestion('s2', 'alpha'),
      catalogQuestion('s3', 'alpha'),
      catalogQuestion('s4', 'alpha'),
    ];

    for (const correct of [0, 1, 2, 3, 4]) {
      const answers = Object.fromEntries(questions.slice(0, correct).map((question) => [question.id, ['a']]));
      const score = scoreQuiz(questions, answers);

      expect(entryPercent({ correct: score.correct, total: score.total })).toBe(score.percent);
    }

    expect(entryPercent({ correct: 1, total: 8 })).toBe(13);
    expect(entryPercent({ correct: 1, total: 3 })).toBe(33);
    expect(entryPercent({ correct: 2, total: 3 })).toBe(67);
  });
});
