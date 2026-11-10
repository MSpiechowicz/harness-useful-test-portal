import { describe, expect, test } from 'bun:test';
import type { HistoryEntry } from './history';
import { sparklinePoints, summarize, topicMastery, trend } from './stats';

function entry(n: number, correct: number, extra: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: `entry-${String(n).padStart(6, '0')}`,
    finishedAt: n * 1000,
    mode: 'exam',
    correct,
    total: 4,
    durationMs: 1000,
    expired: false,
    timerMinutes: 30,
    topics: [],
    questions: [],
    ...extra,
  };
}

describe('summarize', () => {
  test('no tests', () => {
    expect(summarize([])).toEqual({ count: 0, averagePercent: 0, bestPercent: 0, latest: null });
  });

  test('a single test', () => {
    const only = entry(1, 3);

    expect(summarize([only])).toEqual({ count: 1, averagePercent: 75, bestPercent: 75, latest: only });
  });

  test('several tests: rounded average, best and the latest by time', () => {
    const entries = [entry(2, 1), entry(5, 4), entry(3, 2)];
    const summary = summarize(entries);

    expect(summary.count).toBe(3);
    expect(summary.averagePercent).toBe(58); // (25 + 100 + 50) / 3 = 58.3
    expect(summary.bestPercent).toBe(100);
    expect(summary.latest?.id).toBe(entry(5, 4).id);
  });

  test('a mode filter counts only that mode', () => {
    const entries = [entry(1, 4), entry(2, 0, { mode: 'practice' }), entry(3, 2, { mode: 'practice' })];

    expect(summarize(entries, 'practice')).toMatchObject({ count: 2, averagePercent: 25, bestPercent: 50 });
    expect(summarize(entries, 'exam')).toMatchObject({ count: 1, averagePercent: 100 });
    expect(summarize([entry(1, 4)], 'practice')).toEqual({ count: 0, averagePercent: 0, bestPercent: 0, latest: null });
  });
});

describe('trend', () => {
  const entries = [entry(4, 4), entry(3, 3, { mode: 'practice' }), entry(2, 2), entry(1, 1)];

  test('the latest tests, oldest first', () => {
    expect(trend(entries, 3).map((point) => point.percent)).toEqual([50, 75, 100]);
    expect(trend(entries, 10).map((point) => point.id)).toEqual(['entry-000001', 'entry-000002', 'entry-000003', 'entry-000004']);
  });

  test('filters by mode before limiting', () => {
    expect(trend(entries, 5, 'exam').map((point) => point.percent)).toEqual([25, 50, 100]);
    expect(trend(entries, 1, 'exam').map((point) => point.percent)).toEqual([100]);
    expect(trend(entries, 5, 'practice')).toEqual([{ id: 'entry-000003', finishedAt: 3000, percent: 75, mode: 'practice' }]);
  });

  test('empty for no tests or a zero limit', () => {
    expect(trend([], 5)).toEqual([]);
    expect(trend(entries, 0)).toEqual([]);
  });
});

describe('topicMastery', () => {
  const topics = [
    { id: 'alpha', questionCount: 4 },
    { id: 'beta', questionCount: 2 },
    { id: 'gamma', questionCount: 0 },
  ];

  test('nothing taken yet', () => {
    expect(topicMastery([], topics)).toEqual([
      { topic: 'alpha', total: 4, seen: 0, mastered: 0, percent: 0 },
      { topic: 'beta', total: 2, seen: 0, mastered: 0, percent: 0 },
      { topic: 'gamma', total: 0, seen: 0, mastered: 0, percent: 0 },
    ]);
  });

  test('counts different questions seen and those last answered right', () => {
    const entries = [
      entry(2, 0, {
        questions: [
          { id: 'a1', topic: 'alpha', correct: true },
          { id: 'b1', topic: 'beta', correct: false },
        ],
      }),
      entry(1, 0, {
        questions: [
          { id: 'a1', topic: 'alpha', correct: false },
          { id: 'a2', topic: 'alpha', correct: true },
        ],
      }),
    ];

    expect(topicMastery(entries, topics).slice(0, 2)).toEqual([
      { topic: 'alpha', total: 4, seen: 2, mastered: 2, percent: 50 },
      { topic: 'beta', total: 2, seen: 1, mastered: 0, percent: 0 },
    ]);
  });

  test('the latest result of a question wins, whatever order the entries are given in', () => {
    const older = entry(1, 0, { questions: [{ id: 'a1', topic: 'alpha', correct: true }] });
    const newer = entry(2, 0, { questions: [{ id: 'a1', topic: 'alpha', correct: false }] });

    expect(topicMastery([older, newer], topics)[0]).toMatchObject({ seen: 1, mastered: 0 });
    expect(topicMastery([newer, older], topics)[0]).toMatchObject({ seen: 1, mastered: 0 });
  });

  test('a topic that is no longer in the catalog is left out, and seen never exceeds what exists', () => {
    const entries = [
      entry(1, 0, {
        questions: [
          { id: 'old1', topic: 'removed', correct: true },
          { id: 'b1', topic: 'beta', correct: true },
          { id: 'b2', topic: 'beta', correct: true },
          { id: 'b3', topic: 'beta', correct: true },
        ],
      }),
    ];
    const result = topicMastery(entries, topics);

    expect(result.map((item) => item.topic)).toEqual(['alpha', 'beta', 'gamma']);
    expect(result[1]).toEqual({ topic: 'beta', total: 2, seen: 2, mastered: 2, percent: 100 });
  });
});

describe('sparklinePoints', () => {
  test('no values is an empty string', () => {
    expect(sparklinePoints([], 100, 20)).toBe('');
  });

  test('one value is a flat line across the box', () => {
    expect(sparklinePoints([50], 100, 20)).toBe('0,10 100,10');
    expect(sparklinePoints([100], 100, 20)).toBe('0,0 100,0');
  });

  test('several values are spread evenly, 100 at the top and 0 at the bottom', () => {
    expect(sparklinePoints([0, 50, 100], 100, 20)).toBe('0,20 50,10 100,0');
    expect(sparklinePoints([100, 0], 60, 10)).toBe('0,0 60,10');
  });

  test('values outside 0 to 100 are clamped and coordinates are rounded', () => {
    expect(sparklinePoints([-20, 140], 10, 10)).toBe('0,10 10,0');
    expect(sparklinePoints([33, 66, 10], 10, 7)).toBe('0,4.69 5,2.38 10,6.3');
  });
});
