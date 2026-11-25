/**
 * The star chart of the Sternbild memory world (#2283): pure geometry and
 * the live sky, without DOM or React.
 *
 * Every memory is a star on an old star chart, placed by time from left to
 * right (and by a stable hash from top to bottom), joined by the
 * constellation line in the order of time. The sky follows the device
 * clock: its palette blends through night, dawn, day and dusk, the star
 * field turns slowly around a pole above the chart over the night, the moon
 * shows tonight's phase, and August and December bring more shooting stars
 * (December and the winter months also snow). The sky's colours are roles
 * in `ConstellationWorld.css`; this module only says which two palettes to
 * blend and by how much. The values were tuned with the Product Owner in
 * the accepted prototype and are kept unchanged.
 */
import type { TFunction } from 'i18next';
import { keyHash, type MemoryWorldEntry, seasonOf } from './model';

/** The sky's own coordinate system; the sky keeps this aspect ratio. */
export const SKY_W = 400;
export const SKY_H = 340;

export interface Pt {
  x: number;
  y: number;
}

export interface Star {
  entry: MemoryWorldEntry;
  index: number;
  x: number;
  y: number;
  /** Relative brightness: the lead and milestones shine brighter. */
  size: number;
  /** Twinkle phase in seconds. */
  delay: number;
}

/** At most this many stars are shown; the rest stay in the diary. */
export const MAX_STARS = 16;
/**
 * Minimum distance between two stars, in sky units: about 34 px on a 360 px
 * phone. Star hit areas are sized below this share of the sky width, so they
 * never overlap either.
 */
export const MIN_STAR_DISTANCE = 44;
/** The band of the sky where stars sit (before the sky turns), in sky units. */
export const STAR_Y_MIN = 78;
export const STAR_X_MIN = 44;
const LABEL_FONT = 9.5;

/**
 * The memories that become stars, oldest first: all of them up to
 * `MAX_STARS`; otherwise the kept ones (the lead, the lit one) and the rest
 * picked evenly over time.
 */
export function visibleEntries(
  entries: readonly MemoryWorldEntry[],
  keep: readonly (string | null | undefined)[],
): MemoryWorldEntry[] {
  const sorted = entries
    .slice()
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  if (sorted.length <= MAX_STARS) return sorted;
  const kept = new Set(
    keep.filter((key): key is string =>
      sorted.some((entry) => entry.key === key),
    ),
  );
  const others = sorted.filter((entry) => !kept.has(entry.key));
  const slots = MAX_STARS - kept.size;
  const picked = new Set(kept);
  for (let slot = 0; slot < slots; slot += 1) {
    const at =
      slots === 1
        ? Math.floor((others.length - 1) / 2)
        : Math.round((slot * (others.length - 1)) / (slots - 1));
    picked.add(others[at].key);
  }
  return sorted.filter((entry) => picked.has(entry.key));
}

/** Low on the left is the pencil note, low in the middle the telescope. */
function starYMax(x: number) {
  return x > 275 ? 200 : 188;
}

function starSize(entry: MemoryWorldEntry) {
  if (entry.isLead) return 1.6;
  switch (entry.kind) {
    case 'milestone':
      return 1.5;
    case 'photo':
      return 1.25;
    case 'heart':
      return 1.15;
    case 'words':
      return 1;
  }
}

/**
 * Stars by chronology (x, strictly left to right) and a stable hash (y).
 * Each star is nudged up or down, deterministically, until it keeps its
 * distance from the stars before it (the moon wanders, so it is not an
 * obstacle).
 */
