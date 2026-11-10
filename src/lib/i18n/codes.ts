/**
 * Locales the app ships, in plain TypeScript so scripts and tests can read them. Adding a locale means a new
 * file under locales/ plus an entry here; i18n.test.ts fails when the two disagree.
 */
export const LOCALE_CODES = ['en'] as const;

export type LocaleCode = (typeof LOCALE_CODES)[number];

export const DEFAULT_LOCALE: LocaleCode = 'en';
