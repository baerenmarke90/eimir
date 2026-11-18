import { useQueryClient } from '@tanstack/react-query';
import type { PlacesApi } from '../api/generated/apis/PlacesApi';
import type { PlaceRelationsApi } from '../api/generated/apis/PlaceRelationsApi';
import { ClientProblemError } from '../client/problemDetails';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { PlaceChoicePicker } from './PlaceChoicePicker';

/** Typed relation ownership stays with the saved moment. */
export function MomentPlacePicker({
  api,
  relations,
  spaceId,
  targetId,
  kind,
  queryKey,
  offline,
  onLinked,
  onPendingChange,
}: {
  api: PlacesApi;
  relations: PlaceRelationsApi;
  spaceId: string;
  targetId: string;
  kind: 'memories' | 'heart-moments';
  queryKey: readonly unknown[];
  offline: boolean;
  onLinked: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const client = useQueryClient();
  return (
    <PlaceChoicePicker
      api={api}
      spaceId={spaceId}
      queryKey={queryKey}
      offline={offline}
      onPendingChange={onPendingChange}
      captureAdmission={() => captureAuthorizedQuery(client, queryKey)}
      onChoose={async (place) => {
        const admitted = captureAuthorizedQuery(client, queryKey);
        if (!admitted()) throw new ClientProblemError('permission');
        const params = { spaceId, targetId, placeId: place.id };
        if (kind === 'memories') await relations.linkPlaceMemory(params);
        else await relations.linkPlaceHeartMoment(params);
        if (admitted()) {
          onLinked();
        }
      }}
    />
  );
}
