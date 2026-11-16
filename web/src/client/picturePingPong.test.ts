import { describe, expect, it } from 'vitest';
import type { PartnerDistanceLine } from './partnerDistance';
import {
  appendPoint,
  finishStroke,
  flightProfile,
  GRID,
  MAX_POINTS_PER_STROKE,
  strokePath,
  titleSuggestionIndexes,
  toGridPoint,
} from './picturePingPong';

const box = { left: 10, top: 20, width: 200, height: 200 };

function distance(
  band: Extract<PartnerDistanceLine, { kind: 'distance' }>['band'],
): PartnerDistanceLine {
  return { kind: 'distance', band, asOf: new Date(), mapAvailable: false };
}

describe('stroke geometry', () => {
  it('normalizes pointer positions to the 0..1000 grid and clamps', () => {
    expect(toGridPoint(110, 120, box)).toEqual([500, 500]);
    expect(toGridPoint(-50, 9999, box)).toEqual([0, GRID]);
    expect(toGridPoint(1, 1, { ...box, width: 0 })).toEqual([0, 0]);
  });

  it('drops points that barely moved and bounds the stroke length', () => {
    let points = appendPoint([], 100, 100);
    points = appendPoint(points, 101, 101);
    expect(points).toEqual([100, 100]);
    for (let index = 0; index < MAX_POINTS_PER_STROKE + 50; index += 1) {
      points = appendPoint(points, (index * 7) % GRID, (index * 13) % GRID);
    }
    expect(points.length).toBeLessThanOrEqual(MAX_POINTS_PER_STROKE * 2);
  });

  it('turns a tap into a sendable dot and rejects an empty stroke', () => {
    expect(finishStroke([])).toBeNull();
    expect(finishStroke([500, 500])).toEqual([500, 500, 501, 501]);
    expect(finishStroke([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
  });

  it('builds a smooth path through the points', () => {
    expect(strokePath([0, 0])).toBe('');
    expect(strokePath([0, 0, 100, 100])).toBe('M0 0 L100 100');
    expect(strokePath([0, 0, 100, 0, 100, 100])).toContain('Q100 0');
  });
});

describe('title suggestions', () => {
  it('offers three distinct, stable titles per picture', () => {
    const first = titleSuggestionIndexes('picture-a');
    expect(new Set(first).size).toBe(3);
    expect(titleSuggestionIndexes('picture-a')).toEqual(first);
  });
});

describe('distance flight', () => {
  it('is the same unlabelled default flight without a shared distance', () => {
    for (const line of [
      undefined,
      { kind: 'hidden' } as const,
      { kind: 'sharing' } as const,
      { kind: 'ownMissing' } as const,
    ]) {
      expect(flightProfile(line)).toEqual({
        durationScale: 1,
        arcHeight: 0.3,
        label: null,
      });
    }
  });

  it('grows with the server band and names it only for a shared distance', () => {
    const near = flightProfile(distance({ kind: 'NEARBY' }));
    const range = flightProfile(
      distance({ kind: 'RANGE', minKm: 5, maxKm: 10 }),
    );
    const far = flightProfile(
      distance({ kind: 'APPROXIMATE', approximateKm: 1200 }),
    );
    expect(near.durationScale).toBeLessThan(range.durationScale);
    expect(range.durationScale).toBeLessThan(far.durationScale);
    expect(near.arcHeight).toBeLessThan(far.arcHeight);
    expect(far.label).not.toBeNull();
  });
});
