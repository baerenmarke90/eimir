import { SpacesApi } from '../api/generated/apis/SpacesApi';
import { Configuration } from './apiConfiguration';
import type { WhoOfUsParticipant } from './whoOfUsSession';

export async function loadGameParticipants({
  apiBaseUrl,
  accessToken,
  spaceId,
}: {
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
}): Promise<readonly [WhoOfUsParticipant, WhoOfUsParticipant] | null> {
  const spacesApi = new SpacesApi(
    new Configuration({
      basePath: apiBaseUrl,
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  );
  const space = await spacesApi.getSpaceApiV1SpacesSpaceIdGet({ spaceId });
  if (space.partners.length !== 2) return null;
  return [
    { id: space.partners[0].id, displayName: space.partners[0].displayName },
    { id: space.partners[1].id, displayName: space.partners[1].displayName },
  ];
}
