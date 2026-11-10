import { describe, expect, test } from 'bun:test';
import { multi, questionPath, single, topic, topicPath, trueFalse, validFiles, type Files } from './__fixtures__/samples';
import { buildCatalog, normalizePath, UnreadableFile } from './validate';

function errors(files: Files) {
  return buildCatalog(files.topics, files.questions).issues.filter((issue) => issue.severity === 'error');
}

function withQuestion(question: Record<string, unknown>, slug = 'alpha'): Files {
  const files = validFiles();

  files.questions = { [questionPath(slug, String(question.id))]: question };

  return files;
}

function expectError(files: Files, file: string, field: string, message: RegExp) {
  const found = errors(files);

  expect(found.some((issue) => issue.file === file && issue.field === field && message.test(issue.message))).toBe(true);
}

describe('buildCatalog: valid content', () => {
  test('accepts a topic with single, multi and true-false questions', () => {
    const files = validFiles();

    files.questions = {
      [questionPath('alpha', 'q-single')]: single('q-single'),
      [questionPath('alpha', 'q-multi')]: multi('q-multi'),
      [questionPath('alpha', 'q-tf')]: trueFalse('q-tf', { $schema: '../../../schema/question.schema.json' }),
    };

    const { catalog, issues } = buildCatalog(files.topics, files.questions);

    expect(issues).toEqual([]);
    expect(catalog.topics.map((entry) => [entry.id, entry.questionCount])).toEqual([['alpha', 3]]);
    expect(catalog.questions.map((entry) => [entry.id, entry.topic])).toEqual([
      ['q-multi', 'alpha'],
      ['q-single', 'alpha'],
      ['q-tf', 'alpha'],
    ]);
  });

  test('sorts topics by order, then id, with a default order of 1000', () => {
    const files = {
      topics: {
        [topicPath('b-topic')]: topic('b-topic'),
        [topicPath('a-topic')]: topic('a-topic'),
        [topicPath('z-first')]: topic('z-first', { order: 1 }),
      },
      questions: {
        [questionPath('b-topic', 'qb')]: single('qb'),
        [questionPath('a-topic', 'qa')]: single('qa'),
        [questionPath('z-first', 'qz')]: single('qz'),
      },
    };

    const { catalog } = buildCatalog(files.topics, files.questions);

    expect(catalog.topics.map((entry) => entry.id)).toEqual(['z-first', 'a-topic', 'b-topic']);
    expect(catalog.questions.map((entry) => entry.id)).toEqual(['qz', 'qa', 'qb']);
  });

  test('accepts per-locale text and normalizes Windows-style relative paths', () => {
    const files = {
      topics: { 'content\\topics\\alpha\\topic.json': topic('alpha', { title: { en: 'Alpha' } }) },
      questions: { 'content\\topics\\alpha\\questions\\q-single.json': single('q-single', { prompt: { en: 'Pick a.' } }) },
    };

    expect(buildCatalog(files.topics, files.questions).issues).toEqual([]);
  });
});

