import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { type ReactNode, useMemo, useRef, useState } from 'react';
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
import { postSnackbar } from '../client/snackbar';
import { useTranslation } from '../i18n';
import { AddActionButton } from './AddAction';
import { AutoLoadMore } from './AutoLoadMore';
import { EimirIcon } from './EimirIcon';
import { MomentPlaceActionsMenu } from './MomentPlaceActionsMenu';
import { MomentMapLink } from './MomentMapLink';
import { MomentPlacePicker } from './MomentPlacePicker';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet } from './ShortTaskSheet';
import './MomentPlaces.css';
import './MomentMetadata.css';

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
  onNavigate,
  orderedIds,
  inline = false,
  renderTrigger,
  renderSelection,
  showSelection = true,
}: {
  renderTrigger?: (open: () => void) => ReactNode;
  renderSelection?: (
    places: readonly PlaceDetail[],
    open: () => void,
  ) => ReactNode;
  showSelection?: boolean;
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
  targetId: string;
  kind: 'memories' | 'heart-moments';
  offline: boolean;
  compact?: boolean;
  canManage?: boolean;
  onNavigate?: (proceed: () => void) => void;
  orderedIds?: string[];
  inline?: boolean;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const heading = useRef<HTMLHeadingElement>(null);
  const [adding, setAdding] = useState(false);
  const [addingPending, setAddingPending] = useState(false);
  const addTrigger = useRef<HTMLButtonElement>(null);
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
    : (query.data?.pages.flatMap((page) => page.items) ?? []).sort((a, b) => {
        const left = orderedIds?.indexOf(a.id) ?? -1;
        const right = orderedIds?.indexOf(b.id) ?? -1;
        return (left < 0 ? Infinity : left) - (right < 0 ? Infinity : right);
      });
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
      className={`moment-places${compact ? ' moment-places-compact' : ''}${inline ? ' moment-places-inline' : ''}`}
      aria-labelledby={`moment-places-${targetId}`}
    >
      <h2
        className={compact || inline ? 'sr-only' : undefined}
        ref={heading}
        tabIndex={-1}
        id={`moment-places-${targetId}`}
      >
        {t('photoPlaces.title')}
      </h2>
      {canManage && !denied && !query.isPending ? (
        renderTrigger ? (
          renderTrigger(() => setAdding(true))
        ) : (
          <AddActionButton
            label={t('photoPlaces.add')}
            icon="orte"
            ref={addTrigger}
            aria-haspopup="dialog"
            disabled={offline || query.isPending}
            onClick={() => setAdding(true)}
          />
        )
      ) : null}
      {renderSelection?.(items, () => setAdding(true))}
      <ShortTaskSheet
        open={adding && canManage && !denied}
        title={t('photoPlaces.add')}
        isCloseBlocked={addingPending || mutation.isPending}
        onClose={() => setAdding(false)}
        restoreFocusRef={addTrigger}
      >
        {adding && canManage && !denied && !showSelection ? (
          <ul>
            {items.map((place) => (
              <li key={place.id}>
                <span>{readableName(place)}</span>
                <button
                  type="button"
                  className="tertiary"
                  disabled={mutation.isPending || offline}
                  aria-label={t('experiences.removePlace', {
                    name: readableName(place),
                  })}
                  onClick={() => mutation.mutate(place.id)}
                >
                  <EimirIcon name="trash" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
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
              setAddingPending(false);
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
      {showSelection ? (
        <ul>
          {items.map((place) => {
            const destination = photoPlaceMapUrl(
              place.latitude,
              place.longitude,
            );
            const name = readableName(place);
            const context = (
              <>
                {destination ? (
                  <MomentMapLink
                    className="moment-place-address"
                    to={destination}
                    returnFocusKey={`${kind}:${targetId}:${place.id}`}
                    onNavigate={onNavigate}
                    ariaLabel={t('photoPlaces.mapAddress', {
                      address: place.address || name,
                    })}
                  >
                    {place.address || t('photoPlaces.viewMap')}
                  </MomentMapLink>
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
              </>
            );
            return inline ? (
              <li key={place.id}>
                {destination ? (
                  <MomentMapLink
                    className="moment-place-summary"
                    to={destination}
                    returnFocusKey={`${kind}:${targetId}:${place.id}`}
                    onNavigate={onNavigate}
                    ariaLabel={name}
                  >
                    <EimirIcon name="orte" />
                    <span>{name}</span>
                  </MomentMapLink>
                ) : (
                  <span className="moment-place-summary">
                    <EimirIcon name="orte" />
                    <span>{name}</span>
                  </span>
                )}
              </li>
            ) : (
              <li key={place.id}>
                <EimirIcon name="orte" className="moment-place-pin" />
                <div className="moment-place-context">
                  <strong>{name}</strong>
                  {context}
                </div>
                {canManage ? (
                  <MomentPlaceActionsMenu
                    place={{ ...place, name }}
                    disabled={mutation.isPending}
                    offline={offline}
                    restoreFocusRef={heading}
                    onNavigate={onNavigate}
                    onRemove={() => mutation.mutateAsync(place.id)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {query.hasNextPage ? (
        <AutoLoadMore
          query={query}
          className="tertiary"
          blocked={query.isFetchingNextPage}
        >
          {t('photoPlaces.more')}
        </AutoLoadMore>
      ) : null}
    </section>
  );
}
