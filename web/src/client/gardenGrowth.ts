/**
 * Growth and life of the shared garden (#1907 H3, concept A, PR 3).
 *
 * The server decides what the couple's shared days have unlocked. This module
 * only places the unlocked things, chooses which visitors may come and how
 * tall a species grows. Nothing here counts or shows how far away the next
 * unlock is (Product Owner 2026-11-16, #866: no counters, bars or numbers).
 */

import type { GardenForm } from '../api/generated/models/GardenForm';
import type { GardenSpecies } from '../api/generated/models/GardenSpecies';
import type { GardenUnlock } from '../api/generated/models/GardenUnlock';
import type { GardenVisitor } from '../api/generated/models/GardenVisitor';
import type { GardenVisitorNameView } from '../api/generated/models/GardenVisitorNameView';
import { GARDEN_MIN_WIDTH } from './garden';
import { gardenSeason } from './gardenPresentation';

/** Fixed places of the unlockable things; plants never stand on them. */
export const POND = { cx: 250, cy: 192, rx: 40, ry: 10 } as const;
export const ARCH_X = 600;
export const TREE_X = 392;
export const BIRDHOUSE_X = 128;
export const POND_ZONE = POND.rx + 8;
export const ARCH_ZONE = 24;

/** The garden widens with the "more room" unlocks; plants may widen it more. */
export function unlockedWidth(unlocks: ReadonlyArray<GardenUnlock>): number {
  if (unlocks.includes('EVEN_MORE_ROOM')) return 700;
  if (unlocks.includes('MORE_ROOM')) return 520;
  return GARDEN_MIN_WIDTH;
}

export function benchX(unlocks: ReadonlyArray<GardenUnlock>): number {
  return unlocks.includes('MORE_ROOM') ? 462 : 312;
}

/** Places in the pond for water lilies, in planting order. */
const POND_PLACES: ReadonlyArray<[number, number]> = [
  [-18, -1],
  [14, 2],
  [-2, -4],
  [28, -3],
  [-30, 1],
  [4, 3],
];

export function pondSlotPosition(slot: number): { x: number; y: number } {
  const [dx, dy] = POND_PLACES[slot % POND_PLACES.length];
  const ring = Math.floor(slot / POND_PLACES.length);
  return { x: POND.cx + dx + ring * 3, y: POND.cy + dy };
}

/** The tulip blooms in spring, from the shared season helper of the garden presentation. */
export function isSpring(localDate: Date): boolean {
  return gardenSeason(localDate) === 'spring';
}

/** A tulip bulb rests (shown as a sprout) outside spring. */
export function shownStage(
  species: GardenSpecies,
  stage: number,
  localDate: Date,
): number {
  if (species === 'TULIP' && !isSpring(localDate)) return Math.min(stage, 1);
  return stage;
}

export function isBlooming(
  species: GardenSpecies,
  stage: number,
  localDate: Date,
): boolean {
  return shownStage(species, stage, localDate) === 3 && species !== 'SURPRISE';
}

/** Full height of a species in scene units; the core flowers are 44. */
export const SPECIES_HEIGHT: Partial<Record<GardenSpecies, number>> = {
  SUNFLOWER: 66,
  TULIP: 34,
  STRAWBERRY: 16,
  MOONFLOWER: 40,
  SURPRISE: 40,
};

/** Every species a couple can discover, in garden-book order. */
export const BOOK_SPECIES = [
  'POPPY',
  'BELLFLOWER',
  'STARFLOWER',
  'SUNFLOWER',
  'TULIP',
  'WATER_LILY',
  'STRAWBERRY',
  'MOONFLOWER',
] as const satisfies readonly GardenSpecies[];

/** Unlocks that are things in the garden (the rest are new seeds). */
export const FINDS = [
  'PATH',
  'POND',
  'BENCH',
  'TREE',
  'MORE_ROOM',
  'BIRDHOUSE',
  'ROSE_ARCH',
  'SWING',
  'STREAM',
  'EVEN_MORE_ROOM',
] as const satisfies readonly GardenUnlock[];

export const SEED_UNLOCKS = [
  'SUNFLOWER',
  'TULIP',
  'WATER_LILY',
  'STRAWBERRY',
] as const satisfies readonly GardenUnlock[];

export function isFind(unlock: GardenUnlock): boolean {
  return (FINDS as readonly GardenUnlock[]).includes(unlock);
}

export const FORMS = [
  'BED',
  'MEADOW',
  'GARDEN',
  'PARADISE',
] as const satisfies readonly GardenForm[];

/* Visitors ------------------------------------------------------------------- */

export type GardenAnimal =
  | 'snail'
  | 'rabbit'
  | 'hedgehog'
  | 'ducks'
  | 'squirrel'
  | 'deer';

export const ANIMALS: ReadonlyArray<GardenAnimal> = [
  'snail',
  'rabbit',
  'hedgehog',
  'ducks',
  'squirrel',
  'deer',
];

export type AnimalLayer = 'back' | 'pond' | 'front';

