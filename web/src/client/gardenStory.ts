/**
 * The couple's story in the shared garden (#1907 H3 follow-up).
 *
 * Pure derivations only, so both partners see the same garden without any
 * new storage:
 * - Milestones grow as special plants in a calm memory corner. The couple's
 *   Milestones are read through the existing authorized Story path; this
 *   module only maps each one to a garden piece and a place.
 * - Visitors leave small finds. Which find comes on which shared day follows
 *   the couple's space id as a seed and the server's shared-day count.
 * - Rare visitors (owl, fox, ducklings) come only at special times of the
 *   local clock and the couple's season, on days chosen from the space id.
 * - "Euer Gartenjahr" replays the garden as a short timelapse.
 *
 * Nothing here counts, ranks or shows how far away the next thing is
 * (Product Owner 2026-11-16, #866: no counters, bars or numbers).
 */

import type { GardenForm } from '../api/generated/models/GardenForm';
import type { GardenUnlock } from '../api/generated/models/GardenUnlock';
import { seededRandom } from './garden';
import { FORMS, stableChance } from './gardenGrowth';
import { type GardenSeason, gardenSeason } from './gardenPresentation';
import type { MilestoneRef } from './storyWaymarks';

const DAY_MS = 86_400_000;

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/* Milestones as plants -------------------------------------------------------- */

/** The special pieces a Milestone can grow into, all in the garden's style. */
export const MEMORY_PIECES = [
  'heartBush',
  'youngTree',
  'lanternFlower',
  'steppingStones',
  'roseTrellis',
  'memoryStone',
] as const;

export type MemoryPiece = (typeof MEMORY_PIECES)[number];

/** At most this many Milestones stand in the memory corner at once. */
export const MEMORY_CORNER_MAX = 6;

export interface MemoryPlant {
  id: string;
  title: string;
  happenedOn: Date;
  piece: MemoryPiece;
}

export interface PlacedMemoryPlant extends MemoryPlant {
  x: number;
  y: number;
}

