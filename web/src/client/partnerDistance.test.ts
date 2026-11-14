import type { ApproximatePosition } from './approximateLocation';
import {
  DISTANCE_FRESH_MS,
  distanceUnitFor,
  formatDistanceBand,
  isDistanceFresh,
  readPartnerDistanceLine,
} from './partnerDistance';

const position: ApproximatePosition = {
  latitude: 50.94,
  longitude: 6.96,
  accuracyMeters: 1500,
  capturedAt: new Date('2026-11-13T09:30:00Z'),
};

function fakeApi({
  distance = {
    available: true,
    band: { kind: 'APPROXIMATE' as const, approximateKm: 340 },
    asOf: new Date('2026-11-13T09:40:00Z'),
  },
  map = {
    available: true,
    latitude: 53.55,
    longitude: 10,
    radiusMeters: 1500,
    capturedAt: new Date('2026-11-13T09:40:00Z'),
  },
}: {
  distance?: Record<string, unknown>;
  map?: Record<string, unknown>;
} = {}) {
  return {
    getPartnerDistance: vi.fn(async () => distance as never),
    getPartnerLocationMap: vi.fn(async () => map as never),
  };
}

describe('readPartnerDistanceLine', () => {
  it('sends the own position only in the body and keeps only the band', async () => {
    const api = fakeApi();
    const line = await readPartnerDistanceLine({
      api,
      spaceId: 'space-1',
      ownSharingActive: false,
      permission: async () => 'granted',
      measure: async () => position,
    });
    expect(api.getPartnerDistance).toHaveBeenCalledWith({
      spaceId: 'space-1',
      presencePosition: {
        latitude: 50.94,
        longitude: 6.96,
        capturedAt: position.capturedAt,
      },
    });
    expect(line).toEqual({
      kind: 'distance',
      band: { kind: 'APPROXIMATE', approximateKm: 340 },
      asOf: new Date('2026-11-13T09:40:00Z'),
      mapAvailable: true,
    });
    // Neither the viewer's nor the partner's coordinates leave the read.
    expect(JSON.stringify(line)).not.toMatch(/50\.94|6\.96|53\.55|latitude/);
  });

  it('never measures, and so never prompts, without a granted permission', async () => {
    const api = fakeApi({ map: { available: false } });
    const measure = vi.fn(async () => position);
    const line = await readPartnerDistanceLine({
      api,
      spaceId: 'space-1',
      ownSharingActive: false,
      permission: async () => 'prompt',
      measure,
    });
    expect(measure).not.toHaveBeenCalled();
    expect(api.getPartnerDistance).not.toHaveBeenCalled();
    expect(line).toEqual({ kind: 'hidden' });
  });

  it('shows the viewer-only hint when the own position is missing and it matters', async () => {
    const failing = vi.fn(async (): Promise<ApproximatePosition> => {
      throw new Error('LOCATION_UNAVAILABLE');
    });
    await expect(
      readPartnerDistanceLine({
        api: fakeApi({ map: { available: false } }),
        spaceId: 'space-1',
        ownSharingActive: true,
        permission: async () => 'granted',
        measure: failing,
      }),
    ).resolves.toEqual({ kind: 'ownMissing' });
    await expect(
      readPartnerDistanceLine({
        api: fakeApi(),
        spaceId: 'space-1',
        ownSharingActive: false,
        permission: async () => 'denied',
      }),
    ).resolves.toEqual({ kind: 'ownMissing' });
  });

  it('stays hidden without a reason when nobody shares', async () => {
    const api = fakeApi({ distance: { available: false } });
    await expect(
      readPartnerDistanceLine({
        api,
        spaceId: 'space-1',
        ownSharingActive: false,
        permission: async () => 'granted',
        measure: async () => position,
      }),
    ).resolves.toEqual({ kind: 'hidden' });
    expect(api.getPartnerLocationMap).not.toHaveBeenCalled();
  });

  it('shows the sharer a status chip when only they share', async () => {
    const api = fakeApi({ distance: { available: false } });
    const line = await readPartnerDistanceLine({
      api,
      spaceId: 'space-1',
      ownSharingActive: true,
      permission: async () => 'granted',
      measure: async () => position,
    });
    expect(line).toEqual({ kind: 'sharing' });
    // Nothing about the partner's position is read for the status chip.
    expect(api.getPartnerLocationMap).not.toHaveBeenCalled();
  });

  it('is no map link when the partner shares only the distance', async () => {
    const line = await readPartnerDistanceLine({
      api: fakeApi({ map: { available: false } }),
      spaceId: 'space-1',
      ownSharingActive: false,
      permission: async () => 'granted',
      measure: async () => position,
    });
    expect(line).toMatchObject({ kind: 'distance', mapAvailable: false });
  });
});

describe('formatDistanceBand', () => {
  it('formats kilometre bands without a finer value than the server band', () => {
    expect(formatDistanceBand({ kind: 'NEARBY' }, 'de', 'kilometer')).toBe(
      null,
    );
    expect(
      formatDistanceBand(
        { kind: 'RANGE', minKm: 5, maxKm: 10 },
        'de',
        'kilometer',
      ),
    ).toBe('5–10 km');
    expect(
      formatDistanceBand(
        { kind: 'APPROXIMATE', approximateKm: 1200 },
        'de',
        'kilometer',
      ),
    ).toBe('1.200 km');
  });

  it('keeps converted miles as coarse as the kilometre band', () => {
    expect(
      formatDistanceBand(
        { kind: 'APPROXIMATE', approximateKm: 340 },
        'en',
        'mile',
      ),
    ).toBe('210 mi');
    expect(
      formatDistanceBand(
        { kind: 'APPROXIMATE', approximateKm: 800 },
        'en',
        'mile',
      ),
    ).toBe('500 mi');
    expect(
      formatDistanceBand({ kind: 'RANGE', minKm: 2, maxKm: 5 }, 'en', 'mile'),
    ).toBe('1–3 mi');
  });
});

describe('distanceUnitFor', () => {
  it('uses miles only for English US/UK devices', () => {
    expect(distanceUnitFor('en', ['en-US'])).toBe('mile');
    expect(distanceUnitFor('en', ['de-DE', 'en-GB'])).toBe('mile');
    expect(distanceUnitFor('en', ['en-IE'])).toBe('kilometer');
    expect(distanceUnitFor('de', ['en-US'])).toBe('kilometer');
  });
});

describe('freshness and preference key', () => {
  it('treats values older than two hours as an earlier state', () => {
    const now = new Date('2026-11-13T12:00:00Z');
    expect(
      isDistanceFresh(new Date(now.getTime() - DISTANCE_FRESH_MS), now),
    ).toBe(true);
    expect(
      isDistanceFresh(new Date(now.getTime() - DISTANCE_FRESH_MS - 1), now),
    ).toBe(false);
  });
});
