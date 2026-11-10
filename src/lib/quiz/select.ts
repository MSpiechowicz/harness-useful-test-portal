import type { CatalogQuestion } from '../content/catalog';
import type { Option } from '../content/schema';
import type { Settings } from '../settings/schema';
import { shuffle, type Rng } from './shuffle';

type PoolFilter = Pick<Settings, 'testStyle' | 'topics' | 'difficulties'>;
type Selection = Pick<Settings, 'questionCount' | 'shuffleQuestions' | 'shuffleOptions'>;

/** A question in the order it is shown, with its options already in display order. */
export interface QuizQuestion {
  question: CatalogQuestion;
  /** Options in display order; empty for true-false. */
  options: Option[];
}

/** Questions matching the style, topics and difficulties ([] topics or difficulties = no restriction). */
export function filterPool(questions: readonly CatalogQuestion[], filter: PoolFilter): CatalogQuestion[] {
  return questions.filter((question) => {
    if (filter.testStyle !== 'mixed' && question.type !== filter.testStyle) return false;
    if (filter.topics.length > 0 && !filter.topics.includes(question.topic)) return false;
    if (filter.difficulties.length > 0 && !filter.difficulties.includes(question.difficulty)) return false;

    return true;
  });
}

/** Lays out `questions` for display; options are shuffled per question when asked. */
export function prepareQuiz(questions: readonly CatalogQuestion[], shuffleOptions: boolean, rng: Rng = Math.random): QuizQuestion[] {
  return questions.map((question) => {
    if (question.type === 'true-false') return { question, options: [] };

    return { question, options: shuffleOptions ? shuffle(question.options, rng) : [...question.options] };
  });
}

/**
 * A test from `pool`: a uniform random sample of `questionCount` questions (all of them when the pool is smaller),
 * in random order when `shuffleQuestions` is on and in catalog order when it is off.
 */
export function selectQuestions(pool: readonly CatalogQuestion[], settings: Selection, rng: Rng = Math.random): QuizQuestion[] {
  const count = Math.min(settings.questionCount, pool.length);
  const sampled = shuffle(pool, rng).slice(0, count);

  if (!settings.shuffleQuestions) {
    const position = new Map(pool.map((question, index) => [question.id, index]));

    sampled.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
  }

  return prepareQuiz(sampled, settings.shuffleOptions, rng);
}

/** How many questions a test can use: the pool size capped at the configured count. */
export function effectiveCount(poolSize: number, questionCount: number): number {
  return Math.min(poolSize, questionCount);
}
