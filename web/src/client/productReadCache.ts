import {
  type ClientProblemError,
  type ClientProblemKind,
  normalizeClientError,
} from './problemDetails';

export type ProductCacheKind =
  | 'memory'
  | 'heartMoment'
  | 'milestone'
  | 'story'
  | 'story-discover';
export type ProductReadSource = 'network' | 'cache';
export type ProductCachePrivacyScope = 'SPACE_SHARED';

interface ProductCacheContext {
  schemaVersion: 1;
  accountId: string;
  spaceId: string;
  generation: string;
}

interface ProductCacheRecord {
  schemaVersion: 3;
  key: string;
  accountId: string;
  spaceId: string;
  generation: string;
  privacyScope: ProductCachePrivacyScope;
  kind: ProductCacheKind;
  resourceId: string;
  payload: unknown;
  refreshedAt: string;
}

export interface ProductReadResult<T> {
  value: T;
  source: ProductReadSource;
  refreshedAt?: Date;
}

export interface ProductCacheEventDetail {
  refreshedAt: string;
}

export interface ProductReadCacheStorage {
  read(key: string): Promise<unknown>;
  write(record: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
  /** Discard the whole store when `clear` cannot complete.
   *
   * Optional because it exists for exactly one reason: a wipe that has to
   * survive a broken store needs a second, independent mechanism. Dropping the
   * database does not go through a readwrite transaction, so it can still
   * succeed after that transaction aborted.
   */
  destroy?(): Promise<void>;
}

export const PRODUCT_CACHE_FALLBACK_EVENT = 'eimir:read-cache-fallback';
export const PRODUCT_CACHE_NETWORK_EVENT = 'eimir:read-cache-network';
export const PRODUCT_READ_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// IndexedDB names are persistent browser identity. Keep the established
// database so an upgrade does not strand cached rows in an unreachable store.
const DATABASE_NAME = 'sidebyside-web-read-cache';
const DATABASE_VERSION = 3;
const STORE_NAME = 'product-details';
const CONTEXT_STORAGE_KEY = 'eimir-web-read-cache-context-v3';
const LEGACY_CONTEXT_STORAGE_KEYS = [
  'sidebyside-web-read-cache-context-v3',
  'sidebyside-web-read-cache-context-v2',
] as const;
const SHARED_SCOPE: ProductCachePrivacyScope = 'SPACE_SHARED';

/** A marker value that parses but can never be adopted as a context.
 *
 * Overwriting is the fallback for a marker that cannot be removed. The two
 * operations fail for different reasons often enough to be worth trying both:
 * a quota failure rejects growth rather than replacement, and a marker that
 * can be replaced by this value is as dead as a removed one.
 */
const CONTEXT_TOMBSTONE = JSON.stringify({
  schemaVersion: 1,
  invalidated: true,
});

let activeContext: ProductCacheContext | null = null;
let cacheMutationTail: Promise<void> = Promise.resolve();
const invalidatedGenerations = new Set<string>();

/** Whether the persisted marker may still name a generation this runtime
 * invalidated but could not neutralize on disk.
 *
 * `invalidatedGenerations` only protects the current runtime; it is gone after
 * a reload. Everything that has to survive a reload is therefore expressed on
 * disk instead, and this flag covers the one case that cannot be: the marker
 * could not even be read while invalidating, so it was impossible to learn
 * which generation to invalidate. Until the pointer is provably ours again,
 * no persisted context is adopted.
 */
let persistedMarkerUntrusted = false;

/** Whether rows survived a wipe and are still owed a deletion.
 *
 * They are already unreachable, because the generation that keyed them can
 * never be named again. What is left is retention rather than access, and it
 * would otherwise linger untouched: a clean marker removal leaves nothing
 * behind that a later generation change would recognize as work to redo.
 */
let persistedRowsAwaitingPurge = false;

/** Per-resource revocation stamps, independent of the Account/Space lease.
 *
 * The lease guards against a stale Account/Space context repersisting; it says
 * nothing about a single resource whose visibility changed mid-flight within
 * the *same* still-current lease. A read that began while a HeartMoment was
 * SHARED can resolve after that resource was made PRIVATE, still carrying the
 * old SHARED payload — the lease alone cannot catch that, so each resource
 * gets its own monotonic stamp. A write is only persisted if the stamp is
 * unchanged from when its read started.
 */
const resourceRevocationStamps = new Map<string, number>();
let nextResourceRevocationStamp = 1;

function resourceIdentityKey(
  accountId: string,
  spaceId: string,
  kind: ProductCacheKind,
  resourceId: string,
): string {
  return `${accountId}:${spaceId}:${kind}:${resourceId}`;
}

function currentResourceRevocationStamp(
  accountId: string,
  spaceId: string,
  kind: ProductCacheKind,
  resourceId: string,
): number {
  return (
    resourceRevocationStamps.get(
      resourceIdentityKey(accountId, spaceId, kind, resourceId),
    ) ?? 0
  );
}

function bumpResourceRevocationStamp(
  accountId: string,
  spaceId: string,
  kind: ProductCacheKind,
  resourceId: string,
): void {
  resourceRevocationStamps.set(
    resourceIdentityKey(accountId, spaceId, kind, resourceId),
    nextResourceRevocationStamp++,
  );
}

/** Whether a client error is an authoritative "you may not have this"
 * response rather than a transport/server failure.
 *
 * These are exactly the responses `mayUseOfflineProductCache` refuses to fall
 * back on. A resource that just failed this way must not remain readable from
 * a stale cached snapshot either, so its entry is evicted before the caller
 * sees the denial.
 */
function isAuthoritativeDenial(kind: ClientProblemKind): boolean {
  return (
    kind === 'unauthorized' || kind === 'permission' || kind === 'notFound'
  );
}

function contextsEqual(
  left: ProductCacheContext | null,
  right: ProductCacheContext | null,
): boolean {
  return (
    left !== null &&
    right !== null &&
    left.accountId === right.accountId &&
    left.spaceId === right.spaceId &&
    left.generation === right.generation
  );
}

function matchesContext(
  context: ProductCacheContext | null,
  accountId: string,
  spaceId: string,
): context is ProductCacheContext {
  return (
    context !== null &&
    context.accountId === accountId &&
    context.spaceId === spaceId
  );
}

function invalidateContext(context: ProductCacheContext | null): void {
  if (context) invalidatedGenerations.add(context.generation);
}

function isContextInvalidated(context: ProductCacheContext | null): boolean {
  return context !== null && invalidatedGenerations.has(context.generation);
}

function createCacheGeneration(): string {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    if (typeof crypto.getRandomValues === 'function') {
      const values = new Uint32Array(4);
      crypto.getRandomValues(values);
      return Array.from(values, (value) =>
        value.toString(16).padStart(8, '0'),
      ).join('');
    }
  }

