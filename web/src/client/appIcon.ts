import type { AppearanceApi } from '../api/generated/apis/AppearanceApi';
import { AppIconId } from '../api/generated/models/AppIconId';
import type { AppIconPreferenceView } from '../api/generated/models/AppIconPreferenceView';
import { ClientProblemError, normalizeClientError } from './problemDetails';

export const APP_ICON_CAPABILITY = 'theme.bespoke_packs';
export const APP_ICON_IDS: readonly AppIconId[] = Object.values(AppIconId);

export function appIconImage(iconId: AppIconId): string {
  return `/identity/app-icons/v1/${iconId}.png`;
}

export interface AppIconSnapshot {
  preference: AppIconPreferenceView;
  etag: string;
}

export function appIconQueryKey(
  instance: string,
  accountId: string,
  spaceId: string,
) {
  return ['app-icon', instance, accountId, spaceId] as const;
}

function requireEtag(response: Response): string {
  const value = response.headers.get('ETag');
  if (!value)
    throw new ClientProblemError('server', response.status, 'MISSING_ETAG');
  return value;
}

async function snapshotFromResponse(response: {
  raw: Response;
  value: () => Promise<AppIconPreferenceView>;
}): Promise<AppIconSnapshot> {
  const preference = await response.value();
  if (!APP_ICON_IDS.includes(preference.iconId))
    throw new ClientProblemError(
      'server',
      response.raw.status,
      'UNKNOWN_APP_ICON',
    );
  return { preference, etag: requireEtag(response.raw) };
}

export async function loadAppIcon(
  api: AppearanceApi,
  spaceId: string,
  signal: AbortSignal,
): Promise<AppIconSnapshot> {
  try {
    const response = await api.getAppIconPreferenceRaw({ spaceId }, { signal });
    return await snapshotFromResponse(response);
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export async function saveAppIcon(
  api: AppearanceApi,
  spaceId: string,
  snapshot: AppIconSnapshot,
  iconId: AppIconId,
  signal: AbortSignal,
): Promise<AppIconSnapshot> {
  try {
    if (navigator.onLine === false) throw new ClientProblemError('offline');
    const response = await api.updateAppIconPreferenceRaw(
      {
        spaceId,
        ifMatch: snapshot.etag,
        appIconPreferencePatch: { iconId },
      },
      { signal },
    );
    return await snapshotFromResponse(response);
  } catch (error) {
    throw await normalizeClientError(error);
  }
}
