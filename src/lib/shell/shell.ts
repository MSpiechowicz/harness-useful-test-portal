import { Channel, invoke } from '@tauri-apps/api/core';
import type { QuizMode } from '../quiz/state';
import { parseSettings, type Settings } from '../settings/schema';
import { browserStorage, readStoredSettings, writeStoredSettings } from '../settings/storage';
import {
  browserDocumentStorage,
  readDocument,
  readStoredMode,
  writeDocument,
  writeStoredMode,
  type DocumentName,
} from '../storage/documents';

export type { DocumentName } from '../storage/documents';

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

/** The code of a failed command, or null when the error is not one of the backend's. */
export function errorCode(error: unknown): ShellErrorCode | null {
  return isShellError(error) ? error.code : null;
}

/** A failed command rejects with a plain string or an error object. */
export function errorText(error: unknown, fallback: string): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (isShellError(error)) return error.message;

  return fallback;
}

/**
 * Saved settings: the backend's file in the app, localStorage in a browser. Defaults when nothing is stored. Rejects
 * when the backend cannot read its file, so the caller can tell that apart from there being nothing to read.
 */
export async function loadSettings(): Promise<Settings> {
  if (!isShell()) return readStoredSettings(browserStorage());

  return parseSettings(await invoke<unknown>('settings_load'));
}

/**
 * A stored document: null when there is none. Rejects with `{ code, message }`: `invalidInput` when it was damaged
 * (the backend keeps a `.bak` copy) and `io` when it could not be read at all.
 */
export async function loadDocument(name: DocumentName): Promise<unknown> {
  if (!isShell()) return readDocument(browserDocumentStorage(), name);

  return invoke<unknown>('data_load', { name });
}

/** Stores a document; `null` clears it. Rejects with `{ code, message }` when it cannot be written. */
export async function saveDocument(name: DocumentName, value: unknown): Promise<void> {
  if (!isShell()) {
    writeDocument(browserDocumentStorage(), name, value);

    return;
  }

  await invoke<void>('data_save', { name, value });
}

/** The mode (exam or practice) picked last time; kept on this device only. */
export function readMode(): QuizMode {
  return readStoredMode(browserStorage());
}

export function writeMode(mode: QuizMode): void {
  writeStoredMode(browserStorage(), mode);
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
