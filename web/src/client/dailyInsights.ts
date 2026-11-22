import type { DailyCheckInsApi } from '../api/generated/apis/DailyCheckInsApi';
import type { DailyCheckInInsightsView } from '../api/generated/models/DailyCheckInInsightsView';
import type { PersonalWeeklyBriefView } from '../api/generated/models/PersonalWeeklyBriefView';
import type { WeeklyBriefView } from '../api/generated/models/WeeklyBriefView';
import { type IsoDate, isoToDate } from './dailyInsightsModel';
import { ClientProblemError, normalizeClientError } from './problemDetails';

/** Stable Pro capability owned by the server entitlement model (#1163). */
export const DAILY_INSIGHTS_CAPABILITY = 'daily.insights' as const;
export const PREMIUM_ENTITLEMENT_REQUIRED = 'PREMIUM_ENTITLEMENT_REQUIRED';
export const DAILY_CHECK_IN_CONTEXT_UNAVAILABLE =
  'DAILY_CHECK_IN_CONTEXT_UNAVAILABLE';

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

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** The weekly brief (#2169) is caller-specific and never outlives its consumer. */
export function weeklyBriefQueryKey(
  accountId: string,
  spaceId: string,
  monday: IsoDate,
): readonly ['daily-insights', 'brief', string, string, string] {
  return ['daily-insights', 'brief', accountId, spaceId, monday] as const;
}

export async function loadWeeklyBrief(
  api: DailyCheckInsApi,
  spaceId: string,
  monday: IsoDate,
  signal?: AbortSignal,
): Promise<WeeklyBriefView> {
  try {
    const brief = await api.getDailyCheckInWeeklyBrief(
      { spaceId, weekStart: isoToDate(monday) },
      signal ? { signal } : undefined,
    );
    // The generated client leaves `date` array items as ISO strings at runtime.
    return {
      ...brief,
      goodDays: brief.goodDays.map(asDate),
      sharedDays: brief.sharedDays.map(asDate),
    };
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

/** The private ("just me") brief (#2197) is the caller's alone. */
export function personalBriefQueryKey(
  accountId: string,
  spaceId: string,
  monday: IsoDate,
): readonly ['daily-insights', 'personal-brief', string, string, string] {
  return [
    'daily-insights',
    'personal-brief',
    accountId,
    spaceId,
    monday,
  ] as const;
}

export async function loadPersonalBrief(
  api: DailyCheckInsApi,
  spaceId: string,
  monday: IsoDate,
  signal?: AbortSignal,
): Promise<PersonalWeeklyBriefView> {
  try {
    const brief = await api.getDailyCheckInPersonalWeeklyBrief(
      { spaceId, weekStart: isoToDate(monday) },
      signal ? { signal } : undefined,
    );
    return {
      ...brief,
      ownDays: brief.ownDays.map(asDate),
      goodDays: brief.goodDays.map(asDate),
      sharedDays: brief.sharedDays.map(asDate),
    };
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
