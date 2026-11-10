import { z } from 'zod';
import { DIFFICULTIES, SLUG_RE, type Difficulty } from '../content/schema';
import { THEMES } from '../theme/theme';

/** Mirrors the Rust side (serde camelCase); src-tauri/fixtures/settings-default.json holds the same defaults. */

export const TEST_STYLES = ['mixed', 'single', 'multi', 'true-false'] as const;
export type TestStyle = (typeof TEST_STYLES)[number];

export const SETTINGS_BOUNDS = {
  questionCount: { min: 5, max: 100 },
  timerMinutes: { min: 0, max: 180 },
  topics: { max: 200 },
  language: { maxLength: 16 },
} as const;

const LANGUAGE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

export const settingsSchema = z.strictObject({
  version: z.literal(1),
  language: z.string().max(SETTINGS_BOUNDS.language.maxLength).regex(LANGUAGE_RE),
  theme: z.enum(THEMES),
  questionCount: z.number().int().min(SETTINGS_BOUNDS.questionCount.min).max(SETTINGS_BOUNDS.questionCount.max),
  timerMinutes: z.number().int().min(SETTINGS_BOUNDS.timerMinutes.min).max(SETTINGS_BOUNDS.timerMinutes.max),
  testStyle: z.enum(TEST_STYLES),
  topics: z.array(z.string().max(64).regex(SLUG_RE)).max(SETTINGS_BOUNDS.topics.max),
  difficulties: z.array(z.enum(DIFFICULTIES)),
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
  checkForUpdates: z.boolean(),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  language: 'en',
  theme: 'system',
  questionCount: 20,
  timerMinutes: 30,
  testStyle: 'mixed',
  topics: [],
  difficulties: [],
  shuffleQuestions: true,
  shuffleOptions: true,
  checkForUpdates: true,
};

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/** Dedupes and sorts the list fields, like the backend does when it saves. */
export function normalizeSettings(settings: Settings): Settings {
  return {
    ...settings,
    topics: unique(settings.topics).sort(),
    difficulties: unique(settings.difficulties).sort((a: Difficulty, b: Difficulty) => DIFFICULTIES.indexOf(a) - DIFFICULTIES.indexOf(b)),
  };
}

/**
 * Settings from untrusted stored data: each field that is missing or invalid falls back to its default and
 * unknown fields are dropped, so one bad value never discards the rest.
 */
export function parseSettings(raw: unknown): Settings {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const result: Record<string, unknown> = { ...DEFAULT_SETTINGS };

  for (const key of Object.keys(settingsSchema.shape) as (keyof Settings)[]) {
    const parsed = settingsSchema.shape[key].safeParse(input[key]);

    if (parsed.success) result[key] = parsed.data;
  }

  return normalizeSettings(result as Settings);
}

/** Keeps a topic selection to topics that still exist; an emptied selection means "all". */
export function pruneTopics(selected: readonly string[], known: readonly string[]): string[] {
  const knownSet = new Set(known);

  return selected.filter((id) => knownSet.has(id));
}