function byDayThenId(
  left: { happenedOn: Date; id: string },
  right: { happenedOn: Date; id: string },
) {
  return (
    utcDay(left.happenedOn) - utcDay(right.happenedOn) ||
    (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  );
}

/**
 * Every Milestone that has already happened, oldest first, with its piece.
 * The piece follows a stable hash of the Milestone id (the model has no type
 * or category); a Milestone never repeats a piece of the five before it, so
 * the corner's pieces differ. The choice depends only on the Milestone and
 * its predecessors, so it stays the same on both devices and over time.
 */
export function memoryPlants(
  milestones: ReadonlyArray<MilestoneRef>,
  localDate: Date,
): MemoryPlant[] {
  const today = utcDay(localDate);
  const past = milestones
    .filter(
      (milestone) =>
        Number.isFinite(milestone.happenedOn.getTime()) &&
        utcDay(milestone.happenedOn) <= today,
    )
    .slice()
    .sort(byDayThenId);
  const result: MemoryPlant[] = [];
  for (const milestone of past) {
    const recent = new Set(
      result.slice(-(MEMORY_PIECES.length - 1)).map((plant) => plant.piece),
    );
    let index = Math.floor(
      stableChance(`milestone:${milestone.id}`) * MEMORY_PIECES.length,
    );
    while (recent.has(MEMORY_PIECES[index]))
      index = (index + 1) % MEMORY_PIECES.length;
    result.push({
      id: milestone.id,
      title: milestone.title,
      happenedOn: milestone.happenedOn,
      piece: MEMORY_PIECES[index],
    });
  }
  return result;
}

/**
 * The memory corner: a calm strip at the front edge of the meadow, left of
 * the pond, between the stems of the planting lane. Nothing that unlocks
 * stands there, so it never collides with the pond, path, bench, tree or
 * arch. The most recent Milestones stand there, oldest on the left.
 */
const CORNER_X = [33, 52, 71, 90, 109, 128] as const;
const CORNER_Y = 205;

export function memoryCorner(
  plants: ReadonlyArray<MemoryPlant>,
): PlacedMemoryPlant[] {
  return plants.slice(-MEMORY_CORNER_MAX).map((plant, index) => ({
    ...plant,
    x: CORNER_X[index],
    y: CORNER_Y + (index % 2) * 2,
  }));
}

/* Finds ----------------------------------------------------------------------- */

/** Small things visitors leave behind; the book lists only those found. */
export const KEEPSAKES = [
  'feather',
  'hazelnut',
  'snailShell',
  'shinyPebble',
  'clover',
  'acorn',
  'pineCone',
  'heartLeaf',
] as const;

export type Keepsake = (typeof KEEPSAKES)[number];

/** Shared days on which the next find has been left, in finding order. */
export const KEEPSAKE_DAYS = [2, 5, 9, 14, 20, 28, 38, 50] as const;

function seedOf(text: string): number {
  return Math.floor(stableChance(text) * 2 ** 31);
}

/** The order in which this couple finds things; seeded by the space id. */
export function keepsakeOrder(spaceId: string): Keepsake[] {
  const random = seededRandom(seedOf(`keepsakes:${spaceId}`));
  const order: Keepsake[] = [...KEEPSAKES];
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  return order;
}

/** Finds the couple already has, in the order they were found. */
export function foundKeepsakes(
  spaceId: string,
  sharedDays: number,
): Keepsake[] {
  const order = keepsakeOrder(spaceId);
  return order.filter((_, index) => sharedDays >= KEEPSAKE_DAYS[index]);
}

/**
 * The find a visitor leaves on the next tap: the latest one this device has
 * not shown yet. Older unseen finds simply wait in the book.
 */
export function keepsakeToReveal(
  found: ReadonlyArray<Keepsake>,
  seen: ReadonlySet<Keepsake>,
): Keepsake | null {
  const latest = found.at(-1);
  return latest && !seen.has(latest) ? latest : null;
}

/* Rare visitors --------------------------------------------------------------- */

export const RARE_VISITORS = ['owl', 'fox', 'ducklings'] as const;

export type RareVisitor = (typeof RARE_VISITORS)[number];

/** Rare visitors come on about every other day of their season or hour. */
const RARE_DAY_CHANCE = 0.5;

function dayKey(localDate: Date): string {
  return new Date(utcDay(localDate)).toISOString().slice(0, 10);
}

/** Whether this couple's garden is chosen for a rare visitor on this day. */
export function rareDay(
  visitor: RareVisitor,
  spaceId: string,
  localDate: Date,
): boolean {
  return (
    stableChance(`rare:${visitor}:${spaceId}:${dayKey(localDate)}`) <
    RARE_DAY_CHANCE
  );
}

/** The hours (device clock) in which each rare visitor may come. */
export function rareHour(visitor: RareVisitor, hour: number): boolean {
  switch (visitor) {
    case 'owl':
      // Evening and night, on the couple's tree.
      return hour >= 19 || hour < 5;
    case 'fox':
      // Early morning and dusk at the meadow edge.
      return (hour >= 7 && hour < 10) || (hour >= 15 && hour < 19);
    case 'ducklings':
      return hour >= 8 && hour < 18;
  }
  return false;
}

/** Which rare visitors are in the garden right now; usually none. */
export function rareVisitors({
  spaceId,
  localDate,
  hour,
  unlocks,
}: {
  spaceId: string;
  localDate: Date;
  hour: number;
  unlocks: ReadonlyArray<GardenUnlock>;
}): RareVisitor[] {
  const season = gardenSeason(localDate);
  return RARE_VISITORS.filter((visitor) => {
    const place =
      visitor === 'owl'
        ? unlocks.includes('TREE')
        : visitor === 'fox'
          ? season === 'winter'
          : season === 'spring' && unlocks.includes('POND');
    return (
      place && rareHour(visitor, hour) && rareDay(visitor, spaceId, localDate)
    );
  });
}

/* "Euer Gartenjahr" ------------------------------------------------------------ */

/** About 13 seconds from the first seed to today. */
export const PLAYBACK_MS = 13_000;
const START = 0.06;
const SPAN = 0.8;
const GROW = 0.14;

const SEASONS: ReadonlyArray<GardenSeason> = [
  'spring',
  'summer',
  'autumn',
  'winter',
];

/** The unlock with which each later form of the garden visibly arrives. */
const FORM_SIGNATURE: Partial<Record<GardenForm, GardenUnlock>> = {
  MEADOW: 'POND',
  GARDEN: 'TREE',
  PARADISE: 'ROSE_ARCH',
};

export interface PlaybackPlantInput {
  id: string;
  sentOn: Date;
  stage: number;
}

export interface PlaybackTimeline {
  plants: Array<{ id: string; at: number; stage: number }>;
  unlocks: Array<{ unlock: GardenUnlock; at: number }>;
  forms: Array<{ form: GardenForm; at: number }>;
  /** Real seasons when the garden is about a year old, else one symbolic year (spring to winter); today at the end. */
  seasonAt: (t: number) => GardenSeason;
}

export interface PlaybackFrame {
  /** Plants already planted at this moment, with the stage they show. */
  stages: Map<string, number>;
  unlocks: GardenUnlock[];
  form: GardenForm;
  season: GardenSeason;
  /** True on the last frame, which is the garden of today. */
  today: boolean;
}

/**
 * The replay of the garden: plantings in the order of their planted dates,
 * each growing to the stage it has today; the couple's unlocks and forms in
 * their server order; the seasons from spring to winter, ending on today.
 */
export function playbackTimeline({
  plants,
  unlocks,
  form,
  localDate,
}: {
  plants: ReadonlyArray<PlaybackPlantInput>;
  unlocks: ReadonlyArray<GardenUnlock>;
  form: GardenForm;
  localDate: Date;
}): PlaybackTimeline {
  const ordered = plants
    .slice()
    .sort(
      (left, right) =>
        utcDay(left.sentOn) - utcDay(right.sentOn) ||
        (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    );
  const count = ordered.length;
  const timedPlants = ordered.map((plant, index) => ({
    id: plant.id,
    at: count ? START + (SPAN * index) / count : START,
    stage: plant.stage,
  }));
  const timedUnlocks = unlocks.map((unlock, index) => ({
    unlock,
    at: START + (SPAN * (index + 1)) / (unlocks.length + 1),
  }));
  const reached = FORMS.slice(0, FORMS.indexOf(form) + 1);
  const timedForms = reached.map((entry, index) => {
    const signature = FORM_SIGNATURE[entry];
    const arrival = timedUnlocks.find((item) => item.unlock === signature);
    return {
      form: entry,
      at:
        index === 0
          ? 0
          : (arrival?.at ?? START + (SPAN * index) / reached.length),
    };
  });
  const first = ordered[0]?.sentOn ?? localDate;
  const span = utcDay(localDate) - utcDay(first);
  const today = SEASONS.indexOf(gardenSeason(localDate));
  const seasonAt = (t: number): GardenSeason => {
    if (t >= 1) return SEASONS[today];
    if (span >= 300 * DAY_MS)
      return gardenSeason(new Date(utcDay(first) + Math.max(0, t) * span));
    // One symbolic year: spring, summer, autumn, winter, then today.
    return SEASONS[Math.min(3, Math.max(0, Math.floor(t * 4)))];
  };
  return {
    plants: timedPlants,
    unlocks: timedUnlocks,
    forms: timedForms,
    seasonAt,
  };
}

/** The garden at a moment `t` of the replay (0 = before the first seed, 1 = today). */
export function playbackFrame(
  timeline: PlaybackTimeline,
  t: number,
): PlaybackFrame {
  const time = Math.min(1, Math.max(0, t));
  const stages = new Map<string, number>();
  for (const plant of timeline.plants) {
    if (time < plant.at) continue;
    const grown =
      time >= 1
        ? plant.stage
        : Math.min(
            plant.stage,
            Math.floor(((time - plant.at) / GROW) * (plant.stage + 1)),
          );
    stages.set(plant.id, Math.max(0, grown));
  }
  const unlocks = timeline.unlocks
    .filter((item) => time >= 1 || time >= item.at)
    .map((item) => item.unlock);
  const forms = timeline.forms.filter((item) => time >= 1 || time >= item.at);
  return {
    stages,
    unlocks,
    form: forms.at(-1)?.form ?? 'BED',
    season: timeline.seasonAt(time),
    today: time >= 1,
  };
}

/** The first frame worth showing: the first seed in the ground. */
export function playbackStart(timeline: PlaybackTimeline): number {
  return timeline.plants[0]?.at ?? 0;
}
