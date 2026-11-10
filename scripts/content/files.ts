import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { UnreadableFile } from '../../src/lib/content/validate';

export const ROOT = resolve(import.meta.dir, '..', '..');
export const CONTENT_DIR = join(ROOT, 'content');
export const TOPICS_DIR = join(CONTENT_DIR, 'topics');

export interface ContentFiles {
  topics: Record<string, unknown>;
  questions: Record<string, unknown>;
  /** Files under content/topics that are neither a topic nor a question file. */
  stray: string[];
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await Bun.file(path).text());
  } catch (error) {
    return new UnreadableFile(error instanceof Error ? error.message : String(error));
  }
}

/** Reads content/topics the way the app's `import.meta.glob` does: path (relative to the repo root) -> parsed JSON. */
export async function readContentFiles(): Promise<ContentFiles> {
  const topics: Record<string, unknown> = {};
  const questions: Record<string, unknown> = {};
  const stray: string[] = [];

  if (!existsSync(TOPICS_DIR)) return { topics, questions, stray };

  for await (const file of new Bun.Glob('**/*').scan({ cwd: TOPICS_DIR, onlyFiles: true })) {
    const posix = file.replaceAll('\\', '/');
    const relative = `content/topics/${posix}`;
    const parts = posix.split('/');

    if (parts.length === 2 && parts[1] === 'topic.json') {
      topics[relative] = await readJson(join(TOPICS_DIR, file));
    } else if (parts.length === 3 && parts[1] === 'questions' && parts[2].endsWith('.json')) {
      questions[relative] = await readJson(join(TOPICS_DIR, file));
    } else if (!parts.at(-1)?.startsWith('.')) {
      stray.push(`/${relative}`);
    }
  }

  return { topics, questions, stray };
}
