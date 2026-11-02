import { createOwnedObjectUrl, type OwnedObjectUrl } from './objectUrlResource';

interface Entry {
  resource: OwnedObjectUrl;
  consumers: number;
  bytes: number;
  retained: boolean;
  idleAt: number | null;
}
const entries = new Map<string, Entry>();
const MAX_IDLE_BYTES = 8 * 1024 * 1024;
const MAX_IDLE_ENTRIES = 24;
const IDLE_AGE = 60_000;
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
    if (Date.now() - entry.idleAt >= IDLE_AGE) remove(key, entry);
    else {
      idle.push({ key, entry, idleAt: entry.idleAt });
      bytes += entry.bytes;
    }
  }
  idle.sort((a, b) => a.idleAt - b.idleAt);
  while (idle.length > MAX_IDLE_ENTRIES || bytes > MAX_IDLE_BYTES) {
    const next = idle.shift();
    if (!next) break;
    bytes -= next.entry.bytes;
    remove(next.key, next.entry);
  }
  if (idle.length)
    expiry = setTimeout(
      prune,
      Math.max(0, IDLE_AGE - (Date.now() - idle[0].idleAt)),
    );
}

/** Called only after a fresh parent-bound authorization. Handles own one reference. */
export function acquireMediaObjectUrl(
  key: string,
  blob: Blob,
  retainThumbnail: boolean,
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
      if (retainThumbnail && owned.retained) owned.idleAt = Date.now();
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