  throw new Error('Secure cache generation is unavailable');
}

function isCacheContext(value: unknown): value is ProductCacheContext {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ProductCacheContext>;
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.accountId === 'string' &&
    candidate.accountId.length > 0 &&
    typeof candidate.spaceId === 'string' &&
    candidate.spaceId.length > 0 &&
    typeof candidate.generation === 'string' &&
    candidate.generation.length > 0
  );
}

function readCacheContextMarker(): {
  available: boolean;
  hadMarker: boolean;
  context: ProductCacheContext | null;
} {
  if (typeof localStorage === 'undefined') {
    return { available: false, hadMarker: false, context: null };
  }

  try {
    const canonical = localStorage.getItem(CONTEXT_STORAGE_KEY);
    const legacy = LEGACY_CONTEXT_STORAGE_KEYS.map((key) =>
      localStorage.getItem(key),
    ).find((value) => value !== null);
    const raw = canonical ?? legacy ?? null;
    if (raw === null) {
      return { available: true, hadMarker: false, context: null };
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      const context = isCacheContext(parsed) ? parsed : null;
      if (canonical === null && context !== null) {
        localStorage.setItem(CONTEXT_STORAGE_KEY, raw);
        for (const key of LEGACY_CONTEXT_STORAGE_KEYS) {
          localStorage.removeItem(key);
        }
      }
      return {
        available: true,
        hadMarker: true,
        context,
      };
    } catch {
      return { available: true, hadMarker: true, context: null };
    }
  } catch {
    return { available: false, hadMarker: false, context: null };
  }
}

