import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { PartnerLocationApi } from '../api/generated/apis/PartnerLocationApi';
import { SpacesApi } from '../api/generated/apis/SpacesApi';
import type { PartnerLocationSettingsView } from '../api/generated/models/PartnerLocationSettingsView';
import type { SharingLevel } from '../api/generated/models/SharingLevel';
import { Configuration } from './apiConfiguration';
import { ClientProblemError, normalizeClientError } from './problemDetails';
import {
  entitlementLoader,
  useSpaceCapability,
  withdrawSpaceCapability,
} from './spaceEntitlement';

/**
 * Owner-side presentation helpers for partner distance (#1792). The server is
 * authoritative for consent, entitlement and expiry; see
 * docs/m9/PARTNER-LOCATION.md.
 */

export const PARTNER_LOCATION_CAPABILITY = 'presence.location';

export type SharedLevel = Exclude<SharingLevel, 'OFF'>;
export type SharingDuration = 'hour' | 'evening' | 'indefinite';

/** Product Owner decision 2026-11-13: a bounded option is preselected. */
export const DEFAULT_SHARING_DURATION: SharingDuration = 'evening';
export const SHARING_DURATIONS: readonly SharingDuration[] = [
  'hour',
  'evening',
  'indefinite',
];

const HOUR_MS = 60 * 60 * 1000;
const EVENING_HOUR = 23;
const EVENING_MINUTE = 59;
/** An evening end closer than this rolls over to the next evening. */
const MIN_EVENING_REMAINING_MS = 60 * 1000;
/** The server accepts at most 24 h; keep a margin for clock skew. */
const MAX_BOUNDED_MS = 24 * HOUR_MS - 5 * 60 * 1000;

/** The server-authoritative duration request for a chosen option. */
export function sharingDurationRequest(
  duration: SharingDuration,
  now: Date = new Date(),
): { indefinite: boolean; expiresAt: Date | null } {
  if (duration === 'indefinite') return { indefinite: true, expiresAt: null };
  if (duration === 'hour') {
    return { indefinite: false, expiresAt: new Date(now.getTime() + HOUR_MS) };
  }
  const evening = new Date(now);
  evening.setHours(EVENING_HOUR, EVENING_MINUTE, 0, 0);
  if (evening.getTime() - now.getTime() < MIN_EVENING_REMAINING_MS) {
    evening.setDate(evening.getDate() + 1);
  }
  const latest = now.getTime() + MAX_BOUNDED_MS;
  return {
    indefinite: false,
    expiresAt: evening.getTime() > latest ? new Date(latest) : evening,
  };
}

/** The duration option that best describes an existing share. */
export function currentSharingDuration(
  settings: Pick<PartnerLocationSettingsView, 'indefinite' | 'expiresAt'>,
): SharingDuration {
  if (settings.indefinite) return 'indefinite';
  return DEFAULT_SHARING_DURATION;
}

/** Whether moving from `from` to `to` makes more visible to the partner. */
export function raisesVisibility(
  from: SharingLevel,
  to: SharingLevel,
): boolean {
  const rank: Record<SharingLevel, number> = {
    OFF: 0,
    DISTANCE: 1,
    DISTANCE_AND_MAP: 2,
  };
  return rank[to] > rank[from];
}

export function isSharingActive(
  settings: Pick<PartnerLocationSettingsView, 'state'> | undefined,
): boolean {
  return settings?.state === 'ACTIVE';
}

const STORED_STATES: ReadonlySet<string> = new Set([
  'ACTIVE',
  'EXPIRED',
  'SUSPENDED',
  'PARTNER_CHANGED',
]);

/** Something is stored that the owner may want to stop or confirm again. */
export function hasStoredSharing(
  settings: Pick<PartnerLocationSettingsView, 'state' | 'level'> | undefined,
): boolean {
  return Boolean(
    settings &&
      STORED_STATES.has(settings.state) &&
      (settings.level === 'DISTANCE' || settings.level === 'DISTANCE_AND_MAP'),
  );
}

export function partnerLocationSettingsQueryKey(
  accountId: string,
  spaceId: string,
) {
  return ['partner-location-settings', accountId, spaceId] as const;
}

export interface PartnerLocationOwner {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
}

