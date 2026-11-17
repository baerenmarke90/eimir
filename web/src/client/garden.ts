/**
 * Pure rules and geometry of the shared garden (#1907 H3, concept A).
 *
 * The server owns seeds, stages and slots. This module only decides how the
 * garden is drawn and which messenger carries a seed. The messenger and the
 * offer of `liebe Worte` follow the existing server distance band on the
 * reading device; nothing about distance is ever sent or stored.
 */

import type { GardenSpecies } from '../api/generated/models/GardenSpecies';
import type { GardenWords } from '../api/generated/models/GardenWords';
import type { PartnerDistanceLine } from './partnerDistance';

export const GARDEN_WORDS = [
  'THINKING_OF_YOU',
  'MISS_YOU',
  'LOOKING_FORWARD',
  'GOOD_NIGHT',
  'FOR_YOU',
] as const satisfies readonly GardenWords[];

export type GardenMessenger = 'ladybug' | 'bee' | 'bird' | 'balloon';

export interface GardenFlight {
  messenger: GardenMessenger;
  /** The band to name on the arc; `null` when distance is not shared. */
  band: Extract<PartnerDistanceLine, { kind: 'distance' }>['band'] | null;
  /**
   * Product Owner 2026-11-16: `liebe Worte` are offered only when the couple
   * is further apart ("Kurze Fahrt" and more) or distance is not shared.
   */
  wordsOffered: boolean;
  /** Multiplies the flight duration; longer distance, longer flight. */
  durationScale: number;
  /** Arc height as a share of the stage height (0..1). */
  arcHeight: number;
}

export function gardenQueryKey(accountId: string, spaceId: string) {
  return ['games', 'garden', accountId, spaceId] as const;
}

/** The messenger and the words offer follow the band only. */
export function gardenFlight(line?: PartnerDistanceLine): GardenFlight {
  if (!line || line.kind !== 'distance') {
    return {
      messenger: 'bird',
      band: null,
      wordsOffered: true,
      durationScale: 1.2,
      arcHeight: 0.5,
    };
  }
  const { band } = line;
  let messenger: GardenMessenger;
  let wordsOffered: boolean;
  let durationScale: number;
  if (band.kind === 'NEARBY') {
    messenger = 'ladybug';
    wordsOffered = false;
    durationScale = 0.7;
  } else if (band.kind === 'RANGE') {
    const max = band.maxKm ?? 50;
    messenger = max <= 10 ? 'ladybug' : 'bee';
    wordsOffered = max > 25;
    durationScale = max <= 10 ? 0.8 : max <= 25 ? 0.95 : 1.1;
  } else {
    const km = band.approximateKm ?? band.maxKm ?? band.minKm ?? 100;
    messenger = km < 500 ? 'bird' : 'balloon';
    wordsOffered = true;
    durationScale = km < 500 ? 1.4 : 1.8;
  }
  return {
    messenger,
    band,
    wordsOffered,
    durationScale,
    arcHeight: Number(Math.min(0.85, 0.2 + durationScale * 0.3).toFixed(2)),
  };
}

/* Geometry ------------------------------------------------------------------ */

export const GARDEN_HEIGHT = 210;
export const GARDEN_MIN_WIDTH = 340;
const SLOT_START = 24;
const SLOT_STEP = 19;

/** The back hill line and the front meadow line the grass stands on. */
export const groundBack = (x: number) =>
  146 - 13 * Math.sin(((x + 30) / 340) * Math.PI);
export const groundFront = (x: number) =>
  170 - 8 * Math.sin(((x + 90) / 340) * Math.PI * 1.3);

/**
 * Places where the pond and the rose arch appear once the couple's shared days
 * unlock them (#1907 H3, PR 3). Plants never stand there, from the first day
 * on, so nothing has to move when something new appears.
 */
const RESERVED: ReadonlyArray<{ x: number; half: number }> = [
  { x: 250, half: 48 },
  { x: 600, half: 24 },
];

function isReserved(x: number): boolean {
  return RESERVED.some((zone) => Math.abs(x - zone.x) < zone.half);
}

/** Where a planted slot stands; alternate places sit a little further front. */
export function slotPosition(slot: number): { x: number; y: number } {
  let place = 0;
  let free = -1;
  let x = SLOT_START;
  for (;;) {
    x = SLOT_START + place * SLOT_STEP;
    if (!isReserved(x)) free += 1;
    if (free === slot) break;
    place += 1;
  }
  return { x, y: groundFront(x) + 9 + (place % 2) * 7 };
}

