import { describe, expect, it } from 'vitest';
import { demoDistanceInputs, demoOwnPosition } from './demoLocation';

const LEA = { latitude: 50.9375, longitude: 6.9603 };
const ALEX = { latitude: 51.2277, longitude: 6.7735 };

describe('Demo example positions', () => {
  it('reads a granted permission and a valid example fix without a device', async () => {
    expect(await demoDistanceInputs.permission()).toBe('granted');
    const fix = await demoDistanceInputs.measure();
    expect(Math.abs(fix.latitude)).toBeLessThanOrEqual(90);
    expect(Math.abs(fix.longitude)).toBeLessThanOrEqual(180);
    expect(Date.now() - fix.capturedAt.getTime()).toBeLessThan(5_000);
  });

  it("puts the viewer on the other persona's example position", () => {
    // The partner's area is the partner's example position (grid-snapped).
    expect(demoOwnPosition({ latitude: 51.23, longitude: 6.77 })).toMatchObject(
      LEA,
    );
    expect(demoOwnPosition({ latitude: 50.94, longitude: 6.96 })).toMatchObject(
      ALEX,
    );
  });

  it('has no own position while the partner area is unknown', () => {
    expect(demoOwnPosition(null)).toBeNull();
    expect(demoOwnPosition(undefined)).toBeNull();
    expect(demoOwnPosition({ latitude: null, longitude: 6.9 })).toBeNull();
  });
});
