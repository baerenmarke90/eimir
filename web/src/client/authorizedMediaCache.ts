import { sealsDeviceMedia } from './deviceMediaSeal';
import {
  captureDurableMediaEpoch,
  clearDurableMediaStore,
  evictDurableMedia,
  readDurableMedia,
  writeDurableMedia,
} from './durableMediaStore';
import {
  MEDIA_CACHE_MAX_AGE_MS,
  MEDIA_CACHE_MAX_BYTES,
  MEDIA_CACHE_MAX_ENTRIES,
} from './mediaCacheLimits';
import { evictMediaObjectUrls } from './sharedMediaObjectUrls';

export {
  MEDIA_CACHE_MAX_AGE_MS,
  MEDIA_CACHE_MAX_BYTES,
  MEDIA_CACHE_MAX_ENTRIES,
} from './mediaCacheLimits';
/** Session-memory ownership, shared only within an authorized account/API scope. */
export interface MediaCacheScope {
  readonly id: number;
  readonly durableIdentity?: string;
  isCurrent(spaceId: string): boolean;
}

interface CacheLease {
  readonly scope: MediaCacheScope;
  readonly spaceId: string;
  readonly generation: number;
  readonly resourceKey: string;
  readonly revocation: number;
  readonly spaceRevocation: number;
  readonly durableEpoch?: string;
}

interface CachedBlob {
  blob: Blob;
  receivedAt: number;
}

interface PendingBlob {
  controller: AbortController;
  promise: Promise<Blob>;
  consumers: number;
}

const scopesByOwner = new WeakMap<object, Map<string, MediaCacheScope>>();
const clientScopes = new WeakMap<object, MediaCacheScope>();
let nextScopeId = 1;

export function mediaCacheScopeForOwner(
  owner: object,
  basePath: string,
  isCurrent: (spaceId: string) => boolean,
  accountId?: string,
): MediaCacheScope {
  let scopes = scopesByOwner.get(owner);
  if (!scopes) {
    scopes = new Map();
    scopesByOwner.set(owner, scopes);
  }
  let scope = scopes.get(basePath);
  if (!scope) {
    scope = {
      id: nextScopeId++,
      isCurrent,
      durableIdentity: accountId
        ? JSON.stringify([basePath, accountId])
        : undefined,
    };
    scopes.set(basePath, scope);
  }
  return scope;
}

export function registerMediaClient(
  client: object,
  scope: MediaCacheScope,
): void {
  clientScopes.set(client, scope);
}

export function mediaCacheScopeForClient(client: object): MediaCacheScope {
  let scope = clientScopes.get(client);
  if (!scope) {
    // Unregistered/custom clients cannot share across transport instances.
    scope = mediaCacheScopeForOwner(client, '', () => true);
    clientScopes.set(client, scope);
  }
  return scope;
}

const cached = new Map<string, CachedBlob>();
const stored = new Map<string, Promise<Blob | undefined>>();
/**
 * Identity prefixes whose bytes stay in session memory only. M2-D18 #3: Web
 * does not persist `OWNER_ONLY` payloads, so a private parent never reaches
 * the durable store, even when another surface loads the same bytes later.
 */
const sessionOnly = new Set<string>();
const pending = new Map<string, PendingBlob>();
let cachedBytes = 0;
let generation = 0;
const revocations = new Map<string, number>();

export function captureMediaCacheLease(
  client: object,
  spaceId: string,
  identityPrefix: readonly string[] = [],
): CacheLease {
  const scope = mediaCacheScopeForClient(client);
  const resourceKey = JSON.stringify([scope.id, spaceId, ...identityPrefix]);
  return {
    scope,
    spaceId,
    generation,
    resourceKey,
    revocation: revocations.get(resourceKey) ?? 0,
    spaceRevocation: revocations.get(JSON.stringify([scope.id, spaceId])) ?? 0,
    durableEpoch: scope.durableIdentity
      ? captureDurableMediaEpoch()
      : undefined,
  };
}

export function assertMediaCacheLease(lease: CacheLease): void {
  if (
    lease.generation !== generation ||
    (lease.durableEpoch !== undefined &&
      lease.durableEpoch !== captureDurableMediaEpoch()) ||
    lease.revocation !== (revocations.get(lease.resourceKey) ?? 0) ||
    lease.spaceRevocation !==
      (revocations.get(JSON.stringify([lease.scope.id, lease.spaceId])) ?? 0) ||
    !lease.scope.isCurrent(lease.spaceId)
  ) {
    throw new DOMException('Media context expired', 'AbortError');
  }
}

