import { DEFAULT_SETTINGS, normalizeSettings, parseSettings, settingsSchema, type Settings } from './schema';

export const SETTINGS_STORAGE_KEY = 'harness-test-portal:settings';

/** The slice of `Storage` used here, so tests can pass a plain object. */
export type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** The browser's localStorage, or null when it is unavailable (blocked, or no window). */
export function browserStorage(): SettingsStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readStoredSettings(storage: SettingsStorage | null): Settings {
  if (!storage) return { ...DEFAULT_SETTINGS };

  try {
    const text = storage.getItem(SETTINGS_STORAGE_KEY);

    return text ? parseSettings(JSON.parse(text)) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Validates, normalizes and stores; returns the saved settings. Storage failures are swallowed (best effort). */
export function writeStoredSettings(storage: SettingsStorage | null, settings: Settings): Settings {
  const normalized = settingsSchema.parse(normalizeSettings(settings));

  try {
    storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    /* private mode or a full quota: the settings last for this session only */
  }

  return normalized;
}
