import { createOwnedObjectUrl, type OwnedObjectUrl } from './objectUrlResource';
import {
  MEDIA_CACHE_MAX_BYTES,
  MEDIA_CACHE_MAX_ENTRIES,
  MEDIA_CACHE_MAX_AGE_MS,
} from './mediaCacheLimits';

interface Entry {
  resource: OwnedObjectUrl;
  consumers: number;
  bytes: number;
  retained: boolean;
  idleAt: number | null;
}
const entries = new Map<string, Entry>();
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
export function acquireMediaObjectUrl(key: string, blob: Blob): OwnedObjectUrl {
  prune();
  let entry = entries.get(key);
  if (!entry) {
    entry = {
      resource: createOwnedObjectUrl(blob),
      consumers: 0,
      bytes: blob.size,
      retained: true,
      idleAt: null,
    };
    entries.set(key, entry);
  }
  const owned = entry;
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

/** Revocation is immediate even while a previous view still owns a handle. */
export function evictMediaObjectUrls(prefix?: string): void {
  for (const [key, entry] of entries) {
    if (prefix !== undefined && !key.startsWith(prefix)) continue;
    entry.resource.dispose();
    entry.retained = false;
    entries.delete(key);
  }
  prune();
}
