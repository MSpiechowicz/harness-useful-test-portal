import type { CatalogQuestion } from '../catalog';

type Json = Record<string, unknown>;

export const topicPath = (slug: string) => `/content/topics/${slug}/topic.json`;
export const questionPath = (slug: string, id: string) => `/content/topics/${slug}/questions/${id}.json`;

export function topic(id = 'alpha', extra: Json = {}): Json {
  return { id, title: 'Alpha', description: 'About alpha.', ...extra };
}

const source = { title: 'Docs', url: 'https://example.com/docs' };

export function single(id = 'q-single', extra: Json = {}): Json {
  return {
    id,
    type: 'single',
    difficulty: 'basic',
    prompt: 'Pick `a`.',
    options: [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
      { id: 'c', text: 'C' },
    ],
    correct: ['a'],
    explanation: 'Because `a`.',
    sources: [source],
    ...extra,
  };
}

export function multi(id = 'q-multi', extra: Json = {}): Json {
  return { ...single(id), type: 'multi', correct: ['a', 'b'], ...extra };
}

export function trueFalse(id = 'q-tf', extra: Json = {}): Json {
  const question = single(id);

  delete question.options;

  return { ...question, type: 'true-false', correct: true, ...extra };
}

export interface Files {
  topics: Record<string, unknown>;
  questions: Record<string, unknown>;
}

/** One topic `alpha` with one single question: the smallest valid content set. */
export function validFiles(): Files {
  return {
    topics: { [topicPath('alpha')]: topic('alpha') },
    questions: { [questionPath('alpha', 'q-single')]: single('q-single') },
  };
}

/** A catalog question for selection and scoring tests. */
export function catalogQuestion(id: string, topicId: string, extra: Json = {}): CatalogQuestion {
  const base = extra.type === 'multi' ? multi(id) : extra.type === 'true-false' ? trueFalse(id) : single(id);

  return { ...base, ...extra, topic: topicId } as unknown as CatalogQuestion;
}
