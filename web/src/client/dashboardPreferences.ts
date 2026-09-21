import type { DashboardModulePreferenceList } from '../api/generated/models/DashboardModulePreferenceList';
import type { DashboardModuleKey } from './dashboardModules';

export const DEFAULT_UPCOMING_ITEM_LIMIT = 1;
export const UPCOMING_MODULE_KEY: DashboardModuleKey = 'upcoming';
export const PINNED_COLLECTION_MODULE_KEY: DashboardModuleKey =
  'pinned_collection';
export const UPCOMING_ITEM_LIMITS = [1, 2, 3] as const;

/** Absence of an explicit override resolves to visible, the product default. */
export const DEFAULT_MODULE_VISIBLE = true;

export type UpcomingItemLimit = (typeof UPCOMING_ITEM_LIMITS)[number];

export function dashboardPreferencesQueryKey(
  accountId: string,
  spaceId: string,
): readonly ['dashboard-preferences', string, string] {
  return ['dashboard-preferences', accountId, spaceId] as const;
}

export function isUpcomingItemLimit(value: number): value is UpcomingItemLimit {
  return UPCOMING_ITEM_LIMITS.some((limit) => limit === value);
}

export function effectiveUpcomingItemLimit(
  preferences: DashboardModulePreferenceList | undefined,
): UpcomingItemLimit {
  const value = preferences?.items.find(
    (item) => item.moduleKey === UPCOMING_MODULE_KEY,
  )?.itemLimit;
  return value !== undefined && isUpcomingItemLimit(value)
    ? value
    : DEFAULT_UPCOMING_ITEM_LIMIT;
}

export function limitUpcomingItems<T>(
  items: readonly T[],
  preferences: DashboardModulePreferenceList | undefined,
): T[] {
  return items.slice(0, effectiveUpcomingItemLimit(preferences));
}

/**
 * Effective per-user visibility for one registered Dashboard module (#817).
 *
 * Absence of an explicit override — including while the preferences query is
 * still loading or unavailable — resolves to `DEFAULT_MODULE_VISIBLE` so a
 * transient fetch hiccup never hides real content the user never chose to
 * hide.
 */
export function isDashboardModuleVisible(
  preferences: DashboardModulePreferenceList | undefined,
  moduleKey: DashboardModuleKey,
): boolean {
  const value = preferences?.items.find(
    (item) => item.moduleKey === moduleKey,
  )?.visible;
  return value ?? DEFAULT_MODULE_VISIBLE;
}

export function selectedDashboardCollectionId(
  preferences: DashboardModulePreferenceList | undefined,
  moduleKey: DashboardModuleKey,
): string | null {
  return (
    preferences?.items.find((item) => item.moduleKey === moduleKey)
      ?.selectedCollectionId ?? null
  );
}
