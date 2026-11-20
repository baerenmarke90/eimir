import {
  MEDIA_CACHE_MAX_AGE_MS,
  MEDIA_CACHE_MAX_BYTES,
  MEDIA_CACHE_MAX_ENTRIES,
} from './mediaCacheLimits';
import { createOwnedObjectUrl, type OwnedObjectUrl } from './objectUrlResource';
import { createOwnedObjectUrlOffThread } from './offThreadObjectUrl';

interface Entry {
  resource: OwnedObjectUrl;
  consumers: number;
  bytes: number;
  retained: boolean;
  idleAt: number | null;
  original: boolean;
}
const entries = new Map<string, Entry>();
type RevocationListener = (urls: ReadonlySet<string>) => void;
const revocationListeners = new Set<RevocationListener>();
// Compressed file size does not bound decoded image/GPU memory. Keep only the
// two most recently viewed originals idle; their bytes remain in the media cache.
export const MEDIA_OBJECT_URL_MAX_IDLE_ORIGINALS = 2;
let expiry: ReturnType<typeof setTimeout> | undefined;

function remove(key: string, entry: Entry): void {
  if (entries.get(key) === entry) entries.delete(key);
  entry.retained = false;
  if (!entry.consumers) entry.resource.dispose();
}

function prune(): void {
  clearTimeout(expiry);
  expiry = undefined;
  let bytes = 0;
  const idle: Array<{ key: string; entry: Entry; idleAt: number }> = [];
  for (const [key, entry] of entries) {
    if (entry.idleAt === null) continue;
    if (Date.now() - entry.idleAt >= MEDIA_CACHE_MAX_AGE_MS) remove(key, entry);
    else {
      idle.push({ key, entry, idleAt: entry.idleAt });
      bytes += entry.bytes;
    }
  }
  idle.sort((a, b) => a.idleAt - b.idleAt);
  let originals = idle.filter(({ entry }) => entry.original).length;
  for (let index = 0; originals > MEDIA_OBJECT_URL_MAX_IDLE_ORIGINALS; ) {
    const candidate = idle[index];
    if (!candidate) break;
    if (!candidate.entry.original) {
      index++;
      continue;
    }
    idle.splice(index, 1);
    bytes -= candidate.entry.bytes;
    originals--;
    remove(candidate.key, candidate.entry);
  }
  while (
    idle.length > MEDIA_CACHE_MAX_ENTRIES ||
    bytes > MEDIA_CACHE_MAX_BYTES
  ) {
    const next = idle.shift();
    if (!next) break;
    bytes -= next.entry.bytes;
    remove(next.key, next.entry);
  }
  if (idle.length)
    expiry = setTimeout(
      prune,
      Math.max(0, MEDIA_CACHE_MAX_AGE_MS - (Date.now() - idle[0].idleAt)),
    );
}

/** Called only after a fresh parent-bound authorization. Handles own one reference. */
export function acquireMediaObjectUrl(
  key: string,
  blob: Blob,
  presentation: 'preview' | 'original' = 'preview',
): OwnedObjectUrl {
  prune();
  let entry = entries.get(key);
  if (!entry) {
    entry = {
      resource: createOwnedObjectUrl(blob),
      consumers: 0,
      bytes: blob.size,
      retained: true,
      idleAt: null,
      original: presentation === 'original',
    };
    entries.set(key, entry);
  }
  return handleFor(key, entry);
}

/**
 * Evictions while an Object URL is still being created, as prefixes
 * (`undefined` = everything), so a late URL for an evicted key is refused.
 */
let evictionCount = 0;
let creating = 0;
const recentEvictions: Array<{ count: number; prefix: string | undefined }> =
  [];

function evictedSince(count: number, key: string): boolean {
  return recentEvictions.some(
    (eviction) =>
      eviction.count > count &&
      (eviction.prefix === undefined || key.startsWith(eviction.prefix)),
  );
}

/**
 * `acquireMediaObjectUrl` for asynchronous loaders: the Object URL is created
 * off the main thread, so a slow registration in the browser never freezes
 * the page (#2063). `stillValid` re-checks the caller's authorization after
 * the wait and throws when it lapsed; an eviction or wipe that covered `key`
 * meanwhile also refuses the URL. A refused URL is revoked at once.
 */
