import { describe, expect, test } from 'bun:test';
import { resolveTheme, THEME_CACHE_KEY, THEMES, writeThemeCache } from './theme';

describe('resolveTheme', () => {
  test('an explicit theme ignores the OS preference', () => {
    expect([resolveTheme('light', false), resolveTheme('light', true)]).toEqual(['light', 'light']);
    expect([resolveTheme('dark', false), resolveTheme('dark', true)]).toEqual(['dark', 'dark']);
  });

  test('system follows the OS and is dark when the OS prefers nothing', () => {
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
  });

  test('every preference resolves to light or dark', () => {
    for (const preference of THEMES) expect(['light', 'dark']).toContain(resolveTheme(preference, true));
  });
});

describe('writeThemeCache', () => {
  test('stores the preference under the key the boot script reads', () => {
    const stored: Record<string, string> = {};

    writeThemeCache({ setItem: (key, value) => void (stored[key] = value) }, 'light');

    expect(THEME_CACHE_KEY).toBe('harness-test-portal:theme');
    expect(stored).toEqual({ 'harness-test-portal:theme': 'light' });
  });

  test('storage that throws or is missing never breaks', () => {
    const broken = {
      setItem: () => {
        throw new Error('quota');
      },
    };

    expect(() => writeThemeCache(broken, 'dark')).not.toThrow();
    expect(() => writeThemeCache(null, 'dark')).not.toThrow();
  });
});
