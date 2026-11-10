import { describe, expect, test } from 'bun:test';
import { catalogQuestion } from '../content/__fixtures__/samples';
import { DEFAULT_SETTINGS } from '../settings/schema';
import { effectiveCount, filterPool, prepareQuiz, selectQuestions } from './select';
import { shuffle } from './shuffle';
import { seeded } from './test-rng';

const pool = [
  catalogQuestion('a1', 'alpha', { difficulty: 'basic' }),
  catalogQuestion('a2', 'alpha', { difficulty: 'advanced', type: 'multi' }),
  catalogQuestion('b1', 'beta', { difficulty: 'basic', type: 'true-false' }),
  catalogQuestion('b2', 'beta', { difficulty: 'intermediate' }),
  catalogQuestion('c1', 'gamma', { difficulty: 'intermediate', type: 'multi' }),
  catalogQuestion('c2', 'gamma', { difficulty: 'advanced' }),
];

const ids = (list: readonly { id: string }[]) => list.map((entry) => entry.id);

describe('shuffle', () => {
  test('is a permutation and leaves the input untouched', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const result = shuffle(input, seeded(7));

    expect([...result].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('is deterministic for a given generator', () => {
    expect(shuffle([1, 2, 3, 4, 5, 6], seeded(42))).toEqual(shuffle([1, 2, 3, 4, 5, 6], seeded(42)));
  });
});

describe('filterPool', () => {
  const open: Parameters<typeof filterPool>[1] = { testStyle: 'mixed', topics: [], difficulties: [] };

  test('empty topics and difficulties mean no restriction', () => {
    expect(ids(filterPool(pool, open))).toEqual(ids(pool));
  });

  test('filters by test style', () => {
    expect(ids(filterPool(pool, { ...open, testStyle: 'single' }))).toEqual(['a1', 'b2', 'c2']);
    expect(ids(filterPool(pool, { ...open, testStyle: 'multi' }))).toEqual(['a2', 'c1']);
    expect(ids(filterPool(pool, { ...open, testStyle: 'true-false' }))).toEqual(['b1']);
  });

  test('filters by topics and difficulties together', () => {
    expect(ids(filterPool(pool, { ...open, topics: ['alpha', 'gamma'], difficulties: ['advanced'] }))).toEqual(['a2', 'c2']);
  });

  test('an unknown topic leaves the pool empty', () => {
    expect(filterPool(pool, { ...open, topics: ['nope'] })).toEqual([]);
  });
});

describe('selectQuestions', () => {
  const settings = { questionCount: 3, shuffleQuestions: true, shuffleOptions: true };

  test('samples the requested count without repeats', () => {
    const picked = ids(selectQuestions(pool, settings, seeded(1)).map((entry) => entry.question));

    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
    expect(picked.every((id) => ids(pool).includes(id))).toBe(true);
  });

  test('uses the whole pool when it is smaller than the count', () => {
    const picked = selectQuestions(pool, { ...settings, questionCount: 50 }, seeded(1));

    expect(picked).toHaveLength(pool.length);
  });

  test('different seeds give different samples', () => {
    const samples = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => ids(selectQuestions(pool, settings, seeded(seed)).map((entry) => entry.question)).join()),
    );

    expect(samples.size).toBeGreaterThan(1);
  });

  test('keeps catalog order when question shuffling is off', () => {
    for (const seed of [1, 2, 3, 4]) {
      const picked = ids(selectQuestions(pool, { ...settings, shuffleQuestions: false }, seeded(seed)).map((entry) => entry.question));
      const sorted = [...picked].sort((a, b) => ids(pool).indexOf(a) - ids(pool).indexOf(b));

      expect(picked).toEqual(sorted);
    }
  });

  test('sampling is uniform enough: every question is picked sometimes', () => {
    const counts = new Map<string, number>();

    for (let seed = 1; seed <= 300; seed += 1) {
      for (const entry of selectQuestions(pool, settings, seeded(seed)))
        counts.set(entry.question.id, (counts.get(entry.question.id) ?? 0) + 1);
    }

    expect(counts.size).toBe(pool.length);
    for (const count of counts.values()) expect(count).toBeGreaterThan(90);
  });

  test('an empty pool gives an empty test', () => {
    expect(selectQuestions([], settings, seeded(1))).toEqual([]);
  });
});

describe('prepareQuiz', () => {
  test('keeps the authored option order when shuffling is off', () => {
    const [entry] = prepareQuiz([pool[0]], false);

    expect(entry.options.map((option) => option.id)).toEqual(['a', 'b', 'c']);
  });

  test('shuffles options without losing any, and true-false has none', () => {
    const entries = prepareQuiz(pool, true, seeded(9));

    for (const entry of entries) {
      const original = entry.question.type === 'true-false' ? [] : entry.question.options.map((option) => option.id);

      expect(entry.options.map((option) => option.id).sort()).toEqual([...original].sort());
    }
  });
});

describe('effectiveCount', () => {
  test('caps the count at the pool size', () => {
    expect(effectiveCount(8, DEFAULT_SETTINGS.questionCount)).toBe(8);
    expect(effectiveCount(80, DEFAULT_SETTINGS.questionCount)).toBe(20);
    expect(effectiveCount(0, 20)).toBe(0);
  });
});
