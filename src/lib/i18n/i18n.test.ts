import { describe, expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { currentLocale, LOCALE_CODES, setLocale, t, tn } from './index';

describe('locales', () => {
  test('shipped locale codes match the files in locales/', () => {
    const files = readdirSync(join(import.meta.dir, 'locales'))
      .filter((name) => name.endsWith('.ts'))
      .map((name) => name.replace(/\.ts$/, ''))
      .sort();

    const codes: string[] = [...LOCALE_CODES];

    expect(codes.sort()).toEqual(files);
  });
});

describe('t', () => {
  test('fills placeholders and leaves unknown ones in place', () => {
    expect(t('home.questionMany', { count: 3 })).toBe('3 questions');
    expect(t('home.questionMany')).toBe('{count} questions');
  });

  test('tn picks singular or plural by count', () => {
    expect(tn(1, 'home.questionOne', 'home.questionMany')).toBe('1 question');
    expect(tn(0, 'home.questionOne', 'home.questionMany')).toBe('0 questions');
    expect(tn(2, 'home.questionOne', 'home.questionMany')).toBe('2 questions');
  });

  test('an unknown language falls back to English', () => {
    expect(setLocale('xx-YY')).toBe('en');
    expect(currentLocale()).toBe('en');
    expect(t('nav.home')).toBe('Home');
  });
});
