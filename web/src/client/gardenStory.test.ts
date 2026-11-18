import { describe, expect, it } from 'vitest';
import { slotPosition } from './garden';
import { ARCH_X, POND } from './gardenGrowth';
import {
  foundKeepsakes,
  KEEPSAKE_DAYS,
  KEEPSAKES,
  keepsakeOrder,
  keepsakeToReveal,
  MEMORY_CORNER_MAX,
  MEMORY_PIECES,
  memoryCorner,
  memoryPlants,
  playbackFrame,
  playbackStart,
  playbackTimeline,
  rareDay,
  rareHour,
  rareVisitors,
} from './gardenStory';

const TODAY = new Date('2026-11-16T00:00:00Z');
const SPACE = '22222222-2222-4222-8222-222222222222';

const milestone = (index: number, on: string) => ({
  id: `milestone-${index}`,
  title: `Milestone ${index}`,
  happenedOn: new Date(`${on}T00:00:00Z`),
});

describe('milestone plants', () => {
  const milestones = [
    milestone(3, '2025-09-01'),
    milestone(1, '2023-06-17'),
    milestone(2, '2024-05-12'),
    milestone(9, '2027-01-01'),
  ];

  it('grows only Milestones that already happened, oldest first', () => {
    const plants = memoryPlants(milestones, TODAY);
    expect(plants.map((plant) => plant.id)).toEqual([
      'milestone-1',
      'milestone-2',
      'milestone-3',
    ]);
    for (const plant of plants) expect(MEMORY_PIECES).toContain(plant.piece);
  });

  it('maps each Milestone to the same piece on every device and read', () => {
    const first = memoryPlants(milestones, TODAY);
    const shuffled = memoryPlants([...milestones].reverse(), TODAY);
    expect(shuffled).toEqual(first);
    // A later Milestone never changes the pieces of earlier ones.
    const more = memoryPlants(
      [...milestones, milestone(4, '2026-02-02')],
      TODAY,
    );
    expect(more.slice(0, 3)).toEqual(first);
  });

  it('never repeats a piece within the corner', () => {
    const many = Array.from({ length: 14 }, (_, index) =>
      milestone(index, `2020-01-${String(index + 1).padStart(2, '0')}`),
    );
    const plants = memoryPlants(many, TODAY);
    for (
      let index = 0;
      index + MEMORY_CORNER_MAX <= plants.length;
      index += 1
    ) {
      const window = plants.slice(index, index + MEMORY_CORNER_MAX);
      expect(new Set(window.map((plant) => plant.piece)).size).toBe(
        MEMORY_CORNER_MAX,
      );
    }
  });

  it('places at most six of the most recent in a calm lane', () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      milestone(index, `2021-0${index + 1}-01`),
    );
    const corner = memoryCorner(memoryPlants(many, TODAY));
    expect(corner).toHaveLength(MEMORY_CORNER_MAX);
    expect(corner[0].id).toBe('milestone-3');
    expect(corner.at(-1)?.id).toBe('milestone-8');
    for (const plant of corner) {
      // Left of the pond and far from the rose arch, at the front edge.
      expect(plant.x).toBeLessThan(POND.cx - POND.rx - 8);
      expect(Math.abs(plant.x - ARCH_X)).toBeGreaterThan(100);
      expect(plant.y).toBeGreaterThan(slotPosition(0).y + 8);
    }
  });

  it('leaves the garden unchanged without Milestones', () => {
    expect(memoryCorner(memoryPlants([], TODAY))).toEqual([]);
  });
});

describe('finds', () => {
  it('finds the same things in the same order for both partners', () => {
    const order = keepsakeOrder(SPACE);
    expect([...order].sort()).toEqual([...KEEPSAKES].sort());
    expect(keepsakeOrder(SPACE)).toEqual(order);
    expect(keepsakeOrder('another-space')).not.toEqual(order);
  });

  it('has found a thing from its shared day on, never earlier', () => {
    const order = keepsakeOrder(SPACE);
    expect(foundKeepsakes(SPACE, 0)).toEqual([]);
    expect(foundKeepsakes(SPACE, KEEPSAKE_DAYS[0] - 1)).toEqual([]);
    expect(foundKeepsakes(SPACE, KEEPSAKE_DAYS[0])).toEqual([order[0]]);
    expect(foundKeepsakes(SPACE, 30)).toEqual(order.slice(0, 6));
    expect(foundKeepsakes(SPACE, 500)).toEqual(order);
  });

  it('reveals only the latest find this device has not shown yet', () => {
    const found = foundKeepsakes(SPACE, 10);
    expect(keepsakeToReveal(found, new Set())).toBe(found.at(-1));
    expect(keepsakeToReveal(found, new Set(found))).toBeNull();
    expect(keepsakeToReveal([], new Set())).toBeNull();
  });
});

