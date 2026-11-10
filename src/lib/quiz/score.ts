import type { CatalogQuestion } from '../content/catalog';
import type { Slug } from '../content/schema';

/** Option ids for single and multi questions; a boolean for true-false. Absent or empty = unanswered. */
export type Answer = string[] | boolean;

export type AnswerMap = Record<string, Answer | undefined>;

export function isAnswered(answer: Answer | undefined): boolean {
  if (answer === undefined) return false;

  return typeof answer === 'boolean' || answer.length > 0;
}

/** All-or-nothing: the chosen options must be exactly the correct ones. Unanswered is wrong. */
export function isCorrect(question: CatalogQuestion, answer: Answer | undefined): boolean {
  if (!isAnswered(answer)) return false;

  if (question.type === 'true-false') return answer === question.correct;
  if (typeof answer === 'boolean') return false;

  const chosen = new Set(answer);

  return chosen.size === question.correct.length && question.correct.every((id) => chosen.has(id));
}

export interface QuestionResult {
  question: CatalogQuestion;
  answer: Answer | undefined;
  answered: boolean;
  correct: boolean;
}

export interface TopicScore {
  topic: Slug;
  correct: number;
  total: number;
}

export interface Score {
  correct: number;
  total: number;
  /** Whole percent, rounded half up; 0 for an empty test. */
  percent: number;
  /** Topics in order of first appearance in the test. */
  topics: TopicScore[];
  results: QuestionResult[];
}

export function scoreQuiz(questions: readonly CatalogQuestion[], answers: AnswerMap): Score {
  const results = questions.map((question): QuestionResult => {
    const answer = answers[question.id];

    return { question, answer, answered: isAnswered(answer), correct: isCorrect(question, answer) };
  });

  const topics = new Map<Slug, TopicScore>();

  for (const result of results) {
    const entry = topics.get(result.question.topic) ?? { topic: result.question.topic, correct: 0, total: 0 };

    entry.total += 1;
    if (result.correct) entry.correct += 1;
    topics.set(result.question.topic, entry);
  }

  const correct = results.filter((result) => result.correct).length;

  return {
    correct,
    total: results.length,
    percent: results.length === 0 ? 0 : Math.round((correct / results.length) * 100),
    topics: [...topics.values()],
    results,
  };
}
