import { z } from 'zod';
import { DEFAULT_LOCALE, LOCALE_CODES } from '../i18n/codes';
import type { LocalizedText } from './localize';

/** Source of truth for the content files; `bun run content:schema` derives content/schema/*.json from it. */

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const OPTION_ID_RE = /^[a-z0-9-]{1,32}$/;
export const DIFFICULTIES = ['basic', 'intermediate', 'advanced'] as const;
export const QUESTION_TYPES = ['single', 'multi', 'true-false'] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];
export type QuestionType = (typeof QUESTION_TYPES)[number];

const slug = z.string().max(64).regex(SLUG_RE, 'must be a lowercase slug such as "prompt-basics"');

function localized(max: number): z.ZodType<LocalizedText> {
  const text = z.string().min(1).max(max);
  const translations = Object.fromEntries(LOCALE_CODES.filter((code) => code !== DEFAULT_LOCALE).map((code) => [code, text.optional()]));
  const perLocale = z.strictObject({ [DEFAULT_LOCALE]: text, ...translations });

  return z.union([text, perLocale]) as unknown as z.ZodType<LocalizedText>;
}

/** https only, a host, and no user:password in the authority. */
const httpsUrl = z
  .string()
  .max(2048)
  .regex(/^https:\/\/[^/?#@\s]+([/?#]\S*)?$/, 'must be an https URL without credentials')
  .refine((value) => URL.canParse(value), 'must be a parseable URL');

const source = z.strictObject({ title: z.string().min(1).max(200), url: httpsUrl });

const option = z.strictObject({ id: z.string().regex(OPTION_ID_RE, 'must match /^[a-z0-9-]{1,32}$/'), text: localized(300) });

const base = {
  $schema: z.string().optional(),
  id: slug,
  difficulty: z.enum(DIFFICULTIES),
  prompt: localized(1000),
  code: z.string().min(1).max(4000).optional(),
  explanation: localized(2000),
  sources: z.array(source).min(1).max(5),
  tags: z.array(slug).max(10).optional(),
};

function checkCommon(value: { sources: { url: string }[]; tags?: string[] }, ctx: z.RefinementCtx): void {
  const seen = new Set<string>();

  value.sources.forEach((entry, index) => {
    const key = URL.canParse(entry.url) ? new URL(entry.url).href : entry.url;

    if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['sources', index, 'url'], message: 'duplicate source url' });
    seen.add(key);
  });

  if (value.tags && new Set(value.tags).size !== value.tags.length) {
    ctx.addIssue({ code: 'custom', path: ['tags'], message: 'duplicate tags' });
  }
}

function checkChoices(
  value: { options: { id: string }[]; correct: string[]; sources: { url: string }[]; tags?: string[] },
  ctx: z.RefinementCtx,
): void {
  checkCommon(value, ctx);

  const ids = new Set<string>();

  value.options.forEach((entry, index) => {
    if (ids.has(entry.id)) ctx.addIssue({ code: 'custom', path: ['options', index, 'id'], message: `duplicate option id "${entry.id}"` });
    ids.add(entry.id);
  });

  const picked = new Set<string>();

  value.correct.forEach((id, index) => {
    if (!ids.has(id)) ctx.addIssue({ code: 'custom', path: ['correct', index], message: `"${id}" is not an option id` });
    if (picked.has(id)) ctx.addIssue({ code: 'custom', path: ['correct', index], message: `duplicate correct entry "${id}"` });
    picked.add(id);
  });
}

const single = z
  .strictObject({
    ...base,
    type: z.literal('single'),
    options: z.array(option).min(2).max(8),
    correct: z.array(z.string()).length(1, 'single questions need exactly one correct option'),
  })
  .superRefine(checkChoices);

const multi = z
  .strictObject({
    ...base,
    type: z.literal('multi'),
    options: z.array(option).min(3).max(8),
    correct: z.array(z.string()).min(2, 'multi questions need at least two correct options').max(7),
  })
  .superRefine((value, ctx) => {
    checkChoices(value, ctx);

    if (value.correct.length >= value.options.length) {
      ctx.addIssue({ code: 'custom', path: ['correct'], message: 'multi questions cannot mark every option correct' });
    }
  });

const trueFalse = z
  .strictObject({
    ...base,
    type: z.literal('true-false'),
    correct: z.boolean(),
  })
  .superRefine(checkCommon);

export const questionSchema = z.discriminatedUnion('type', [single, multi, trueFalse]);

export const topicSchema = z.strictObject({
  $schema: z.string().optional(),
  id: slug,
  title: localized(120),
  description: localized(400),
  group: localized(80).optional(),
  order: z.number().int().min(-100000).max(100000).optional(),
});

export type Question = z.infer<typeof questionSchema>;
export type TopicFile = z.infer<typeof topicSchema>;
export type Option = z.infer<typeof option>;
export type Source = z.infer<typeof source>;
export type Slug = string;