/** Whether the persisted marker was *observed* to name nothing adoptable.
 *
 * Deliberately not satisfied by a marker that cannot be read. Unreadable only
 * describes right now, and browser storage that refuses reads during a wipe
 * can answer them again a moment later, still holding the pointer this wipe
 * was supposed to destroy. Safety here has to be observed, not inferred from
 * an absent observation.
 */
function markerIsProvablyUnusable(): boolean {
  const marker = readCacheContextMarker();
  return marker.available && marker.context === null;
}

/** Point the persisted marker at `context`, or report that it points at
 * nothing adoptable.
 *
 * Returns whether the on-disk pointer is now safe, meaning it either names
 * this generation or cannot name any generation. A `false` result is the one
 * case that must not be ignored: the pointer still names something older.
 */
function writeCacheContextMarker(context: ProductCacheContext): boolean {
  if (typeof localStorage === 'undefined') return true;
  try {
    localStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(context));
    for (const key of LEGACY_CONTEXT_STORAGE_KEYS) localStorage.removeItem(key);
  } catch {
    // Verified below rather than assumed, in either direction.
  }

  const marker = readCacheContextMarker();
  return marker.available && contextsEqual(marker.context, context);
}

/** Make the persisted marker unable to name any generation, and verify it.
 *
 * This is what makes an invalidation durable. Every row key begins with its
 * generation, so a pointer that can no longer name that generation leaves the
 * rows unreachable for good, even when they physically survive. Removal is
 * tried first; a marker that resists removal is overwritten with a value that
 * `isCacheContext` rejects.
 *
 * Returns whether the pointer is provably unusable. `false` means no
 * `localStorage` mutation succeeded while reads still work, so the invalidation
 * could not be recorded on disk at all.
 */
function neutralizeCacheContextMarker(): boolean {
  if (typeof localStorage === 'undefined') return true;

  try {
    localStorage.removeItem(CONTEXT_STORAGE_KEY);
    for (const key of LEGACY_CONTEXT_STORAGE_KEYS) localStorage.removeItem(key);
  } catch {
    // Removal is not the only way to make the pointer unusable.
  }
  if (markerIsProvablyUnusable()) return true;

  try {
    localStorage.setItem(CONTEXT_STORAGE_KEY, CONTEXT_TOMBSTONE);
  } catch {
    // Nothing durable is left to try; the caller has to stay fail closed.
  }
  return markerIsProvablyUnusable();
}

function isLeaseCurrent(lease: ProductCacheContext): boolean {
  if (isContextInvalidated(lease) || !contextsEqual(activeContext, lease)) {
    return false;
  }

  const marker = readCacheContextMarker();
  if (!marker.available) return true;
  return contextsEqual(marker.context, lease);
}

function enqueueCacheMutation<T>(operation: () => Promise<T>): Promise<T> {
  const run = cacheMutationTail.then(operation);
  cacheMutationTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function cacheKey(
  context: ProductCacheContext,
  privacyScope: ProductCachePrivacyScope,
  kind: ProductCacheKind,
  resourceId: string,
): string {
  return `${context.generation}:${context.accountId}:${context.spaceId}:${privacyScope}:${kind}:${resourceId}`;
}

function openCacheDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () =>
      reject(
        request.error ?? new Error('Failed to open the product read cache'),
      );
    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (
        event.oldVersion < DATABASE_VERSION &&
        database.objectStoreNames.contains(STORE_NAME)
      ) {
        database.deleteObjectStore(STORE_NAME);
      }
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function mutateCacheStore(
  mutate: (store: IDBObjectStore) => void,
): Promise<void> {
  const database = await openCacheDatabase();
  if (!database) return;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const closeAndResolve = () => {
      if (settled) return;
      settled = true;
      database.close();
      resolve();
    };
    const closeAndReject = (error?: DOMException | null) => {
      if (settled) return;
      settled = true;
      database.close();
      reject(error ?? new Error('Product read cache transaction failed'));
    };

    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.oncomplete = closeAndResolve;
      transaction.onerror = () => closeAndReject(transaction.error);
      transaction.onabort = () => closeAndReject(transaction.error);
      mutate(transaction.objectStore(STORE_NAME));
    } catch (error) {
      closeAndReject(error instanceof DOMException ? error : null);
    }
  });
}

