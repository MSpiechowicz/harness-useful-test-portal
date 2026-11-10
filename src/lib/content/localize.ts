import { DEFAULT_LOCALE, LOCALE_CODES, type LocaleCode } from '../i18n/codes';

/** Plain text, or per-locale text where English is always present. */
export type LocalizedText = string | ({ en: string } & Partial<Record<LocaleCode, string>>);

/** The shipped locale for a language tag such as `en-GB`, or null when none matches. */
export function matchLocale(language: string): LocaleCode | null {
  const tag = language.toLowerCase();
  const exact = LOCALE_CODES.find((code) => code === tag);

  if (exact) return exact;

  const base = tag.split('-')[0];

  return LOCALE_CODES.find((code) => code === base) ?? null;
}

/** The text for `language`: its own translation, then the base language, then English. */
export function localize(text: LocalizedText, language: string): string {
  if (typeof text === 'string') return text;

  const locale = matchLocale(language);
  const translated = locale ? text[locale] : undefined;

  return translated ?? text[DEFAULT_LOCALE];
}
