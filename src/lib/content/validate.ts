import { LOCALE_CODES, DEFAULT_LOCALE } from '../i18n/codes';
import { topicOrder, type Catalog, type CatalogQuestion, type CatalogTopic } from './catalog';
import { questionSchema, topicSchema, type Question, type TopicFile } from './schema';

export interface ContentIssue {
  severity: 'error' | 'warning';
  /** POSIX path such as `/content/topics/llm-basics/topic.json`. */
  file: string;
  /** Dotted field path, or an empty string for the file as a whole. */
  field: string;
  message: string;
}

/** Stands in for a file whose JSON could not be parsed, so the validator can report it. */
export class UnreadableFile {
  constructor(readonly reason: string) {}
}

export interface BuildResult {
  catalog: Catalog;
  issues: ContentIssue[];
}

const TOPIC_RE = /^\/content\/topics\/([^/]+)\/topic\.json$/;
const QUESTION_RE = /^\/content\/topics\/([^/]+)\/questions\/([^/]+)\.json$/;

/**
 * Brings a discovered file path to the POSIX `/content/topics/...` form, whether it comes from
 * `import.meta.glob` (already absolute), `Bun.Glob` (relative, maybe backslashes on Windows) or an absolute path.
 */
export function normalizePath(path: string): string {
  const posix = path.replaceAll('\\', '/');
  const marker = 'content/topics/';
  const index = posix.lastIndexOf(marker);

  return index === -1 ? posix : `/${posix.slice(index)}`;
}

/** Re-keys files by normalized path; the first path wins if two normalize to the same one. */
function normalizeKeys(files: Record<string, unknown>): Map<string, unknown> {
  const normalized = new Map<string, unknown>();

  for (const path of Object.keys(files).sort()) {
    const key = normalizePath(path);

    if (!normalized.has(key)) normalized.set(key, files[path]);
  }

  return normalized;
}

function fieldPath(path: PropertyKey[]): string {
  return path.map(String).join('.');
}

/** Warnings for placeholder text left behind by the scaffolding commands. */
function collectPlaceholders(value: unknown, path: string[], found: string[]): void {
  if (typeof value === 'string') {
    if (value.includes('TODO')) found.push(fieldPath(path));
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => collectPlaceholders(item, [...path, String(index)], found));
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) collectPlaceholders(item, [...path, key], found);
  }
}

/** Non-English locales the app ships but a text does not translate. */
function missingTranslations(value: unknown, path: string[], found: { field: string; locale: string }[]): void {
  if (!value || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => missingTranslations(item, [...path, String(index)], found));

    return;
  }

  const record = value as Record<string, unknown>;

  if (typeof record[DEFAULT_LOCALE] === 'string') {
    for (const locale of LOCALE_CODES) {
      if (locale !== DEFAULT_LOCALE && typeof record[locale] !== 'string') found.push({ field: fieldPath(path), locale });
    }

    return;
  }

  for (const [key, item] of Object.entries(record)) missingTranslations(item, [...path, key], found);
}

/** Plain-string texts are English-only, so shipped non-English locales miss them too. */
function plainTextFields(value: unknown, path: string[], found: string[]): void {
  if (!value || typeof value !== 'object') return;

  const record = value as Record<string, unknown>;

  for (const key of ['title', 'description', 'group', 'prompt', 'explanation']) {
    if (typeof record[key] === 'string') found.push(fieldPath([...path, key]));
  }

  if (Array.isArray(record.options)) {
    record.options.forEach((entry, index) => {
      if (entry && typeof entry === 'object' && typeof (entry as { text?: unknown }).text === 'string') {
        found.push(fieldPath([...path, 'options', String(index), 'text']));
      }
    });
  }
}

/**
 * Validates every discovered content file and builds the catalog from the valid ones. Pure: both the app
 * (`import.meta.glob`) and the scripts (`Bun.Glob`) hand it `path -> parsed JSON`.
 */
