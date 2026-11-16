import type { MemoryDetail } from '../api/generated/models/MemoryDetail';
import {
  deviceMediaKey,
  openJson,
  openMedia,
  type SealedJson,
  type SealedMedia,
  sealJson,
  sealMedia,
  sealsDeviceMedia,
} from './deviceMediaSeal';
import type { MemoryCreateAttempt } from './memoryCreateIdentity';
import {
  memoryOnlyPhotoDescriptor,
  missingSelectedPhoto,
  retainPhotoInMemory,
  type SelectedPhotoDescriptor,
} from './selectedMediaRetention';

/** Owner-local work, never a shared read-cache entry or an offline outbox. */
export interface MemoryDiaryDraft {
  planningLinks?: { id: string; title: string; kind: 'plans' | 'wishes' }[];
  linkRecoveryMemory?: MemoryDetail;
  title: string;
  /** Daily question key of a guided experience draft, if one was selected. */
  experienceQuestionId?: string;
  body: string;
  tags: string[];
  tagDraft?: string;
  happenedOn: string;
  happenedUntil?: string;
  places?: { id: string; name: string; address: string | null }[];
  selectedCoverPosition?: number | null;
  place?: { id: string; name: string; address: string | null };
  files: { file: File; attachmentId?: string; isSensitive?: boolean }[];
  attempt: MemoryCreateAttempt | null;
  partial: {
    memory: MemoryDetail;
    attachmentIds: readonly string[];
    attachmentSensitivity?: readonly boolean[];
    selectedCoverPosition?: number | null;
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

function restoreValue(value: StoredDraft, format?: 3): MemoryDiaryDraft {
  return {
    ...value,
    legacyMedia: format !== 3 && value.files.length > 0,
    files: value.files.map((entry) =>
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
  /** Plaintext work: browsers and iOS, and Android rows from before sealing. */
  value?: StoredDraft;
  /** The Android app keeps the work sealed under the per-login device key. */
  sealed?: SealedDraft;
  format?: 3;
}

/** Text and structure as one sealed JSON value, photo bytes sealed one by one. */
interface SealedDraft {
  text: SealedJson;
  files: SealedMedia[];
}

// A draft holds `Date` values (inside recovered Memories) and `File` objects,
// which JSON cannot carry. They are tagged for the sealed form and restored on
// load; a photo's name and time travel inside the sealed text.
const DATE_TAG = '$eimirDate';
const FILE_TAG = '$eimirFile';

function toSealable(value: unknown, files: File[]): unknown {
  if (value instanceof Date)
    return {
      [DATE_TAG]: Number.isNaN(value.getTime()) ? null : value.toISOString(),
    };
  if (typeof File !== 'undefined' && value instanceof File) {
    files.push(value);
    return {
      [FILE_TAG]: files.length - 1,
      name: value.name,
      lastModified: value.lastModified,
    };
  }
  if (Array.isArray(value)) return value.map((item) => toSealable(item, files));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [
        name,
        toSealable(item, files),
      ]),
    );
  return value;
}

function fromSealable(value: unknown, files: readonly Blob[]): unknown {
  if (Array.isArray(value))
    return value.map((item) => fromSealable(item, files));
  if (!value || typeof value !== 'object') return value;
  const tagged = value as Record<string, unknown>;
  if (DATE_TAG in tagged) {
    const iso = tagged[DATE_TAG];
    return new Date(typeof iso === 'string' ? iso : Number.NaN);
  }
  if (FILE_TAG in tagged) {
    const blob = files[tagged[FILE_TAG] as number];
    if (!blob) throw new Error('Draft photo missing');
    return new File([blob], String(tagged.name), {
      type: blob.type,
      lastModified: Number(tagged.lastModified),
    });
  }
  return Object.fromEntries(
    Object.entries(tagged).map(([name, item]) => [
      name,
      fromSealable(item, files),
    ]),
  );
}

const fileRowKey = (key: string, index: number) =>
  `${key}\u0000draft-file\u0000${index}`;

/** Fails without a key: a sealing device never writes plaintext work. */
async function sealDraft(
  key: string,
  value: StoredDraft,
): Promise<SealedDraft> {
  const cryptoKey = await deviceMediaKey();
  if (!cryptoKey) throw new Error('Draft write failed');
  const files: File[] = [];
  const text = await sealJson(cryptoKey, key, toSealable(value, files));
  return {
    text,
    files: await Promise.all(
      files.map((file, index) =>
        sealMedia(cryptoKey, fileRowKey(key, index), file),
      ),
    ),
  };
}

/** `undefined` when no key is available right now; throws when unreadable. */
async function openDraft(
  key: string,
  sealed: SealedDraft,
): Promise<StoredDraft | undefined> {
  const cryptoKey = await deviceMediaKey();
  if (!cryptoKey) return undefined;
  const files = await Promise.all(
    sealed.files.map((file, index) =>
      openMedia(cryptoKey, fileRowKey(key, index), file),
    ),
  );
  return fromSealable(
    await openJson(cryptoKey, key, sealed.text),
    files,
  ) as StoredDraft;
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

  constructor(
    apiBaseUrl: string,
    accountId: string,
    spaceId: string,
    purpose?: string,
  ) {
    this.key = JSON.stringify([
      apiBaseUrl.replace(/\/+$/, ''),
      accountId,
      spaceId,
      ...(purpose ? [purpose] : []),
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
    let found: DraftRecord | null = null;
    try {
      found = await new Promise<DraftRecord | null>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        let result: DraftRecord | null = null;
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
              result = record;
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
    if (!found) return null;
    if (!sealsDeviceMedia())
      return found.value ? restoreValue(found.value, found.format) : null;
    return this.openSealed(found);
  }

  /** Android app: open sealed work; seal work kept from before sealing. */
  private async openSealed(
    record: DraftRecord,
  ): Promise<MemoryDiaryDraft | null> {
    if (!record.sealed) {
      if (!record.value) return null;
      // Unsaved work must survive the update that introduced sealing.
      await this.resealInPlace(record.value).catch(() => undefined);
      return restoreValue(record.value, record.format);
    }
    let value: StoredDraft | undefined;
    try {
      value = await openDraft(this.key, record.sealed);
    } catch {
      // Sealed under an earlier login's key, or damaged: not recoverable.
      await this.clear().catch(() => undefined);
      return null;
    }
    return value ? restoreValue(value, record.format) : null;
  }

  /** Replace a plaintext row by its sealed form without taking ownership. */
  private async resealInPlace(value: StoredDraft): Promise<void> {
    const sealed = await sealDraft(this.key, value);
    const db = await database();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        const request = store.get(this.key);
        request.onsuccess = () => {
          const record = request.result as DraftRecord | undefined;
          if (!this.current() || !record?.value || record.owner !== this.owner)
            return;
          const { value: _plaintext, ...kept } = record;
          store.put({ ...kept, sealed } satisfies DraftRecord);
        };
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => reject(new Error('Draft write failed'));
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
        // Web Crypto cannot run inside an IndexedDB transaction, so the work
        // is sealed first and written as one row afterwards.
        const sealed =
          value && sealsDeviceMedia() ? await sealDraft(this.key, value) : null;
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
                    ...(sealed ? { sealed } : { value }),
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
