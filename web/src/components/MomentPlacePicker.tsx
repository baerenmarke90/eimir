import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { PlacesApi } from '../api/generated/apis/PlacesApi';
import type { PlaceRelationsApi } from '../api/generated/apis/PlaceRelationsApi';
import type { PlaceDetail } from '../api/generated/models/PlaceDetail';
import { assertOnlineWrite } from '../client/connectivity';
import { normalizeClientError } from '../client/problemDetails';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { PlaceMapPicker, type PlaceMapSelection } from './PlaceMapPicker';
import { ProblemState } from './ProblemState';

/** The parent owns admission; a created Place survives a failed relation write. */
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
  const { t } = useTranslation();
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [mapSelection, setMapSelection] = useState<PlaceMapSelection>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [created, setCreated] = useState<PlaceDetail | null>(null);
  const owner = useRef({ active: true, pending: false });
  useEffect(() => {
    const session = owner.current;
    session.active = true;
    return () => {
      session.active = false;
    };
  }, []);
  const places = useInfiniteQuery({
    queryKey: [...queryKey, 'picker'],
    initialPageParam: undefined as string | undefined,
    retry: false,
    queryFn: async ({ pageParam, signal }) => {
      try {
        return await api.listPlaces(
          { spaceId, cursor: pageParam, limit: 20 },
          { signal },
        );
      } catch (failure) {
        throw await normalizeClientError(failure);
      }
    },
    getNextPageParam: (page, _pages, cursor, cursors) =>
      page.nextCursor &&
      page.nextCursor !== cursor &&
      !cursors.includes(page.nextCursor)
        ? page.nextCursor
        : undefined,
  });
  async function connect(place?: PlaceDetail, selection?: PlaceMapSelection) {
    if (owner.current.pending || offline) return;
    const admitted = captureAuthorizedQuery(client, queryKey);
    if (!admitted()) return;
    owner.current.pending = true;
    setPending(true);
    onPendingChange(true);
    setError(null);
    try {
      assertOnlineWrite();
      let destination = place;
      if (!destination && selection) {
        destination = await api.createPlace({
          spaceId,
          placeCreate: {
            name: selection.name,
            address: selection.address ?? undefined,
            latitude: selection.latitude,
            longitude: selection.longitude,
          },
        });
        if (owner.current.active && admitted()) setCreated(destination);
      }
      if (!destination || !owner.current.active || !admitted()) return;
      assertOnlineWrite();
      const params = { spaceId, targetId, placeId: destination.id };
      if (kind === 'memories') await relations.linkPlaceMemory(params);
      else await relations.linkPlaceHeartMoment(params);
      if (owner.current.active && admitted()) onLinked();
    } catch (failure) {
      const problem = await normalizeClientError(failure);
      if (owner.current.active && admitted()) setError(problem);
    } finally {
      owner.current.pending = false;
      if (owner.current.active) {
        setPending(false);
        onPendingChange(false);
      }
    }
  }
  const entries = places.isError
    ? []
    : [
        ...new Map(
          (places.data?.pages.flatMap((page) => page.items) ?? []).map(
            (place) => [place.id, place],
          ),
        ).values(),
      ];
  return (
    <div className="moment-place-picker" aria-busy={pending}>
      <p>{t('photoPlaces.addHelp')}</p>
      <PlaceMapPicker
        api={api}
        spaceId={spaceId}
        value={mapSelection}
        disabled={offline || pending || Boolean(created)}
        onSelect={(selection) => {
          setMapSelection(selection);
          void connect(undefined, selection);
        }}
      />
      {created ? (
        <div className="inline-message" role="status">
          <p>{t('photoPlaces.createdHelp', { name: created.name })}</p>
          <button
            type="button"
            disabled={pending || offline}
            onClick={() => void connect(created)}
          >
            {t('photoPlaces.retryLink')}
          </button>
        </div>
      ) : null}
      {error ? <ProblemState error={error} /> : null}
      {offline ? <p role="status">{t('photoPlaces.offline')}</p> : null}
      <label htmlFor="moment-place-search">
        {t('photoPlaces.savedSearch')}
      </label>
      <input
        id="moment-place-search"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        disabled={pending}
      />
      {places.isPending ? (
        <p role="status">{t('photoPlaces.placesLoading')}</p>
      ) : null}
      {places.error ? (
        <ProblemState
          error={places.error}
          onRetry={() => void places.refetch()}
        />
      ) : null}
      <ul className="moment-place-choices">
        {entries
          .filter((place) =>
            `${place.name} ${place.address ?? ''}`
              .toLocaleLowerCase()
              .includes(search.toLocaleLowerCase()),
          )
          .map((place) => (
            <li key={place.id}>
              <button
                className="secondary"
                type="button"
                disabled={pending || offline || Boolean(created)}
                onClick={() => void connect(place)}
              >
                <EimirIcon name="orte" />
                <span>
                  <strong>{place.name}</strong>
                  {place.address ? <span>{place.address}</span> : null}
                </span>
              </button>
            </li>
          ))}
      </ul>
      {places.hasNextPage ? (
        <button
          className="tertiary"
          type="button"
          disabled={pending || places.isFetchingNextPage || offline}
          onClick={() => void places.fetchNextPage()}
        >
          {t('photoPlaces.more')}
        </button>
      ) : null}
    </div>
  );
}
