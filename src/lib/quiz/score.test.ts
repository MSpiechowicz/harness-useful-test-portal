import { describe, expect, test } from 'bun:test';
import { catalogQuestion } from '../content/__fixtures__/samples';
import { isAnswered, isCorrect, scoreQuiz } from './score';

const single = catalogQuestion('s1', 'alpha');
const multi = catalogQuestion('m1', 'alpha', { type: 'multi' });
const truth = catalogQuestion('t1', 'beta', { type: 'true-false' });

describe('isCorrect', () => {
  test('single: the one correct option', () => {
    expect(isCorrect(single, ['a'])).toBe(true);
    expect(isCorrect(single, ['b'])).toBe(false);
  });

  test('multi is all-or-nothing, in any order', () => {
    expect(isCorrect(multi, ['b', 'a'])).toBe(true);
    expect(isCorrect(multi, ['a'])).toBe(false);
    expect(isCorrect(multi, ['a', 'b', 'c'])).toBe(false);
    expect(isCorrect(multi, ['a', 'c'])).toBe(false);
  });

  test('true-false compares the boolean, including false answers', () => {
    expect(isCorrect(truth, true)).toBe(true);
    expect(isCorrect(truth, false)).toBe(false);
    expect(isCorrect(catalogQuestion('t2', 'beta', { type: 'true-false', correct: false }), false)).toBe(true);
  });

  test('unanswered is wrong', () => {
    expect(isCorrect(single, undefined)).toBe(false);
    expect(isCorrect(multi, [])).toBe(false);
    expect(isAnswered([])).toBe(false);
    expect(isAnswered(false)).toBe(true);
  });
});

describe('scoreQuiz', () => {
  test('counts correct answers, percent and per-topic totals', () => {
    const score = scoreQuiz([single, multi, truth], { s1: ['a'], m1: ['a'], t1: true });

    expect(score.correct).toBe(2);
    expect(score.total).toBe(3);
    expect(score.percent).toBe(67);
    expect(score.topics).toEqual([
      { topic: 'alpha', correct: 1, total: 2 },
      { topic: 'beta', correct: 1, total: 1 },
    ]);
    expect(score.results.map((result) => [result.question.id, result.answered, result.correct])).toEqual([
      ['s1', true, true],
      ['m1', true, false],
      ['t1', true, true],
    ]);
  });

  test('flags unanswered questions', () => {
    const score = scoreQuiz([single, truth], {});

    expect(score.correct).toBe(0);
    expect(score.results.every((result) => !result.answered)).toBe(true);
  });

  test('an empty test scores zero', () => {
    expect(scoreQuiz([], {})).toMatchObject({ correct: 0, total: 0, percent: 0, topics: [] });
  });
});
