import { errorText, loadSettings, saveSettings } from '../shell/shell';
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from './schema';

export const settingsState = $state<{
  value: Settings;
  loaded: boolean;
  /** Why the saved settings could not be read. While set, defaults are in use and nothing is written to disk. */
  loadError: string | null;
  saveError: string | null;
  savedAt: number | null;
}>({
  value: { ...DEFAULT_SETTINGS },
  loaded: false,
  loadError: null,
  saveError: null,
  savedAt: null,
});

// Saves run one after another so the last change always wins on disk.
let queue: Promise<void> = Promise.resolve();

export async function initSettings(): Promise<void> {
  if (settingsState.loaded) return;

  try {
    settingsState.value = await loadSettings();
  } catch (error) {
    // The file may still hold good settings: use defaults for now and never write over it.
    settingsState.loadError = errorText(error, 'load failed');
  }

  settingsState.loaded = true;
}

function persist(): void {
  if (settingsState.loadError !== null) return;

  const snapshot = $state.snapshot(settingsState.value);

  queue = queue.then(async () => {
    try {
      // The backend's normalized copy replaces ours only if nothing changed meanwhile.
      const saved = await saveSettings(snapshot);

      settingsState.saveError = null;
      settingsState.savedAt = Date.now();
      if (JSON.stringify($state.snapshot(settingsState.value)) === JSON.stringify(snapshot)) settingsState.value = saved;
    } catch (error) {
      settingsState.saveError = error instanceof Error ? error.message : typeof error === 'string' ? error : 'save failed';
    }
  });
}

/** Applies a change at once and saves it in the background. */
export function updateSettings(patch: Partial<Settings>): void {
  settingsState.value = normalizeSettings({ ...settingsState.value, ...patch });
  persist();
}

export function resetSettings(): void {
  settingsState.value = { ...DEFAULT_SETTINGS };
  persist();
}
