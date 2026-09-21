import type { DailyCheckInsApi } from '../api/generated/apis/DailyCheckInsApi';
import type { DailyCheckInTodayView } from '../api/generated/models/DailyCheckInTodayView';
import type { DailyCheckInUpdate } from '../api/generated/models/DailyCheckInUpdate';
import type { ApiResponse } from '../api/generated/runtime';
import { ClientProblemError, normalizeClientError } from './problemDetails';

export interface DailyCheckInSnapshot {
  projection: DailyCheckInTodayView;
  etag: string;
}

export function dailyCheckInTodayQueryKey(
  accountId: string,
  spaceId: string,
): readonly ['daily-check-in', 'today', string, string] {
  // The response contains caller-owned state plus a privacy-bounded partner
  // projection. Account and Space therefore both belong to the cache identity.
  return ['daily-check-in', 'today', accountId, spaceId] as const;
}

async function snapshotFromResponse(
  response: ApiResponse<DailyCheckInTodayView>,
): Promise<DailyCheckInSnapshot> {
  const projection = await response.value();
  const etag = response.raw.headers.get('ETag');
  if (!etag) {
    throw new ClientProblemError('server', 500, 'DAILY_CHECK_IN_ETAG_MISSING');
  }
  return { projection, etag };
}

export async function loadDailyCheckInToday(
  api: DailyCheckInsApi,
  spaceId: string,
  signal?: AbortSignal,
): Promise<DailyCheckInSnapshot> {
  try {
    return await snapshotFromResponse(
      await api.getDailyCheckInTodayRaw(
        { spaceId },
        signal ? { signal } : undefined,
      ),
    );
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export async function updateDailyCheckInToday(
  api: DailyCheckInsApi,
  spaceId: string,
  ifMatch: string,
  update: DailyCheckInUpdate,
): Promise<DailyCheckInSnapshot> {
  try {
    return await snapshotFromResponse(
      await api.updateDailyCheckInTodayRaw({
        spaceId,
        ifMatch,
        dailyCheckInUpdate: update,
      }),
    );
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export function dailyCheckInTodayQueryOptions(
  api: DailyCheckInsApi | null | undefined,
  accountId: string,
  spaceId: string,
) {
  return {
    queryKey: dailyCheckInTodayQueryKey(accountId, spaceId),
    queryFn: ({ signal }: { signal: AbortSignal }) => {
      if (!api) {
        throw new ClientProblemError('unknown');
      }
      return loadDailyCheckInToday(api, spaceId, signal);
    },
    enabled: Boolean(api && accountId && spaceId),
    retry: false,
    staleTime: 0,
    // Current partner DailyCheckIn is deliberately ephemeral. Once the active
    // consumer disappears (module/Space/account switch), do not retain it in a
    // detached React Query cache.
    gcTime: 0,
    refetchOnMount: 'always' as const,
    refetchOnWindowFocus: 'always' as const,
    refetchOnReconnect: 'always' as const,
  };
}
