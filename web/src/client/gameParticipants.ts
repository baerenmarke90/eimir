import { SpacesApi } from '../api/generated/apis/SpacesApi';
import type { PartnerView } from '../api/generated/models/PartnerView';
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
  return orderParticipants(space.partners);
}

type Participant = Pick<PartnerView, 'id' | 'displayName'>;

export function orderParticipants(
  partners: readonly Participant[],
  currentAccountId?: string,
): [Participant, Participant] | null {
  if (partners.length !== 2) return null;
  const [a, b] = partners;
  const [first, second] =
    b.id === currentAccountId && a.id !== currentAccountId ? [b, a] : [a, b];
  return [
    { id: first.id, displayName: first.displayName },
    { id: second.id, displayName: second.displayName },
  ];
}
