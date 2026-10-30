/** Disposable app-owned bytes; credentials and signed URLs never enter this store. */
export const DURABLE_MEDIA_MAX_BYTES = 128 * 1024 * 1024;
export const DURABLE_MEDIA_MAX_ENTRIES = 512;
export const DURABLE_MEDIA_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DATABASE = 'eimir-authorized-media-v1';
const STORE = 'media';
const EPOCH_KEY = 'eimir-media-epoch-v1';
interface Row {
  key: string;
  epoch: string;
  blob: Blob;
  savedAt: number;
  usedAt: number;
}
let tail: Promise<unknown> = Promise.resolve();
function epoch(): string | undefined {
  try {
    let value = localStorage.getItem(EPOCH_KEY);
    if (!value) {
      value = crypto.randomUUID();
      localStorage.setItem(EPOCH_KEY, value);
    }
    return value;
  } catch {
    return undefined;
  }
}
export function captureDurableMediaEpoch(): string | undefined {
  return epoch();
}
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Media store blocked'));
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, set: (value: T) => void) => void,
): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let value: T;
      tx.oncomplete = () => resolve(value);
      tx.onerror = tx.onabort = () => reject(tx.error);
      operation(tx.objectStore(STORE), (next) => {
        value = next;
      });
    });
  } finally {
    db.close();
  }
}
function enqueue(operation: () => Promise<unknown>): Promise<void> {
  const next = tail.then(operation).catch(() => undefined);
  tail = next;
  return next.then(() => undefined);
}
export function clearDurableMediaStore(): void {
  // Rotate synchronously before deletion; a late old write cannot join a new login.
  try {
    localStorage.setItem(EPOCH_KEY, crypto.randomUUID());
  } catch {
    try {
      localStorage.removeItem(EPOCH_KEY);
    } catch {
      /* Storage unavailable. */
    }
  }
  void enqueue(() =>
    transaction<void>('readwrite', (store) => {
      store.clear();
    }),
  );
}
export async function readDurableMedia(
  key: string,
  capturedEpoch: string,
): Promise<Blob | undefined> {
  if (epoch() !== capturedEpoch) return undefined;
  try {
    const row = await transaction<Row | undefined>('readonly', (store, set) => {
      const request = store.get(key);
      request.onsuccess = () => set(request.result);
    });
    if (
      !row ||
      row.epoch !== capturedEpoch ||
      epoch() !== capturedEpoch ||
      row.savedAt > Date.now() ||
      Date.now() - row.savedAt >= DURABLE_MEDIA_MAX_AGE_MS
    )
      return undefined;
    void enqueue(async () => {
      if (epoch() !== capturedEpoch) return;
      await transaction<void>('readwrite', (store) => {
        const request = store.get(key);
        request.onsuccess = () => {
          const current = request.result as Row | undefined;
          if (current?.savedAt === row.savedAt)
            store.put({ ...current, usedAt: Date.now() });
        };
      });
    });
    return row.blob;
  } catch {
    return undefined;
  }
}
export function writeDurableMedia(
  key: string,
  capturedEpoch: string,
  blob: Blob,
  isCurrent: () => boolean,
): Promise<void> {
  return enqueue(async () => {
    if (
      blob.size > DURABLE_MEDIA_MAX_BYTES ||
      epoch() !== capturedEpoch ||
      !isCurrent()
    )
      return;
    await transaction<void>('readwrite', (store) => {
      const request = store.getAll();
      request.onsuccess = () => {
        if (epoch() !== capturedEpoch || !isCurrent()) return;
        const now = Date.now();
        const rows = (request.result as Row[])
          .filter((row) => {
            const keep =
              row.key !== key &&
              row.epoch === capturedEpoch &&
              row.savedAt <= now &&
              now - row.savedAt < DURABLE_MEDIA_MAX_AGE_MS;
            if (!keep) store.delete(row.key);
            return keep;
          })
          .sort((a, b) => a.usedAt - b.usedAt);
        let bytes =
          rows.reduce((sum, row) => sum + row.blob.size, 0) + blob.size;
        while (
          rows.length >= DURABLE_MEDIA_MAX_ENTRIES ||
          bytes > DURABLE_MEDIA_MAX_BYTES
        ) {
          const oldest = rows.shift();
          if (!oldest) break;
          bytes -= oldest.blob.size;
          store.delete(oldest.key);
        }
        store.put({
          key,
          epoch: capturedEpoch,
          blob,
          savedAt: now,
          usedAt: now,
        } satisfies Row);
      };
    });
  });
}
export function evictDurableMedia(prefix: string): void {
  void enqueue(() =>
    transaction<void>('readwrite', (store) => {
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (String(cursor.key).startsWith(prefix)) cursor.delete();
        cursor.continue();
      };
    }),
  );
}
