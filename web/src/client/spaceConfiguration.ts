import type { QueryClient } from '@tanstack/react-query';
import type { SpacesApi } from '../api/generated/apis/SpacesApi';
import type { SpaceConfigurationUpdate } from '../api/generated/models/SpaceConfigurationUpdate';
import type { SpaceConfigurationView } from '../api/generated/models/SpaceConfigurationView';
import type { ApiResponse } from '../api/generated/runtime';
import { ClientProblemError, normalizeClientError } from './problemDetails';

export const SPACE_CONFIGURATION_REFRESH_INTERVAL_MS = 30_000;

export interface SpaceConfigurationSnapshot {
  configuration: SpaceConfigurationView;
  etag: string;
}

export function spaceConfigurationQueryKey(
  accountId: string,
  spaceId: string,
): readonly ['space-configuration', string, string] {
  // Management authority is caller-specific even though the shared values are
  // Space-wide. Keep account identity in the key so an account switch can
  // never reuse another caller's canManageSpaceConfiguration result.
  return ['space-configuration', accountId, spaceId] as const;
}

/**
 * Runtime consumers call this when the server reports SPACE_MODULE_DISABLED (or
 * a projection that omits the module), so the stale entry point leaves the
 * composition now instead of waiting for the periodic refresh.
 */
export function refreshSpaceConfiguration(
  queryClient: QueryClient,
  accountId: string,
  spaceId: string,
): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: spaceConfigurationQueryKey(accountId, spaceId),
    exact: true,
    refetchType: 'active',
  });
}

async function snapshotFromResponse(
  response: ApiResponse<SpaceConfigurationView>,
): Promise<SpaceConfigurationSnapshot> {
  const configuration = await response.value();
  const etag = response.raw.headers.get('ETag');
  if (!etag) {
    throw new ClientProblemError(
      'server',
      500,
      'SPACE_CONFIGURATION_ETAG_MISSING',
    );
  }
  return { configuration, etag };
}

export async function loadSpaceConfiguration(
  spacesApi: SpacesApi,
  spaceId: string,
): Promise<SpaceConfigurationSnapshot> {
  try {
    return await snapshotFromResponse(
      await spacesApi.getSpaceConfigurationRaw({ spaceId }),
    );
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export async function updateSpaceConfiguration(
  spacesApi: SpacesApi,
  spaceId: string,
  ifMatch: string,
  update: SpaceConfigurationUpdate,
): Promise<SpaceConfigurationSnapshot> {
  try {
    return await snapshotFromResponse(
      await spacesApi.updateSpaceConfigurationRaw({
        spaceId,
        ifMatch,
        spaceConfigurationUpdate: update,
      }),
    );
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

type DailyModuleField = 'vibeCheckEnabled' | 'energyCheckInEnabled';

/**
 * The device zone is only a suggestion for the manager's first Daily Check-in
 * choice. It is persisted through the Space configuration write, so no client
 * ever derives the shared day from its own device afterwards.
 */
export function suggestedDailyContextTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * The server rejects enabling a Daily Check-in module without a shared day
 * context, so the first enable carries the confirmed zone in the same atomic
 * write instead of failing with a state the manager cannot resolve.
 */
export function dailyModuleToggleUpdate(
  configuration: SpaceConfigurationView,
  field: DailyModuleField,
  suggestedTimezone: string | null,
): SpaceConfigurationUpdate {
  const enabling = !configuration[field];
  const update: SpaceConfigurationUpdate = { [field]: enabling };
  if (
    enabling &&
    configuration.dailyContextTimezone === null &&
    suggestedTimezone
  ) {
    update.dailyContextTimezone = suggestedTimezone;
  }
  return update;
}

export function dailyContextTimezoneOptions(current: string): string[] {
  let supported: string[] = [];
  try {
    supported = Intl.supportedValuesOf('timeZone');
  } catch {
    // Older engines lack the enumeration; the current zone stays selectable.
  }
  return supported.includes(current) ? supported : [current, ...supported];
}

export function spaceConfigurationQueryOptions(
  spacesApi: SpacesApi | null | undefined,
  accountId: string,
  spaceId: string,
) {
  return {
    queryKey: spaceConfigurationQueryKey(accountId, spaceId),
    queryFn: () => {
      if (!spacesApi) {
        throw new ClientProblemError('unknown');
      }
      return loadSpaceConfiguration(spacesApi, spaceId);
    },
    enabled: Boolean(spacesApi && accountId && spaceId),
    retry: false,
    staleTime: 0,
    refetchInterval: SPACE_CONFIGURATION_REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: 'always' as const,
  };
}
