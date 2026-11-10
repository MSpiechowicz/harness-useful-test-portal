import { buildCatalog, formatIssue, hasErrors, type ContentIssue } from '../../src/lib/content/validate';
import { readContentFiles } from './files';

const { topics, questions, stray } = await readContentFiles();
const { catalog, issues } = buildCatalog(topics, questions);

const all: ContentIssue[] = [
  ...issues,
  ...stray.map((file): ContentIssue => ({ severity: 'error', file, field: '', message: 'unexpected file in content/topics' })),
];

for (const issue of all) console.log(formatIssue(issue));

const errors = all.filter((issue) => issue.severity === 'error').length;
const warnings = all.length - errors;

console.log(`content: ${catalog.topics.length} topics, ${catalog.questions.length} questions, ${errors} errors, ${warnings} warnings`);

process.exit(hasErrors(all) ? 1 : 0);