export const ANIMAL_LAYER: Record<GardenAnimal, AnimalLayer> = {
  snail: 'front',
  rabbit: 'front',
  hedgehog: 'front',
  ducks: 'pond',
  squirrel: 'back',
  deer: 'back',
};

/** Which visitors the garden already knows; more come as it grows. */
export function availableAnimals(
  sharedDays: number,
  unlocks: ReadonlyArray<GardenUnlock>,
): GardenAnimal[] {
  return ANIMALS.filter((animal) => {
    switch (animal) {
      case 'snail':
        return true;
      case 'rabbit':
        return sharedDays >= 5;
      case 'hedgehog':
        return sharedDays >= 10;
      case 'ducks':
        return unlocks.includes('POND');
      case 'squirrel':
        return unlocks.includes('TREE');
      case 'deer':
        return sharedDays >= 50;
    }
    return false;
  });
}

/* Visitor names (#1907 H3 follow-up) ----------------------------------------- */

/** Up to 40 characters after trimming, like the garden name. */
export const VISITOR_NAME_MAX = 40;

/** The server's closed visitor code for each animal. */
export const VISITOR_CODE: Record<GardenAnimal, GardenVisitor> = {
  snail: 'SNAIL',
  rabbit: 'RABBIT',
  hedgehog: 'HEDGEHOG',
  ducks: 'DUCKS',
  squirrel: 'SQUIRREL',
  deer: 'DEER',
};

/** Localized name suggestions per animal (keys below `growth.visitors.suggestions`). */
export const VISITOR_SUGGESTIONS: Record<
  GardenAnimal,
  ReadonlyArray<string>
> = {
  snail: ['a', 'b', 'c', 'd'],
  rabbit: ['a', 'b', 'c', 'd'],
  hedgehog: ['a', 'b', 'c', 'd'],
  ducks: ['a', 'b', 'c'],
  squirrel: ['a', 'b', 'c', 'd'],
  deer: ['a', 'b', 'c', 'd'],
};

/** The couple's shared names by animal; unnamed visitors are absent. */
export function visitorNames(
  names: ReadonlyArray<GardenVisitorNameView> | undefined,
): Partial<Record<GardenAnimal, string>> {
  const byCode = new Map((names ?? []).map((entry) => [entry.animal, entry]));
  const result: Partial<Record<GardenAnimal, string>> = {};
  for (const animal of ANIMALS) {
    const entry = byCode.get(VISITOR_CODE[animal]);
    if (entry) result[animal] = entry.name;
  }
  return result;
}

/** Collapses whitespace the way the server stores a name. */
export function cleanVisitorName(name: string): string {
  return name.split(/\s+/u).filter(Boolean).join(' ');
}

/** The names with one visitor set (or removed when `name` is empty). */
export function withVisitorName(
  names: ReadonlyArray<GardenVisitorNameView> | undefined,
  animal: GardenAnimal,
  name: string,
): GardenVisitorNameView[] {
  const code = VISITOR_CODE[animal];
  const rest = (names ?? []).filter((entry) => entry.animal !== code);
  const next = name ? [...rest, { animal: code, name }] : rest;
  const order = ANIMALS.map((kind) => VISITOR_CODE[kind]);
  return next.sort(
    (left, right) => order.indexOf(left.animal) - order.indexOf(right.animal),
  );
}

/** One to three visitors at a time, depending on how far the garden has grown. */
export function maxVisitors(sharedDays: number): number {
  if (sharedDays >= 50) return 3;
  if (sharedDays >= 10) return 2;
  return 1;
}

/* Background trees ------------------------------------------------------------ */

export interface BackgroundTree {
  x: number;
  kind: 'round' | 'pine';
  /** 0.35 when it appears, growing to 1 with further shared days. */
  scale: number;
}

const TREES: ReadonlyArray<{ x: number; at: number; kind: 'round' | 'pine' }> =
  [
    { x: 300, at: 6, kind: 'round' },
    { x: 64, at: 12, kind: 'pine' },
    { x: 470, at: 26, kind: 'round' },
    { x: 178, at: 32, kind: 'pine' },
    { x: 548, at: 40, kind: 'round' },
    { x: 650, at: 48, kind: 'pine' },
    { x: 22, at: 55, kind: 'round' },
  ];

/** Small trees behind the hill appear over time and keep growing. */
export function backgroundTrees(
  sharedDays: number,
  width: number,
): BackgroundTree[] {
  return TREES.filter(
    (tree) => tree.at <= sharedDays && tree.x < width - 10,
  ).map((tree) => ({
    x: tree.x,
    kind: tree.kind,
    scale:
      Math.round(Math.min(1, 0.35 + (sharedDays - tree.at) / 28) * 100) / 100,
  }));
}

/* Deterministic chance ------------------------------------------------------- */

/** A stable 0..1 value for an id, so a choice never flickers between renders. */
export function stableChance(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

/** `liebe Worte` sometimes arrive by plane banner instead of the folded card. */
export function wordsArriveByPlane(seedId: string): boolean {
  return stableChance(`plane:${seedId}`) < 0.4;
}
