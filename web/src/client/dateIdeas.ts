import { useMemo } from 'react';
import { DateIdeasApi } from '../api/generated/apis/DateIdeasApi';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { DateIdea } from '../api/generated/models/DateIdea';
import { Configuration } from './apiConfiguration';
import { entitlementLoader, useSpaceCapability } from './spaceEntitlement';

/** Space capability for curated date inspiration (#1892). Server-authorized. */
export const DATE_INSPIRATION_CAPABILITY = 'planning.date_inspiration';

export type DurationFilter = 'SHORT' | 'EVENING' | 'LONG';
export type BudgetFilter = 'FREE' | 'LOW' | 'MEDIUM' | 'HIGH';
export type SettingFilterValue = 'HOME' | 'OUT';

/** Single choice per group; groups combine with AND. Catalog keys only. */
export interface DateIdeasFilterState {
  category?: string;
  duration?: DurationFilter;
  budget?: BudgetFilter;
  setting?: SettingFilterValue;
}

export const DURATION_FILTERS: readonly DurationFilter[] = [
  'SHORT',
  'EVENING',
  'LONG',
];
export const BUDGET_FILTERS: readonly BudgetFilter[] = [
  'FREE',
  'LOW',
  'MEDIUM',
  'HIGH',
];
export const SETTING_FILTERS: readonly SettingFilterValue[] = ['HOME', 'OUT'];

export function dateIdeasQueryKey(
  accountId: string,
  spaceId: string,
  locale: string,
) {
  return ['date-ideas', accountId, spaceId, locale] as const;
}

/** Mirrors the server filter contract: `EITHER` ideas match both settings. */
export function matchesDateIdeaFilter(
  idea: Pick<
    DateIdea,
    'categoryId' | 'durationBand' | 'budgetBand' | 'setting'
  >,
  filter: DateIdeasFilterState,
): boolean {
  if (filter.category && idea.categoryId !== filter.category) return false;
  if (filter.duration && idea.durationBand !== filter.duration) return false;
  if (filter.budget && idea.budgetBand !== filter.budget) return false;
  if (
    filter.setting &&
    idea.setting !== filter.setting &&
    idea.setting !== 'EITHER'
  )
    return false;
  return true;
}

export function filterDateIdeas<T extends DateIdea>(
  ideas: readonly T[],
  filter: DateIdeasFilterState,
): T[] {
  return ideas.filter((idea) => matchesDateIdeaFilter(idea, filter));
}

/** Number of narrowing groups behind the "more filters" disclosure. */
export function secondaryFilterCount(filter: DateIdeasFilterState): number {
  return [filter.duration, filter.budget, filter.setting].filter(Boolean)
    .length;
}

export function hasDateIdeasFilter(filter: DateIdeasFilterState): boolean {
  return Boolean(filter.category) || secondaryFilterCount(filter) > 0;
}

/** Drops values the current catalog does not know (e.g. after an update). */
export function sanitizeDateIdeasFilter(
  value: DateIdeasFilterState | undefined,
  categories: readonly string[] | null,
): DateIdeasFilterState {
  if (!value) return {};
  return {
    category:
      value.category && (!categories || categories.includes(value.category))
        ? value.category
        : undefined,
    duration: DURATION_FILTERS.includes(value.duration as DurationFilter)
      ? value.duration
      : undefined,
    budget: BUDGET_FILTERS.includes(value.budget as BudgetFilter)
      ? value.budget
      : undefined,
    setting: SETTING_FILTERS.includes(value.setting as SettingFilterValue)
      ? value.setting
      : undefined,
  };
}

function formatRange(
  format: Intl.NumberFormat,
  min: number,
  max: number,
): string {
  if (min === max) return format.format(max);
  // ES2023 locale-aware ranges; older engines fall back to an en dash.
  const ranged = format as Intl.NumberFormat & {
    formatRange?: (start: number, end: number) => string;
  };
  try {
    if (ranged.formatRange) return ranged.formatRange(min, max);
  } catch {
    // Fall through to the simple range below.
  }
  return `${format.format(min)}–${format.format(max)}`;
}

/** Localized duration range, e.g. "1,5–2,5 Std." or "1–2 days". */
export function formatDurationRange(
  minMinutes: number,
  maxMinutes: number,
  locale: string,
): string {
  if (minMinutes >= 1440)
    return formatRange(
      new Intl.NumberFormat(locale, {
        style: 'unit',
        unit: 'day',
        unitDisplay: 'long',
        maximumFractionDigits: 1,
      }),
      minMinutes / 1440,
      maxMinutes / 1440,
    );
  if (maxMinutes < 60)
    return formatRange(
      new Intl.NumberFormat(locale, {
        style: 'unit',
        unit: 'minute',
        unitDisplay: 'short',
      }),
      minMinutes,
      maxMinutes,
    );
  const half = (minutes: number) => Math.round(minutes / 30) / 2;
  return formatRange(
    new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: 'hour',
      unitDisplay: 'short',
      maximumFractionDigits: 1,
    }),
    half(minMinutes),
    half(maxMinutes),
  );
}

/** Localized total budget range without fractions; null means free. */
export function formatBudgetRange(
  min: number,
  max: number,
  currency: string,
  locale: string,
): string | null {
  if (max <= 0) return null;
  return formatRange(
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }),
    min,
    max,
  );
}

export function createDateIdeasApi(
  apiBaseUrl: string,
  accessToken: string,
): DateIdeasApi {
  return new DateIdeasApi(
    new Configuration({
      basePath: apiBaseUrl,
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  );
}

/** Reuses the session's single entitlement read for date inspiration. */
export function useDateInspirationCapability({
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
}: {
  apiBaseUrl?: string;
  accessToken?: string;
  accountId: string;
  spaceId: string;
}) {
  const load = useMemo(
    () =>
      apiBaseUrl && accessToken
        ? entitlementLoader(
            new EntitlementsApi(
              new Configuration({
                basePath: apiBaseUrl,
                headers: { Authorization: `Bearer ${accessToken}` },
              }),
            ),
            spaceId,
          )
        : undefined,
    [apiBaseUrl, accessToken, spaceId],
  );
  return useSpaceCapability({
    accountId,
    spaceId,
    load,
    capability: DATE_INSPIRATION_CAPABILITY,
  });
}
