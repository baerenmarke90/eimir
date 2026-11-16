import { AutoLoadMore } from './AutoLoadMore';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import type { PlacesApi } from '../api/generated/apis/PlacesApi';
import type { PlaceDetail } from '../api/generated/models/PlaceDetail';
import { assertOnlineWrite } from '../client/connectivity';
import {
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';
import { captureQueryIdentity } from '../client/queryIdentity';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { PlaceMapPicker, type PlaceMapSelection } from './PlaceMapPicker';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet } from './ShortTaskSheet';

/** One saved/map Place choice; a created Place survives a failed consumer write. */
export function PlaceChoicePicker({
  api,
  spaceId,
  queryKey,
  offline,
  onChoose,
  onPendingChange,
  captureAdmission,
  confirmSharedCreate = false,
  onChooseLocation,
  locationHint,
}: {
  api: PlacesApi;
  spaceId: string;
  queryKey: readonly unknown[];
  offline: boolean;
  onChoose: (place: PlaceDetail) => Promise<void> | void;
  captureAdmission?: () => () => boolean;
  confirmSharedCreate?: boolean;
  onChooseLocation?: (location: PlaceMapSelection) => void;
  locationHint?: string;
  onPendingChange: (pending: boolean) => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const id = useId();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
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
          {
            spaceId,
            cursor: pageParam,
            limit: 20,
            order: 'NAME',
            scope: 'ACTIVE',
          },
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
  async function connect(
    place?: PlaceDetail,
    selection?: {
      name: string;
      address?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    },
  ) {
    if (owner.current.pending || offline) return;
    const choiceAdmitted = captureQueryIdentity(client, [
      ...queryKey,
      'picker',
    ]);
    const parentAdmitted = captureAdmission?.() ?? (() => true);
    const admitted = () =>
      choiceAdmitted() &&
      parentAdmitted() &&
      !['unauthorized', 'permission', 'notFound'].includes(
        clientProblemKind(
          client.getQueryState([...queryKey, 'picker'])?.error,
        ) ?? '',
      );
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
            latitude: selection.latitude ?? undefined,
            longitude: selection.longitude ?? undefined,
          },
        });
        if (owner.current.active && admitted()) setCreated(destination);
      }
      if (!destination || !owner.current.active || !admitted()) return;
      assertOnlineWrite();
      await onChoose(destination);
      if (owner.current.active && admitted()) {
        setCreating(false);
        setCreated(null);
      }
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
      {!onChooseLocation ? (
        <button
          type="button"
          className="secondary composer-new-place"
          disabled={offline || pending || Boolean(created)}
          onClick={() => {
            setNewName(search.trim());
            setNewAddress('');
            setMapSelection(undefined);
            setCreating(true);
          }}
        >
          <EimirIcon name="hinzufuegen" />
          {search.trim() &&
          !entries.some((place) =>
            `${place.name} ${place.address ?? ''}`
              .toLocaleLowerCase()
              .includes(search.toLocaleLowerCase()),
          )
            ? t('composer.createNamedPlace', { name: search.trim() })
            : t('composer.createPlace')}
        </button>
      ) : null}
      <ShortTaskSheet
        open={creating}
        title={t('composer.newPlace')}
        onClose={() => setCreating(false)}
        isCloseBlocked={pending}
        className="composer-new-place-sheet"
      >
        <p className="field-help">{t('photoPlaces.sharedCreateHint')}</p>
        <label htmlFor={`${id}-name`}>{t('m5s3.place.name')}</label>
        <input
          id={`${id}-name`}
          value={newName}
          maxLength={200}
          disabled={pending}
          onChange={(event) => setNewName(event.target.value)}
        />
        <label htmlFor={`${id}-address`}>{t('m5s3.place.address')}</label>
        <input
          id={`${id}-address`}
          value={newAddress}
          maxLength={1000}
          disabled={pending}
          onChange={(event) => setNewAddress(event.target.value)}
        />
        <PlaceMapPicker
          api={api}
          spaceId={spaceId}
          value={mapSelection}
          disabled={pending}
          onSelect={(selection) => {
            setMapSelection(selection);
            if (!newName.trim()) setNewName(selection.name);
            if (!newAddress.trim()) setNewAddress(selection.address ?? '');
          }}
        />
        {error ? <ProblemState error={error} /> : null}
        {created ? (
          <p role="status">
            {t('photoPlaces.createdHelp', { name: created.name })}
          </p>
        ) : null}
        <button
          type="button"
          disabled={!newName.trim() || pending || offline}
          onClick={() =>
            void connect(created ?? undefined, {
              name: newName.trim(),
              address: newAddress.trim() || undefined,
              latitude: mapSelection?.latitude,
              longitude: mapSelection?.longitude,
            })
          }
        >
          {t(pending ? 'm5s3.common.saving' : 'photoPlaces.saveSharedPlace')}
        </button>
        <button
          type="button"
          className="tertiary"
          disabled={pending}
          onClick={() => setCreating(false)}
        >
          {t('composer.backToPlaces')}
        </button>
      </ShortTaskSheet>
      <PlaceMapPicker
        api={api}
        spaceId={spaceId}
        value={mapSelection}
        confirmationLabel={
          confirmSharedCreate ? t('photoPlaces.saveSharedPlace') : undefined
        }
        confirmationHint={
          locationHint ??
          (confirmSharedCreate ? t('photoPlaces.sharedCreateHint') : undefined)
        }
        disabled={offline || pending || Boolean(created)}
        onSelect={(selection) => {
          if (onChooseLocation) {
            onChooseLocation(selection);
            return;
          }
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
      <label htmlFor={`${id}-search`}>{t('photoPlaces.savedSearch')}</label>
      <input
        id={`${id}-search`}
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
        <AutoLoadMore
          query={places}
          className="tertiary"
          blocked={pending || places.isFetchingNextPage || offline}
        >
          {t('photoPlaces.more')}
        </AutoLoadMore>
      ) : null}
    </div>
  );
}
