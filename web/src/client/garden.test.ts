import { describe, expect, it } from 'vitest';
import {
  GARDEN_MIN_WIDTH,
  gardenFlight,
  gardenWidth,
  slotPosition,
  stageChanges,
} from './garden';

const distance = (band: Parameters<typeof gardenFlight>[0] & object) => band;

describe('garden flight', () => {
  it('chooses the messenger and the words offer from the band only', () => {
    const at = new Date();
    const line = (band: {
      kind: 'NEARBY' | 'RANGE' | 'APPROXIMATE';
      minKm?: number;
      maxKm?: number;
      approximateKm?: number;
    }) => distance({ kind: 'distance', band, asOf: at, mapAvailable: false });
    expect(gardenFlight(line({ kind: 'NEARBY' }))).toMatchObject({
      messenger: 'ladybug',
      wordsOffered: false,
    });
    expect(
      gardenFlight(line({ kind: 'RANGE', minKm: 5, maxKm: 10 })),
    ).toMatchObject({
      messenger: 'ladybug',
      wordsOffered: false,
    });
    expect(
      gardenFlight(line({ kind: 'RANGE', minKm: 10, maxKm: 25 })),
    ).toMatchObject({
      messenger: 'bee',
      wordsOffered: false,
    });
    expect(
      gardenFlight(line({ kind: 'RANGE', minKm: 25, maxKm: 50 })),
    ).toMatchObject({
      messenger: 'bee',
      wordsOffered: true,
    });
    expect(
      gardenFlight(line({ kind: 'APPROXIMATE', approximateKm: 350 })),
    ).toMatchObject({
      messenger: 'bird',
      wordsOffered: true,
    });
    expect(
      gardenFlight(line({ kind: 'APPROXIMATE', approximateKm: 1200 })),
    ).toMatchObject({
      messenger: 'balloon',
      wordsOffered: true,
    });
  });

  it('stays neutral without a shared distance', () => {
    for (const hidden of [
      undefined,
      { kind: 'hidden' as const },
      { kind: 'sharing' as const },
    ]) {
      expect(gardenFlight(hidden)).toMatchObject({
        messenger: 'bird',
        band: null,
        wordsOffered: true,
      });
    }
  });

  it('flies longer and higher the further apart the couple is', () => {
    const at = new Date();
    const near = gardenFlight({
      kind: 'distance',
      band: { kind: 'NEARBY' },
      asOf: at,
      mapAvailable: false,
    });
    const far = gardenFlight({
      kind: 'distance',
      band: { kind: 'APPROXIMATE', approximateKm: 1200 },
      asOf: at,
      mapAvailable: false,
    });
    expect(far.durationScale).toBeGreaterThan(near.durationScale);
    expect(far.arcHeight).toBeGreaterThan(near.arcHeight);
  });
});

describe('garden geometry', () => {
  it('keeps the base width until the slots need more room', () => {
    expect(gardenWidth(0)).toBe(GARDEN_MIN_WIDTH);
    expect(gardenWidth(9)).toBe(GARDEN_MIN_WIDTH);
    expect(gardenWidth(9, 520)).toBe(520);
    expect(gardenWidth(30)).toBeGreaterThan(GARDEN_MIN_WIDTH);
    expect(slotPosition(1).y).toBeGreaterThan(slotPosition(0).y - 8);
  });

  it('reports growth since the previous state for one-shot motion', () => {
    const changes = stageChanges(
      [
        { id: 'a', stage: 1 },
        { id: 'b', stage: 3 },
      ],
      [
        { id: 'a', stage: 2 },
        { id: 'b', stage: 3 },
        { id: 'c', stage: 0 },
      ],
    );
    expect([...changes]).toEqual([
      ['a', 1],
      ['c', -1],
    ]);
    expect(stageChanges(undefined, [{ id: 'a', stage: 1 }]).size).toBe(0);
  });
});
