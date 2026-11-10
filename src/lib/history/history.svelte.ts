import { t, tn } from '../i18n';
import { errorCode, errorText, loadDocument, saveDocument } from '../shell/shell';
import { appendEntry, isValidEntry, parseHistory, serializeHistory, type HistoryEntry } from './history';

export const historyState = $state<{
  loaded: boolean;
  /** Newest first. */
  entries: HistoryEntry[];
  /** The stored history is from a newer version: it is shown but never written over. */
  readOnly: boolean;
  /** Something to tell the user that does not stop recording, such as a damaged file kept as a backup. */
  notice: string | null;
  /** The stored history could not be read, so nothing is written this session. */
  error: string | null;
  /** The last save failed; results are still held in memory for this session. */
  saveError: string | null;
}>({
  loaded: false,
  entries: [],
  readOnly: false,
  notice: null,
  error: null,
  saveError: null,
});

// Saves run one after another so the last change always wins on disk.
let queue: Promise<void> = Promise.resolve();
let ready: Promise<void> = Promise.resolve();

/** Whether results are being kept only in memory: the stored history is read-only or unreadable, or the last save failed. */
export function historyUnsaved(): boolean {
  return historyState.readOnly || historyState.error !== null || historyState.saveError !== null;
}

function canWrite(): boolean {
  return !historyState.readOnly && historyState.error === null;
}

async function load(): Promise<void> {
  try {
    const parsed = parseHistory(await loadDocument('history'));

    historyState.entries = parsed.entries;
    historyState.readOnly = parsed.readOnly;

    // Results that cannot be read are left out, and gone from the file once the next result is saved: say so.
    if (parsed.dropped > 0 && !parsed.readOnly) {
      historyState.notice = tn(parsed.dropped, 'history.noticeDroppedOne', 'history.noticeDroppedMany');
    }
  } catch (error) {
    // The backend (or the browser wrapper) has already moved a damaged file aside as a backup: start fresh.
    if (errorCode(error) === 'invalidInput') historyState.notice = t('history.noticeDamaged');
    else historyState.error = t('history.noticeUnreadable');
  }

  historyState.loaded = true;
}

/** Reads the stored history once. */
export function initHistory(): Promise<void> {
  if (historyState.loaded) return ready;

  ready = ready.then(() => (historyState.loaded ? undefined : load()));

  return ready;
}

function enqueueSave(value: unknown): void {
  queue = queue.then(async () => {
    try {
      await saveDocument('history', value);
      historyState.saveError = null;
    } catch (error) {
      historyState.saveError = errorText(error, 'save failed');
    }
  });
}

function commit(entry: HistoryEntry): void {
  const entries = appendEntry($state.snapshot(historyState.entries) as HistoryEntry[], entry);

  historyState.entries = entries;

  if (canWrite()) enqueueSave(serializeHistory(entries));
}

/** Adds a finished test. It is always kept in memory; it is written unless the stored history is read-only or unreadable. */
export function recordResult(entry: HistoryEntry): void {
  if (!isValidEntry(entry)) return;

  if (historyState.loaded) commit(entry);
  else void ready.then(() => commit(entry));
}

/** Empties the history (and removes the stored one unless it is read-only or unreadable). */
export function clearHistory(): void {
  historyState.entries = [];
  historyState.notice = null;

  if (canWrite()) enqueueSave(null);
}
