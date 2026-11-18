/**
 * Which finds this device has already shown with a glint (#1907 H3
 * follow-up). The finds themselves are derived from server facts and are the
 * same for both partners; this device-local note only keeps a find from
 * glinting twice. It holds opaque find codes, never content, and losing it
 * merely lets the latest find glint once more.
 */

import { KEEPSAKES, type Keepsake } from './gardenStory';

const PREFIX = 'eimir-garden-keepsakes-v1';

export function keepsakeStoreKey(accountId: string, spaceId: string): string {
  return JSON.stringify([PREFIX, accountId, spaceId]);
}

export function readSeenKeepsakes(key: string): Set<Keepsake> {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(value)) return new Set();
    return new Set(
      value.filter((entry): entry is Keepsake =>
        (KEEPSAKES as readonly unknown[]).includes(entry),
      ),
    );
  } catch {
    return new Set();
  }
}

export function saveSeenKeepsakes(
  key: string,
  seen: ReadonlySet<Keepsake>,
): void {
  try {
    window.localStorage.setItem(key, JSON.stringify([...seen]));
  } catch {
    /* Without storage a find may glint once more on the next visit. */
  }
}
