/**
 * The distance step this device last showed on Wir, so a change can be shown
 * once when the app opens (Product Owner, 2026-11-22).
 *
 * The record holds only the coarse step (0 to 6) and two timestamps: never a
 * position, a kilometre value, a direction or a history. There is one record
 * per viewer and Space, replaced on every write. Like a presence snapshot
 * (docs/m9/PARTNER-LOCATION.md section 5) it expires after 24 hours; it is also
 * removed when sharing ends and on sign-out. It stays on this device and is
 * not part of the synced personal settings.
 */
import { DISTANCE_STAGE_MAX } from './partnerDistance';

const PREFIX = 'eimir.wir.distanceSeen:';

/** A record older than this is never compared with a new value. */
export const DISTANCE_SEEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** A value that flips around a band edge animates at most this often. */
export const DISTANCE_CHANGE_REST_MS = 30 * 60 * 1000;

export interface WirDistanceSeen {
  stage: number;
  seenAt: number;
  playedAt: number | null;
}

/** Keeps the comparison for this session when storage is unavailable. */
const memory = new Map<string, string>();

function storageKey(accountId: string, spaceId: string) {
  return `${PREFIX}${accountId}:${spaceId}`;
}

function parse(raw: string | null, now: number): WirDistanceSeen | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<WirDistanceSeen>;
    if (
      !Number.isInteger(value.stage) ||
      (value.stage as number) < 0 ||
      (value.stage as number) > DISTANCE_STAGE_MAX ||
      typeof value.seenAt !== 'number' ||
      value.seenAt > now ||
      now - value.seenAt > DISTANCE_SEEN_MAX_AGE_MS
    )
      return null;
    return {
      stage: value.stage as number,
      seenAt: value.seenAt,
      playedAt: typeof value.playedAt === 'number' ? value.playedAt : null,
    };
  } catch {
    return null;
  }
}

export function forgetDistanceSeen(accountId: string, spaceId: string): void {
  const key = storageKey(accountId, spaceId);
  memory.delete(key);
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing was stored.
  }
}

/** The current record; an expired or malformed one is removed. */
export function readDistanceSeen(
  accountId: string,
  spaceId: string,
  now = Date.now(),
): WirDistanceSeen | null {
  const key = storageKey(accountId, spaceId);
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    raw = memory.get(key) ?? null;
  }
  const seen = parse(raw, now);
  if (!seen && raw) forgetDistanceSeen(accountId, spaceId);
  return seen;
}

/** Replaces the record with the step shown now. */
export function rememberDistanceSeen(
  accountId: string,
  spaceId: string,
  stage: number,
  { now = Date.now(), played = false }: { now?: number; played?: boolean } = {},
): void {
  const previous = readDistanceSeen(accountId, spaceId, now);
  const record: WirDistanceSeen = {
    stage,
    seenAt: now,
    playedAt: played ? now : (previous?.playedAt ?? null),
  };
  const key = storageKey(accountId, spaceId);
  const value = JSON.stringify(record);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    memory.set(key, value);
  }
}

/** Whether a change may animate now, or should simply be shown. */
export function distanceChangeMayPlay(
  seen: WirDistanceSeen | null,
  now = Date.now(),
): boolean {
  return (
    seen?.playedAt == null || now - seen.playedAt >= DISTANCE_CHANGE_REST_MS
  );
}

/** Removes every record on this device (sign-out). */
export function clearWirDistanceSeen(): void {
  memory.clear();
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    // Nothing was stored.
  }
}