export async function acquireMediaObjectUrlAsync(
  key: string,
  blob: Blob,
  presentation: 'preview' | 'original' = 'preview',
  stillValid?: () => void,
): Promise<OwnedObjectUrl> {
  const known = reacquireMediaObjectUrl(key);
  if (known) return known;
  const since = evictionCount;
  creating += 1;
  let resource: OwnedObjectUrl;
  try {
    resource = await createOwnedObjectUrlOffThread(blob);
  } finally {
    creating -= 1;
  }
  const evicted = evictedSince(since, key);
  if (!creating) recentEvictions.length = 0;
  try {
    stillValid?.();
    if (evicted) throw new DOMException('Media context expired', 'AbortError');
  } catch (error) {
    resource.dispose();
    throw error;
  }
  prune();
  const existing = entries.get(key);
  if (existing?.retained) {
    // Another loader finished first; keep its URL and drop this one.
    resource.dispose();
    return handleFor(key, existing);
  }
  const entry: Entry = {
    resource,
    consumers: 0,
    bytes: blob.size,
    retained: true,
    idleAt: null,
    original: presentation === 'original',
  };
  entries.set(key, entry);
  return handleFor(key, entry);
}

/**
 * Takes another handle on an existing, still retained entry without bytes or
 * transport. Eviction, wipe and expiry delete entries, so a hit is current.
 */
export function reacquireMediaObjectUrl(key: string): OwnedObjectUrl | null {
  prune();
  const entry = entries.get(key);
  return entry?.retained ? handleFor(key, entry) : null;
}

let synchronousCapture: { handle: OwnedObjectUrl | null } | null = null;

/**
 * Runs a loader and returns a handle it could satisfy synchronously. The
 * caller owns that handle; the loader's promise result is a separate handle.
 */
export function captureSynchronousMediaObjectUrl<T>(run: () => T): {
  result: T;
  handle: OwnedObjectUrl | null;
} {
  const previous = synchronousCapture;
  const current: { handle: OwnedObjectUrl | null } = { handle: null };
  synchronousCapture = current;
  try {
    return { result: run(), handle: current.handle };
  } catch (error) {
    current.handle?.dispose();
    throw error;
  } finally {
    synchronousCapture = previous;
  }
}

/** Offered only by authorized loaders for the exact key they serve. */
export function offerSynchronousMediaObjectUrl(key: string): void {
  if (!synchronousCapture || synchronousCapture.handle) return;
  synchronousCapture.handle = reacquireMediaObjectUrl(key);
}

function handleFor(key: string, owned: Entry): OwnedObjectUrl {
  owned.consumers++;
  owned.idleAt = null;
  let released = false;
  return {
    url: owned.resource.url,
    dispose() {
      if (released) return;
      released = true;
      owned.consumers--;
      if (owned.consumers) return;
      if (owned.retained) owned.idleAt = Date.now();
      else remove(key, owned);
      prune();
    },
  };
}

/**
 * A view that stays mounted (for example a kept primary tab) keeps showing
 * already decoded pixels after its object URL is revoked. Holders subscribe
 * so a revocation also withdraws what they display.
 */
export function subscribeMediaObjectUrlRevocations(
  listener: RevocationListener,
): () => void {
  revocationListeners.add(listener);
  return () => {
    revocationListeners.delete(listener);
  };
}

/** Revocation is immediate even while a previous view still owns a handle. */
export function evictMediaObjectUrls(prefix?: string): void {
  evictionCount += 1;
  if (creating) recentEvictions.push({ count: evictionCount, prefix });
  const revoked = new Set<string>();
  for (const [key, entry] of entries) {
    if (prefix !== undefined && !key.startsWith(prefix)) continue;
    revoked.add(entry.resource.url);
    entry.resource.dispose();
    entry.retained = false;
    entries.delete(key);
  }
  prune();
  if (revoked.size)
    for (const listener of [...revocationListeners]) listener(revoked);
}
