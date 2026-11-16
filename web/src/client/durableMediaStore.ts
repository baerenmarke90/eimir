import {
  deviceMediaKey,
  forgetDeviceMediaKey,
  openMedia,
  type SealedMedia,
  sealMedia,
  sealsDeviceMedia,
} from './deviceMediaSeal';

/**
 * Disposable app-owned bytes; credentials and signed URLs never enter this store.
 * Product Owner decision (2026-11-16): keep up to 2000 media items on the device,
 * bounded by item count rather than bytes. Thumbnail and original of one item
 * share one slot. There is deliberately no maximum age (PO, same day): the item
 * limit and the browser quota bound the store, a quota failure frees the least
 * recently used quarter and retries once, and logout or an Account/Space change
 * rotates the epoch and clears everything.
 * The Android app seals every row under a per-login Keystore-wrapped key
 * (`deviceMediaSeal.ts`, PO decision of the same day) and keeps no plaintext.
 */
export const DURABLE_MEDIA_MAX_ENTRIES = 2000;
const DATABASE = 'eimir-authorized-media-v1';
const STORE = 'media';
const METADATA = 'metadata';
const EPOCH_KEY = 'eimir-media-epoch-v1';
type Payload = { blob: Blob } | { sealed: SealedMedia };
type Row = Payload & {
  key: string;
  epoch: string;
  savedAt: number;
  usedAt: number;
};
type Metadata = {
  key: string;
  epoch: string;
  savedAt: number;
  usedAt: number;
  bytes: number;
};
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
    const request = indexedDB.open(DATABASE, 3);
    let abandoned = false;
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (event.oldVersion < 2) {
        // Disposable v1 entries have no independent size index. Discard them
        // without materializing every old Blob during the one-time upgrade.
        if (db.objectStoreNames.contains(STORE)) db.deleteObjectStore(STORE);
        db.createObjectStore(STORE, { keyPath: 'key' });
        db.createObjectStore(METADATA, { keyPath: 'key' });
      } else if (sealsDeviceMedia()) {
        // v2 rows were plaintext; a sealing device keeps none of them.
        request.transaction?.objectStore(STORE).clear();
        request.transaction?.objectStore(METADATA).clear();
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      if (abandoned) db.close();
      else resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      abandoned = true;
      reject(new Error('Media store blocked'));
    };
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
  // The key goes first: sealed rows are unreadable even if deletion fails.
  forgetDeviceMediaKey();
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
    if (!row || row.epoch !== capturedEpoch || epoch() !== capturedEpoch)
      return undefined;
    const blob = await rowBlob(row);
    if (!blob || epoch() !== capturedEpoch) return undefined;
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
    return blob;
  } catch {
    return undefined;
  }
}
async function rowBlob(row: Row): Promise<Blob | undefined> {
  if (!sealsDeviceMedia()) return 'blob' in row ? row.blob : undefined;
  if (!('sealed' in row)) return undefined;
  const cryptoKey = await deviceMediaKey();
  if (!cryptoKey) return undefined;
  try {
    return await openMedia(cryptoKey, row.key, row.sealed);
  } catch {
    // Sealed under an earlier key or damaged: it can never be read again.
    void enqueue(() =>
      transaction<void>('readwrite', (store) => {
        store.delete(row.key);
        store.transaction.objectStore(METADATA).delete(row.key);
      }),
    );
    return undefined;
  }
}
/** One slot per media item: the key without its trailing variant. */
function mediaItemKey(key: string): string {
  try {
    const parts: unknown = JSON.parse(key);
    if (Array.isArray(parts) && parts.length > 1)
      return JSON.stringify(parts.slice(0, -1));
  } catch {
    /* Opaque keys form their own slot. */
  }
  return key;
}
function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}
function putDurableMedia(
  key: string,
  capturedEpoch: string,
  payload: Payload,
  isCurrent: () => boolean,
  shrink: boolean,
): Promise<void> {
  const bytes =
    'sealed' in payload ? payload.sealed.data.byteLength : payload.blob.size;
  return transaction<void>('readwrite', (store) => {
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
      const item = mediaItemKey(key);
      const items = new Map<string, { usedAt: number; keys: string[] }>();
      for (const row of request.result as Metadata[]) {
        if (row.key === key) continue;
        if (row.epoch !== capturedEpoch) {
          remove(row.key);
          continue;
        }
        const rowItem = mediaItemKey(row.key);
        if (rowItem === item) continue;
        const group = items.get(rowItem) ?? { usedAt: 0, keys: [] };
        group.usedAt = Math.max(group.usedAt, row.usedAt);
        group.keys.push(row.key);
        items.set(rowItem, group);
      }
      const others = [...items.values()].sort((a, b) => a.usedAt - b.usedAt);
      // The written item keeps one slot of its own.
      const limit = shrink
        ? Math.floor((others.length * 3) / 4)
        : DURABLE_MEDIA_MAX_ENTRIES - 1;
      while (others.length > limit) {
        const oldest = others.shift();
        if (!oldest) break;
        oldest.keys.forEach(remove);
      }
      store.put({
        ...payload,
        key,
        epoch: capturedEpoch,
        savedAt: now,
        usedAt: now,
      } satisfies Row);
      metadata.put({
        key,
        epoch: capturedEpoch,
        bytes,
        savedAt: now,
        usedAt: now,
      } satisfies Metadata);
    };
  });
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
      epoch() !== capturedEpoch ||
      !isCurrent()
    )
      return;
    let payload: Payload = { blob };
    if (sealsDeviceMedia()) {
      // A sealing device never writes plaintext; without a key it writes nothing.
      const cryptoKey = await deviceMediaKey();
      if (!cryptoKey || epoch() !== capturedEpoch || !isCurrent()) return;
      payload = { sealed: await sealMedia(cryptoKey, key, blob) };
    }
    try {
      await putDurableMedia(key, capturedEpoch, payload, isCurrent, false);
    } catch (error) {
      if (!isQuotaError(error)) throw error;
      // The device filled up before the item limit: free the oldest quarter.
      await putDurableMedia(key, capturedEpoch, payload, isCurrent, true);
    }
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
