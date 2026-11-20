import { describe, expect, it } from 'vitest';
import { distanceKm, framingPoints } from './mapFraming';

const cologne = { id: 'cologne', latitude: 50.94, longitude: 6.96 };
const saarland = { id: 'saar', latitude: 49.37, longitude: 7.07 };
const heidelberg = { id: 'heidelberg', latitude: 49.4, longitude: 8.69 };
const sanFrancisco = { id: 'sf', latitude: 37.79, longitude: -122.41 };

describe('framingPoints', () => {
  it('frames the dense home region and leaves one distant trip out', () => {
    const framed = framingPoints([sanFrancisco, cologne, saarland, heidelberg]);
    expect(framed.map((point) => point.id)).toEqual([
      'cologne',
      'saar',
      'heidelberg',
    ]);
  });

  it('frames every place when they are all close together', () => {
    expect(framingPoints([cologne, saarland, heidelberg])).toHaveLength(3);
  });

  it('keeps short lists unchanged, even when far apart', () => {
    expect(framingPoints([cologne, sanFrancisco])).toEqual([
      cologne,
      sanFrancisco,
    ]);
    expect(framingPoints([])).toEqual([]);
  });

  it('measures great-circle distance in kilometres', () => {
    expect(distanceKm(cologne, saarland)).toBeGreaterThan(150);
    expect(distanceKm(cologne, saarland)).toBeLessThan(200);
  });
});
