import type { DailyCheckInsApi } from '../api/generated/apis/DailyCheckInsApi';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { DailyCheckInInsightsView } from '../api/generated/models/DailyCheckInInsightsView';
import { isoToDate, type IsoDate } from './dailyInsightsModel';
import { ClientProblemError, normalizeClientError } from './problemDetails';

/** Stable Pro capability owned by the server entitlement model (#1163). */
export const DAILY_INSIGHTS_CAPABILITY = 'daily.insights' as const;
export const PREMIUM_ENTITLEMENT_REQUIRED = 'PREMIUM_ENTITLEMENT_REQUIRED';
export const DAILY_CHECK_IN_CONTEXT_UNAVAILABLE =
  'DAILY_CHECK_IN_CONTEXT_UNAVAILABLE';

export function dailyInsightsEntitlementQueryKey(
  accountId: string,
  spaceId: string,
): readonly ['daily-insights', 'entitlement', string, string] {
  return ['daily-insights', 'entitlement', accountId, spaceId] as const;
}

/**
 * The insights response carries the caller's own values plus a
 * privacy-bounded partner projection, so account and Space both belong to the
 * cache identity and nothing is retained once the consumer unmounts.
 */
export function dailyInsightsQueryKey(
  accountId: string,
  spaceId: string,
  range: { start: IsoDate; end: IsoDate } | null,
): readonly ['daily-insights', 'range', string, string, string, string] {
  return [
    'daily-insights',
    'range',
    accountId,
    spaceId,
    range?.start ?? 'current',
    range?.end ?? 'current',
  ] as const;
}

/** True when the server-published capability set includes `daily.insights`. */
export async function loadDailyInsightsCapability(
  api: EntitlementsApi,
  spaceId: string,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const entitlement =
      await api.getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet(
        { spaceId },
        signal ? { signal } : undefined,
      );
    return entitlement.capabilities.includes(DAILY_INSIGHTS_CAPABILITY);
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export async function loadDailyInsights(
  api: DailyCheckInsApi,
  spaceId: string,
  range: { start: IsoDate; end: IsoDate } | null,
  signal?: AbortSignal,
): Promise<DailyCheckInInsightsView> {
  try {
    return await api.getDailyCheckInInsights(
      {
        spaceId,
        ...(range
          ? { startDate: isoToDate(range.start), endDate: isoToDate(range.end) }
          : {}),
      },
      signal ? { signal } : undefined,
    );
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

/** The server denied the Pro read; the Space no longer (or not yet) has Pro. */
export function isInsightsEntitlementRequired(error: unknown): boolean {
  return (
    error instanceof ClientProblemError &&
    error.kind === 'permission' &&
    error.code === PREMIUM_ENTITLEMENT_REQUIRED
  );
}

/** The Space has no authoritative Daily Check-in time zone (yet). */
export function isInsightsContextUnavailable(error: unknown): boolean {
  return (
    error instanceof ClientProblemError &&
    error.code === DAILY_CHECK_IN_CONTEXT_UNAVAILABLE
  );
}
