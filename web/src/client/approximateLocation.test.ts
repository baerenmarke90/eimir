import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApproximateLocationError,
  clearPublicationMemory,
  currentApproximatePosition,
  distanceKm,
  locationPermission,
  MAX_PUBLISH_INTERVAL_MS,
  publishOwnPositionIfDue,
  REUSE_CACHED_FIX_MS,
  shouldPublish,
} from './approximateLocation';
import { isAndroidApp } from './config';

const native = vi.hoisted(() => ({
  available: true,
  checkPermissions: vi.fn(async () => ({ location: 'granted' })),
  requestPermissions: vi.fn(async () => ({ location: 'granted' })),
  current: vi.fn(async (_options: { maxAgeMs: number }) => ({
    latitude: 53.5511,
    longitude: 9.9937,
    accuracyMeters: 1200,
    capturedAt: Date.parse('2026-11-13T10:00:00Z'),
  })),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isPluginAvailable: () => native.available },
  registerPlugin: () => ({
    checkPermissions: native.checkPermissions,
    requestPermissions: native.requestPermissions,
    current: native.current,
  }),
}));

vi.mock('./config', () => ({ isAndroidApp: vi.fn(() => true) }));

const HAMBURG = { latitude: 53.5511, longitude: 9.9937 };
const COLOGNE = { latitude: 50.9375, longitude: 6.9603 };
const NOW = new Date('2026-11-13T10:00:00Z');

function position(at = HAMBURG) {
  return { ...at, accuracyMeters: 1000, capturedAt: NOW };
}

beforeEach(() => {
  vi.mocked(isAndroidApp).mockReturnValue(true);
  native.available = true;
  native.checkPermissions.mockResolvedValue({ location: 'granted' });
  clearPublicationMemory();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('native approximate location', () => {
  it('asks the plugin for a cached fix within the default reuse window', async () => {
    const result = await currentApproximatePosition();
    expect(native.current).toHaveBeenCalledWith({
      maxAgeMs: REUSE_CACHED_FIX_MS,
    });
    expect(result).toEqual({
      latitude: 53.5511,
      longitude: 9.9937,
      accuracyMeters: 1200,
      capturedAt: new Date('2026-11-13T10:00:00Z'),
    });
  });

  it('normalizes native failures', async () => {
    native.current.mockRejectedValueOnce({ code: 'PERMISSION_DENIED' });
    await expect(currentApproximatePosition()).rejects.toEqual(
      new ApproximateLocationError('PERMISSION_DENIED'),
    );
    native.current.mockRejectedValueOnce(new Error('unexpected'));
    await expect(currentApproximatePosition()).rejects.toMatchObject({
      code: 'LOCATION_UNAVAILABLE',
    });
  });

  it('maps the rationale state to an ordinary prompt', async () => {
    native.checkPermissions.mockResolvedValueOnce({
      location: 'prompt-with-rationale',
    });
    expect(await locationPermission()).toBe('prompt');
  });
});

describe('browser approximate location', () => {
  it('never requests high accuracy and reuses a cached fix', async () => {
    vi.mocked(isAndroidApp).mockReturnValue(false);
    const getCurrentPosition = vi.fn(
      (success: PositionCallback, _error: unknown, _options: PositionOptions) =>
        success({
          coords: { latitude: 1, longitude: 2, accuracy: 900 },
          timestamp: NOW.getTime(),
        } as GeolocationPosition),
    );
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });

    const result = await currentApproximatePosition();

    expect(getCurrentPosition.mock.calls[0][2]).toEqual({
      enableHighAccuracy: false,
      maximumAge: REUSE_CACHED_FIX_MS,
      timeout: 20_000,
    });
    expect(result.accuracyMeters).toBe(900);
  });

  it('reports unsupported browsers', async () => {
    vi.mocked(isAndroidApp).mockReturnValue(false);
    vi.stubGlobal('navigator', {});
    expect(await locationPermission()).toBe('unsupported');
    await expect(currentApproximatePosition()).rejects.toMatchObject({
      code: 'UNSUPPORTED',
    });
  });
});

describe('publish rules', () => {
  it('publishes the first fix and after a new consent generation', () => {
    expect(shouldPublish(undefined, position(), 3, NOW)).toBe(true);
    const last = { ...HAMBURG, publishedAt: NOW, generation: 2 };
    expect(shouldPublish(last, position(), 3, NOW)).toBe(true);
  });

  it('skips small movements until the shared value would go stale', () => {
    const last = { ...HAMBURG, publishedAt: NOW, generation: 3 };
    const nearby = { latitude: 53.555, longitude: 9.9937 };
    expect(distanceKm(HAMBURG, nearby)).toBeLessThan(1);
    expect(shouldPublish(last, position(nearby), 3, NOW)).toBe(false);
    const later = new Date(NOW.getTime() + MAX_PUBLISH_INTERVAL_MS);
    expect(shouldPublish(last, position(nearby), 3, later)).toBe(true);
    expect(shouldPublish(last, position(COLOGNE), 3, NOW)).toBe(true);
  });
});

describe('publishOwnPositionIfDue', () => {
  function api(state = 'ACTIVE') {
    return {
      publishPartnerLocationSnapshot: vi.fn(async () => ({
        available: true,
        level: 'DISTANCE' as const,
        state: state as 'ACTIVE',
        indefinite: true,
        expiresAt: null,
        generation: 4,
        lastPublishedAt: NOW,
      })),
    };
  }

  it('sends nothing unless sharing is active and permission is granted', async () => {
    const client = api();
    expect(
      await publishOwnPositionIfDue({
        api: client,
        spaceId: 's',
        accountId: 'a',
        settings: { state: 'OFF', generation: 4 },
        now: NOW,
      }),
    ).toBeNull();
    native.checkPermissions.mockResolvedValueOnce({ location: 'denied' });
    expect(
      await publishOwnPositionIfDue({
        api: client,
        spaceId: 's',
        accountId: 'a',
        settings: { state: 'ACTIVE', generation: 4 },
        now: NOW,
      }),
    ).toBeNull();
    expect(client.publishPartnerLocationSnapshot).not.toHaveBeenCalled();
    expect(native.current).not.toHaveBeenCalled();
  });

  it('publishes once and then waits for movement or staleness', async () => {
    const client = api();
    const request = {
      api: client,
      spaceId: 's',
      accountId: 'a',
      settings: { state: 'ACTIVE' as const, generation: 4 },
      now: NOW,
    };
    expect(await publishOwnPositionIfDue(request)).not.toBeNull();
    expect(client.publishPartnerLocationSnapshot).toHaveBeenCalledWith({
      spaceId: 's',
      presencePublish: {
        latitude: 53.5511,
        longitude: 9.9937,
        accuracyMeters: 1200,
        capturedAt: new Date('2026-11-13T10:00:00Z'),
        consentGeneration: 4,
      },
    });
    expect(await publishOwnPositionIfDue(request)).toBeNull();
    expect(client.publishPartnerLocationSnapshot).toHaveBeenCalledTimes(1);
  });

  it('forgets the publication when the server reports sharing stopped', async () => {
    const client = api('EXPIRED');
    const request = {
      api: client,
      spaceId: 's',
      accountId: 'a',
      settings: { state: 'ACTIVE' as const, generation: 4 },
      now: NOW,
    };
    await publishOwnPositionIfDue(request);
    await publishOwnPositionIfDue(request);
    expect(client.publishPartnerLocationSnapshot).toHaveBeenCalledTimes(2);
  });
});
