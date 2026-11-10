import { Channel, invoke } from '@tauri-apps/api/core';
import { DEFAULT_SETTINGS, parseSettings, type Settings } from '../settings/schema';
import { browserStorage, readStoredSettings, writeStoredSettings } from '../settings/storage';

/** A newer release the app's updater found. */
export interface UpdateInfo {
  version: string;
  currentVersion: string;
  date: string | null;
  notes: string | null;
}

/** One step of an update being installed. `total` is null while the download size is unknown. */
export interface UpdateProgress {
  phase: 'downloading' | 'installing' | 'done';
  downloaded: number;
  total: number | null;
}

export type ShellErrorCode =
  'invalidInput' | 'notFound' | 'forbidden' | 'unsupported' | 'io' | 'process' | 'timeout' | 'protocol' | 'internal';

export interface ShellError {
  code: ShellErrorCode;
  message: string;
}

/** Whether the page runs inside the Tauri window rather than in a plain browser. */
export function isShell(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function isShellError(value: unknown): value is ShellError {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as ShellError).code === 'string' &&
    typeof (value as ShellError).message === 'string'
  );
}

/** True when a failed command says the updater is not available in this build. */
export function isUnsupported(error: unknown): boolean {
  return isShellError(error) && error.code === 'unsupported';
}

/** A failed command rejects with a plain string or an error object. */
export function errorText(error: unknown, fallback: string): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (isShellError(error)) return error.message;

  return fallback;
}

/** Saved settings: the backend's file in the app, localStorage in a browser. Defaults when nothing usable is stored. */
export async function loadSettings(): Promise<Settings> {
  if (!isShell()) return readStoredSettings(browserStorage());

  try {
    return parseSettings(await invoke<unknown>('settings_load'));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Saves and returns the normalized settings. Rejects when the backend refuses them. */
export async function saveSettings(settings: Settings): Promise<Settings> {
  if (!isShell()) return writeStoredSettings(browserStorage(), settings);

  return parseSettings(await invoke<unknown>('settings_save', { settings }));
}

/** The newer release the app's updater found, or null when this one is the latest. */
export function checkShellUpdate(): Promise<UpdateInfo | null> {
  return invoke<UpdateInfo | null>('update_check');
}

/** Downloads and installs the update found by the last check, reporting each step. Resolves once it is installed. */
export function installShellUpdate(onProgress: (progress: UpdateProgress) => void): Promise<void> {
  const channel = new Channel<UpdateProgress>();

  channel.onmessage = onProgress;

  return invoke<void>('update_install', { onProgress: channel });
}

/** Restarts the app. */
export function relaunch(): Promise<void> {
  return invoke<void>('app_relaunch');
}

/** Only https links with a host leave the app, matching what the backend accepts. */
export function isOpenableUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    return parsed.protocol === 'https:' && parsed.hostname !== '' && parsed.username === '' && parsed.password === '';
  } catch {
    return false;
  }
}

/** Opens a link in the system browser: through the backend in the app, a new window in a browser. */
export async function openUrl(url: string): Promise<void> {
  if (!isOpenableUrl(url)) return;

  if (isShell()) {
    await invoke<void>('open_url', { url });

    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}
