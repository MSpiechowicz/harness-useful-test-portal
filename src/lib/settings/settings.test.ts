import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SETTINGS, normalizeSettings, parseSettings, pruneTopics, settingsSchema, SETTINGS_BOUNDS } from './schema';
import { readStoredSettings, SETTINGS_STORAGE_KEY, writeStoredSettings, type SettingsStorage } from './storage';

/** The contract from the plan, used when the backend fixture is not present yet. */
const CONTRACT_DEFAULTS = {
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

function memoryStorage(initial?: string): SettingsStorage & { value: string | null } {
  const store = { value: initial ?? null };

  return {
    get value() {
      return store.value;
    },
    getItem: () => store.value,
    setItem: (_key: string, value: string) => {
      store.value = value;
    },
  };
}

describe('defaults', () => {
  test('equal the backend fixture settings-default.json', () => {
    const path = join(import.meta.dir, '..', '..', '..', 'src-tauri', 'fixtures', 'settings-default.json');
    const expected = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : CONTRACT_DEFAULTS;

    expect(DEFAULT_SETTINGS).toEqual(expected);
  });

  test('are valid settings', () => {
    expect(settingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true);
  });
});

describe('bounds', () => {
  const with_ = (patch: Record<string, unknown>) => settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...patch }).success;

  test('questionCount is an integer from 5 to 100', () => {
    expect([
      with_({ questionCount: 4 }),
      with_({ questionCount: 5 }),
      with_({ questionCount: 100 }),
      with_({ questionCount: 101 }),
    ]).toEqual([false, true, true, false]);
    expect(with_({ questionCount: 7.5 })).toBe(false);
    expect(SETTINGS_BOUNDS.questionCount).toEqual({ min: 5, max: 100 });
  });

  test('timerMinutes is an integer from 0 (off) to 180', () => {
    expect([with_({ timerMinutes: -1 }), with_({ timerMinutes: 0 }), with_({ timerMinutes: 180 }), with_({ timerMinutes: 181 })]).toEqual([
      false,
      true,
      true,
      false,
    ]);
  });

  test('version must be 1, test style and language are checked', () => {
    expect(with_({ version: 2 })).toBe(false);
    expect(with_({ testStyle: 'essay' })).toBe(false);
    expect(with_({ language: 'EN' })).toBe(false);
    expect(with_({ language: 'pt-BR' })).toBe(true);
    expect(with_({ language: 'a'.repeat(17) })).toBe(false);
  });

  test('theme is system, light or dark', () => {
    expect([with_({ theme: 'system' }), with_({ theme: 'light' }), with_({ theme: 'dark' })]).toEqual([true, true, true]);
    expect([with_({ theme: 'Dark' }), with_({ theme: '' }), with_({ theme: 'auto' })]).toEqual([false, false, false]);
  });

  test('topics are slugs and at most 200; difficulties are known values', () => {
    expect(with_({ topics: ['Not A Slug'] })).toBe(false);
    expect(with_({ topics: Array.from({ length: 201 }, (_, index) => `t${index}`) })).toBe(false);
    expect(with_({ difficulties: ['expert'] })).toBe(false);
  });
});

describe('parseSettings', () => {
  test('fills missing fields with defaults and ignores unknown ones', () => {
    expect(parseSettings({ questionCount: 40, surprise: true })).toEqual({ ...DEFAULT_SETTINGS, questionCount: 40 });
  });

  test('one invalid field falls back without discarding the others', () => {
    expect(parseSettings({ questionCount: 1000, timerMinutes: 10 })).toEqual({ ...DEFAULT_SETTINGS, timerMinutes: 10 });
  });

  test('a missing or invalid theme falls back to system without discarding the others', () => {
    expect(parseSettings({ questionCount: 40 }).theme).toBe('system');
    expect(parseSettings({ theme: 'auto', questionCount: 40 })).toEqual({ ...DEFAULT_SETTINGS, questionCount: 40 });
    expect(parseSettings({ theme: 'light' }).theme).toBe('light');
  });

  test('non-objects give defaults', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings([1, 2])).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('x')).toEqual(DEFAULT_SETTINGS);
  });

  test('dedupes and sorts topics and difficulties', () => {
    const parsed = parseSettings({ topics: ['b', 'a', 'b'], difficulties: ['advanced', 'basic', 'advanced'] });

    expect(parsed.topics).toEqual(['a', 'b']);
    expect(parsed.difficulties).toEqual(['basic', 'advanced']);
  });
});

describe('normalizeSettings and pruneTopics', () => {
  test('normalize sorts lists', () => {
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, topics: ['z', 'a'] }).topics).toEqual(['a', 'z']);
  });

  test('pruneTopics drops topics that no longer exist', () => {
    expect(pruneTopics(['a', 'gone'], ['a', 'b'])).toEqual(['a']);
    expect(pruneTopics(['gone'], ['a'])).toEqual([]);
  });
});

describe('localStorage persistence', () => {
  test('round-trips normalized settings under the contract key', () => {
    const storage = memoryStorage();
    const saved = writeStoredSettings(storage, { ...DEFAULT_SETTINGS, topics: ['b', 'a'], timerMinutes: 0 });

    expect(saved.topics).toEqual(['a', 'b']);
    expect(SETTINGS_STORAGE_KEY).toBe('harness-test-portal:settings');
    expect(readStoredSettings(storage)).toEqual(saved);
  });

  test('corrupt or missing data reads as defaults', () => {
    expect(readStoredSettings(memoryStorage('{not json'))).toEqual(DEFAULT_SETTINGS);
    expect(readStoredSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
    expect(readStoredSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  test('storage that throws never breaks reading or saving', () => {
    const broken: SettingsStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };

    expect(readStoredSettings(broken)).toEqual(DEFAULT_SETTINGS);
    expect(writeStoredSettings(broken, DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  test('refuses to store invalid settings', () => {
    expect(() => writeStoredSettings(memoryStorage(), { ...DEFAULT_SETTINGS, questionCount: 1 })).toThrow();
  });
});
