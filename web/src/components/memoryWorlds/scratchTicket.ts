/**
 * The pure rules of the Rubbellos memory world (#2283): the heart's
 * geometry, when a scratched foil counts as revealed, the three bonus coins
 * and the extra memory they bring, and the small texts of a ticket. Kept
 * free of the DOM so they can be tested on their own.
 */
import type { MemoryWorldEntry, MemoryWorldEntryKind } from './model';
import { keyHash } from './model';

/* ---------- Tuning ---------- */

/** Share of the heart that must be scratched before the rest dissolves. */
export const HEART_REVEAL = 0.55;
/** Share of a bonus coin that must be scratched before it opens. */
export const COIN_REVEAL = 0.45;
/** A sampled foil pixel counts as scratched below this alpha (0..255). */
export const CLEARED_ALPHA = 64;
/** Sample grid per side: the heart and the smaller coins. */
export const HEART_SAMPLE_GRID = 22;
export const COIN_SAMPLE_GRID = 10;

/* ---------- The heart ---------- */

/** The big heart, in a 0..1 box: the start point, then cubic segments. */
export const HEART_START: readonly [number, number] = [0.5, 0.97];
export const HEART_CURVES: readonly (readonly [
  number,
  number,
  number,
  number,
  number,
  number,
])[] = [
  [0.36, 0.86, 0.03, 0.62, 0.03, 0.33],
  [0.03, 0.15, 0.16, 0.03, 0.3, 0.03],
  [0.4, 0.03, 0.47, 0.09, 0.5, 0.18],
  [0.53, 0.09, 0.6, 0.03, 0.7, 0.03],
  [0.84, 0.03, 0.97, 0.15, 0.97, 0.33],
  [0.97, 0.62, 0.64, 0.86, 0.5, 0.97],
];

/** The heart in its 0..1 box as an SVG path. */
export const HEART_D = `M${HEART_START.join(' ')} ${HEART_CURVES.map(
  (curve) => `C${curve.join(' ')}`,
).join(' ')} Z`;

/** The heart scaled into a box, as an SVG path (the small printed motifs). */
export function heartPathIn(x: number, y: number, w: number, h: number) {
  const px = (u: number) => (x + u * w).toFixed(2);
  const py = (v: number) => (y + v * h).toFixed(2);
  return `M${px(HEART_START[0])} ${py(HEART_START[1])} ${HEART_CURVES.map(
    (c) =>
      `C${px(c[0])} ${py(c[1])} ${px(c[2])} ${py(c[3])} ${px(c[4])} ${py(c[5])}`,
  ).join(' ')} Z`;
}

/** A small deterministic random source (mulberry32) for printed patterns. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- Reveal threshold ---------- */

/**
 * The alpha offsets (into RGBA canvas data) of a `grid` x `grid` sample
 * raster, kept only where `inside` reports the sample inside the shape.
 */
export function sampleOffsets(
  width: number,
  height: number,
  grid: number,
  inside: (x: number, y: number) => boolean,
): Int32Array {
  const list: number[] = [];
  for (let gy = 0; gy < grid; gy += 1)
    for (let gx = 0; gx < grid; gx += 1) {
      const x = Math.floor(((gx + 0.5) / grid) * width);
      const y = Math.floor(((gy + 0.5) / grid) * height);
      if (inside(x, y)) list.push((y * width + x) * 4 + 3);
    }
  return Int32Array.from(list);
}

/** The share of sampled foil pixels that are scratched away (0..1). */
export function clearedShare(
  data: ArrayLike<number>,
  offsets: ArrayLike<number>,
): number {
  if (offsets.length === 0) return 0;
  let cleared = 0;
  for (let index = 0; index < offsets.length; index += 1)
    if (data[offsets[index]] < CLEARED_ALPHA) cleared += 1;
  return cleared / offsets.length;
}

/** Whether enough of the foil is scratched away for the rest to dissolve. */
export function isRevealed(share: number, threshold: number): boolean {
  return share >= threshold;
}

/* ---------- Bonus coins ---------- */

export type CoinSymbol = 'heart' | 'kiss' | 'star';
export const COIN_SYMBOLS: readonly CoinSymbol[] = ['heart', 'kiss', 'star'];

/** The kind of the extra memory a triple of each symbol prefers. */
export const BONUS_KIND: Readonly<Record<CoinSymbol, MemoryWorldEntryKind>> =
  Object.freeze({ heart: 'heart', kiss: 'photo', star: 'milestone' });

/**
 * The three coin symbols of a ticket, from its memory's key hash: one ticket
 * in three is a triple, the others are mixed (and may still match by chance).
 */
export function coinSymbols(hash: number): CoinSymbol[] {
  if ((hash >>> 17) % 3 === 0)
    return Array.from({ length: 3 }, () => COIN_SYMBOLS[(hash >>> 5) % 3]);
  return [0, 1, 2].map((index) => COIN_SYMBOLS[(hash >>> (index * 4 + 3)) % 3]);
}

/** The symbol of three equal coins, or `null`. */
export function tripleOf(symbols: readonly CoinSymbol[]): CoinSymbol | null {
  return symbols.length > 0 && symbols.every((symbol) => symbol === symbols[0])
    ? symbols[0]
    : null;
}

/** The extra memory for three equal coins: matching the symbol when possible. */
export function bonusFor(
  pool: readonly MemoryWorldEntry[],
  won: MemoryWorldEntry,
  symbol: CoinSymbol,
  hash: number,
): MemoryWorldEntry | null {
  const others = pool.filter((entry) => entry.key !== won.key);
  if (others.length === 0) return null;
  const matching = others.filter((entry) => entry.kind === BONUS_KIND[symbol]);
  const from = matching.length > 0 ? matching : others;
  return from[(hash >>> 9) % from.length];
}

/* ---------- Ticket texts ---------- */

/** Shortens a text at a word boundary, so it is abbreviated instead of clipped. */
export function shorten(text: string, max: number): string {
  const clean = text.trim().replace(/\s+/gu, ' ');
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/u, '')}…`;
}

export type CardSize = 'short' | 'medium' | 'long';

/**
 * The handwritten card under the foil: its text shortened to the room of
 * the heart and the handwriting size by length (the text is then fitted
 * into the heart's safe area as well).
 */
export function cardFit(entry: Pick<MemoryWorldEntry, 'kind' | 'title'>): {
  text: string;
  size: CardSize;
} {
  const room = entry.kind === 'words' ? 70 : 56;
  const text = shorten(entry.title, room);
  const size: CardSize =
    text.length <= 24 ? 'short' : text.length <= 48 ? 'medium' : 'long';
  return { text, size };
}

/** The ticket's printed serial: four digits from the memory's key. */
export function ticketSerial(key: string): string {
  return String(keyHash(key) % 10000).padStart(4, '0');
}