/** The garden widens (and pans) once the slots no longer fit its width. */
export function gardenWidth(
  highestSlot: number,
  minWidth: number = GARDEN_MIN_WIDTH,
): number {
  const needed = slotPosition(highestSlot).x + SLOT_STEP + SLOT_START;
  return Math.max(minWidth, Math.ceil(needed / 10) * 10);
}

export const STAGE_HEIGHT_SHARE = [0, 0.36, 0.72, 1] as const;
export const PLANT_HEIGHT = 44;

/* Deterministic randomness for grass, stars and particles ------------------- */

export function seededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/* Organic outlines ----------------------------------------------------------- */

/** A smooth closed outline through points (Catmull-Rom as cubic Béziers). */
export function smoothClosed(points: ReadonlyArray<[number, number]>): string {
  const n = points.length;
  let d = `M${r1(points[0][0])} ${r1(points[0][1])}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    d += ` C${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return `${d}Z`;
}

/** A soft scalloped blob for crowns, clouds of colour, ponds and centres. */
export function blob(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  bumps: number,
  amplitude: number,
  phase = 0,
): string {
  const points: Array<[number, number]> = [];
  const n = bumps * 2;
  for (let k = 0; k < n; k += 1) {
    const angle = (k / n) * Math.PI * 2 + phase;
    const radius = k % 2 ? 1 - amplitude : 1;
    points.push([
      cx + Math.cos(angle) * rx * radius,
      cy + Math.sin(angle) * ry * radius,
    ]);
  }
  return smoothClosed(points);
}

/** A teardrop petal from the flower centre outwards (before rotation). */
export function petalPath(length: number, width: number): string {
  return `M0 0 C${r1(width)} ${r1(-length * 0.22)} ${r1(width * 0.95)} ${r1(-length * 0.8)} 0 ${r1(-length)} C${r1(-width * 0.95)} ${r1(-length * 0.8)} ${r1(-width)} ${r1(-length * 0.22)} 0 0Z`;
}

/** A filled outline polygon along a ground function, closed to the bottom. */
export function groundPath(ground: (x: number) => number, width: number) {
  let d = `M0 ${r1(ground(0))}`;
  for (let x = 10; x <= width; x += 10) d += ` L${x} ${r1(ground(x))}`;
  return `${d} V${GARDEN_HEIGHT} H0Z`;
}

export interface GrassTuft {
  x: number;
  blades: string[];
}

/** Grass tufts along a ground line; each tuft sways from its root. */
export function grassTufts(
  ground: (x: number) => number,
  {
    count,
    seed,
    minHeight,
    maxHeight,
    width,
  }: {
    count: number;
    seed: number;
    minHeight: number;
    maxHeight: number;
    width: number;
  },
): GrassTuft[] {
  const random = seededRandom(seed);
  const tufts: GrassTuft[] = [];
  for (let k = 0; k < count; k += 1) {
    const x = (k + random() * 0.8) * (width / count);
    const y = ground(x) + random() * 4;
    const blades: string[] = [];
    const bladeCount = 3 + Math.floor(random() * 3);
    for (let b = 0; b < bladeCount; b += 1) {
      const bx = x + (b - bladeCount / 2) * 2.2;
      const h = minHeight + random() * (maxHeight - minHeight);
      const lean = (random() - 0.45) * 9;
      blades.push(
        `M${r1(bx - 1.6)} ${r1(y)} Q${r1(bx + lean * 0.25)} ${r1(y - h * 0.6)} ${r1(bx + lean)} ${r1(y - h)} Q${r1(bx + lean * 0.2 + 0.6)} ${r1(y - h * 0.5)} ${r1(bx + 1.6)} ${r1(y)}Z`,
      );
    }
    tufts.push({ x, blades });
  }
  return tufts;
}

/** Plant stages that changed between two server states, for one-shot growth. */
export function stageChanges(
  before: ReadonlyArray<{ id: string; stage: number }> | undefined,
  after: ReadonlyArray<{ id: string; stage: number }>,
): Map<string, number> {
  const changes = new Map<string, number>();
  if (!before) return changes;
  const previous = new Map(before.map((plant) => [plant.id, plant.stage]));
  for (const plant of after) {
    const old = previous.get(plant.id);
    if (old === undefined) changes.set(plant.id, -1);
    else if (old < plant.stage) changes.set(plant.id, old);
  }
  return changes;
}

export const SPECIES_ORDER = [
  'POPPY',
  'BELLFLOWER',
  'STARFLOWER',
] as const satisfies readonly GardenSpecies[];