export function buildCatalog(topicFiles: Record<string, unknown>, questionFiles: Record<string, unknown>): BuildResult {
  const issues: ContentIssue[] = [];
  const error = (file: string, field: string, message: string) => issues.push({ severity: 'error', file, field, message });
  const warn = (file: string, field: string, message: string) => issues.push({ severity: 'warning', file, field, message });

  const topicsByPath = normalizeKeys(topicFiles);
  const questionsByPath = normalizeKeys(questionFiles);

  const nonEnglish = LOCALE_CODES.filter((code) => code !== DEFAULT_LOCALE);

  function reportWarnings(file: string, raw: unknown): void {
    const placeholders: string[] = [];

    collectPlaceholders(raw, [], placeholders);
    for (const field of placeholders) warn(file, field, 'placeholder text (TODO) left in the file');

    if (nonEnglish.length === 0) return;

    const missing: { field: string; locale: string }[] = [];

    missingTranslations(raw, [], missing);
    for (const entry of missing) warn(file, entry.field, `missing "${entry.locale}" translation`);

    const plain: string[] = [];

    plainTextFields(raw, [], plain);
    for (const field of plain) warn(file, field, `plain text has no "${nonEnglish.join('", "')}" translation`);
  }

  // Topics
  const topics = new Map<string, TopicFile>();

  for (const [file, raw] of topicsByPath) {
    const match = TOPIC_RE.exec(file);

    if (!match) {
      error(file, '', 'topic files must live at /content/topics/<slug>/topic.json');
      continue;
    }

    if (raw instanceof UnreadableFile) {
      error(file, '', `not valid JSON: ${raw.reason}`);
      continue;
    }

    const parsed = topicSchema.safeParse(raw);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) error(file, fieldPath(issue.path), issue.message);
      continue;
    }

    if (parsed.data.id !== match[1]) {
      error(file, 'id', `id "${parsed.data.id}" must equal the folder name "${match[1]}"`);
      continue;
    }

    reportWarnings(file, raw);
    topics.set(match[1], parsed.data);
  }

  // Questions
  const questions = new Map<string, CatalogQuestion>();
  const questionFileById = new Map<string, string>();
  const folders = new Set<string>();

  for (const [file, raw] of questionsByPath) {
    const match = QUESTION_RE.exec(file);

    if (!match) {
      error(file, '', 'question files must live at /content/topics/<slug>/questions/<id>.json');
      continue;
    }

    const [, folder, name] = match;

    folders.add(folder);

    if (!topicsByPath.has(`/content/topics/${folder}/topic.json`)) {
      error(file, '', `questions folder "${folder}" has no topic.json`);
      continue;
    }

    if (raw instanceof UnreadableFile) {
      error(file, '', `not valid JSON: ${raw.reason}`);
      continue;
    }

    const parsed = questionSchema.safeParse(raw);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) error(file, fieldPath(issue.path), issue.message);
      continue;
    }

    const question: Question = parsed.data;

    if (question.id !== name) {
      error(file, 'id', `id "${question.id}" must equal the file name "${name}"`);
      continue;
    }

    const earlier = questionFileById.get(question.id);

    if (earlier) {
      error(file, 'id', `duplicate question id "${question.id}" (also in ${earlier})`);
      continue;
    }

    reportWarnings(file, raw);
    questionFileById.set(question.id, file);

    if (topics.has(folder)) questions.set(question.id, { ...question, topic: folder });
  }

  // Topics without any question
  for (const [id] of topics) {
    const count = [...questions.values()].filter((question) => question.topic === id).length;
    const hasFiles = folders.has(id);

    if (count === 0 && !hasFiles) error(`/content/topics/${id}/topic.json`, '', 'topic has no questions');
  }

  const catalogTopics: CatalogTopic[] = [...topics].map(([id, topic]) => ({
    id,
    title: topic.title,
    description: topic.description,
    group: topic.group,
    order: topicOrder(topic),
    questionCount: [...questions.values()].filter((question) => question.topic === id).length,
  }));

  catalogTopics.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  const topicIndex = new Map(catalogTopics.map((topic, index) => [topic.id, index]));
  const catalogQuestions = [...questions.values()].sort(
    (a, b) => (topicIndex.get(a.topic) ?? 0) - (topicIndex.get(b.topic) ?? 0) || a.id.localeCompare(b.id),
  );

  return { catalog: { topics: catalogTopics, questions: catalogQuestions }, issues };
}

export function hasErrors(issues: readonly ContentIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}

export function formatIssue(issue: ContentIssue): string {
  const field = issue.field ? ` ${issue.field}:` : '';

  return `${issue.severity === 'error' ? 'error' : 'warn '} ${issue.file}${field} ${issue.message}`;
}
