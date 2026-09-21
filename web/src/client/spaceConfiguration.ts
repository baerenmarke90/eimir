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