export function createPartnerLocationApi(
  apiBaseUrl: string,
  accessToken: string,
): PartnerLocationApi {
  return new PartnerLocationApi(
    new Configuration({
      basePath: apiBaseUrl,
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  );
}

export function usePartnerLocationApi({
  apiBaseUrl,
  accessToken,
}: Pick<PartnerLocationOwner, 'apiBaseUrl' | 'accessToken'>) {
  return useMemo(
    () => createPartnerLocationApi(apiBaseUrl, accessToken),
    [apiBaseUrl, accessToken],
  );
}

export async function readPartnerLocationSettings(
  api: Pick<PartnerLocationApi, 'getPartnerLocationSettings'>,
  spaceId: string,
): Promise<PartnerLocationSettingsView> {
  try {
    return await api.getPartnerLocationSettings({ spaceId });
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export function usePartnerLocationSettings(
  owner: PartnerLocationOwner & {
    api: Pick<PartnerLocationApi, 'getPartnerLocationSettings'>;
    enabled?: boolean;
  },
) {
  const { api, accountId, spaceId, enabled = true } = owner;
  return useQuery({
    queryKey: partnerLocationSettingsQueryKey(accountId, spaceId),
    queryFn: () => readPartnerLocationSettings(api, spaceId),
    enabled: enabled && Boolean(accountId && spaceId),
    retry: false,
  });
}

export function isEntitlementRequired(error: unknown): boolean {
  return (
    error instanceof ClientProblemError &&
    error.kind === 'permission' &&
    error.code === 'PREMIUM_ENTITLEMENT_REQUIRED'
  );
}

/** Settings writes shared by the settings page and the start sheet. */
export function usePartnerLocationWrites({
  api,
  accountId,
  spaceId,
}: {
  api: Pick<PartnerLocationApi, 'updatePartnerLocationSettings'>;
  accountId: string;
  spaceId: string;
}) {
  const queryClient = useQueryClient();
  const store = useCallback(
    (view: PartnerLocationSettingsView) => {
      queryClient.setQueryData(
        partnerLocationSettingsQueryKey(accountId, spaceId),
        view,
      );
      return view;
    },
    [accountId, queryClient, spaceId],
  );
  const write = useCallback(
    async (update: {
      level: SharingLevel;
      indefinite?: boolean;
      expiresAt?: Date | null;
    }) => {
      try {
        return store(
          await api.updatePartnerLocationSettings({
            spaceId,
            partnerLocationSettingsUpdate:
              update.level === 'OFF' ? { level: 'OFF' } : update,
          }),
        );
      } catch (error) {
        const problem = await normalizeClientError(error);
        if (isEntitlementRequired(problem)) {
          withdrawSpaceCapability(
            queryClient,
            accountId,
            spaceId,
            PARTNER_LOCATION_CAPABILITY,
          );
        }
        throw problem;
      }
    },
    [accountId, api, queryClient, spaceId, store],
  );
  return {
    store,
    share: (level: SharedLevel, duration: SharingDuration) =>
      write({ level, ...sharingDurationRequest(duration) }),
    /** Narrowing keeps the existing end; it never extends the share. */
    narrow: (level: SharedLevel, settings: PartnerLocationSettingsView) =>
      write({
        level,
        indefinite: settings.indefinite,
        expiresAt: settings.indefinite ? null : settings.expiresAt,
      }),
    stop: () => write({ level: 'OFF' }),
  };
}

/** Whether the active Space has a partner other than the signed-in account. */
export function usePartnerName({
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
  enabled = true,
}: PartnerLocationOwner & { enabled?: boolean }): {
  paired: boolean | undefined;
  id?: string;
  name?: string;
} {
  const spacesApi = useMemo(
    () =>
      new SpacesApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ),
    [accessToken, apiBaseUrl],
  );
  // Shares the cache entry of the relationship settings section.
  const space = useQuery({
    queryKey: ['space', spaceId],
    queryFn: async () => {
      try {
        return await spacesApi.getSpaceApiV1SpacesSpaceIdGet({ spaceId });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    enabled: enabled && Boolean(spaceId),
    retry: false,
  });
  if (!space.data) return { paired: undefined };
  const partner = space.data.partners.find((person) => person.id !== accountId);
  return {
    paired: Boolean(partner),
    id: partner?.id,
    name: partner?.displayName || undefined,
  };
}

/** Reuses the session's single entitlement read for `presence.location`. */
export function usePartnerLocationCapability({
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
}: PartnerLocationOwner) {
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
    [accessToken, apiBaseUrl, spaceId],
  );
  return useSpaceCapability({
    accountId,
    spaceId,
    load,
    capability: PARTNER_LOCATION_CAPABILITY,
  });
}

/* One-time start sheet ---------------------------------------------------- */

const answeredInSession = new Set<string>();

export function partnerLocationOnboardingKey(
  apiBaseUrl: string,
  accountId: string,
): string {
  return `eimir-partner-location-onboarding-v1:${apiBaseUrl}:${accountId}`;
}

export function wasPartnerLocationOnboardingAnswered(key: string): boolean {
  if (answeredInSession.has(key)) return true;
  try {
    return window.localStorage.getItem(key) === 'answered';
  } catch {
    // Do not repeatedly ask when this device cannot retain the decision.
    return true;
  }
}

export function rememberPartnerLocationOnboardingAnswer(key: string): void {
  answeredInSession.add(key);
  try {
    window.localStorage.setItem(key, 'answered');
  } catch {
    // The in-memory decision still survives remounts during this session.
  }
}

/** Test seam: forget in-memory answers. */
export function resetPartnerLocationOnboardingMemory(): void {
  answeredInSession.clear();
}
