import { join } from 'node:path';
import { z } from 'zod';
import { questionSchema, topicSchema } from '../../src/lib/content/schema';
import { CONTENT_DIR } from './files';

const check = process.argv.includes('--check');
const outputs = [
  { name: 'topic.schema.json', schema: topicSchema },
  { name: 'question.schema.json', schema: questionSchema },
];

let drift = false;

for (const { name, schema } of outputs) {
  const path = join(CONTENT_DIR, 'schema', name);
  const json = `${JSON.stringify(z.toJSONSchema(schema, { io: 'input' }), null, 2)}\n`;

  if (check) {
    const existing = (await Bun.file(path).exists()) ? await Bun.file(path).text() : null;

    if (existing !== json) {
      console.error(`content/schema/${name} is out of date; run "bun run content:schema".`);
      drift = true;
    }
  } else {
    await Bun.write(path, json);
    console.log(`wrote content/schema/${name}`);
  }
}

if (drift) process.exit(1);
if (check) console.log('content/schema is up to date');