export function layoutStars(sorted: readonly MemoryWorldEntry[]): Star[] {
  const n = sorted.length;
  const spacing = n > 1 ? (SKY_W - 2 * STAR_X_MIN) / (n - 1) : 0;
  const placed: Star[] = [];
  const clearance = (x: number, y: number) => {
    let nearest = Number.POSITIVE_INFINITY;
    for (const other of placed)
      nearest = Math.min(
        nearest,
        Math.hypot(x - other.x, y - other.y) - MIN_STAR_DISTANCE,
      );
    return nearest;
  };
  sorted.forEach((entry, index) => {
    const hash = keyHash(entry.key);
    // A little jitter only where there is room for it.
    const jitter =
      spacing > MIN_STAR_DISTANCE + 6 ? (((hash >>> 10) % 13) - 6) * 0.8 : 0;
    const x = n === 1 ? SKY_W / 2 : STAR_X_MIN + spacing * index + jitter;
    const yMax = starYMax(x);
    const preferred = STAR_Y_MIN + ((hash % 1000) / 1000) * (yMax - STAR_Y_MIN);
    // Try the preferred height first, then step outwards in both directions.
    let best = { y: preferred, room: clearance(x, preferred) };
    if (best.room < 0) {
      const direction = hash % 2 === 0 ? 1 : -1;
      for (let step = 1; step <= 60; step += 1) {
        let found = false;
        for (const sign of [direction, -direction]) {
          const candidate = preferred + sign * step * 4;
          if (candidate < STAR_Y_MIN || candidate > yMax) continue;
          const room = clearance(x, candidate);
          if (room >= 0) {
            best = { y: candidate, room };
            found = true;
            break;
          }
          if (room > best.room) best = { y: candidate, room };
        }
        if (found) break;
      }
    }
    placed.push({
      entry,
      index,
      x,
      y: best.y,
      size: starSize(entry),
      delay: ((hash >>> 4) % 50) / 10,
    });
  });
  return placed;
}

/** Rough width of an engraved label in sky units. */
function labelWidth(label: string) {
  return label.length * LABEL_FONT * 0.62;
}

export interface SeasonMark {
  key: string;
  x: number;
  label: string;
}

/** "Sommer ’25", or "Winter ’24/25" across the turn of the year. */
export function seasonMarkLabel(date: Date, t: TFunction): string {
  const { season, year } = seasonOf(date);
  const short = (value: number) => String(value).slice(2);
  const name = t(`rediscovery.season.${season}`);
  return season === 'winter'
    ? t('memoryWorlds.stars.winterMark', {
        season: name,
        from: short(year - 1),
        to: short(year),
      })
    : t('memoryWorlds.stars.seasonMark', { season: name, year: short(year) });
}

/**
 * Engraved season names along the time axis; a label that would touch the
 * previous one is left out.
 */
export function seasonMarks(
  stars: readonly Star[],
  t: TFunction,
): SeasonMark[] {
  const marks: SeasonMark[] = [];
  let lastKey = '';
  let lastRight = Number.NEGATIVE_INFINITY;
  for (const star of stars) {
    const season = seasonOf(star.entry.date);
    if (season.key === lastKey) continue;
    lastKey = season.key;
    const label = seasonMarkLabel(star.entry.date, t);
    const half = labelWidth(label) / 2;
    const x = Math.min(SKY_W - 18 - half, Math.max(18 + half, star.x));
    if (x - half < lastRight + 8) continue;
    marks.push({ key: season.key, x, label });
    lastRight = x + half;
  }
  return marks;
}

