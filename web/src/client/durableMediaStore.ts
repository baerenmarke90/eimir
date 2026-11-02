/** Disposable app-owned bytes; credentials and signed URLs never enter this store. */
export const DURABLE_MEDIA_MAX_BYTES = 128 * 1024 * 1024;
export const DURABLE_MEDIA_MAX_ENTRIES = 512;
export const DURABLE_MEDIA_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DATABASE = 'eimir-authorized-media-v1';
const STORE = 'media';
const METADATA = 'metadata';
const EPOCH_KEY = 'eimir-media-epoch-v1';
interface Row {
  key: string;
  epoch: string;
  blob: Blob;
  savedAt: number;
  usedAt: number;
}
type Metadata = Omit<Row, 'blob'> & { bytes: number };
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
    const request = indexedDB.open(DATABASE, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      // Disposable v1 entries have no independent size index. Discard them
      // without materializing every old Blob during the one-time upgrade.
      if (db.objectStoreNames.contains(STORE)) db.deleteObjectStore(STORE);
      db.createObjectStore(STORE, { keyPath: 'key' });
      db.createObjectStore(METADATA, { keyPath: 'key' });
    };
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
      const tx = db.transaction([STORE, METADATA], mode);
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
      store.transaction.objectStore(METADATA).clear();
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
        const metadata = store.transaction.objectStore(METADATA);
        const request = metadata.get(key);
        request.onsuccess = () => {
          const current = request.result as Metadata | undefined;
          if (current?.savedAt === row.savedAt)
            metadata.put({ ...current, usedAt: Date.now() });
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
      !blob.type.startsWith('image/') ||
      blob.size > DURABLE_MEDIA_MAX_BYTES ||
      epoch() !== capturedEpoch ||
      !isCurrent()
    )
      return;
    await transaction<void>('readwrite', (store) => {
      const metadata = store.transaction.objectStore(METADATA);
      const remove = (rowKey: string) => {
        store.delete(rowKey);
        metadata.delete(rowKey);
      };
      // Eviction scans small metadata only, never the cached media payloads.
      const request = metadata.getAll();
      request.onsuccess = () => {
        if (epoch() !== capturedEpoch || !isCurrent()) return;
        const now = Date.now();
        const rows = (request.result as Metadata[])
          .filter((row) => {
            const keep =
              row.key !== key &&
              row.epoch === capturedEpoch &&
              row.savedAt <= now &&
              now - row.savedAt < DURABLE_MEDIA_MAX_AGE_MS;
            if (!keep) remove(row.key);
            return keep;
          })
          .sort((a, b) => a.usedAt - b.usedAt);
        let bytes = rows.reduce((sum, row) => sum + row.bytes, 0) + blob.size;
        while (
          rows.length >= DURABLE_MEDIA_MAX_ENTRIES ||
          bytes > DURABLE_MEDIA_MAX_BYTES
        ) {
          const oldest = rows.shift();
          if (!oldest) break;
          bytes -= oldest.bytes;
          remove(oldest.key);
        }
        store.put({
          key,
          epoch: capturedEpoch,
          blob,
          savedAt: now,
          usedAt: now,
        } satisfies Row);
        metadata.put({
          key,
          epoch: capturedEpoch,
          bytes: blob.size,
          savedAt: now,
          usedAt: now,
        } satisfies Metadata);
      };
    });
  });
}
export function evictDurableMedia(prefix: string): void {
  void enqueue(() =>
    transaction<void>('readwrite', (store) => {
      const request = store.transaction.objectStore(METADATA).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (String(cursor.key).startsWith(prefix)) {
          store.delete(cursor.key);
          cursor.delete();
        }
        cursor.continue();
      };
    }),
  );
}
