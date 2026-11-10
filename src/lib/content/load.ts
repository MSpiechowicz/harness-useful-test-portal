import type { Catalog } from './catalog';
import { buildCatalog, formatIssue, type ContentIssue } from './validate';

// Every topic and question file is bundled at build time; the same files are validated by `bun run content:validate`.
const topicFiles = import.meta.glob('/content/topics/*/topic.json', { eager: true, import: 'default' });
const questionFiles = import.meta.glob('/content/topics/*/questions/*.json', { eager: true, import: 'default' });

let cached: { catalog: Catalog; issues: ContentIssue[] } | null = null;

/** The bundled content. Files that fail validation are left out and reported on the console. */
export function loadCatalog(): Catalog {
  if (!cached) {
    cached = buildCatalog(topicFiles, questionFiles);

    for (const issue of cached.issues) {
      if (issue.severity === 'error') console.warn(`[content] ${formatIssue(issue)}`);
    }
  }

  return cached.catalog;
}
