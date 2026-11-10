import { SLUG_RE, type QuestionType } from '../../src/lib/content/schema';

export function isSlug(value: string): boolean {
  return value.length <= 64 && SLUG_RE.test(value);
}

export function topicTemplate(slug: string): Record<string, unknown> {
  return {
    $schema: '../../schema/topic.schema.json',
    id: slug,
    title: 'TODO: topic title',
    description: 'TODO: one or two sentences on what this topic covers.',
    group: 'TODO: group heading',
    order: 1000,
  };
}

const COMMON = {
  difficulty: 'basic',
  explanation: 'TODO: why the answer is right, in plain text. `backticks` render as inline code.',
  sources: [{ title: 'TODO: source title', url: 'https://example.com/TODO' }],
};

/** A question file that passes the schema; the TODO placeholders are reported as warnings until replaced. */
export function questionTemplate(id: string, type: QuestionType): Record<string, unknown> {
  const head = { $schema: '../../../schema/question.schema.json', id, type };

  if (type === 'true-false') {
    return { ...head, ...COMMON, prompt: 'TODO: a statement that is either true or false.', correct: true };
  }

  const options =
    type === 'single'
      ? [
          { id: 'a', text: 'TODO: correct option' },
          { id: 'b', text: 'TODO: wrong option' },
          { id: 'c', text: 'TODO: wrong option' },
          { id: 'd', text: 'TODO: wrong option' },
        ]
      : [
          { id: 'a', text: 'TODO: correct option' },
          { id: 'b', text: 'TODO: correct option' },
          { id: 'c', text: 'TODO: wrong option' },
          { id: 'd', text: 'TODO: wrong option' },
        ];

  return {
    ...head,
    ...COMMON,
    prompt:
      type === 'single' ? 'TODO: the question, with exactly one right option.' : 'TODO: the question, with two or more right options.',
    options,
    correct: type === 'single' ? ['a'] : ['a', 'b'],
  };
}

export function toJsonFile(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