describe('buildCatalog: rejection rules', () => {
  test('topic folder name must equal its id', () => {
    const files = validFiles();

    files.topics = { [topicPath('alpha')]: topic('beta') };
    expectError(files, topicPath('alpha'), 'id', /folder name/);
  });

  test('question file name must equal its id', () => {
    expectError(
      { ...validFiles(), questions: { [questionPath('alpha', 'other')]: single('q-single') } },
      questionPath('alpha', 'other'),
      'id',
      /file name/,
    );
  });

  test('question ids are unique across topics', () => {
    const files = validFiles();

    files.topics[topicPath('beta')] = topic('beta');
    files.questions[questionPath('beta', 'q-single')] = single('q-single');

    const found = errors(files);

    expect(found.filter((issue) => /duplicate question id/.test(issue.message))).toHaveLength(1);
  });

  test('option ids are unique', () => {
    const question = single('q-single', {
      options: [
        { id: 'a', text: 'A' },
        { id: 'a', text: 'B' },
      ],
    });

    expectError(withQuestion(question), questionPath('alpha', 'q-single'), 'options.1.id', /duplicate option id/);
  });

  test('correct entries must be option ids', () => {
    expectError(withQuestion(single('q-single', { correct: ['zzz'] })), questionPath('alpha', 'q-single'), 'correct.0', /not an option id/);
  });

  test('correct entries must not repeat', () => {
    const question = multi('q-multi', { correct: ['a', 'a'] });

    expectError(withQuestion(question), questionPath('alpha', 'q-multi'), 'correct.1', /duplicate correct/);
  });

  test('single needs exactly one correct option', () => {
    const two = single('q-single', { correct: ['a', 'b'] });
    const none = single('q-single', { correct: [] });

    expect(errors(withQuestion(two)).some((issue) => issue.field === 'correct')).toBe(true);
    expect(errors(withQuestion(none)).some((issue) => issue.field === 'correct')).toBe(true);
  });

  test('multi needs at least two correct options', () => {
    expectError(withQuestion(multi('q-multi', { correct: ['a'] })), questionPath('alpha', 'q-multi'), 'correct', /at least two/);
  });

  test('multi cannot mark every option correct', () => {
    const question = multi('q-multi', { correct: ['a', 'b', 'c'] });

    expectError(withQuestion(question), questionPath('alpha', 'q-multi'), 'correct', /every option/);
  });

  test('sources must be https', () => {
    const question = single('q-single', { sources: [{ title: 'Docs', url: 'http://example.com/docs' }] });

    expectError(withQuestion(question), questionPath('alpha', 'q-single'), 'sources.0.url', /https/);
  });

  test('source urls must not carry credentials', () => {
    const question = single('q-single', { sources: [{ title: 'Docs', url: 'https://user:pass@example.com/docs' }] });

    expectError(withQuestion(question), questionPath('alpha', 'q-single'), 'sources.0.url', /credentials/);
  });

  test('source urls must be unique', () => {
    const entry = { title: 'Docs', url: 'https://example.com/docs' };
    const question = single('q-single', { sources: [entry, { ...entry, title: 'Again' }] });

    expectError(withQuestion(question), questionPath('alpha', 'q-single'), 'sources.1.url', /duplicate source/);
  });

  test('at least one source is required', () => {
    expect(errors(withQuestion(single('q-single', { sources: [] }))).some((issue) => issue.field === 'sources')).toBe(true);
  });

  test('localized text rejects an unknown locale key', () => {
    const question = single('q-single', { prompt: { en: 'Pick a.', xx: 'Wybierz a.' } });

    expect(errors(withQuestion(question)).some((issue) => issue.field.startsWith('prompt'))).toBe(true);
  });

  test('localized text requires English', () => {
    const topicWithoutEn = topic('alpha', { title: { de: 'Alpha' } });
    const files = { ...validFiles(), topics: { [topicPath('alpha')]: topicWithoutEn } };

    expect(errors(files).some((issue) => issue.file === topicPath('alpha') && issue.field.startsWith('title'))).toBe(true);
  });

  test('unknown keys are rejected on questions and topics', () => {
    expect(errors(withQuestion(single('q-single', { topic: 'alpha' }))).some((issue) => /Unrecognized key/.test(issue.message))).toBe(true);

    const files = { ...validFiles(), topics: { [topicPath('alpha')]: topic('alpha', { colour: 'red' }) } };

    expect(errors(files).some((issue) => /Unrecognized key/.test(issue.message))).toBe(true);
  });

  test('a questions folder without topic.json is reported', () => {
    const files = validFiles();

    files.questions[questionPath('orphan', 'q-orphan')] = single('q-orphan');
    expectError(files, questionPath('orphan', 'q-orphan'), '', /no topic\.json/);
  });

  test('a topic with zero questions is reported', () => {
    const files = validFiles();

    files.topics[topicPath('empty')] = topic('empty');
    expectError(files, topicPath('empty'), '', /no questions/);
  });

  test('invalid JSON is reported', () => {
    const files = validFiles();

    files.questions[questionPath('alpha', 'broken')] = new UnreadableFile('Unexpected token');
    expectError(files, questionPath('alpha', 'broken'), '', /not valid JSON/);
  });

  test('files outside the expected layout are reported', () => {
    const files = validFiles();

    files.questions['/content/topics/alpha/nested/q.json'] = single('q');
    expectError(files, '/content/topics/alpha/nested/q.json', '', /must live at/);
  });

  test('invalid files stay out of the catalog but do not hide valid ones', () => {
    const files = validFiles();

    files.questions[questionPath('alpha', 'bad')] = single('bad', { correct: ['nope'] });

    const { catalog } = buildCatalog(files.topics, files.questions);

    expect(catalog.questions.map((entry) => entry.id)).toEqual(['q-single']);
  });
});

describe('buildCatalog: warnings', () => {
  test('placeholder TODO text warns but does not fail', () => {
    const files = withQuestion(single('q-single', { prompt: 'TODO: write me' }));
    const { issues } = buildCatalog(files.topics, files.questions);

    expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(issues.some((issue) => issue.severity === 'warning' && issue.field === 'prompt')).toBe(true);
  });
});

describe('normalizePath', () => {
  test('keeps import.meta.glob style absolute paths', () => {
    expect(normalizePath('/content/topics/a/topic.json')).toBe('/content/topics/a/topic.json');
  });

  test('turns repo-relative and dotted paths into the POSIX absolute form', () => {
    expect(normalizePath('content/topics/a/topic.json')).toBe('/content/topics/a/topic.json');
    expect(normalizePath('./content/topics/a/topic.json')).toBe('/content/topics/a/topic.json');
  });

  test('handles backslashes and absolute Windows or POSIX paths', () => {
    expect(normalizePath('content\\topics\\a\\questions\\q.json')).toBe('/content/topics/a/questions/q.json');
    expect(normalizePath('C:\\work\\repo\\content\\topics\\a\\topic.json')).toBe('/content/topics/a/topic.json');
    expect(normalizePath('/home/me/repo/content/topics/a/topic.json')).toBe('/content/topics/a/topic.json');
  });
});