async function readCacheStoreRecord(key: string): Promise<unknown> {
  const database = await openCacheDatabase();
  if (!database) return null;

  return new Promise<unknown>((resolve, reject) => {
    let settled = false;
    let value: unknown = null;
    const closeAndResolve = () => {
      if (settled) return;
      settled = true;
      database.close();
      resolve(value);
    };
    const closeAndReject = (error?: DOMException | null) => {
      if (settled) return;
      settled = true;
      database.close();
      reject(error ?? new Error('Product read cache transaction failed'));
    };

    try {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(key);
      request.onerror = () => closeAndReject(request.error);
      request.onsuccess = () => {
        value = request.result ?? null;
      };
      transaction.oncomplete = closeAndResolve;
      transaction.onerror = () => closeAndReject(transaction.error);
      transaction.onabort = () => closeAndReject(transaction.error);
    } catch (error) {
      closeAndReject(error instanceof DOMException ? error : null);
    }
  });
}

function deleteCacheDatabase(): Promise<void> {
  if (typeof indexedDB === 'undefined') return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(
        request.error ?? new Error('Failed to drop the product read cache'),
      );
    // Another tab holding the database open would delay this indefinitely.
    // Waiting would turn a wipe into a hang, so it counts as a failure and the
    // caller keeps the generation unreachable instead.
    request.onblocked = () =>
      reject(new Error('Dropping the product read cache is blocked'));
  });
}

const indexedDbStorage: ProductReadCacheStorage = {
  read: readCacheStoreRecord,
  write: (record) => mutateCacheStore((store) => store.put(record)),
  remove: (key) => mutateCacheStore((store) => store.delete(key)),
  clear: () => mutateCacheStore((store) => store.clear()),
  destroy: deleteCacheDatabase,
};

let cacheStorage: ProductReadCacheStorage = indexedDbStorage;

/** Destroy every persisted row, escalating past a store that cannot clear.
 *
 * The original failure is what surfaces if the escalation fails too: the
 * caller is told that the physical rows survived, not how many ways there were
 * to try.
 */
async function purgeCacheStore(): Promise<void> {
  try {
    await cacheStorage.clear();
    persistedRowsAwaitingPurge = false;
    return;
  } catch (error) {
    const destroy = cacheStorage.destroy;
    if (destroy) {
      try {
        await destroy.call(cacheStorage);
        persistedRowsAwaitingPurge = false;
        return;
      } catch {
        // The original failure is the honest one to report.
      }
    }
    persistedRowsAwaitingPurge = true;
    throw error;
  }
}

function scheduleContextStoreClear(): void {
  void enqueueCacheMutation(purgeCacheStore).catch(() => undefined);
}

