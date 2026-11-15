import { connectionTier, partnerConnectionStyle } from './partnerConnection';
import { DISTANCE_FRESH_MS } from './partnerDistance';

const now = new Date('2026-11-15T18:00:00Z');
const cologne = { latitude: 50.94, longitude: 6.96 };
const hamburg = { latitude: 53.55, longitude: 10 };
const duesseldorf = { latitude: 51.23, longitude: 6.78 };
const nextDoor = { latitude: 50.95, longitude: 6.97 };
const partnerArea = {
  ...hamburg,
  capturedAt: new Date(now.getTime() - 20 * 60_000),
};

describe('connectionTier', () => {
  it('follows the server band', () => {
    expect(connectionTier({ kind: 'NEARBY' }, hamburg, cologne)).toBe('near');
    expect(
      connectionTier({ kind: 'RANGE', minKm: 25, maxKm: 50 }, hamburg, cologne),
    ).toBe('regional');
    expect(
      connectionTier(
        { kind: 'APPROXIMATE', approximateKm: 50 },
        nextDoor,
        cologne,
      ),
    ).toBe('far');
  });

  it('falls back to the shown points with the band limits', () => {
    expect(connectionTier(undefined, nextDoor, cologne)).toBe('near');
    expect(connectionTier(null, duesseldorf, cologne)).toBe('regional');
    expect(connectionTier(undefined, hamburg, cologne)).toBe('far');
  });
});

describe('partnerConnectionStyle', () => {
  const both = {
    partnerArea,
    ownPosition: cologne,
    ownSharingActive: true,
    band: { kind: 'APPROXIMATE' as const, approximateKm: 350 },
    now,
  };

  it('connects only while both currently share', () => {
    expect(partnerConnectionStyle(both)).toEqual({
      tier: 'far',
      earlier: false,
    });
    // The partner shares no map area (nothing or distance only).
    expect(partnerConnectionStyle({ ...both, partnerArea: null })).toBeNull();
    // The viewer does not share: one-way stays without a connection.
    expect(
      partnerConnectionStyle({ ...both, ownSharingActive: false }),
    ).toBeNull();
    // The viewer's own position is unknown on this device.
    expect(partnerConnectionStyle({ ...both, ownPosition: null })).toBeNull();
  });

  it('marks an earlier snapshot as muted', () => {
    const old = new Date(now.getTime() - DISTANCE_FRESH_MS - 60_000);
    expect(
      partnerConnectionStyle({
        ...both,
        partnerArea: { ...hamburg, capturedAt: old },
      }),
    ).toEqual({ tier: 'far', earlier: true });
    expect(
      partnerConnectionStyle({
        ...both,
        partnerArea: { ...hamburg, capturedAt: null },
      })?.earlier,
    ).toBe(true);
  });
});