/** A deterministic pseudo-random sequence (Park–Miller), so nothing reshuffles. */
function sequence(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

/** Faint background stars; the brighter ones carry a little cross glint. */
export const DUST_STARS = (() => {
  const rnd = sequence(20231);
  return Array.from({ length: 104 }, (_, id) => {
    const x = -50 + rnd() * 500;
    const y = 10 + rnd() * 290;
    const r = 0.4 + rnd() ** 2.2 * 1.3;
    return {
      id,
      x,
      y,
      r,
      glint: r > 1.2,
      /** Twinkle phase and period in seconds. */
      delay: rnd() * 6,
      period: 3 + rnd() * 4,
    };
  });
})();

/** Snowflakes for the winter months. */
export const SNOW = (() => {
  const rnd = sequence(4711);
  return Array.from({ length: 18 }, (_, id) => ({
    id,
    x: 10 + rnd() * 380,
    r: 0.6 + rnd() * 0.9,
    /** Phase and period of the fall in seconds. */
    delay: rnd() * 14,
    period: 11 + rnd() * 8,
    drift: rnd() * 30 - 15,
  }));
})();

/** The engraved scale of the chart's frame. */
export const FRAME_TICKS = [
  ...Array.from({ length: 47 }, (_, index) => {
    const x = 16 + index * 8;
    return `M${x} 5V${index % 5 === 0 ? 12.5 : 8.6}`;
  }),
  ...Array.from({ length: 32 }, (_, index) => {
    const y = 20 + index * 8;
    const long = index % 5 === 0 ? 12.5 : 8.6;
    return `M5 ${y}H${long}M395 ${y}H${SKY_W - long}`;
  }),
].join('');

export const HILL_EDGE =
  'M0 294 C60 276 120 264 196 264 C262 264 300 276 340 272 C366 270 386 262 400 258';
export const HILL = `${HILL_EDGE} L400 340 L0 340 Z`;

/** The hill's top edge, sampled, to tell a press on the hill from the sky. */
const HILL_POINTS: Pt[] = (() => {
  const segments: Pt[][] = [
    [
      { x: 0, y: 294 },
      { x: 60, y: 276 },
      { x: 120, y: 264 },
      { x: 196, y: 264 },
    ],
    [
      { x: 196, y: 264 },
      { x: 262, y: 264 },
      { x: 300, y: 276 },
      { x: 340, y: 272 },
    ],
    [
      { x: 340, y: 272 },
      { x: 366, y: 270 },
      { x: 386, y: 262 },
      { x: 400, y: 258 },
    ],
  ];
  const points: Pt[] = [];
  for (const [a, b, c, d] of segments)
    for (let step = 0; step <= 24; step += 1) {
      const t = step / 24;
      const u = 1 - t;
      points.push({
        x:
          u * u * u * a.x +
          3 * u * u * t * b.x +
          3 * u * t * t * c.x +
          t * t * t * d.x,
        y:
          u * u * u * a.y +
          3 * u * u * t * b.y +
          3 * u * t * t * c.y +
          t * t * t * d.y,
      });
    }
  return points;
})();

/** The height of the hill's edge at `x`, in sky units. */
export function hillY(x: number): number {
  for (let index = 1; index < HILL_POINTS.length; index += 1) {
    const a = HILL_POINTS[index - 1];
    const b = HILL_POINTS[index];
    if (x <= b.x)
      return a.y + ((b.y - a.y) * (x - a.x)) / Math.max(0.001, b.x - a.x);
  }
  return HILL_POINTS[HILL_POINTS.length - 1].y;
}

export function normalize(x: number, y: number): Pt {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

/** An SVG path through the points (empty for fewer than two). */
export function pathOf(points: readonly Pt[]): string {
  if (points.length < 2) return '';
  return `M${points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L')}`;
}

/**
 * The nearest star ahead of the first origin that has one in direction
 * `dir`, widening the cone; failing that, the star most in line with the
 * swipe. Excluded stars are skipped unless nothing else is left.
 */
export function pickTarget(
  stars: readonly Star[],
  origins: readonly Pt[],
  dir: Pt,
  exclude: ReadonlySet<string>,
): { star: Star; from: Pt } {
  const pool = stars.filter((star) => !exclude.has(star.entry.key));
  const candidates = pool.length > 0 ? pool : stars;
  for (const from of origins) {
    for (const cone of [0.82, 0.5]) {
      let best: Star | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const star of candidates) {
        const vx = star.x - from.x;
        const vy = star.y - from.y;
        const distance = Math.hypot(vx, vy);
        if (distance < 4) continue;
        const cos = (vx * dir.x + vy * dir.y) / distance;
        if (cos < cone) continue;
        const score = distance * (1 + (1 - cos) * 3);
        if (score < bestScore) {
          best = star;
          bestScore = score;
        }
      }
      if (best) return { star: best, from };
    }
  }
  const from = origins[0];
  let best = candidates[0];
  let bestCos = Number.NEGATIVE_INFINITY;
  for (const star of candidates) {
    const v = normalize(star.x - from.x, star.y - from.y);
    const cos = v.x * dir.x + v.y * dir.y;
    if (cos > bestCos) {
      best = star;
      bestCos = cos;
    }
  }
  return { star: best, from };
}

/** The star a traced thread hooks onto at `at`, if any is close enough. */
export const TRACE_RADIUS = 22;

export function starNear(
  stars: readonly Star[],
  at: Pt,
  chain: readonly Star[],
): Star | undefined {
  return stars.find(
    (star) =>
      !chain.some((link) => link.entry.key === star.entry.key) &&
      Math.hypot(star.x - at.x, star.y - at.y) <= TRACE_RADIUS,
  );
}

/* ---------- The telescope ---------- */

/** The telescope's pivot on the tripod, and where it rests at first. */
export const SCOPE: Pt = { x: 240, y: 244 };
export const SCOPE_REST_DEG = -36;
/** Distance from the pivot to the lens at the front of the tube. */
const SCOPE_LENS = 15.6;
/** Radius of the telescope's field of view on the sky. */
export const FIELD_R = 36;

/** The telescope only points into the sky. */
export function clampAim(deg: number): number {
  return Math.min(-8, Math.max(-172, deg));
}

export function angleTo(point: Pt): number {
  return clampAim(
    (Math.atan2(point.y - SCOPE.y, point.x - SCOPE.x) * 180) / Math.PI,
  );
}

export function lensAt(deg: number): Pt {
  const rad = (deg * Math.PI) / 180;
  return {
    x: SCOPE.x + SCOPE_LENS * Math.cos(rad),
    y: SCOPE.y + SCOPE_LENS * Math.sin(rad),
  };
}

/** Where the field of view lies: `reach` along the tube, kept on the chart. */
export function fieldAt(deg: number, reach: number): Pt {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  let distance = Math.min(280, Math.max(70, reach));
  if (cos > 0.01) distance = Math.min(distance, (SKY_W - 40 - SCOPE.x) / cos);
  if (cos < -0.01) distance = Math.min(distance, (SCOPE.x - 40) / -cos);
  if (sin < -0.01) distance = Math.min(distance, (SCOPE.y - 50) / -sin);
  return { x: SCOPE.x + distance * cos, y: SCOPE.y + distance * sin };
}

/** The star nearest the field's centre (or, failing that, most in line). */
export function starInField(
  stars: readonly Star[],
  deg: number,
  reach: number,
): Star {
  const centre = fieldAt(deg, reach);
  let best = stars[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const star of stars) {
    const distance = Math.hypot(star.x - centre.x, star.y - centre.y);
    const score =
      distance <= FIELD_R * 1.8
        ? distance
        : 1000 + Math.abs(angleTo(star) - deg);
    if (score < bestScore) {
      best = star;
      bestScore = score;
    }
  }
  return best;
}

/** The keys of the stars inside the field of view centred on `centre`. */
export function starsInField(stars: readonly Star[], centre: Pt): Set<string> {
  return new Set(
    stars
      .filter(
        (star) => Math.hypot(star.x - centre.x, star.y - centre.y) <= FIELD_R,
      )
      .map((star) => star.entry.key),
  );
}

/* ---------- The live sky ---------- */

/** The palettes the sky blends through (colours: `ConstellationWorld.css`). */
export type SkyPalette = 'night' | 'predawn' | 'day' | 'dusk';

/** The roles every palette defines (`--memory-stars-<palette>-<role>`). */
export const SKY_ROLES = [
  'top',
  'mid',
  'low',
  'horizon',
  'glow',
  'dust',
  'fade',
  'milk',
  'star',
] as const;

/** The palette at each hour; the sky blends smoothly between neighbours. */
const SKY_TABLE: readonly { at: number; palette: SkyPalette }[] = [
  { at: 0, palette: 'night' },
  { at: 4.5, palette: 'night' },
  { at: 6, palette: 'predawn' },
  { at: 7.5, palette: 'day' },
  { at: 16.5, palette: 'day' },
  { at: 18.5, palette: 'dusk' },
  { at: 20.5, palette: 'night' },
  { at: 24, palette: 'night' },
];

/** Which two palettes the sky blends at this hour, and by how much (0..1). */
export function skyAt(hours: number): {
  from: SkyPalette;
  to: SkyPalette;
  blend: number;
} {
  let index = 1;
  while (index < SKY_TABLE.length - 1 && SKY_TABLE[index].at <= hours)
    index += 1;
  const a = SKY_TABLE[index - 1];
  const b = SKY_TABLE[index];
  const raw = Math.min(1, Math.max(0, (hours - a.at) / (b.at - a.at)));
  return {
    from: a.palette,
    to: b.palette,
    blend: Math.round(raw * raw * (3 - 2 * raw) * 10000) / 10000,
  };
}

/**
 * The pencil notes sit low in the sky. In the light day sky a blue-black
 * pencil reads better there than the cream one: from 06:43 to 17:27, where
 * the blended light palettes make the blue-black ink win on contrast (the
 * dark theme's sky never gets that light, so its pencil stays cream).
 */
const PENCIL_INK_FROM = 6 + 43 / 60;
const PENCIL_INK_UNTIL = 17 + 27 / 60;

export function pencilInk(hours: number): boolean {
  return hours >= PENCIL_INK_FROM - 1e-9 && hours < PENCIL_INK_UNTIL - 1e-9;
}

/** 0 at 18:00, 1 at 06:00, and back to 0 by 18:00 (a gentle swing). */
export function nightArc(hours: number): number {
  const since = (hours - 18 + 24) % 24;
  return since <= 12 ? since / 12 : 1 - (since - 12) / 12;
}

/** The star field turns around a pole above the chart, ±12° over the night. */
export const POLE: Pt = { x: 200, y: 0 };
const SKY_TURN_DEG = 12;

/** How far the star field has turned at this hour, in degrees. */
export function skyTurn(hours: number): number {
  return (
    Math.round((-SKY_TURN_DEG + 2 * SKY_TURN_DEG * nightArc(hours)) * 100) / 100
  );
}

export function rotateAbout(point: Pt, deg: number): Pt {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = point.x - POLE.x;
  const dy = point.y - POLE.y;
  return { x: POLE.x + dx * cos - dy * sin, y: POLE.y + dx * sin + dy * cos };
}

const SYNODIC_DAYS = 29.530588853;
/** A known new moon: 6 January 2000, 18:14 UTC. */
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
export const MOON_R = 15;

/** 0 new moon, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
export function moonPhase(date: Date): number {
  const days = (date.getTime() - KNOWN_NEW_MOON) / 86400000;
  return (((days / SYNODIC_DAYS) % 1) + 1) % 1;
}

/** The lit part of the moon around (0, 0); waxing is lit on the right. */
export function moonLitPath(phase: number, r: number = MOON_R): string {
  const k = Math.cos(2 * Math.PI * phase);
  const rx = (Math.abs(k) * r).toFixed(2);
  if (phase < 0.5)
    return `M0 ${-r}A${r} ${r} 0 0 1 0 ${r}A${rx} ${r} 0 0 ${k > 0 ? 0 : 1} 0 ${-r}Z`;
  return `M0 ${-r}A${r} ${r} 0 0 0 0 ${r}A${rx} ${r} 0 0 ${k > 0 ? 1 : 0} 0 ${-r}Z`;
}

/** The moon wanders across the top of the chart through the night. */
export function moonAt(arc: number): Pt {
  return { x: 70 + 260 * arc, y: 60 - 12 * Math.sin(Math.PI * arc) };
}

/** The moon's sleepy face sits on its lit part and grows with it. */
export function moonFace(phase: number): { x: number; scale: number } {
  const lit = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const side = phase < 0.5 ? 1 : -1;
  return {
    x: side * MOON_R * (1 - lit) * 0.9,
    scale: 0.45 + 0.55 * Math.sqrt(lit),
  };
}

/** August (Perseids) and December (Geminids) bring shooting star showers. */
export function isShowerMonth(month: number): boolean {
  return month === 7 || month === 11;
}

/** December to February: frost on the hill and a little snow. */
export function isWinterMonth(month: number): boolean {
  return month === 11 || month <= 1;
}

/** Shooting stars cross the sky on their own only outside the bright day. */
export function ambientShootingStarsAt(hour: number): boolean {
  return hour < 8 || hour >= 17;
}

/* ---------- Growth ---------- */

/** Remembers which memories have already been stars on this device. */
export const SEEN_STARS_KEY = 'eimir.memoryWorlds.stars.seen';
const SEEN_STARS_LIMIT = 600;

export function readSeenStars(): Set<string> | null {
  try {
    const raw = window.localStorage.getItem(SEEN_STARS_KEY);
    if (!raw) return null;
    const list: unknown = JSON.parse(raw);
    return Array.isArray(list)
      ? new Set(list.filter((key): key is string => typeof key === 'string'))
      : null;
  } catch {
    return null;
  }
}

export function writeSeenStars(keys: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(
      SEEN_STARS_KEY,
      JSON.stringify([...keys].slice(-SEEN_STARS_LIMIT)),
    );
  } catch {
    // Storage unavailable: newborn stars just are not remembered.
  }
}

/**
 * The newborn stars (memories that were not stars on the last visit) and
 * when each lights up: the constellation line draws on linearly after
 * `delayMs` over `drawMs`, and a newborn star lights when the line reaches
 * it. Nothing is newborn on the very first visit.
 */
export function birthDelays(
  stars: readonly Star[],
  seenBefore: ReadonlySet<string> | null,
  delayMs: number,
  drawMs: number,
): Map<string, number> {
  const births = new Map<string, number>();
  if (!seenBefore || stars.length < 2) return births;
  const lengths = stars.map((star, index) =>
    index === 0
      ? 0
      : Math.hypot(star.x - stars[index - 1].x, star.y - stars[index - 1].y),
  );
  const totalLength = lengths.reduce((sum, length) => sum + length, 0) || 1;
  let run = 0;
  stars.forEach((star, index) => {
    run += lengths[index];
    if (!seenBefore.has(star.entry.key))
      births.set(
        star.entry.key,
        Math.round(delayMs + (drawMs * run) / totalLength),
      );
  });
  return births;
}