function captureCacheLease(
  accountId: string,
  spaceId: string,
): ProductCacheContext {
  const marker = readCacheContextMarker();
  const persistedContext = marker.available ? marker.context : null;

  if (
    !persistedMarkerUntrusted &&
    marker.available &&
    matchesContext(persistedContext, accountId, spaceId) &&
    !isContextInvalidated(persistedContext)
  ) {
    if (!contextsEqual(activeContext, persistedContext)) {
      invalidateContext(activeContext);
      activeContext = persistedContext;
    }
    return persistedContext;
  }

  if (
    !marker.available &&
    matchesContext(activeContext, accountId, spaceId) &&
    !isContextInvalidated(activeContext)
  ) {
    return activeContext;
  }

  const hadPriorContext =
    persistedContext !== null ||
    activeContext !== null ||
    marker.hadMarker ||
    persistedRowsAwaitingPurge;
  invalidateContext(activeContext);
  invalidateContext(persistedContext);

  const next: ProductCacheContext = {
    schemaVersion: 1,
    accountId,
    spaceId,
    generation: createCacheGeneration(),
  };
  activeContext = next;

  // A marker that cannot be claimed still names the generation this call just
  // invalidated, and it would outlive the runtime that knows better. Making it
  // unusable is what keeps the predecessor unreachable after a reload; the new
  // generation then fails closed here rather than caching against a pointer it
  // does not own.
  persistedMarkerUntrusted =
    !writeCacheContextMarker(next) && !neutralizeCacheContextMarker();

  if (hadPriorContext) scheduleContextStoreClear();
  return next;
}

function currentCacheLease(
  accountId: string,
  spaceId: string,
): ProductCacheContext | null {
  const current = activeContext;
  if (!matchesContext(current, accountId, spaceId)) return null;
  return isLeaseCurrent(current) ? current : null;
}

export function isFreshProductCacheTimestamp(
  refreshedAt: string,
  now = Date.now(),
): boolean {
  const timestamp = Date.parse(refreshedAt);
  return (
    Number.isFinite(timestamp) &&
    timestamp <= now &&
    now - timestamp <= PRODUCT_READ_CACHE_MAX_AGE_MS
  );
}

export function canPersistProductReadPayload(
  kind: ProductCacheKind,
  payload: unknown,
): boolean {
  if (kind !== 'heartMoment') return true;
  if (!payload || typeof payload !== 'object') return false;
  return (payload as { visibility?: unknown }).visibility === 'SHARED';
}

function isExpectedRecord(
  record: unknown,
  expected: {
    key: string;
    accountId: string;
    spaceId: string;
    generation: string;
    kind: ProductCacheKind;
    resourceId: string;
  },
): record is ProductCacheRecord {
  if (!record || typeof record !== 'object') return false;
  const candidate = record as Partial<ProductCacheRecord>;
  return (
    candidate.schemaVersion === 3 &&
    candidate.key === expected.key &&
    candidate.accountId === expected.accountId &&
    candidate.spaceId === expected.spaceId &&
    candidate.generation === expected.generation &&
    candidate.privacyScope === SHARED_SCOPE &&
    candidate.kind === expected.kind &&
    candidate.resourceId === expected.resourceId &&
    typeof candidate.refreshedAt === 'string' &&
    isFreshProductCacheTimestamp(candidate.refreshedAt)
  );
}

async function deleteRecordByKey(
  key: string,
  lease?: ProductCacheContext,
): Promise<void> {
  await enqueueCacheMutation(async () => {
    if (lease && !isLeaseCurrent(lease)) return;
    await cacheStorage.remove(key);
  });
}

async function readRecord(
  expected: {
    key: string;
    accountId: string;
    spaceId: string;
    generation: string;
    kind: ProductCacheKind;
    resourceId: string;
  },
  lease: ProductCacheContext,
): Promise<ProductCacheRecord | null> {
  let record: unknown;
  try {
    record = await cacheStorage.read(expected.key);
  } catch {
    return null;
  }

  if (!isLeaseCurrent(lease)) return null;
  if (!isExpectedRecord(record, expected)) {
    if (record) await deleteRecordByKey(expected.key, lease);
    return null;
  }
  if (!canPersistProductReadPayload(record.kind, record.payload)) {
    await deleteRecordByKey(expected.key, lease);
    return null;
  }
  return record;
}

async function writeRecord(
  record: ProductCacheRecord,
  lease: ProductCacheContext,
): Promise<void> {
  await enqueueCacheMutation(async () => {
    if (!isLeaseCurrent(lease)) return;
    try {
      await cacheStorage.write(record);
    } catch {
      // Ordinary cache writes remain best effort.
    }
  });
}

