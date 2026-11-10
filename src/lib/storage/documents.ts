import { QUIZ_MODES, type QuizMode } from '../quiz/state';

/** Larger stored documents, like the backend's, are refused. */
export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;

/** The documents kept besides the settings: the finished tests and the test in progress. */
export type DocumentName = 'history' | 'session';

export const MODE_STORAGE_KEY = 'harness-test-portal:mode';

/** The slice of `Storage` used here, so tests can pass a plain object. */
export type DocumentStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Same shape as the backend's command errors. */
export interface DocumentError {
  code: 'invalidInput' | 'io';
  message: string;
}

/** The browser's localStorage, or null when it is unavailable (blocked, or no window). */
export function browserDocumentStorage(): DocumentStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function documentKey(name: DocumentName): string {
  return `harness-test-portal:${name}`;
}

function failure(code: DocumentError['code'], message: string): DocumentError {
  return { code, message };
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function usable(storage: DocumentStorage | null): DocumentStorage {
  if (!storage) throw failure('io', 'Browser storage is not available.');

  return storage;
}

/** Keeps a damaged document under `<key>.bak` (replacing an older backup) and removes it from its place. */
function moveAside(storage: DocumentStorage, key: string, text: string): void {
  try {
    storage.setItem(`${key}.bak`, text);
    storage.removeItem(key);
  } catch {
    throw failure('io', `Could not read ${key} and could not set it aside.`);
  }
}

function parsed(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

/**
 * The stored document, or null when there is none. A stored value that is not JSON or is too large is moved to
 * `<key>.bak` and reported as `invalidInput`; storage that cannot be read is `io`.
 */
export function readDocument(storage: DocumentStorage | null, name: DocumentName): unknown {
  const target = usable(storage);
  const key = documentKey(name);
  let text: string | null;

  try {
    text = target.getItem(key);
  } catch {
    throw failure('io', `Could not read ${key}.`);
  }

  if (text === null) return null;

  const result = byteLength(text) > MAX_DOCUMENT_BYTES ? { ok: false as const } : parsed(text);

  if (result.ok) return result.value;

  moveAside(target, key, text);

  throw failure('invalidInput', `The saved ${name} could not be read and was kept as ${key}.bak`);
}

/** Stores the document; null clears it. Over the size cap is `invalidInput` and nothing is written; a failed write is `io`. */
export function writeDocument(storage: DocumentStorage | null, name: DocumentName, value: unknown): void {
  const target = usable(storage);
  const key = documentKey(name);

  if (value === null) {
    try {
      target.removeItem(key);
    } catch {
      throw failure('io', `Could not clear ${key}.`);
    }

    return;
  }

  const text = JSON.stringify(value) as string | undefined;

  if (text === undefined) throw failure('invalidInput', `The ${name} cannot be saved.`);
  if (byteLength(text) > MAX_DOCUMENT_BYTES) throw failure('invalidInput', `The ${name} is too large to save.`);

  try {
    target.setItem(key, text);
  } catch {
    throw failure('io', `Could not save ${key}.`);
  }
}

/** The mode picked last time; exam when nothing valid is stored or storage is unavailable. */
export function readStoredMode(storage: Pick<Storage, 'getItem'> | null): QuizMode {
  try {
    const value = storage?.getItem(MODE_STORAGE_KEY);

    return QUIZ_MODES.find((mode) => mode === value) ?? 'exam';
  } catch {
    return 'exam';
  }
}

/** Best effort: the choice only lasts this session when storage refuses it. */
export function writeStoredMode(storage: Pick<Storage, 'setItem'> | null, mode: QuizMode): void {
  try {
    storage?.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    /* private mode or a full quota */
  }
}
