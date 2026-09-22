import { describe, expect, it, vi } from 'vitest';
import type { DailyCheckInsApi } from '../api/generated/apis/DailyCheckInsApi';
import type { DailyCheckInTodayView } from '../api/generated/models/DailyCheckInTodayView';
import {
  DAILY_CHECK_IN_REFRESH_INTERVAL_MS,
  dailyCheckInTodayQueryKey,
  dailyCheckInTodayQueryOptions,
  loadDailyCheckInToday,
  updateDailyCheckInToday,
} from './dailyCheckIn';

function projection(energyLevel: number | null): DailyCheckInTodayView {
  return {
    checkedOn: new Date('2026-09-21T00:00:00.000Z'),
    dailyContextTimezone: 'Europe/Berlin',
    own: { energyLevel, vibe: null, vibeNote: null, version: energyLevel === null ? 0 : 1 },
    energy: {
      visibilityMode: 'MUTUAL_REVEAL',
      partner: { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' },
    },
    vibe: null,
  };
}

function rawResponse(value: DailyCheckInTodayView, etag?: string) {
  return {
    raw: new Response(null, {
      status: 200,
      headers: etag ? { ETag: etag } : undefined,
    }),
    value: async () => value,
  };
}

describe('DailyCheckIn web query contract', () => {
  it('isolates the privacy-bounded projection by account and Space', () => {
    expect(dailyCheckInTodayQueryKey('account-1', 'space-1')).toEqual([
      'daily-check-in',
      'today',
      'account-1',
      'space-1',
    ]);
    expect(dailyCheckInTodayQueryKey('account-2', 'space-1')).not.toEqual(
      dailyCheckInTodayQueryKey('account-1', 'space-1'),
    );
    expect(dailyCheckInTodayQueryKey('account-1', 'space-2')).not.toEqual(
      dailyCheckInTodayQueryKey('account-1', 'space-1'),
    );
  });

  it('keeps an active Today surface converged with partner Daily Check-in changes', () => {
    const api = {} as DailyCheckInsApi;
    const options = dailyCheckInTodayQueryOptions(api, 'account-1', 'space-1');

    expect(options.refetchInterval).toBe(DAILY_CHECK_IN_REFRESH_INTERVAL_MS);
    expect(options.refetchInterval).toBe(5_000);
    expect(options.refetchIntervalInBackground).toBe(false);
    expect(options.refetchOnWindowFocus).toBe('always');
    expect(options.refetchOnReconnect).toBe('always');
  });

  it('preserves the exact ETag and sends it unchanged as If-Match', async () => {
    const getDailyCheckInTodayRaw = vi
      .fn()
      .mockResolvedValue(rawResponse(projection(null), '"2026-09-21:absent"'));
    const updateDailyCheckInTodayRaw = vi
      .fn()
      .mockResolvedValue(
        rawResponse(projection(60), '"2026-09-21:check-in-1:1"'),
      );
    const api = {
      getDailyCheckInTodayRaw,
      updateDailyCheckInTodayRaw,
    } as unknown as DailyCheckInsApi;

    const current = await loadDailyCheckInToday(api, 'space-1');
    expect(current.etag).toBe('"2026-09-21:absent"');

    const updated = await updateDailyCheckInToday(
      api,
      'space-1',
      current.etag,
      { energyLevel: 60 },
    );

    expect(updateDailyCheckInTodayRaw).toHaveBeenCalledWith({
      spaceId: 'space-1',
      ifMatch: '"2026-09-21:absent"',
      dailyCheckInUpdate: { energyLevel: 60 },
    });
    expect(updated.etag).toBe('"2026-09-21:check-in-1:1"');
    expect(updated.projection.own.energyLevel).toBe(60);
  });

  it('fails closed when a DailyCheckIn response omits its validator', async () => {
    const api = {
      getDailyCheckInTodayRaw: vi
        .fn()
        .mockResolvedValue(rawResponse(projection(null))),
    } as unknown as DailyCheckInsApi;

    await expect(loadDailyCheckInToday(api, 'space-1')).rejects.toMatchObject({
      code: 'DAILY_CHECK_IN_ETAG_MISSING',
      kind: 'server',
    });
  });
});