function emitCacheEvent(type: string, refreshedAt: string): void {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined')
    return;
  window.dispatchEvent(
    new CustomEvent<ProductCacheEventDetail>(type, {
      detail: { refreshedAt },
    }),
  );
}

export function mayUseOfflineProductCache(error: ClientProblemError): boolean {
  return error.kind === 'offline' || error.kind === 'server';
}

async function saveProductReadCacheEntryForLease<T>(
  lease: ProductCacheContext,
  {
    kind,
    resourceId,
    value,
    serialize,
    refreshedAt = new Date(),
  }: {
    kind: ProductCacheKind;
    resourceId: string;
    value: T;
    serialize: (value: T) => unknown;
    refreshedAt?: Date;
  },
): Promise<void> {
  if (!isLeaseCurrent(lease)) return;

  const key = cacheKey(lease, SHARED_SCOPE, kind, resourceId);
  const payload = serialize(value);
  if (!canPersistProductReadPayload(kind, payload)) {
    await deleteRecordByKey(key, lease);
    return;
  }

  await writeRecord(
    {
      schemaVersion: 3,
      key,
      accountId: lease.accountId,
      spaceId: lease.spaceId,
      generation: lease.generation,
      privacyScope: SHARED_SCOPE,
      kind,
      resourceId,
      payload,
      refreshedAt: refreshedAt.toISOString(),
    },
    lease,
  );
}

export async function saveProductReadCacheEntry<T>({
  accountId,
  spaceId,
  kind,
  resourceId,
  value,
  serialize,
  refreshedAt = new Date(),
}: {
  accountId: string;
  spaceId: string;
  kind: ProductCacheKind;
  resourceId: string;
  value: T;
  serialize: (value: T) => unknown;
  refreshedAt?: Date;
}): Promise<void> {
  const lease = currentCacheLease(accountId, spaceId);
  if (!lease) return;
  await saveProductReadCacheEntryForLease(lease, {
    kind,
    resourceId,
    value,
    serialize,
    refreshedAt,
  });
}

export async function loadProductWithReadCache<T>({
  accountId,
  spaceId,
  kind,
  resourceId,
  load,
  serialize,
  deserialize,
}: {
  accountId: string;
  spaceId: string;
  kind: ProductCacheKind;
  resourceId: string;
  load: () => Promise<T>;
  serialize: (value: T) => unknown;
  deserialize: (payload: unknown) => T;
}): Promise<ProductReadResult<T>> {
  const lease = captureCacheLease(accountId, spaceId);
  const key = cacheKey(lease, SHARED_SCOPE, kind, resourceId);
  const revocationStampAtStart = currentResourceRevocationStamp(
    accountId,
    spaceId,
    kind,
    resourceId,
  );

  let value: T;
  try {
    value = await load();
  } catch (error) {
    const normalized = await normalizeClientError(error);
    if (isAuthoritativeDenial(normalized.kind)) {
      // An authoritative denial revokes the resource before it is returned to
      // the caller, so a later offline/server-error fallback cannot resurrect
      // a snapshot already known to be unauthorized or absent.
      await deleteProductReadCacheEntry(accountId, spaceId, kind, resourceId);
    }
    if (!mayUseOfflineProductCache(normalized) || !isLeaseCurrent(lease)) {
      throw normalized;
    }

    const cached = await readRecord(
      {
        key,
        accountId,
        spaceId,
        generation: lease.generation,
        kind,
        resourceId,
      },
      lease,
    );
    if (!cached || !isLeaseCurrent(lease)) throw normalized;
    emitCacheEvent(PRODUCT_CACHE_FALLBACK_EVENT, cached.refreshedAt);
    return {
      value: deserialize(cached.payload),
      source: 'cache',
      refreshedAt: new Date(cached.refreshedAt),
    };
  }

  const refreshedAt = new Date();
  const revocationStampAtCompletion = currentResourceRevocationStamp(
    accountId,
    spaceId,
    kind,
    resourceId,
  );
  if (revocationStampAtCompletion === revocationStampAtStart) {
    // A stamp change means this resource was revoked (mutated to a
    // non-shared visibility, or authoritatively denied) after this read
    // began. The response in hand is now stale privacy state and must not
    // repersist it, no matter what visibility it still claims.
    await saveProductReadCacheEntryForLease(lease, {
      kind,
      resourceId,
      value,
      serialize,
      refreshedAt,
    });
  }
  if (isLeaseCurrent(lease)) {
    emitCacheEvent(PRODUCT_CACHE_NETWORK_EVENT, refreshedAt.toISOString());
  }
  return { value, source: 'network', refreshedAt };
}

