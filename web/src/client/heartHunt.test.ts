import { describe, expect, it } from 'vitest';
import {
  arcPoints,
  flightPlan,
  framePoint,
  placeKey,
  warmthKey,
} from './heartHunt';

describe('heart hunt helpers', () => {
  it('maps a pointer to per-mille inside the frame and clamps outside', () => {
    const rect = { left: 10, top: 20, width: 200, height: 250 };
    expect(framePoint(110, 145, rect)).toEqual({ x: 500, y: 500 });
    expect(framePoint(-50, 999, rect)).toEqual({ x: 0, y: 1000 });
  });

  it('names the heart place in nine soft areas, never a coordinate', () => {
    expect(placeKey({ x: 100, y: 100 })).toBe('topLeft');
    expect(placeKey({ x: 500, y: 500 })).toBe('center');
    expect(placeKey({ x: 900, y: 900 })).toBe('bottomRight');
  });

  it('maps the warmth level to its word key and clamps', () => {
    expect(warmthKey(0)).toBe('cold');
    expect(warmthKey(3)).toBe('hot');
    expect(warmthKey(9)).toBe('hot');
    expect(warmthKey(-2)).toBe('cold');
  });

  it('flies the same medium arc without a band, longer for farther bands', () => {
    const none = flightPlan(null);
    const near = flightPlan({ kind: 'NEARBY' });
    const far = flightPlan({ kind: 'APPROXIMATE', approximateKm: 1200 });
    expect(none.height).toBe(40);
    expect(near.height).toBeLessThan(none.height);
    expect(far.height).toBeGreaterThan(none.height);
    expect(far.far).toBe(true);
  });

  it('samples an arc that starts and ends on the avatars and rises between', () => {
    const points = arcPoints({ x: 34, y: 66 }, { x: 306, y: 66 }, 60, 10);
    expect(points).toHaveLength(11);
    expect(points[0]).toEqual({ x: 34, y: 66 });
    expect(points[10]).toEqual({ x: 306, y: 66 });
    expect(Math.min(...points.map((point) => point.y))).toBeLessThan(66);
  });
});
