export const THEMES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEMES)[number];
export type ResolvedTheme = 'light' | 'dark';

/** Where the preference is mirrored so static/theme-boot.js can set the theme before the first paint. */
export const THEME_CACHE_KEY = 'harness-test-portal:theme';

/** The theme to show: an explicit choice wins, "system" follows the OS (dark when it expresses no preference). */
export function resolveTheme(preference: ThemePreference, prefersLight: boolean): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference;

  return prefersLight ? 'light' : 'dark';
}

/** Stores the preference for the boot script. Storage failures are swallowed (the setting itself is saved elsewhere). */
export function writeThemeCache(storage: Pick<Storage, 'setItem'> | null, preference: ThemePreference): void {
  try {
    storage?.setItem(THEME_CACHE_KEY, preference);
  } catch {
    /* private mode or a full quota: the first paint falls back to the OS theme */
  }
}
