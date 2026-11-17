import { describe, expect, it } from 'vitest';
import { GARDEN_MIN_WIDTH, slotPosition } from './garden';
import {
  ARCH_X,
  availableAnimals,
  backgroundTrees,
  isBlooming,
  maxVisitors,
  POND,
  pondSlotPosition,
  shownStage,
  stableChance,
  cleanVisitorName,
  unlockedWidth,
  visitorNames,
  withVisitorName,
  wordsArriveByPlane,
} from './gardenGrowth';

const AUTUMN = new Date('2026-11-16T00:00:00Z');
const SPRING = new Date('2027-04-12T00:00:00Z');

describe('garden growth', () => {
  it('widens only with the "more room" unlocks', () => {
    expect(unlockedWidth([])).toBe(GARDEN_MIN_WIDTH);
    expect(unlockedWidth(['PATH', 'POND'])).toBe(GARDEN_MIN_WIDTH);
    expect(unlockedWidth(['MORE_ROOM'])).toBe(520);
    expect(unlockedWidth(['MORE_ROOM', 'EVEN_MORE_ROOM'])).toBe(700);
  });

  it('never plants on the places reserved for the pond and the rose arch', () => {
    for (let slot = 0; slot < 40; slot += 1) {
      const { x } = slotPosition(slot);
      expect(Math.abs(x - POND.cx)).toBeGreaterThanOrEqual(POND.rx + 8);
      expect(Math.abs(x - ARCH_X)).toBeGreaterThanOrEqual(24);
      if (slot > 0) expect(x).toBeGreaterThan(slotPosition(slot - 1).x);
    }
  });

  it('places water lilies inside the pond', () => {
    for (let slot = 0; slot < 6; slot += 1) {
      const { x, y } = pondSlotPosition(slot);
      expect(Math.abs(x - POND.cx)).toBeLessThan(POND.rx);
      expect(Math.abs(y - POND.cy)).toBeLessThan(POND.ry);
    }
  });

  it('lets a tulip rest until spring', () => {
    expect(shownStage('TULIP', 3, AUTUMN)).toBe(1);
    expect(shownStage('TULIP', 0, AUTUMN)).toBe(0);
    expect(shownStage('TULIP', 3, SPRING)).toBe(3);
    expect(shownStage('POPPY', 3, AUTUMN)).toBe(3);
    expect(isBlooming('TULIP', 3, AUTUMN)).toBe(false);
    expect(isBlooming('TULIP', 3, SPRING)).toBe(true);
    expect(isBlooming('SURPRISE', 3, AUTUMN)).toBe(false);
  });

  it('welcomes more visitors as the garden grows', () => {
    expect(availableAnimals(0, [])).toEqual(['snail']);
    expect(availableAnimals(5, ['PATH'])).toEqual(['snail', 'rabbit']);
    expect(availableAnimals(10, ['PATH', 'POND'])).toEqual([
      'snail',
      'rabbit',
      'hedgehog',
      'ducks',
    ]);
    expect(availableAnimals(25, ['POND', 'TREE'])).toContain('squirrel');
    expect(availableAnimals(49, ['POND', 'TREE'])).not.toContain('deer');
    expect(availableAnimals(50, ['POND', 'TREE'])).toContain('deer');
    expect([0, 10, 50].map(maxVisitors)).toEqual([1, 2, 3]);
  });

  it('grows background trees with the shared days', () => {
    expect(backgroundTrees(5, 340)).toEqual([]);
    const young = backgroundTrees(6, 340);
    expect(young).toEqual([{ x: 300, kind: 'round', scale: 0.35 }]);
    const older = backgroundTrees(30, 340);
    expect(older[0].scale).toBe(1);
    // Trees beyond the garden's width wait until there is room.
    expect(backgroundTrees(30, 340).some((tree) => tree.x > 330)).toBe(false);
    expect(backgroundTrees(30, 520).some((tree) => tree.x === 470)).toBe(true);
  });

  it('decides the plane banner per seed, without flicker', () => {
    expect(stableChance('seed-a')).toBe(stableChance('seed-a'));
    expect(stableChance('seed-a')).not.toBe(stableChance('seed-b'));
    const ids = Array.from({ length: 200 }, (_, index) => `seed-${index}`);
    const byPlane = ids.filter(wordsArriveByPlane).length;
    expect(byPlane).toBeGreaterThan(40);
    expect(byPlane).toBeLessThan(120);
  });

  it('maps visitor names by animal and keeps the catalog order', () => {
    expect(visitorNames(undefined)).toEqual({});
    expect(
      visitorNames([
        { animal: 'DUCKS', name: 'Lotte & Otto' },
        { animal: 'SNAIL', name: 'Frieda' },
      ]),
    ).toEqual({ snail: 'Frieda', ducks: 'Lotte & Otto' });
    const named = withVisitorName(
      [{ animal: 'DEER', name: 'Fenja' }],
      'snail',
      'Turbo',
    );
    expect(named).toEqual([
      { animal: 'SNAIL', name: 'Turbo' },
      { animal: 'DEER', name: 'Fenja' },
    ]);
    expect(withVisitorName(named, 'snail', '')).toEqual([
      { animal: 'DEER', name: 'Fenja' },
    ]);
    expect(cleanVisitorName('  Pip   &\tPünktchen ')).toBe('Pip & Pünktchen');
  });
});