function removeCached(key: string): void {
  const entry = cached.get(key);
  if (!entry) return;
  cachedBytes -= entry.blob.size;
  cached.delete(key);
}

function prune(): void {
  const now = performance.now();
  for (const [key, entry] of cached) {
    if (now - entry.receivedAt >= MEDIA_CACHE_MAX_AGE_MS) removeCached(key);
  }
  while (
    cachedBytes > MEDIA_CACHE_MAX_BYTES ||
    cached.size > MEDIA_CACHE_MAX_ENTRIES
  ) {
    const oldest = cached.keys().next().value;
    if (oldest === undefined) break;
    removeCached(oldest);
  }
}

function findCachedBlob(key: string): Blob | undefined {
  prune();
  const hit = cached.get(key);
  if (hit) {
    cached.delete(key);
    cached.set(key, hit);
  }
  return hit?.blob;
}

function rememberCachedBlob(key: string, blob: Blob): void {
  if (blob.size > MEDIA_CACHE_MAX_BYTES || cached.has(key)) return;
  cached.set(key, { blob, receivedAt: performance.now() });
  cachedBytes += blob.size;
  prune();
}

/** Clear synchronously before any asynchronous persistent-cache cleanup. */
export function clearAuthorizedMediaCache(): void {
  generation += 1;
  evictMediaObjectUrls();
  clearDurableMediaStore();
  cached.clear();
  stored.clear();
  sessionOnly.clear();
  cachedBytes = 0;
  revocations.clear();
  for (const entry of pending.values()) entry.controller.abort();
  pending.clear();
}

function keyPrefix(lease: CacheLease, identity: readonly string[]): string {
  return JSON.stringify([lease.scope.id, lease.spaceId, ...identity]);
}

export function evictAuthorizedMedia(
  lease: CacheLease,
  identityPrefix: readonly string[],
): void {
  const resourceKey = keyPrefix(lease, identityPrefix);
  const diskPrefix = durableKey(lease, identityPrefix);
  if (diskPrefix) evictDurableMedia(diskPrefix.slice(0, -1));
  revocations.set(resourceKey, (revocations.get(resourceKey) ?? 0) + 1);
  const prefix = keyPrefix(lease, identityPrefix).slice(0, -1);
  evictMediaObjectUrls(prefix);
  const matches = (key: string) =>
    key === `${prefix}]` || key.startsWith(`${prefix},`);
  for (const key of cached.keys()) {
    if (matches(key)) removeCached(key);
  }
  for (const key of stored.keys()) {
    if (matches(key)) stored.delete(key);
  }
  for (const [key, entry] of pending) {
    if (!matches(key)) continue;
    entry.controller.abort();
    pending.delete(key);
  }
}

function isSessionOnly(
  lease: CacheLease,
  identity: readonly string[],
): boolean {
  for (let length = 1; length <= identity.length; length += 1) {
    if (sessionOnly.has(keyPrefix(lease, identity.slice(0, length))))
      return true;
  }
  return false;
}

/**
 * Keep every media identity under this prefix in session memory only for
 * the rest of this login. Bytes this device stored earlier (for example while
 * the parent was still shared) are removed from the durable store once.
 * A sealing device (the Android app) keeps private images too: its store holds
 * only ciphertext under a per-login Keystore key, so this is a no-op there.
 */
export function keepMediaInSession(
  lease: CacheLease,
  identityPrefix: readonly string[],
): void {
  if (sealsDeviceMedia()) return;
  const key = keyPrefix(lease, identityPrefix);
  if (sessionOnly.has(key)) return;
  sessionOnly.add(key);
  const diskKey = durableKey(lease, identityPrefix);
  // The open array matches the exact identity and every longer one below it.
  if (diskKey) evictDurableMedia(diskKey.slice(0, -1));
}

function durableKey(
  lease: CacheLease,
  identity: readonly string[],
): string | undefined {
  return lease.scope.durableIdentity && lease.durableEpoch
    ? JSON.stringify([
        lease.durableEpoch,
        lease.scope.durableIdentity,
        lease.spaceId,
        ...identity,
      ])
    : undefined;
}