export async function deleteProductReadCacheEntry(
  accountId: string,
  spaceId: string,
  kind: ProductCacheKind,
  resourceId: string,
): Promise<void> {
  // Revoked before the row lookup, and unconditionally: a read that started
  // before this call must never repersist afterward, even if there is no
  // current lease (nothing to physically delete) or the row is already gone.
  bumpResourceRevocationStamp(accountId, spaceId, kind, resourceId);
  const lease = currentCacheLease(accountId, spaceId);
  if (!lease) return;
  await deleteRecordByKey(
    cacheKey(lease, SHARED_SCOPE, kind, resourceId),
    lease,
  );
}

/** Invalidate everything this browser persisted, durably.
 *
 * The wipe is durable as soon as one of two independent things holds: the
 * persisted marker can no longer name the invalidated generation, or the rows
 * are gone. Either one is enough, because a row is only ever read through a
 * key that begins with the generation the marker names. That is why this does
 * not depend on both effects landing, which is what made a partially failed
 * cleanup survivable across a reload.
 *
 * The returned promise still rejects when the physical rows survive. Callers
 * are told the truth — a rejection means "unreachable, not yet deleted", never
 * "wiped" — and the retention debt is retried on the next generation change.
 *
 * The one state that cannot be made durable is a `localStorage` that answers
 * reads but refuses every mutation while the store refuses both clearing and
 * being dropped. Nothing can be recorded then; this runtime stays fail closed
 * through `invalidatedGenerations` and `persistedMarkerUntrusted`, and a reload
 * in that state would trust the stale marker again.
 */
export function clearProductReadCache(): Promise<void> {
  const marker = readCacheContextMarker();
  invalidateContext(activeContext);
  if (marker.available) invalidateContext(marker.context);
  activeContext = null;
  persistedMarkerUntrusted = !neutralizeCacheContextMarker();
  return enqueueCacheMutation(purgeCacheStore);
}

/** Start a wipe from a lifecycle that cannot await it.
 *
 * Logout, Account and Space changes invalidate synchronously and navigate on;
 * they have nothing to do with a rejected promise. The failure is not
 * discarded, it is just already recorded where it matters: the invalidation
 * above is durable before this returns, and the surviving rows are retried
 * when the next generation is established.
 */
export function clearProductReadCacheInBackground(): void {
  void clearProductReadCache().catch(() => undefined);
}

export function __setProductReadCacheStorageForTests(
  storage: ProductReadCacheStorage,
): void {
  cacheStorage = storage;
}

export function __waitForProductReadCacheMutationsForTests(): Promise<void> {
  return cacheMutationTail;
}

export function __resetProductReadCacheStateForTests(): void {
  activeContext = null;
  cacheMutationTail = Promise.resolve();
  cacheStorage = indexedDbStorage;
  invalidatedGenerations.clear();
  persistedMarkerUntrusted = false;
  persistedRowsAwaitingPurge = false;
  resourceRevocationStamps.clear();
  nextResourceRevocationStamp = 1;
}

export const __PRODUCT_READ_CACHE_CONTEXT_STORAGE_KEY_FOR_TESTS =
  CONTEXT_STORAGE_KEY;
