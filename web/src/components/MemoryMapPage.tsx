import { useInfiniteQuery } from '@tanstack/react-query';
import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import type { MemoryMapEntry } from '../api/generated/models/MemoryMapEntry';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import {
  ClientProblemError,
  normalizeClientError,
} from '../client/problemDetails';
import { useTaskOrigin } from '../client/taskOrigin';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { memoryDetailPath } from '../client/routes';
import { resolvedLocale, useTranslation } from '../i18n';
import { AppErrorBoundary } from './AppErrorBoundary';
import { PageHeader } from './PageHeader';
import type { MapLocation } from './PlaceMapCanvas';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';
import './MemoryMapPage.css';

const MapCanvas = lazy(() => import('./PlaceMapCanvas'));

export function MemoryMapPage({
  apis,
  spaceId,
  accountId,
  apiBaseUrl,
}: {
  apis: SharedPlanningApis;
  spaceId: string;
  accountId: string;
  apiBaseUrl?: string;
}) {
  const { t } = useTranslation();
  const { captureOrigin, requestReturn } = useTaskOrigin();
  const location = useLocation();
  const navigate = useNavigate();
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('place');
  const selectPlace = useCallback(
    (id: string) =>
      setParams({ place: id }, { replace: true, state: location.state }),
    [setParams, location.state],
  );
  const query = useInfiniteQuery({
    queryKey: [
      ...authorSummaryQueryKeys.memoryMap(spaceId),
      accountId,
      apiBaseUrl,
    ],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      try {
        return await apis.places.listMemoryMap(
          { spaceId, cursor: pageParam, limit: 100 },
          { signal },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: false,
    gcTime: 0,
  });
  const locations = useMemo(() => {
    const grouped = new Map<
      string,
      { point: MapLocation; memories: Map<string, MemoryMapEntry> }
    >();
    for (const entry of query.data?.pages.flatMap((page) => page.items) ?? []) {
      const id = `${entry.latitude}:${entry.longitude}`;
      let group = grouped.get(id);
      if (!group) {
        group = {
          point: {
            id,
            latitude: entry.latitude,
            longitude: entry.longitude,
            label: entry.placeName,
            count: 0,
          },
          memories: new Map(),
        };
        grouped.set(id, group);
      }
      group.memories.set(entry.memoryId, entry);
      group.point.count = group.memories.size;
    }
    return [...grouped.values()];
  }, [query.data]);
  const points = useMemo(
    () =>
      locations.map(({ point }) => ({
        ...point,
        label: t('memoryMap.locationCount', {
          name: point.label,
          count: point.count,
        }),
      })),
    [locations, t],
  );
  const selected = locations.find(({ point }) => point.id === selectedId);
  const gated =
    query.error instanceof ClientProblemError &&
    query.error.code === 'PREMIUM_ENTITLEMENT_REQUIRED';
  return (
    <div className="page memory-map-page">
      <PageHeader
        title={t('memoryMap.title')}
        description={t('memoryMap.intro')}
        before={
          <button
            type="button"
            className="back-link tertiary"
            onClick={() =>
              requestReturn(
                (location.state as { taskOriginKey?: unknown } | null)
                  ?.taskOriginKey,
                '/story?tab=timeline',
              )
            }
          >
            {t('memoryMap.back')}
          </button>
        }
      />
      {gated ? (
        <UiState
          kind="empty"
          title={t('memoryMap.proTitle')}
          body={t('memoryMap.proBody')}
        />
      ) : query.error ? (
        <ProblemState
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : query.isPending ? (
        <UiState kind="loading" title={t('states.loading.title')} />
      ) : locations.length === 0 && !query.hasNextPage ? (
        <UiState
          kind="empty"
          title={t('memoryMap.emptyTitle')}
          body={t('memoryMap.emptyBody')}
        />
      ) : (
        <>
          <p className="field-help">{t('memoryMap.privacy')}</p>
          {locations.length ? (
            !tilesLoaded ? (
              <button
                type="button"
                className="secondary"
                onClick={() => setTilesLoaded(true)}
              >
                {t('m5s3.map.loadMap')}
              </button>
            ) : (
              <AppErrorBoundary
                resetKey={`${spaceId}:${accountId}`}
                fallback={<p role="alert">{t('m5s3.map.tileError')}</p>}
              >
                <Suspense
                  fallback={<p role="status">{t('states.loading.title')}</p>}
                >
                  <MapCanvas
                    locations={points}
                    onLocationSelect={selectPlace}
                  />
                </Suspense>
              </AppErrorBoundary>
            )
          ) : null}
          {query.hasNextPage ? (
            <button
              type="button"
              className="secondary"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {t(
                query.isFetchingNextPage
                  ? 'states.loading.title'
                  : 'memoryMap.loadMore',
              )}
            </button>
          ) : null}
          {selected ? (
            <section
              aria-labelledby="map-place-heading"
              className="memory-map-selection"
            >
              <h2 id="map-place-heading">{selected.point.label}</h2>
              <button
                type="button"
                className="tertiary"
                onClick={() =>
                  setParams({}, { replace: true, state: location.state })
                }
              >
                {t('memoryMap.allPlaces')}
              </button>
              <ul>
                {[...selected.memories.values()].map((entry) => (
                  <li key={entry.memoryId}>
                    <Link
                      to={memoryDetailPath(entry.memoryId)}
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
                        if (taskOriginKey) {
                          event.preventDefault();
                          void navigate(memoryDetailPath(entry.memoryId), {
                            state: { taskOriginKey },
                          });
                        }
                      }}
                    >
                      <strong>{entry.title || t('memoryMap.untitled')}</strong>
                      <time
                        dateTime={entry.happenedOn.toISOString().slice(0, 10)}
                      >
                        {new Intl.DateTimeFormat(resolvedLocale(), {
                          dateStyle: 'medium',
                          timeZone: 'UTC',
                        }).format(entry.happenedOn)}
                      </time>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <ul
              className="memory-map-places"
              aria-label={t('memoryMap.places')}
            >
              {locations.map(({ point }) => (
                <li key={point.id}>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => selectPlace(point.id)}
                  >
                    {t('memoryMap.locationCount', {
                      name: point.label,
                      count: point.count,
                    })}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
