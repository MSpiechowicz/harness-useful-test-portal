import type { ResolvedTheme } from './theme';

function initialTheme(): ResolvedTheme {
  if (typeof document === 'undefined') return 'dark';

  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/** The theme on screen right now (static/theme-boot.js sets it first; routes/+layout.svelte keeps it current). */
export const themeState = $state<{ resolved: ResolvedTheme }>({ resolved: initialTheme() });