describe('rare visitors', () => {
  const evening = (visitor: 'owl' | 'fox' | 'ducklings', from: string) =>
    Array.from({ length: 30 }, (_, index) => {
      const date = new Date(from);
      date.setUTCDate(date.getUTCDate() + index);
      return date;
    }).find((date) => rareDay(visitor, SPACE, date)) as Date;

  it('keeps each visitor to its hours', () => {
    expect(rareHour('owl', 21)).toBe(true);
    expect(rareHour('owl', 3)).toBe(true);
    expect(rareHour('owl', 12)).toBe(false);
    expect(rareHour('fox', 8)).toBe(true);
    expect(rareHour('fox', 17)).toBe(true);
    expect(rareHour('fox', 12)).toBe(false);
    expect(rareHour('ducklings', 10)).toBe(true);
    expect(rareHour('ducklings', 20)).toBe(false);
  });

  it('brings the owl only to the tree in the evening on chosen days', () => {
    const day = evening('owl', '2026-11-16T00:00:00Z');
    const base = { spaceId: SPACE, localDate: day, unlocks: ['TREE' as const] };
    expect(rareVisitors({ ...base, hour: 21 })).toEqual(['owl']);
    expect(rareVisitors({ ...base, hour: 12 })).toEqual([]);
    expect(rareVisitors({ ...base, unlocks: [], hour: 21 })).toEqual([]);
  });

  it('brings the fox only in winter and the ducklings only in a spring pond', () => {
    const winter = evening('fox', '2027-01-05T00:00:00Z');
    expect(
      rareVisitors({ spaceId: SPACE, localDate: winter, hour: 8, unlocks: [] }),
    ).toEqual(['fox']);
    const autumnFox = evening('fox', '2026-10-01T00:00:00Z');
    expect(
      rareVisitors({
        spaceId: SPACE,
        localDate: autumnFox,
        hour: 8,
        unlocks: [],
      }),
    ).toEqual([]);
    const spring = evening('ducklings', '2027-04-02T00:00:00Z');
    expect(
      rareVisitors({
        spaceId: SPACE,
        localDate: spring,
        hour: 10,
        unlocks: ['POND'],
      }),
    ).toEqual(['ducklings']);
    expect(
      rareVisitors({
        spaceId: SPACE,
        localDate: spring,
        hour: 10,
        unlocks: [],
      }),
    ).toEqual([]);
  });

  it('comes on about every other day, the same for both partners', () => {
    const days = Array.from({ length: 200 }, (_, index) => {
      const date = new Date('2026-01-01T00:00:00Z');
      date.setUTCDate(date.getUTCDate() + index);
      return rareDay('owl', SPACE, date);
    });
    const share = days.filter(Boolean).length / days.length;
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.7);
    expect(rareDay('owl', SPACE, TODAY)).toBe(rareDay('owl', SPACE, TODAY));
  });
});

describe('garden-year replay', () => {
  const plants = [
    { id: 'c', sentOn: new Date('2026-11-02T00:00:00Z'), stage: 3 },
    { id: 'a', sentOn: new Date('2026-10-01T00:00:00Z'), stage: 3 },
    { id: 'b', sentOn: new Date('2026-10-01T00:00:00Z'), stage: 1 },
  ];
  const timeline = playbackTimeline({
    plants,
    unlocks: ['PATH', 'POND', 'SUNFLOWER', 'TREE'],
    form: 'GARDEN',
    localDate: TODAY,
  });

  it('replays plantings in the order of their planted dates', () => {
    expect(timeline.plants.map((plant) => plant.id)).toEqual(['a', 'b', 'c']);
    const times = timeline.plants.map((plant) => plant.at);
    expect([...times].sort((x, y) => x - y)).toEqual(times);
    const start = playbackFrame(timeline, playbackStart(timeline));
    expect([...start.stages.keys()]).toEqual(['a']);
    expect(start.stages.get('a')).toBe(0);
  });

  it('grows each plant monotonically to its stage of today', () => {
    let previous = new Map<string, number>();
    for (let step = 0; step <= 100; step += 1) {
      const frame = playbackFrame(timeline, step / 100);
      for (const [id, stage] of previous)
        expect(frame.stages.get(id)).toBeGreaterThanOrEqual(stage);
      previous = frame.stages;
    }
    const end = playbackFrame(timeline, 1);
    expect(Object.fromEntries(end.stages)).toEqual({ a: 3, b: 1, c: 3 });
  });

  it('reveals unlocks and forms in order and ends on today', () => {
    const forms: string[] = [];
    const seasons: string[] = [];
    let unlocks = 0;
    for (let step = 0; step <= 100; step += 1) {
      const frame = playbackFrame(timeline, step / 100);
      expect(frame.unlocks.length).toBeGreaterThanOrEqual(unlocks);
      unlocks = frame.unlocks.length;
      if (forms.at(-1) !== frame.form) forms.push(frame.form);
      if (seasons.at(-1) !== frame.season) seasons.push(frame.season);
    }
    expect(forms).toEqual(['BED', 'MEADOW', 'GARDEN']);
    expect(seasons).toEqual(['spring', 'summer', 'autumn', 'winter', 'autumn']);
    const end = playbackFrame(timeline, 1);
    expect(end.today).toBe(true);
    expect(end.unlocks).toEqual(['PATH', 'POND', 'SUNFLOWER', 'TREE']);
    expect(end.form).toBe('GARDEN');
    // The meadow arrives together with the pond.
    const pond = timeline.unlocks.find((item) => item.unlock === 'POND');
    expect(timeline.forms.find((item) => item.form === 'MEADOW')?.at).toBe(
      pond?.at,
    );
  });

  it('follows the real seasons for a garden of about a year', () => {
    const old = playbackTimeline({
      plants: [{ id: 'x', sentOn: new Date('2025-11-20T00:00:00Z'), stage: 3 }],
      unlocks: [],
      form: 'BED',
      localDate: TODAY,
    });
    expect(playbackFrame(old, 0).season).toBe('autumn');
    expect(playbackFrame(old, 0.4).season).toBe('spring');
    expect(playbackFrame(old, 1).season).toBe('autumn');
  });
});
