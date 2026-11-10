import { matchLocale } from '../content/localize';
import { DEFAULT_LOCALE, LOCALE_CODES, type LocaleCode } from './codes';
import { en, type MessageKey, type Messages } from './locales/en';

export type { MessageKey } from './locales/en';
export { LOCALE_CODES, type LocaleCode } from './codes';

/** English is complete; other locales may leave keys out and fall back to it. */
const catalogs: Record<LocaleCode, Partial<Messages>> = { en };

/** Display names for the language setting, each in its own language. */
export const LOCALE_NAMES: Record<LocaleCode, string> = { en: 'English' };

let current: LocaleCode = DEFAULT_LOCALE;

/** Switches the UI language to the closest shipped locale for `language`; unknown tags give English. */
export function setLocale(language: string): LocaleCode {
  current = matchLocale(language) ?? DEFAULT_LOCALE;

  return current;
}

export function currentLocale(): LocaleCode {
  return current;
}

export function availableLocales(): readonly LocaleCode[] {
  return LOCALE_CODES;
}

/** The message for `key` in the current locale (English when untranslated), with `{name}` placeholders filled from `params`. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const template = catalogs[current][key] ?? en[key];

  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** Picks the singular or plural message by count; `{count}` is filled in automatically. */
export function tn(count: number, one: MessageKey, other: MessageKey, params?: Record<string, string | number>): string {
  return t(count === 1 ? one : other, { count, ...params });
}
