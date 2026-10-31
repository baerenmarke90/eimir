import type { MemoryDetail } from '../api/generated/models/MemoryDetail';
import type { MemoryCreateAttempt } from './memoryCreateIdentity';
import {
  memoryOnlyPhotoDescriptor,
  missingSelectedPhoto,
  retainPhotoInMemory,
  type SelectedPhotoDescriptor,
} from './selectedMediaRetention';

/** Owner-local work, never a shared read-cache entry or an offline outbox. */
export interface MemoryDiaryDraft {
  title: string;
  body: string;
  tags: string[];
  tagDraft?: string;
  happenedOn: string;
  files: { file: File; attachmentId?: string; isSensitive?: boolean }[];
  attempt: MemoryCreateAttempt | null;
  partial: {
    memory: MemoryDetail;
    attachmentIds: readonly string[];
    attachmentSensitivity?: readonly boolean[];
  } | null;
  /** Old records have no trustworthy photo provenance; migrate only on Resume. */
  legacyMedia?: boolean;
}

type StoredPhoto =
  | MemoryDiaryDraft['files'][number]
  | {
      selectedPhoto: SelectedPhotoDescriptor;
      attachmentId?: string;
      isSensitive?: boolean;
    };
type StoredDraft = Omit<MemoryDiaryDraft, 'files'> & { files: StoredPhoto[] };

function checkpointValue(value: MemoryDiaryDraft): StoredDraft {
  return {
    ...value,
    legacyMedia: false,
    files: value.files.map(({ file, attachmentId, isSensitive }) => {
      if (value.legacyMedia) retainPhotoInMemory(file);
      const selectedPhoto = memoryOnlyPhotoDescriptor(file);
      return selectedPhoto
        ? { selectedPhoto: { ...selectedPhoto }, attachmentId, isSensitive }
        : { file, attachmentId, isSensitive };
    }),
  };
}

function restoreValue(record: DraftRecord): MemoryDiaryDraft {
  return {
    ...record.value,
    legacyMedia: record.format !== 3 && record.value.files.length > 0,
    files: record.value.files.map((entry) =>
      'selectedPhoto' in entry
        ? {
            file: missingSelectedPhoto(entry.selectedPhoto),
            attachmentId: entry.attachmentId,
            isSensitive: entry.isSensitive,
          }
        : entry,
    ),
  };
}

interface DraftRecord {
  key: string;
  epoch: string;
  owner: string;
  expiresAt: number;
  value: StoredDraft;
  format?: 3;
}

const DATABASE = 'eimir-memory-drafts-v1';
const DATABASE_VERSION = 2;
const STORE = 'drafts';
const EPOCH_KEY = 'eimir-memory-drafts-epoch-v1';
export const MEMORY_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
let invalidation = 0;
let persistenceRevoked = false;

function epoch(): string {
  if (persistenceRevoked) throw new Error('Draft persistence revoked');
  let value = localStorage.getItem(EPOCH_KEY);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(EPOCH_KEY, value);
  }
  return value;
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Draft storage unavailable'));
      return;
    }
    let rejected = false;
    const fail = (message: string) => {
      rejected = true;
      reject(new Error(message));
    };
    const request = indexedDB.open(DATABASE, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE))
        db.createObjectStore(STORE, { keyPath: 'key' });
      const store = (request.transaction as IDBTransaction).objectStore(STORE);
      for (const name of ['epoch', 'expiresAt']) {
        if (!store.indexNames.contains(name)) store.createIndex(name, name);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      // A blocked open can succeed after its caller has already fallen back.
      // That abandoned connection must not block a later upgrade or erase.
      if (rejected) db.close();
      else resolve(db);
    };
    request.onerror = () => fail('Draft storage unavailable');
    request.onblocked = () => fail('Draft storage blocked');
  });
}

/** Inspect index keys without cloning retained text or File payloads. */
function deleteDraftKeys(
  store: IDBObjectStore,
  index: 'epoch' | 'expiresAt',
  matches: (key: IDBValidKey) => boolean,
  complete: () => void = () => {},
  range?: IDBKeyRange,
): void {
  const request = store.index(index).openKeyCursor(range);
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) {
      complete();
      return;
    }
    if (matches(cursor.key)) store.delete(cursor.primaryKey);
    cursor.continue();
  };
}

export class MemoryDraftOwnershipError extends Error {
  constructor() {
    super('Draft ownership changed');
  }
}

