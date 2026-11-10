import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { QUESTION_TYPES, type QuestionType } from '../../src/lib/content/schema';
import { TOPICS_DIR } from './files';
import { isSlug, questionTemplate, toJsonFile, topicTemplate } from './templates';

const USAGE = `Usage:
  bun run new:topic <slug>
  bun run new:question <topic> <id> [--type single|multi|true-false]`;

function fail(message: string): never {
  console.error(`error: ${message}\n\n${USAGE}`);
  process.exit(1);
}

async function createTopic(slug: string | undefined): Promise<void> {
  if (!slug) fail('missing topic slug');
  if (!isSlug(slug)) fail(`"${slug}" is not a valid slug (lowercase letters, digits and single hyphens, at most 64 characters)`);

  const path = join(TOPICS_DIR, slug, 'topic.json');

  if (existsSync(path)) fail(`${path} already exists; refusing to overwrite`);

  await Bun.write(path, toJsonFile(topicTemplate(slug)));
  console.log(`created content/topics/${slug}/topic.json`);
  console.log(`next: bun run new:question ${slug} <id>`);
}

async function createQuestion(topic: string | undefined, id: string | undefined, args: string[]): Promise<void> {
  if (!topic || !id) fail('missing topic or question id');
  if (!isSlug(topic)) fail(`"${topic}" is not a valid slug`);
  if (!isSlug(id)) fail(`"${id}" is not a valid slug (lowercase letters, digits and single hyphens, at most 64 characters)`);

  const typeIndex = args.indexOf('--type');
  const type = typeIndex === -1 ? 'single' : args[typeIndex + 1];

  if (!QUESTION_TYPES.includes(type as QuestionType)) fail(`--type must be one of ${QUESTION_TYPES.join(', ')}`);

  if (!existsSync(join(TOPICS_DIR, topic, 'topic.json'))) {
    fail(`unknown topic "${topic}"; create it first with: bun run new:topic ${topic}`);
  }

  const path = join(TOPICS_DIR, topic, 'questions', `${id}.json`);

  if (existsSync(path)) fail(`${path} already exists; refusing to overwrite`);

  const taken = new Bun.Glob(`*/questions/${id}.json`);

  for await (const other of taken.scan({ cwd: TOPICS_DIR })) {
    fail(`question id "${id}" is already used by content/topics/${other}; ids are unique across topics`);
  }

  await Bun.write(path, toJsonFile(questionTemplate(id, type as QuestionType)));
  console.log(`created content/topics/${topic}/questions/${id}.json (${type})`);
}

const [command, ...rest] = process.argv.slice(2);

if (command === 'topic') await createTopic(rest[0]);
else if (command === 'question') await createQuestion(rest[0], rest[1], rest.slice(2));
else fail(command ? `unknown command "${command}"` : 'missing command');