/** Read bytes this login already stored for the exact lease and identity. */
export async function readStoredMediaBlob(
  lease: CacheLease,
  identity: readonly string[],
): Promise<Blob | undefined> {
  assertMediaCacheLease(lease);
  const key = keyPrefix(lease, identity);
  const hit = findCachedBlob(key);
  if (hit) return hit;
  const diskKey = durableKey(lease, identity);
  const epoch = lease.durableEpoch;
  if (!diskKey || !epoch || isSessionOnly(lease, identity)) return undefined;
  let read = stored.get(key);
  if (!read) {
    const created = readDurableMedia(diskKey, epoch)
      .then((blob) => {
        assertMediaCacheLease(lease);
        return blob;
      })
      .finally(() => {
        if (stored.get(key) === created) stored.delete(key);
      });
    stored.set(key, created);
    read = created;
  }
  const blob = await read;
  assertMediaCacheLease(lease);
  return blob;
}

export interface MediaCacheOptions {
  /**
   * `false` keeps the bytes in session memory only: no durable read or write,
   * and an earlier durable copy is removed. Required for every `OWNER_ONLY`
   * parent (M2-D18 #3). Session-only wins for the rest of the login.
   */
  readonly persist?: boolean;
}

/**
 * Reuse immutable bytes stored for this exact scope. Identity must
 * include parent binding, attachment identity and original/thumbnail variant.
 * Cancellation belongs to each consumer; only the last departing consumer
 * cancels the shared transport. Failed/aborted results never enter the cache.
 * A prestarted local read must use the same lease and attachment identity.
 */
export async function loadCachedMediaBlob(
  lease: CacheLease,
  identity: readonly string[],
  load: (signal: AbortSignal) => Promise<Blob>,
  signal?: AbortSignal,
  storedRead?: Promise<Blob | undefined>,
  options: MediaCacheOptions = {},
): Promise<Blob> {
  signal?.throwIfAborted();
  assertMediaCacheLease(lease);
  if (options.persist === false) keepMediaInSession(lease, identity);
  const key = keyPrefix(lease, identity);
  const hit = findCachedBlob(key);
  if (hit) return hit;

  let entry = pending.get(key);
  if (!entry) {
    const controller = new AbortController();
    const created: PendingBlob = {
      controller,
      consumers: 0,
      promise: Promise.resolve()
        .then(async () => {
          controller.signal.throwIfAborted();
          const diskKey = isSessionOnly(lease, identity)
            ? undefined
            : durableKey(lease, identity);
          const diskRead = diskKey
            ? (storedRead ?? readStoredMediaBlob(lease, identity))
            : undefined;
          const diskBlob = diskRead ? await diskRead : undefined;
          controller.signal.throwIfAborted();
          assertMediaCacheLease(lease);
          const blob = diskBlob ?? (await load(controller.signal));
          controller.signal.throwIfAborted();
          assertMediaCacheLease(lease);
          if (!diskBlob && diskKey && lease.durableEpoch) {
            void writeDurableMedia(diskKey, lease.durableEpoch, blob, () => {
              try {
                assertMediaCacheLease(lease);
                // A consumer may have marked the identity private meanwhile.
                return (
                  !controller.signal.aborted && !isSessionOnly(lease, identity)
                );
              } catch {
                return false;
              }
            });
          }
          rememberCachedBlob(key, blob);
          return blob;
        })
        .finally(() => {
          if (pending.get(key) === created) pending.delete(key);
        }),
    };
    pending.set(key, created);
    entry = created;
  }
  const shared = entry;
  shared.consumers += 1;
  try {
    const blob = await new Promise<Blob>((resolve, reject) => {
      const abort = () => reject(signal?.reason);
      signal?.addEventListener('abort', abort, { once: true });
      void shared.promise.then(resolve, reject).finally(() => {
        signal?.removeEventListener('abort', abort);
      });
    });
    signal?.throwIfAborted();
    assertMediaCacheLease(lease);
    return blob;
  } finally {
    shared.consumers -= 1;
    if (shared.consumers === 0 && pending.get(key) === shared) {
      pending.delete(key);
      shared.controller.abort();
    }
  }
}
