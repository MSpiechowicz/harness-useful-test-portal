import { describe, expect, test } from 'bun:test';
import { buildCatalog } from '../../src/lib/content/validate';
import { classifyStatus } from './links';
import { isSlug, questionTemplate, topicTemplate } from './templates';

describe('scaffolding templates', () => {
  test('a new topic and each question type pass the schema, with TODO warnings only', () => {
    const questions = {
      '/content/topics/demo/questions/q-single.json': questionTemplate('q-single', 'single'),
      '/content/topics/demo/questions/q-multi.json': questionTemplate('q-multi', 'multi'),
      '/content/topics/demo/questions/q-tf.json': questionTemplate('q-tf', 'true-false'),
    };
    const { catalog, issues } = buildCatalog({ '/content/topics/demo/topic.json': topicTemplate('demo') }, questions);

    expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(issues.some((issue) => issue.severity === 'warning')).toBe(true);
    expect(catalog.questions).toHaveLength(3);
  });

  test('slug check matches the schema rule', () => {
    expect(isSlug('prompt-basics')).toBe(true);
    expect(isSlug('Prompt')).toBe(false);
    expect(isSlug('a--b')).toBe(false);
    expect(isSlug('a'.repeat(65))).toBe(false);
  });
});

describe('classifyStatus', () => {
  test('separates live pages, dead pages and inconclusive answers', () => {
    expect([200, 301, 304].map(classifyStatus)).toEqual(['ok', 'ok', 'ok']);
    expect([404, 410].map(classifyStatus)).toEqual(['fail', 'fail']);
    expect([403, 429, 503].map(classifyStatus)).toEqual(['warn', 'warn', 'warn']);
  });
});
