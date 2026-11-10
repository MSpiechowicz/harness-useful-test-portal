import { describe, expect, test } from 'bun:test';
import { localize, matchLocale } from './localize';

describe('localize', () => {
  test('plain strings are returned as they are', () => {
    expect(localize('Hello', 'en')).toBe('Hello');
    expect(localize('Hello', 'pl')).toBe('Hello');
  });

  test('uses the translation for a shipped locale', () => {
    expect(localize({ en: 'Hello' }, 'en')).toBe('Hello');
  });

  test('falls back to English for an unknown locale and for regional tags', () => {
    expect(localize({ en: 'Hello' }, 'xx')).toBe('Hello');
    expect(localize({ en: 'Hello' }, 'en-GB')).toBe('Hello');
    expect(localize({ en: 'Hello' }, '')).toBe('Hello');
  });
});

describe('matchLocale', () => {
  test('matches exact and base languages case-insensitively', () => {
    expect(matchLocale('EN')).toBe('en');
    expect(matchLocale('en-US')).toBe('en');
    expect(matchLocale('de')).toBeNull();
  });
});
