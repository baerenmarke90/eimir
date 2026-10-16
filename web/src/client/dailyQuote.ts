import type { DailyQuoteApi } from '../api/generated/apis/DailyQuoteApi';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { DailyQuoteCatalogView } from '../api/generated/models/DailyQuoteCatalogView';
import type { DailyQuotePreferencePatch } from '../api/generated/models/DailyQuotePreferencePatch';
import type { DailyQuotePreferenceView } from '../api/generated/models/DailyQuotePreferenceView';
import type { DailyQuoteResponse } from '../api/generated/models/DailyQuoteResponse';
import { ClientProblemError, normalizeClientError } from './problemDetails';

export const DAILY_QUOTE_CAPABILITY = 'daily.quote' as const;
export const PREMIUM_ENTITLEMENT_REQUIRED = 'PREMIUM_ENTITLEMENT_REQUIRED';
export const RESOURCE_VERSION_CONFLICT = 'RESOURCE_VERSION_CONFLICT';

export interface DailyQuotePreferenceSnapshot {
  preference: DailyQuotePreferenceView;
  etag: string;
}

export function dailyQuoteEntitlementQueryKey(
  accountId: string,
  spaceId: string,
): readonly ['daily-quote', 'entitlement', string, string] {
  return ['daily-quote', 'entitlement', accountId, spaceId] as const;
}

export function dailyQuoteQueryKey(
  accountId: string,
  spaceId: string,
): readonly ['daily-quote', 'today', string, string] {
  return ['daily-quote', 'today', accountId, spaceId] as const;
}

export function dailyQuoteCatalogQueryKey(
  accountId: string,
  spaceId: string,
): readonly ['daily-quote', 'catalog', string, string] {
  return ['daily-quote', 'catalog', accountId, spaceId] as const;
}

export function dailyQuotePreferencesQueryKey(
  accountId: string,
  spaceId: string,
): readonly ['daily-quote', 'preferences', string, string] {
  return ['daily-quote', 'preferences', accountId, spaceId] as const;
}

export async function loadDailyQuoteCapability(
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
    return entitlement.capabilities.includes(DAILY_QUOTE_CAPABILITY);
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export async function loadDailyQuote(
  api: DailyQuoteApi,
  spaceId: string,
  signal?: AbortSignal,
): Promise<DailyQuoteResponse> {
  try {
    return await api.getDailyQuote(
      { spaceId },
      signal ? { signal } : undefined,
    );
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export async function loadDailyQuoteCatalog(
  api: DailyQuoteApi,
  spaceId: string,
  signal?: AbortSignal,
): Promise<DailyQuoteCatalogView> {
  try {
    return await api.getDailyQuoteCatalog(
      { spaceId },
      signal ? { signal } : undefined,
    );
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

function requireEtag(response: Response): string {
  const etag = response.headers.get('ETag');
  if (!etag) {
    throw new ClientProblemError('server', response.status, 'MISSING_ETAG');
  }
  return etag;
}

export async function loadDailyQuotePreferences(
  api: DailyQuoteApi,
  spaceId: string,
  signal?: AbortSignal,
): Promise<DailyQuotePreferenceSnapshot> {
  try {
    const response = await api.getDailyQuotePreferencesRaw(
      { spaceId },
      signal ? { signal } : undefined,
    );
    const etag = requireEtag(response.raw);
    const preference = await response.value();
    return { preference, etag };
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export async function saveDailyQuotePreferences(
  api: DailyQuoteApi,
  spaceId: string,
  snapshot: DailyQuotePreferenceSnapshot,
  patch: DailyQuotePreferencePatch,
  signal?: AbortSignal,
): Promise<DailyQuotePreferenceSnapshot> {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new ClientProblemError('offline');
    }
    const response = await api.updateDailyQuotePreferencesRaw(
      {
        spaceId,
        ifMatch: snapshot.etag,
        dailyQuotePreferencePatch: patch,
      },
      signal ? { signal } : undefined,
    );
    const etag = requireEtag(response.raw);
    const preference = await response.value();
    return { preference, etag };
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export function isDailyQuoteEntitlementRequired(error: unknown): boolean {
  return (
    error instanceof ClientProblemError &&
    error.kind === 'permission' &&
    error.code === PREMIUM_ENTITLEMENT_REQUIRED
  );
}

export function isDailyQuoteConflict(error: unknown): boolean {
  return (
    error instanceof ClientProblemError &&
    error.kind === 'conflict' &&
    error.code === RESOURCE_VERSION_CONFLICT
  );
}
