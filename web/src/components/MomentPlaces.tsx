import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PlaceRelationsApi } from '../api/generated/apis/PlaceRelationsApi';
import { PlacesApi } from '../api/generated/apis/PlacesApi';
import type { PlaceDetail } from '../api/generated/models/PlaceDetail';
import type { PlacePage } from '../api/generated/models/PlacePage';
import { Configuration } from '../client/apiConfiguration';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { assertOnlineWrite } from '../client/connectivity';
import { photoPlaceMapUrl, photoPlacesRequest } from '../client/photoPlaces';
import { clientProblemKind } from '../client/problemDetails';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { placeDetailPath } from '../client/routes';
import { postSnackbar } from '../client/snackbar';
import { useTaskOrigin } from '../client/taskOrigin';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { MomentPlacePicker } from './MomentPlacePicker';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import './MomentPlaces.css';

export function MomentPlaces({
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
  targetId,
  kind,
  offline,
  compact = false,
  canManage = false,
}: {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
  targetId: string;
  kind: 'memories' | 'heart-moments';
  offline: boolean;
  compact?: boolean;
  canManage?: boolean;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const navigate = useNavigate();
  const { captureOrigin } = useTaskOrigin();
  const heading = useRef<HTMLHeadingElement>(null);
  const sheet = useRef<ShortTaskSheetHandle>(null);
  const unlinkInFlight = useRef(false);
  const [adding, setAdding] = useState(false);
  const [addingPending, setAddingPending] = useState(false);
  const addTrigger = useRef<HTMLButtonElement>(null);
  const [selected, setSelected] = useState<PlaceDetail | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [removed, setRemoved] = useState(false);
  const isPlaceholder = (name: string) =>
    name === t('photoPlaces.initialName') || name === 'Photo location';
  const readableName = (place: PlaceDetail) =>
    isPlaceholder(place.name) ? t('photoPlaces.locationFallback') : place.name;
  const config = useMemo(
    () =>
      new Configuration({
        basePath: apiBaseUrl,
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    [apiBaseUrl, accessToken],
  );
  const api = useMemo(() => new PlacesApi(config), [config]);
  const relations = useMemo(() => new PlaceRelationsApi(config), [config]);
  const key = [
    ...authorSummaryQueryKeys.places(spaceId),
    'moment',
    apiBaseUrl,
    accountId,
    kind,
    targetId,
  ] as const;
  const query = useInfiniteQuery<
    PlacePage,
    Error,
    InfiniteData<PlacePage, string | undefined>,
    typeof key,
    string | undefined
  >({
    queryKey: key,
    initialPageParam: undefined as string | undefined,
    retry: false,
    refetchInterval: (current) =>
      !offline &&
      current.state.dataUpdateCount + current.state.errorUpdateCount < 20 &&
      current.state.data?.pages.some((page) =>
        page.items.some((place) => isPlaceholder(place.name) && !place.address),
      )
        ? 3_000
        : false,
    queryFn: ({ pageParam, signal }) =>
      photoPlacesRequest(() =>
        api.listMomentPlaces(
          { spaceId, kind, targetId, cursor: pageParam, limit: 20 },
          { signal },
        ),
      ),
    getNextPageParam: (page, _pages, lastCursor, cursors) => {
      const next = page.nextCursor;
      return next && next !== lastCursor && !cursors.includes(next)
        ? next
        : undefined;
    },
  });
  const mutation = useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (placeId: string) => {
      const admitted = captureAuthorizedQuery(client, key);
      assertOnlineWrite();
      if (!admitted())
        throw new Error('Moment places are no longer authorized.');
      const params = { spaceId, targetId, placeId };
      if (kind === 'memories')
        await photoPlacesRequest(() => relations.unlinkPlaceMemory(params));
      else
        await photoPlacesRequest(() =>
          relations.unlinkPlaceHeartMoment(params),
        );
      return admitted;
    },
    onSuccess: (admitted) => {
      if (!admitted()) return;
      setRemoved(true);
      setSelected(null);
      void client.invalidateQueries({
        queryKey: authorSummaryQueryKeys.places(spaceId),
      });
      postSnackbar(t('photoPlaces.removed'), { tone: 'success' });
    },
  });
  const denied = ['unauthorized', 'permission', 'notFound'].includes(
    clientProblemKind(query.error) ?? '',
  );
  const items = denied
    ? []
    : (query.data?.pages.flatMap((page) => page.items) ?? []);
  const mapUrl = selected
    ? photoPlaceMapUrl(selected.latitude, selected.longitude)
    : null;
  if (
    !query.isPending &&
    !query.error &&
    items.length === 0 &&
    !removed &&
    !canManage
  )
    return null;
  return (
    <section
      className={`moment-places${compact ? ' moment-places-compact' : ''}`}
      aria-labelledby={`moment-places-${targetId}`}
    >
      <h2
        className={compact ? 'sr-only' : undefined}
        ref={heading}
        tabIndex={-1}
        id={`moment-places-${targetId}`}
      >
        {t('photoPlaces.title')}
      </h2>
      {canManage && !denied && !query.isPending && items.length === 0 ? (
        <button
          ref={addTrigger}
          type="button"
          className="secondary moment-place-add"
          aria-haspopup="dialog"
          disabled={offline || query.isPending}
          onClick={() => setAdding(true)}
        >
          <EimirIcon name="orte" />
          <span>{t('photoPlaces.add')}</span>
        </button>
      ) : null}
      <ShortTaskSheet
        open={adding && canManage && !denied}
        title={t('photoPlaces.add')}
        isCloseBlocked={addingPending}
        onClose={() => setAdding(false)}
        restoreFocusRef={addTrigger}
      >
        {adding && canManage && !denied ? (
          <MomentPlacePicker
            api={api}
            relations={relations}
            spaceId={spaceId}
            targetId={targetId}
            kind={kind}
            queryKey={key}
            onPendingChange={setAddingPending}
            offline={offline}
            onLinked={() => {
              setAdding(false);
              void client.invalidateQueries({
                queryKey: authorSummaryQueryKeys.places(spaceId),
              });
              postSnackbar(t('photoPlaces.added'), { tone: 'success' });
            }}
          />
        ) : null}
      </ShortTaskSheet>
      {removed && items.length === 0 ? (
        <p role="status">{t('photoPlaces.removed')}</p>
      ) : null}
      {query.isPending ? (
        <p className="muted" role="status">
          {t(offline ? 'photoPlaces.offline' : 'photoPlaces.placesLoading')}
        </p>
      ) : null}
      {query.error ? (
        <>
          <ProblemState error={query.error} />
          <button
            type="button"
            className="tertiary"
            onClick={() => void query.refetch()}
          >
            {t('photoPlaces.retry')}
          </button>
        </>
      ) : null}
      <ul>
        {items.map((place) => {
          const destination = photoPlaceMapUrl(place.latitude, place.longitude);
          const name = readableName(place);
          return (
            <li key={place.id}>
              <EimirIcon name="orte" className="moment-place-pin" />
              <div className="moment-place-context">
                <strong>{name}</strong>
                {destination ? (
                  <a
                    className="moment-place-address"
                    href={destination}
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                    aria-label={t('photoPlaces.mapAddress', {
                      address: place.address || name,
                    })}
                  >
                    {place.address || t('photoPlaces.viewMap')}
                  </a>
                ) : place.address ? (
                  <span>{place.address}</span>
                ) : null}
                {place.geocodingSource === 'openstreetmap' ? (
                  <a
                    className="moment-place-attribution"
                    href="https://www.openstreetmap.org/copyright"
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                  >
                    © OpenStreetMap
                  </a>
                ) : null}
              </div>
              {canManage ? (
                <button
                  type="button"
                  className="tertiary moment-place-overflow"
                  aria-label={t('photoPlaces.actions', { name })}
                  title={t('photoPlaces.actions', { name })}
                  aria-haspopup="dialog"
                  aria-expanded={selected?.id === place.id}
                  onClick={() => {
                    setSelected(place);
                    setConfirm(false);
                    mutation.reset();
                  }}
                >
                  <span aria-hidden="true">⋯</span>
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {query.hasNextPage ? (
        <button
          type="button"
          className="tertiary"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t('photoPlaces.more')}
        </button>
      ) : null}
      <ShortTaskSheet
        ref={sheet}
        open={selected !== null && !denied}
        title={selected ? readableName(selected) : t('photoPlaces.title')}
        onClose={() => setSelected(null)}
        isCloseBlocked={mutation.isPending}
        restoreFocusRef={heading}
      >
        {selected ? (
          <div className="moment-place-actions">
            {confirm ? (
              <>
                <p>{t('photoPlaces.removeHint')}</p>
                <button
                  type="button"
                  className="destructive"
                  disabled={!canManage || mutation.isPending || offline}
                  onClick={() => {
                    if (!canManage || unlinkInFlight.current) return;
                    unlinkInFlight.current = true;
                    mutation.mutate(selected.id, {
                      onSettled: () => {
                        unlinkInFlight.current = false;
                      },
                    });
                  }}
                >
                  {t('photoPlaces.remove')}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={mutation.isPending}
                  onClick={() => setConfirm(false)}
                >
                  {t('photoPlaces.cancel')}
                </button>
              </>
            ) : (
              <>
                <Link
                  className="button-link secondary-link"
                  to={placeDetailPath(selected.id)}
                  onClick={(event) => {
                    event.preventDefault();
                    const path = placeDetailPath(selected.id);
                    sheet.current?.closeForNavigation(() => {
                      const taskOriginKey = captureOrigin();
                      void navigate(path, { state: { taskOriginKey } });
                    });
                  }}
                >
                  {t('photoPlaces.edit')}
                </Link>
                {mapUrl ? (
                  <a
                    className="button-link secondary-link"
                    href={mapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                  >
                    {t('photoPlaces.maps')}
                  </a>
                ) : null}
                <button
                  type="button"
                  className="tertiary"
                  disabled={!canManage || offline}
                  onClick={() => setConfirm(true)}
                >
                  {t('photoPlaces.remove')}
                </button>
              </>
            )}
            {offline ? <p role="status">{t('photoPlaces.offline')}</p> : null}
            {mutation.error ? <ProblemState error={mutation.error} /> : null}
          </div>
        ) : null}
      </ShortTaskSheet>
    </section>
  );
}
