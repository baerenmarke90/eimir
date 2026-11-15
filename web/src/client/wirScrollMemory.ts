/**
 * Remembers where the person was on Wir so a cold start (the OS discarded the
 * WebView while the app was in the background) returns to the same place
 * instead of the top. Stores only a number and a timestamp, per account/space.
 */
const KEY_PREFIX = 'eimir.wir.scroll.v1';
/** Beyond this the old position no longer feels like "where I was". */
export const WIR_SCROLL_MEMORY_TTL_MS = 6 * 60 * 60_000;
const MAX_OFFSET = 200_000;

// Only the first Wir mount of a JS process can be a cold-start return.
let coldStartOpen = true;

function storageKey(accountId: string, spaceId: string): string {
  return `${KEY_PREFIX}:${accountId}:${spaceId}`;
}

export function rememberWirScroll(
  accountId: string,
  spaceId: string,
  offset: number,
  now = Date.now(),
): void {
  if (!accountId || !spaceId || !Number.isFinite(offset)) return;
  try {
    const key = storageKey(accountId, spaceId);
    if (offset <= 0) window.localStorage.removeItem(key);
    else
      window.localStorage.setItem(
        key,
        JSON.stringify({ offset: Math.round(offset), savedAt: now }),
      );
  } catch {
    // Storage may be unavailable; restoring the position is only a comfort.
  }
}

/** The remembered offset for this process's first Wir mount, once. */
export function takeColdStartWirScroll(
  accountId: string,
  spaceId: string,
  now = Date.now(),
): number | null {
  if (!coldStartOpen) return null;
  coldStartOpen = false;
  if (!accountId || !spaceId) return null;
  try {
    const raw = window.localStorage.getItem(storageKey(accountId, spaceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { offset?: unknown; savedAt?: unknown };
    if (
      typeof parsed.offset !== 'number' ||
      typeof parsed.savedAt !== 'number' ||
      !Number.isFinite(parsed.offset) ||
      parsed.offset <= 0 ||
      parsed.offset > MAX_OFFSET ||
      now - parsed.savedAt > WIR_SCROLL_MEMORY_TTL_MS ||
      parsed.savedAt > now
    )
      return null;
    return parsed.offset;
  } catch {
    return null;
  }
}

/** Test seam: a new process starts open again. */
export function resetWirScrollMemoryForTests(): void {
  coldStartOpen = true;
}
