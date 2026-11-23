/**
 * The "Wie geht's?" invitation on Wir appears once per day, at the first
 * opening of Wir on this device.
 *
 * "Day" is the check-in day the server reports (`checkedOn`, in the Space's
 * daily-context time zone), not the device calendar: the invitation asks for
 * exactly that day's check-in, so both always change at the same moment, also
 * while travelling. A day counts as used at its first opening even when it
 * already has a value, for example from another device, so removing that value
 * later does not bring the invitation back.
 *
 * The store holds one day string per viewer and Space. It stays on this device
 * and is not part of the synced personal settings.
 */

import { localDay } from './quietHints';

/** Keeps the once-per-day rule for this session when storage is unavailable. */
const memory = new Map<string, string>();

function storageKey(accountId: string, spaceId: string) {
  return `eimir.wir.checkInPromptDay:${accountId}:${spaceId}`;
}

function lastPromptDay(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

/** Whether `day` has not had its first opening on this device yet. */
export function checkInPromptDue(
  accountId: string,
  spaceId: string,
  day: string,
): boolean {
  return lastPromptDay(storageKey(accountId, spaceId)) !== day;
}

/** Records the first opening of `day`. */
export function markCheckInPromptDay(
  accountId: string,
  spaceId: string,
  day: string,
): void {
  const key = storageKey(accountId, spaceId);
  try {
    window.localStorage.setItem(key, day);
  } catch {
    memory.set(key, day);
  }
}

function rowKey(accountId: string, spaceId: string) {
  return `eimir.wir.checkInRowDay:${accountId}:${spaceId}`;
}

/**
 * Whether this device last saw a daily mark under the names today. While
 * today's state loads, only then does the row keep its place: an empty day
 * must not hold a row open that closes again and pulls the quote up.
 */
export function checkInRowExpected(
  accountId: string,
  spaceId: string,
  now = new Date(),
): boolean {
  try {
    return (
      window.localStorage.getItem(rowKey(accountId, spaceId)) === localDay(now)
    );
  } catch {
    return false;
  }
}

/** Remembers from a confirmed read whether the row shows a mark today. */
export function rememberCheckInRow(
  accountId: string,
  spaceId: string,
  shown: boolean,
  now = new Date(),
): void {
  const key = rowKey(accountId, spaceId);
  try {
    if (shown) window.localStorage.setItem(key, localDay(now));
    else window.localStorage.removeItem(key);
  } catch {
    // Only a layout convenience; the row then simply opens when a value lands.
  }
}
