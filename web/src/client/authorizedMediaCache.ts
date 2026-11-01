import {
  captureDurableMediaEpoch,
  clearDurableMediaStore,
  readDurableMedia,
  writeDurableMedia,
  evictDurableMedia,
} from './durableMediaStore';
/** Session-memory byte ownership; views continue to own their Object URLs. */
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

export const MEDIA_CACHE_MAX_BYTES = 48 * 1024 * 1024;
export const MEDIA_CACHE_MAX_ENTRIES = 192;
export const MEDIA_CACHE_MAX_AGE_MS = 30 * 60 * 1000;

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

/** Clear synchronously before any asynchronous persistent-cache cleanup. */
export function clearAuthorizedMediaCache(): void {
  generation += 1;
  clearDurableMediaStore();
  cached.clear();
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
  const matches = (key: string) =>
    key === `${prefix}]` || key.startsWith(`${prefix},`);
  for (const key of cached.keys()) {
    if (matches(key)) removeCached(key);
  }
  for (const [key, entry] of pending) {
    if (!matches(key)) continue;
    entry.controller.abort();
    pending.delete(key);
  }
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

/**
 * Reuse immutable bytes after the caller's authorization check. Identity must
 * include parent binding, attachment identity and original/thumbnail variant.
 * Cancellation belongs to each consumer; only the last departing consumer
 * cancels the shared transport. Failed/aborted results never enter the cache.
 */
export async function loadCachedMediaBlob(
  lease: CacheLease,
  identity: readonly string[],
  load: (signal: AbortSignal) => Promise<Blob>,
  signal?: AbortSignal,
): Promise<Blob> {
  signal?.throwIfAborted();
  assertMediaCacheLease(lease);
  prune();
  const key = keyPrefix(lease, identity);
  const hit = cached.get(key);
  if (hit) {
    cached.delete(key);
    cached.set(key, hit);
    return hit.blob;
  }

  let entry = pending.get(key);
  if (!entry) {
    const controller = new AbortController();
    const created: PendingBlob = {
      controller,
      consumers: 0,
      promise: Promise.resolve()
        .then(async () => {
          controller.signal.throwIfAborted();
          const diskKey = durableKey(lease, identity);
          const diskBlob =
            diskKey && lease.durableEpoch
              ? await readDurableMedia(diskKey, lease.durableEpoch)
              : undefined;
          controller.signal.throwIfAborted();
          assertMediaCacheLease(lease);
          const blob = diskBlob ?? (await load(controller.signal));
          controller.signal.throwIfAborted();
          assertMediaCacheLease(lease);
          if (!diskBlob && diskKey && lease.durableEpoch) {
            void writeDurableMedia(diskKey, lease.durableEpoch, blob, () => {
              try {
                assertMediaCacheLease(lease);
                return !controller.signal.aborted;
              } catch {
                return false;
              }
            });
          }
          if (blob.size <= MEDIA_CACHE_MAX_BYTES) {
            cached.set(key, { blob, receivedAt: performance.now() });
            cachedBytes += blob.size;
            prune();
          }
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
