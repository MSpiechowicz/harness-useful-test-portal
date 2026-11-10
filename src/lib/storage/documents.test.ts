import { describe, expect, test } from 'bun:test';
import {
  documentKey,
  MAX_DOCUMENT_BYTES,
  MODE_STORAGE_KEY,
  readDocument,
  readStoredMode,
  writeDocument,
  writeStoredMode,
  type DocumentStorage,
} from './documents';

function memory(initial: Record<string, string> = {}): DocumentStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));

  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe('keys', () => {
  test('follow the contract', () => {
    expect(documentKey('history')).toBe('harness-test-portal:history');
    expect(documentKey('session')).toBe('harness-test-portal:session');
    expect(MODE_STORAGE_KEY).toBe('harness-test-portal:mode');
  });
});

describe('round trip', () => {
  test('nothing stored reads as null', () => {
    expect(readDocument(memory(), 'history')).toBeNull();
  });

  test('stores and reads back a value, per name', () => {
    const storage = memory();

    writeDocument(storage, 'history', { version: 1, entries: [1, 2] });
    writeDocument(storage, 'session', { id: 'x' });

    expect(readDocument(storage, 'history')).toEqual({ version: 1, entries: [1, 2] });
    expect(readDocument(storage, 'session')).toEqual({ id: 'x' });
    expect(storage.data.get('harness-test-portal:history')).toBe('{"version":1,"entries":[1,2]}');
  });

  test('saving null clears the document', () => {
    const storage = memory();

    writeDocument(storage, 'session', { id: 'x' });
    writeDocument(storage, 'session', null);

    expect(readDocument(storage, 'session')).toBeNull();
    expect(storage.data.size).toBe(0);
  });
});

describe('damaged data', () => {
  test('text that is not JSON is kept as the backup (replacing an older one), reports invalidInput and reads as empty next time', () => {
    const storage = memory({ 'harness-test-portal:history': '{not json', 'harness-test-portal:history.bak': 'older backup' });
    let thrown: unknown;

    try {
      readDocument(storage, 'history');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({ code: 'invalidInput', message: expect.stringContaining('kept as harness-test-portal:history.bak') });
    expect(storage.data.get('harness-test-portal:history.bak')).toBe('{not json');
    expect(storage.data.has('harness-test-portal:history')).toBe(false);
    expect(readDocument(storage, 'history')).toBeNull();
  });

  test('a stored value over the cap is moved aside the same way', () => {
    const storage = memory({ 'harness-test-portal:session': JSON.stringify('x'.repeat(MAX_DOCUMENT_BYTES)) });

    expect(() => readDocument(storage, 'session')).toThrow();
    expect(storage.data.has('harness-test-portal:session.bak')).toBe(true);
    expect(storage.data.has('harness-test-portal:session')).toBe(false);
  });

  test('when the damaged value cannot be set aside it stays put and the error is io', () => {
    const storage = memory({ 'harness-test-portal:history': 'nope' });
    const full: DocumentStorage = {
      getItem: (key) => storage.getItem(key),
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: (key) => storage.removeItem(key),
    };

    expect(() => readDocument(full, 'history')).toThrow(expect.objectContaining({ code: 'io' }));
    expect(storage.data.get('harness-test-portal:history')).toBe('nope');
  });
});

describe('failures', () => {
  test('a write the browser refuses is io', () => {
    const storage: DocumentStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => undefined,
    };

    expect(() => writeDocument(storage, 'history', { a: 1 })).toThrow(expect.objectContaining({ code: 'io' }));
  });

  test('a read the browser refuses is io', () => {
    const storage: DocumentStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };

    expect(() => readDocument(storage, 'history')).toThrow(expect.objectContaining({ code: 'io' }));
  });

  test('unavailable storage is io for both', () => {
    expect(() => readDocument(null, 'history')).toThrow(expect.objectContaining({ code: 'io' }));
    expect(() => writeDocument(null, 'history', {})).toThrow(expect.objectContaining({ code: 'io' }));
  });

  test('a value over the cap is invalidInput and nothing is written', () => {
    const storage = memory({ 'harness-test-portal:history': '{"keep":true}' });

    expect(() => writeDocument(storage, 'history', 'x'.repeat(MAX_DOCUMENT_BYTES))).toThrow(
      expect.objectContaining({ code: 'invalidInput' }),
    );
    expect(storage.data.get('harness-test-portal:history')).toBe('{"keep":true}');
  });

  test('a value just under the cap is stored', () => {
    const storage = memory();

    writeDocument(storage, 'history', 'x'.repeat(MAX_DOCUMENT_BYTES - 2));

    expect(storage.data.get('harness-test-portal:history')?.length).toBe(MAX_DOCUMENT_BYTES);
  });

  test('the cap counts bytes, not characters', () => {
    expect(() => writeDocument(memory(), 'history', 'é'.repeat(MAX_DOCUMENT_BYTES / 2))).toThrow(
      expect.objectContaining({ code: 'invalidInput' }),
    );
  });

  test('a value JSON cannot represent is invalidInput', () => {
    expect(() => writeDocument(memory(), 'history', undefined)).toThrow(expect.objectContaining({ code: 'invalidInput' }));
  });
});

describe('mode preference', () => {
  test('defaults to exam', () => {
    expect(readStoredMode(memory())).toBe('exam');
    expect(readStoredMode(null)).toBe('exam');
    expect(readStoredMode(memory({ [MODE_STORAGE_KEY]: 'cram' }))).toBe('exam');
  });

  test('round trips and survives storage that throws', () => {
    const storage = memory();

    writeStoredMode(storage, 'practice');

    expect(readStoredMode(storage)).toBe('practice');
    expect(() =>
      writeStoredMode(
        {
          setItem: () => {
            throw new Error('quota');
          },
        },
        'exam',
      ),
    ).not.toThrow();
    expect(
      readStoredMode({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toBe('exam');
  });
});
