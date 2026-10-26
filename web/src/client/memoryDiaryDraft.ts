import type { MemoryDetail } from '../api/generated/models/MemoryDetail';
import type { MemoryCreateAttempt } from './memoryCreateIdentity';

/** Owner-local work, never a shared read-cache entry or an offline outbox. */
export interface MemoryDiaryDraft {
  title: string;
  body: string;
  tags: string[];
  tagDraft?: string;
  happenedOn: string;
  files: { file: File; attachmentId?: string }[];
  attempt: MemoryCreateAttempt | null;
  partial: { memory: MemoryDetail; attachmentIds: readonly string[] } | null;
}

interface DraftRecord {
  key: string;
  epoch: string;
  owner: string;
  expiresAt: number;
  value: MemoryDiaryDraft;
}

const DATABASE = 'eimir-memory-drafts-v1';
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
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Draft storage unavailable'));
    request.onblocked = () => reject(new Error('Draft storage blocked'));
  });
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
        const request = store.getAll();
        let result: MemoryDiaryDraft | null = null;
        request.onsuccess = () => {
          if (!this.current()) {
            tx.abort();
            return;
          }
          this.owner = null;
          for (const record of request.result as DraftRecord[]) {
            if (record.epoch !== this.epoch || record.expiresAt <= Date.now()) {
              store.delete(record.key);
            } else if (record.key === this.key) {
              this.owner = record.owner;
              result = record.value;
            }
          }
        };
        tx.oncomplete = () => resolve(result);
        tx.onabort = tx.onerror = () => reject(new Error('Draft read failed'));
      });
    } finally {
      db.close();
    }
  }

  save(value: MemoryDiaryDraft): Promise<void> {
    return this.mutate(value);
  }
  clear(): Promise<void> {
    return this.mutate(null);
  }

  private mutate(value: MemoryDiaryDraft | null): Promise<void> {
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
              if (value && this.epoch)
                store.put({
                  key: this.key,
                  epoch: this.epoch,
                  owner: this.writer,
                  expiresAt: Date.now() + MEMORY_DRAFT_MAX_AGE_MS,
                  value,
                } satisfies DraftRecord);
              else store.delete(this.key);
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
          const request = store.getAll();
          request.onsuccess = () => {
            // A new login may already have acquired a new lease while this
            // asynchronous purge was opening the database. Keep its records.
            const activeEpoch = epoch();
            for (const record of request.result as DraftRecord[]) {
              if (record.epoch !== activeEpoch) store.delete(record.key);
            }
          };
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
