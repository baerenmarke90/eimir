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
  original: boolean;
}
const entries = new Map<string, Entry>();
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
