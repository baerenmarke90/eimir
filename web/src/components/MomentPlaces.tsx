import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PlaceRelationsApi } from '../api/generated/apis/PlaceRelationsApi';
import { PlacesApi } from '../api/generated/apis/PlacesApi';
import type { PlaceDetail } from '../api/generated/models/PlaceDetail';
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
}: {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
  targetId: string;
  kind: 'memories' | 'heart-moments';
  offline: boolean;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const navigate = useNavigate();
  const { captureOrigin } = useTaskOrigin();
  const heading = useRef<HTMLHeadingElement>(null);
  const sheet = useRef<ShortTaskSheetHandle>(null);
  const unlinkInFlight = useRef(false);
  const [selected, setSelected] = useState<PlaceDetail | null>(null);
  const [confirm, setConfirm] = useState(false);
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
    'moment-places',
    apiBaseUrl,
    accountId,
    spaceId,
    kind,
    targetId,
  ] as const;
  const query = useInfiniteQuery({
    queryKey: key,
    initialPageParam: undefined as string | undefined,
    retry: false,
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
      setSelected(null);
      void client.invalidateQueries({ queryKey: key });
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
  if (!query.isPending && !query.error && items.length === 0) return null;
  return (
    <section
      className="moment-places"
      aria-labelledby={`moment-places-${targetId}`}
    >
      <h2 ref={heading} tabIndex={-1} id={`moment-places-${targetId}`}>
        {t('photoPlaces.title')}
      </h2>
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
        {items.map((place) => (
          <li key={place.id}>
            <Link
              to={placeDetailPath(place.id)}
              onClick={(event) => {
                if (
                  event.button ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                const taskOriginKey = captureOrigin();
                if (!taskOriginKey) return;
                event.preventDefault();
                void navigate(placeDetailPath(place.id), {
                  state: { taskOriginKey },
                });
              }}
            >
              {place.name}
            </Link>
            <button
              type="button"
              className="tertiary"
              onClick={() => {
                setSelected(place);
                setConfirm(false);
                mutation.reset();
              }}
            >
              {t('photoPlaces.actions', { name: place.name })}
            </button>
          </li>
        ))}
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
        title={selected?.name ?? t('photoPlaces.title')}
        onClose={() => setSelected(null)}
        isCloseBlocked={mutation.isPending}
        restoreFocusRef={heading}
      >
        {selected ? (
          <>
            {confirm ? (
              <>
                <p>{t('photoPlaces.removeHint')}</p>
                <button
                  type="button"
                  className="destructive"
                  disabled={mutation.isPending || offline}
                  onClick={() => {
                    if (unlinkInFlight.current) return;
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
                  className="button-link"
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
                    className="button-link"
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
                  disabled={offline}
                  onClick={() => setConfirm(true)}
                >
                  {t('photoPlaces.remove')}
                </button>
              </>
            )}
            {offline ? <p role="status">{t('photoPlaces.offline')}</p> : null}
            {mutation.error ? <ProblemState error={mutation.error} /> : null}
          </>
        ) : null}
      </ShortTaskSheet>
    </section>
  );
}
