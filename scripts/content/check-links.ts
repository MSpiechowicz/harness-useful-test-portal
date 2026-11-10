import { buildCatalog } from '../../src/lib/content/validate';
import { readContentFiles } from './files';
import { classifyStatus } from './links';

const TIMEOUT_MS = 15_000;
const CONCURRENCY = 8;
const USER_AGENT = 'harness-test-portal-link-check (+https://github.com/MSpiechowicz/harness-useful-test-portal)';

async function request(url: string, method: 'HEAD' | 'GET'): Promise<Response> {
  return fetch(url, { method, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'user-agent': USER_AGENT } });
}

/** HEAD first; many sites reject it, so a bad status is retried as GET before it counts. */
async function probe(url: string): Promise<{ verdict: 'ok' | 'warn' | 'fail'; detail: string }> {
  try {
    let response = await request(url, 'HEAD');

    if (classifyStatus(response.status) !== 'ok') response = await request(url, 'GET');

    return { verdict: classifyStatus(response.status), detail: `HTTP ${response.status}` };
  } catch (error) {
    return { verdict: 'fail', detail: error instanceof Error ? error.message : String(error) };
  }
}

const { topics, questions } = await readContentFiles();
const { catalog } = buildCatalog(topics, questions);

const usedBy = new Map<string, string[]>();

for (const question of catalog.questions) {
  for (const source of question.sources) usedBy.set(source.url, [...(usedBy.get(source.url) ?? []), question.id]);
}

const urls = [...usedBy.keys()].sort();
let failed = 0;
let warned = 0;
let next = 0;

async function worker(): Promise<void> {
  while (next < urls.length) {
    const url = urls[next++];
    const { verdict, detail } = await probe(url);
    const ids = usedBy.get(url)?.join(', ');

    if (verdict === 'fail') {
      failed += 1;
      console.log(`FAIL ${detail} ${url} (${ids})`);
    } else if (verdict === 'warn') {
      warned += 1;
      console.log(`warn ${detail} ${url} (${ids})`);
    }
  }
}

await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));

console.log(`links: ${urls.length} checked, ${failed} broken, ${warned} inconclusive`);
process.exit(failed > 0 ? 1 : 0);
