/**
 * The pure rules of the Glas memory world (#2283): the pile of folded slips
 * in the jar, which slip is drawn next, today's draw remembered on this
 * device, the rattles that open the lid and a shaken phone. Kept free of the
 * DOM so they can be tested on their own.
 */
import type { MemoryWorldEntry, MemoryWorldEntryKind } from './model';
import { keyHash } from './model';

/* ---------- Today's draw ---------- */

/**
 * Today's drawn slip on this device: `{ day, key }`. Only the slip's key is
 * stored, never its content; a stored draw of another day is ignored.
 */
export const JAR_DRAW_KEY = 'eimir.memoryWorlds.jar.draw';

/** The local calendar day of `date`, e.g. `2026-11-25`. */
export function jarDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The key of the slip drawn today on this device, if any. */
export function readTodayDraw(now: Date = new Date()): string | null {
  try {
    const raw = window.localStorage.getItem(JAR_DRAW_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { day, key } = parsed as { day?: unknown; key?: unknown };
    return day === jarDay(now) && typeof key === 'string' ? key : null;
  } catch {
    return null;
  }
}

/** Remembers today's draw, or forgets it when the slip is back in the jar. */
export function rememberDraw(key: string | null, now: Date = new Date()): void {
  try {
    if (key)
      window.localStorage.setItem(
        JAR_DRAW_KEY,
        JSON.stringify({ day: jarDay(now), key }),
      );
    else window.localStorage.removeItem(JAR_DRAW_KEY);
  } catch {
    // Storage unavailable: the draw just is not remembered.
  }
}

/**
 * The next slip to draw: the lead on the first draw, afterwards any other
 * than the one just put back.
 */
export function pickNextSlip(
  entries: readonly MemoryWorldEntry[],
  lastKey: string | null,
  random: () => number = Math.random,
): MemoryWorldEntry | null {
  if (entries.length === 0) return null;
  if (lastKey === null) {
    const lead = entries.find((entry) => entry.isLead);
    if (lead) return lead;
  }
  const pool = entries.filter((entry) => entry.key !== lastKey);
  const list = pool.length > 0 ? pool : entries;
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

/* ---------- The pile ---------- */

/** Diary slips drawn in the jar; older ones lie underneath, unlisted. */
export const SLIP_REAL_MAX = 30;
/** The jar always looks generously filled: at least this many slips. */
export const SLIP_COUNT_MIN = 34;
const SLIP_COLUMNS = 6;

export type SlipTone = MemoryWorldEntryKind | 'lilac' | 'peach';

const DECORATION_TONES: readonly SlipTone[] = [
  'lilac',
  'peach',
  'heart',
  'milestone',
  'photo',
  'words',
];

export interface JarSlip {
  key: string;
  tone: SlipTone;
  left: number;
  top: number;
  w: number;
  h: number;
  rot: number;
  /** Which of the three moving layers of the pile it lies in. */
  group: 0 | 1 | 2;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * The pile: decorative slips at the bottom (so the jar always looks
 * generously filled), the listed diary slips above, the lead on top. The
 * places derive from the keys, so the pile never changes between visits.
 */
export function buildSlips(entries: readonly MemoryWorldEntry[]): JarSlip[] {
  const real = entries.slice(0, SLIP_REAL_MAX);
  const total = Math.max(SLIP_COUNT_MIN, real.length + 4);
  const items: { key: string; tone: SlipTone }[] = [];
  for (let index = 0; index < total - real.length; index += 1)
    items.push({
      // The decorative keys seed the accepted prototype's pile.
      key: `deco-${index}`,
      tone: DECORATION_TONES[(index * 5) % DECORATION_TONES.length],
    });
  for (const entry of real.slice().reverse())
    items.push({ key: entry.key, tone: entry.kind });
  const rows = Math.ceil(items.length / SLIP_COLUMNS);
  return items.map((item, index) => {
    const hash = keyHash(`${item.key}#${index}`);
    const row = Math.floor(index / SLIP_COLUMNS);
    const col = index % SLIP_COLUMNS;
    const span = row === 0 ? 124 : 148;
    const step = span / (SLIP_COLUMNS - 1);
    const shift = row % 2 === 1 ? step * 0.45 : 0;
    const cx = clamp(
      120 - span / 2 + col * step + shift + ((hash % 15) - 7),
      row === 0 ? 58 : 46,
      row === 0 ? 182 : 194,
    );
    const cy = 290 - row * 15 - ((hash >> 5) % 6);
    const w = 34 + ((hash >> 9) % 9);
    const h = 16 + ((hash >> 13) % 5);
    const lift = rows <= 1 ? 0 : row / (rows - 1);
    return {
      key: item.key,
      tone: item.tone,
      left: Math.round(cx - w / 2),
      top: Math.round(cy - h / 2),
      w,
      h,
      rot: ((hash >> 3) % 70) - 35,
      group: lift < 0.34 ? 0 : lift < 0.67 ? 1 : 2,
    };
  });
}

/** A slip for an entry that has no place in the pile. */
export const FALLBACK_SLIP: JarSlip = Object.freeze({
  key: 'fallback',
  tone: 'words',
  left: 100,
  top: 200,
  w: 38,
  h: 18,
  rot: -12,
  group: 2,
});

/* ---------- Rattling the lid open ---------- */

/** Counted rattles (turns of the finger, taps) that open the lid. */
export const RATTLES_TO_OPEN = 4;
/** … or this long of continuous back-and-forth (with at least two). */
export const SHAKE_OPEN_MS = 1200;
/** A turn of the finger counts after this much travel since the last turn. */
export const REVERSAL_PX = 18;
/** Turns further apart than this start a new count. */
export const SERIES_GAP_MS = 400;
/** Taps further apart than this start a new count. */
export const TAP_GAP_MS = 1000;

export interface RattleSeries {
  count: number;
  start: number;
  last: number;
  /** After today's draw, a series is refused once. */
  refused: boolean;
}

export function newRattleSeries(): RattleSeries {
  return { count: 0, start: 0, last: 0, refused: false };
}

/**
 * Counts one rattle at `now`; a rattle later than `gap` after the last one
 * starts a new series. Returns whether the series opens the lid.
 */
export function addRattle(
  series: RattleSeries,
  now: number,
  gap: number,
): boolean {
  if (series.count === 0 || now - series.last > gap) {
    series.count = 0;
    series.start = now;
    series.refused = false;
  }
  series.count += 1;
  series.last = now;
  return (
    series.count >= RATTLES_TO_OPEN ||
    (series.count >= 2 && now - series.start >= SHAKE_OPEN_MS)
  );
}

/**
 * Turns of a finger moving the jar sideways: every reversal after at least
 * `REVERSAL_PX` of travel is one rattle, with its travel in px.
 */
export interface ReversalTrack {
  dir: number;
  from: number;
  extreme: number;
}

export function newReversalTrack(x: number): ReversalTrack {
  return { dir: 0, from: x, extreme: x };
}

/** The travel of a counted turn at `x`, or null. */
export function trackReversal(track: ReversalTrack, x: number): number | null {
  if (track.dir === 0) {
    if (Math.abs(x - track.from) >= REVERSAL_PX) {
      track.dir = Math.sign(x - track.from);
      track.extreme = x;
    }
    return null;
  }
  if ((x - track.extreme) * track.dir > 0) {
    track.extreme = x;
    return null;
  }
  if (Math.abs(x - track.extreme) < REVERSAL_PX) return null;
  const travel = Math.abs(track.extreme - track.from);
  track.from = track.extreme;
  track.extreme = x;
  track.dir = -track.dir;
  return travel >= REVERSAL_PX ? travel : null;
}

/* ---------- A shaken phone ---------- */

/** Peaks of the gravity-free acceleration (m/s²) that make a shake. */
export const SHAKE_PEAK = 12;
export const SHAKE_PEAKS = 3;
export const SHAKE_WINDOW_MS = 1100;
export const SHAKE_DEBOUNCE_MS = 1500;
const SHAKE_PEAK_GAP_MS = 120;
const GRAVITY_FOLLOW = 0.1;
/** Below this sideways acceleration the slips do not follow the phone. */
export const SHAKE_FOLLOW = 3;

export interface ShakeReading {
  /** Sideways acceleration without gravity (m/s²). */
  lateral: number;
  /** Whether this sample completes a shake. */
  shake: boolean;
}

/**
 * Recognises a shaken phone from `accelerationIncludingGravity` samples
 * (Android WebView reports no reliable `acceleration`): a slowly tracked
 * gravity estimate is removed, and three peaks of what is left within
 * `SHAKE_WINDOW_MS` make a shake.
 */
export function createShakeDetector(): (
  sample: { x: number; y: number; z: number },
  now: number,
) => ShakeReading | null {
  const gravity = [0, 0, 0];
  let primed = false;
  let peaks: number[] = [];
  let lastShake = Number.NEGATIVE_INFINITY;
  return (sample, now) => {
    if (!primed) {
      gravity[0] = sample.x;
      gravity[1] = sample.y;
      gravity[2] = sample.z;
      primed = true;
      return null;
    }
    gravity[0] += (sample.x - gravity[0]) * GRAVITY_FOLLOW;
    gravity[1] += (sample.y - gravity[1]) * GRAVITY_FOLLOW;
    gravity[2] += (sample.z - gravity[2]) * GRAVITY_FOLLOW;
    const lateral = sample.x - gravity[0];
    const magnitude = Math.hypot(
      lateral,
      sample.y - gravity[1],
      sample.z - gravity[2],
    );
    if (
      magnitude > SHAKE_PEAK &&
      (peaks.length === 0 || now - peaks[peaks.length - 1] >= SHAKE_PEAK_GAP_MS)
    )
      peaks.push(now);
    peaks = peaks.filter((time) => now - time <= SHAKE_WINDOW_MS);
    if (peaks.length >= SHAKE_PEAKS && now - lastShake > SHAKE_DEBOUNCE_MS) {
      lastShake = now;
      peaks = [];
      return { lateral, shake: true };
    }
    return { lateral, shake: false };
  };
}