/** A serialized writer lease. Another tab may take over only by resuming. */
export class MemoryDiaryDraftStore {
  private readonly key: string;
  private readonly generation = invalidation;
  private readonly writer = crypto.randomUUID();
  private epoch: string | null = null;
  private owner: string | null = null;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(apiBaseUrl: string, accountId: string, spaceId: string) {
    this.key = JSON.stringify([
      apiBaseUrl.replace(/\/+$/, ''),
      accountId,
      spaceId,
    ]);
  }

  private current(): boolean {
    try {
      return this.generation === invalidation && this.epoch === epoch();
    } catch {
      return false;
    }
  }

  async load(): Promise<MemoryDiaryDraft | null> {
    this.epoch = epoch();
    const db = await database();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        let result: MemoryDiaryDraft | null = null;
        let pendingSweeps = 2;
        const readOwnedDraft = () => {
          if (!this.current()) {
            tx.abort();
            return;
          }
          if (--pendingSweeps !== 0) return;
          // Finish metadata deletions before reading: an expired requested
          // draft must not load its retained Files just to be discarded.
          const request = store.get(this.key);
          request.onsuccess = () => {
            if (!this.current()) {
              tx.abort();
              return;
            }
            this.owner = null;
            const record = request.result as DraftRecord | undefined;
            if (record?.epoch === this.epoch && record.expiresAt > Date.now()) {
              this.owner = record.owner;
              result = restoreValue(record);
            } else if (record) {
              store.delete(this.key);
            }
          };
        };
        deleteDraftKeys(
          store,
          'epoch',
          (key) => key !== this.epoch,
          readOwnedDraft,
        );
        deleteDraftKeys(
          store,
          'expiresAt',
          () => true,
          readOwnedDraft,
          IDBKeyRange.upperBound(Date.now()),
        );
        tx.oncomplete = () => resolve(result);
        tx.onabort = tx.onerror = () => reject(new Error('Draft read failed'));
      });
    } finally {
      db.close();
    }
  }

  save(value: MemoryDiaryDraft): Promise<void> {
    return this.mutate(checkpointValue(value));
  }
  clear(): Promise<void> {
    return this.mutate(null);
  }

  private mutate(value: StoredDraft | null): Promise<void> {
    const work = this.tail
      .catch(() => undefined)
      .then(async () => {
        if (!this.current()) throw new MemoryDraftOwnershipError();
        const db = await database();
        try {
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            const store = tx.objectStore(STORE);
            const request = store.get(this.key);
            let ownershipLost = false;
            request.onsuccess = () => {
              const record = request.result as DraftRecord | undefined;
              if (!this.current() || (record?.owner ?? null) !== this.owner) {
                ownershipLost = true;
                tx.abort();
                return;
              }
              try {
                if (value && this.epoch)
                  store.put({
                    key: this.key,
                    epoch: this.epoch,
                    owner: this.writer,
                    expiresAt: Date.now() + MEMORY_DRAFT_MAX_AGE_MS,
                    value,
                    format: 3,
                  } satisfies DraftRecord);
                else store.delete(this.key);
              } catch {
                // Quota/serialization failures may be synchronous. Do not let
                // them escape an IndexedDB event handler as an unhandled error.
                reject(new Error('Draft write failed'));
                tx.abort();
              }
            };
            tx.oncomplete = () => {
              this.owner = value ? this.writer : null;
              resolve();
            };
            tx.onabort = tx.onerror = () =>
              reject(
                ownershipLost
                  ? new MemoryDraftOwnershipError()
                  : new Error('Draft write failed'),
              );
          });
        } finally {
          db.close();
        }
      });
    this.tail = work;
    return work;
  }
}

/** Invalidate leases synchronously, then purge files and text together. */
export function clearMemoryDiaryDrafts(): void {
  invalidation += 1;
  try {
    localStorage.setItem(EPOCH_KEY, crypto.randomUUID());
    persistenceRevoked = false;
  } catch {
    persistenceRevoked = true;
  }
  void database()
    .then(async (db) => {
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          const store = tx.objectStore(STORE);
          if (persistenceRevoked) {
            store.clear();
            tx.oncomplete = () => resolve();
            tx.onabort = tx.onerror = () =>
              reject(new Error('Draft purge failed'));
            return;
          }
          // A new login may have saved while this purge was opening the
          // database. Read the active epoch at traversal, never before open.
          deleteDraftKeys(store, 'epoch', (key) => key !== epoch());
          tx.oncomplete = () => resolve();
          tx.onabort = tx.onerror = () =>
            reject(new Error('Draft purge failed'));
        });
      } finally {
        db.close();
      }
    })
    .catch(() => undefined);
}
