import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { DateIdeasApi } from '../api/generated/apis/DateIdeasApi';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { DateIdea } from '../api/generated/models/DateIdea';
import type { DateIdeaCategory } from '../api/generated/models/DateIdeaCategory';
import type { DateIdeaPlaceType } from '../api/generated/models/DateIdeaPlaceType';
import { Configuration } from './apiConfiguration';
import {
  type ClientProblemError,
  normalizeClientError,
} from './problemDetails';
import {
  entitlementLoader,
  useSpaceCapability,
  withdrawSpaceCapability,
} from './spaceEntitlement';

/** Space capability for curated date inspiration (#1892). Server-authorized. */
export const DATE_INSPIRATION_CAPABILITY = 'planning.date_inspiration';

/** Inclusive upper bounds offered as filters (minutes; whole EUR for two). */
export const MINUTE_LIMITS = [20, 30, 45, 60] as const;
export const BUDGET_LIMITS = [0, 5, 10, 20] as const;
export type MinuteLimit = (typeof MINUTE_LIMITS)[number];
export type BudgetLimit = (typeof BUDGET_LIMITS)[number];
export const PLACE_FILTERS: readonly DateIdeaPlaceType[] = ['home', 'out'];

/** One choice per group; groups combine with AND. No place means anywhere. */
export interface DateIdeasFilterState {
  category?: DateIdeaCategory;
  maxMinutes?: MinuteLimit;
  maxBudget?: BudgetLimit;
  place?: DateIdeaPlaceType;
}

export function dateIdeasQueryKey(
  accountId: string,
  spaceId: string,
  locale: string,
) {
  return ['date-ideas', accountId, spaceId, locale] as const;
}

/** Image bytes share the catalog scope, so a downgrade removes them too. */
export function dateIdeaImageQueryKey(
  accountId: string,
  spaceId: string,
  imageId: string,
) {
  return ['date-ideas', accountId, spaceId, 'image', imageId] as const;
}

/** Every protected catalog response of one Account/Space, any locale. */
export function dateIdeasScopeKey(accountId: string, spaceId: string) {
  return ['date-ideas', accountId, spaceId] as const;
}

/** Mirrors the server contract: inclusive bounds, 0 € means free. */
export function matchesDateIdeaFilter(
  idea: Pick<
    DateIdea,
    'category' | 'minutes' | 'budgetEurForTwo' | 'placeType'
  >,
  filter: DateIdeasFilterState,
): boolean {
  if (filter.category && idea.category !== filter.category) return false;
  if (filter.maxMinutes !== undefined && idea.minutes > filter.maxMinutes)
    return false;
  if (filter.maxBudget !== undefined && idea.budgetEurForTwo > filter.maxBudget)
    return false;
  return !filter.place || idea.placeType === filter.place;
}

export function filterDateIdeas<T extends DateIdea>(
  ideas: readonly T[],
  filter: DateIdeasFilterState,
): T[] {
  return ideas.filter((idea) => matchesDateIdeaFilter(idea, filter));
}

/** Number of narrowing groups behind the "more filters" disclosure. */
export function secondaryFilterCount(filter: DateIdeasFilterState): number {
  return [
    filter.maxMinutes !== undefined,
    filter.maxBudget !== undefined,
    filter.place !== undefined,
  ].filter(Boolean).length;
}

export function hasDateIdeasFilter(filter: DateIdeasFilterState): boolean {
  return Boolean(filter.category) || secondaryFilterCount(filter) > 0;
}

/** Drops restored values the current catalog does not know. */
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
    maxMinutes: MINUTE_LIMITS.includes(value.maxMinutes as MinuteLimit)
      ? value.maxMinutes
      : undefined,
    maxBudget: BUDGET_LIMITS.includes(value.maxBudget as BudgetLimit)
      ? value.maxBudget
      : undefined,
    place: PLACE_FILTERS.includes(value.place as DateIdeaPlaceType)
      ? value.place
      : undefined,
  };
}

export function formatMinutes(minutes: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'minute',
    unitDisplay: 'short',
  }).format(minutes);
}

export function formatEuros(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Wishes created from an idea in this session, so the idea can offer "view"
 * and plan through the canonical Wish-to-Plan conversion. Lives only in the
 * Account/Space query cache (cleared on sign-out and Space change); the
 * catalog ID never reaches a Wish or Plan request.
 */
function savedWishesKey(accountId: string, spaceId: string) {
  return ['date-idea-wishes', accountId, spaceId] as const;
}

export function rememberDateIdeaWish(
  client: QueryClient,
  accountId: string,
  spaceId: string,
  ideaId: string,
  wishId: string,
) {
  // Kept for the whole session; Space change and sign-out clear the cache.
  client.setQueryDefaults(savedWishesKey(accountId, spaceId), {
    gcTime: Number.POSITIVE_INFINITY,
  });
  client.setQueryData<Record<string, string>>(
    savedWishesKey(accountId, spaceId),
    (current) => ({ ...current, [ideaId]: wishId }),
  );
}

export function savedDateIdeaWishes(
  client: QueryClient,
  accountId: string,
  spaceId: string,
): Record<string, string> {
  return (
    client.getQueryData<Record<string, string>>(
      savedWishesKey(accountId, spaceId),
    ) ?? {}
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

/**
 * The protected catalog read shared by discovery and the shared selection.
 * A server denial withdraws the cached capability, and without the capability
 * no catalog response of this Account/Space stays cached (downgrade, revoked
 * grant or denial).
 */
export function useDateIdeasCatalog({
  api,
  accountId,
  spaceId,
  locale,
  capability,
  enabled = true,
}: {
  api: Pick<DateIdeasApi, 'listDateIdeas'>;
  accountId: string;
  spaceId: string;
  locale: string;
  capability: boolean | undefined;
  enabled?: boolean;
}) {
  const client = useQueryClient();
  const catalog = useQuery({
    queryKey: dateIdeasQueryKey(accountId, spaceId, locale),
    queryFn: async ({ signal }) => {
      try {
        return await api.listDateIdeas({ spaceId, locale }, { signal });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    enabled: capability === true && enabled,
    // The catalog changes only with a release. Filtering is local.
    staleTime: 5 * 60_000,
    retry: false,
  });
  const denied =
    (catalog.error as ClientProblemError | null)?.code ===
    'PREMIUM_ENTITLEMENT_REQUIRED';
  useEffect(() => {
    if (denied)
      withdrawSpaceCapability(
        client,
        accountId,
        spaceId,
        DATE_INSPIRATION_CAPABILITY,
      );
  }, [denied, client, accountId, spaceId]);
  useEffect(() => {
    if (capability === false || denied)
      client.removeQueries({ queryKey: dateIdeasScopeKey(accountId, spaceId) });
  }, [capability, denied, client, accountId, spaceId]);
  return { catalog, denied };
}
