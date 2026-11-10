import { loadSettings, saveSettings } from '../shell/shell';
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from './schema';

export const settingsState = $state<{ value: Settings; loaded: boolean; saveError: string | null; savedAt: number | null }>({
  value: { ...DEFAULT_SETTINGS },
  loaded: false,
  saveError: null,
  savedAt: null,
});

// Saves run one after another so the last change always wins on disk.
let queue: Promise<void> = Promise.resolve();

export async function initSettings(): Promise<void> {
  if (settingsState.loaded) return;

  settingsState.value = await loadSettings();
  settingsState.loaded = true;
}

function persist(): void {
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
