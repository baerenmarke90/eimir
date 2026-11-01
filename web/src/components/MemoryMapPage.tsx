import { useInfiniteQuery } from '@tanstack/react-query';
import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import type { MemoryMapEntry } from '../api/generated/models/MemoryMapEntry';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import {
  ClientProblemError,
  normalizeClientError,
} from '../client/problemDetails';
import { memoryDetailPath } from '../client/routes';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import {
  parseStoryFilters,
  storyFiltersToSearch,
} from '../client/storyProduct';
import { useTaskOrigin } from '../client/taskOrigin';
import { resolvedLocale, useTranslation } from '../i18n';
import { AppErrorBoundary } from './AppErrorBoundary';
import { EimirIcon } from './EimirIcon';
import { MemoryPreview } from './MemoryPreview';
import { PageHeader } from './PageHeader';
import type { MapLocation } from './PlaceMapCanvas';
import { ProblemState } from './ProblemState';
import { type StoryView, StoryViewTabs } from './StoryViewTabs';
import { UiState } from './UiState';
import './MemoryMapPage.css';

const MapCanvas = lazy(() => import('./PlaceMapCanvas'));

export function MemoryMapPage({
  apis,
  spaceId,
  accountId,
  apiBaseUrl,
  loadMemoryImage,
}: {
  apis: SharedPlanningApis;
  spaceId: string;
  accountId: string;
  apiBaseUrl?: string;
  loadMemoryImage?: (
    memoryId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ) => Promise<string>;
}) {
  const { t } = useTranslation();
  const { captureOrigin } = useTaskOrigin();
  const location = useLocation();
  const navigate = useNavigate();
  const [revealedPlaceId, setRevealedPlaceId] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('place');
  const selectPlace = useCallback(
    (id: string) => {
      setRevealedPlaceId(id);
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set('place', id);
          return next;
        },
        { replace: true, state: location.state },
      );
    },
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
  const thumbnail = useCallback(
    (entry?: MemoryMapEntry) =>
      entry?.previewAttachmentId && loadMemoryImage ? (
        <MemoryPreview
          memoryId={entry.memoryId}
          attachmentId={entry.previewAttachmentId}
          isSensitive={entry.previewIsSensitive}
          loadImage={loadMemoryImage}
          resourceScopeKey={`memory-map:${apiBaseUrl}:${accountId}:${spaceId}`}
          loadingMode="near-viewport"
          fallback={<EimirIcon name="erinnerungen" />}
        />
      ) : (
        <EimirIcon name="erinnerungen" />
      ),
    [loadMemoryImage, apiBaseUrl, accountId, spaceId],
  );
  const points = useMemo(
    () =>
      locations.map(({ point, memories }) => ({
        ...point,
        preview: thumbnail(
          [...memories.values()].find((entry) => entry.previewAttachmentId),
        ),
        label: t('memoryMap.locationCount', {
          name: point.label,
          count: point.count,
        }),
      })),
    [locations, t, thumbnail],
  );
  const selected = locations.find(({ point }) => point.id === selectedId);
  const locale = resolvedLocale();
  const dateFormats = useMemo(
    () => ({
      full: new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeZone: 'UTC',
      }),
      day: new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        timeZone: 'UTC',
      }),
      month: new Intl.DateTimeFormat(locale, {
        month: 'short',
        timeZone: 'UTC',
      }),
    }),
    [locale],
  );
  const gated =
    query.error instanceof ClientProblemError &&
    query.error.code === 'PREMIUM_ENTITLEMENT_REQUIRED';
  function setView(view: StoryView, keyboard = false) {
    if (view === 'map') return;
    const search = storyFiltersToSearch(parseStoryFilters(params));
    search.set('tab', view);
    void navigate(`/story?${search}`, {
      state: { ...location.state, focusStoryView: keyboard },
    });
  }
  return (
    <div className="page memory-map-page">
      <PageHeader variant="root" title={t('story.timelineTitle')} />
      <StoryViewTabs activeView="map" onSelect={setView} />
      <div
        id="momente-panel-map"
        role="tabpanel"
        aria-labelledby="momente-tab-map"
      >
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
            {locations.length ? (
              <AppErrorBoundary
                resetKey={`${spaceId}:${accountId}`}
                fallback={<p role="alert">{t('m5s3.map.tileError')}</p>}
              >
                <Suspense
                  fallback={
                    <div className="memory-map-loading" role="status">
                      {t('states.loading.title')}
                    </div>
                  }
                >
                  <MapCanvas
                    locations={points}
                    onLocationSelect={selectPlace}
                  />
                </Suspense>
              </AppErrorBoundary>
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
                <div className="memory-map-selection-heading">
                  <h2 id="map-place-heading">
                    <EimirIcon name="orte" />
                    {selected.point.label}
                  </h2>
                  <button
                    type="button"
                    className="tertiary"
                    onClick={() => {
                      setRevealedPlaceId(null);
                      setParams(
                        (current) => {
                          const next = new URLSearchParams(current);
                          next.delete('place');
                          return next;
                        },
                        { replace: true, state: location.state },
                      );
                    }}
                  >
                    {t('memoryMap.allPlaces')}
                  </button>
                </div>
                <ul
                  key={selected.point.id}
                  className={
                    revealedPlaceId === selected.point.id
                      ? 'eimir-motion-disclosure'
                      : undefined
                  }
                >
                  {[...selected.memories.values()].map((entry) => (
                    <li key={entry.memoryId}>
                      <Link
                        className="memory-map-memory"
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
                        <span
                          className="memory-map-thumbnail"
                          aria-hidden="true"
                        >
                          {thumbnail(entry)}
                        </span>
                        <span className="memory-map-memory-copy">
                          <strong>
                            {entry.title || t('memoryMap.untitled')}
                          </strong>
                          <time
                            dateTime={entry.happenedOn
                              .toISOString()
                              .slice(0, 10)}
                          >
                            {dateFormats.full.format(entry.happenedOn)}
                          </time>
                        </span>
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
                {locations.map(({ point, memories }) => (
                  <li key={point.id}>
                    <button
                      type="button"
                      className="memory-map-place"
                      aria-label={t('memoryMap.locationCount', {
                        name: point.label,
                        count: point.count,
                      })}
                      onClick={() => selectPlace(point.id)}
                    >
                      <span className="memory-map-thumbnail" aria-hidden="true">
                        {thumbnail(
                          [...memories.values()].find(
                            (entry) => entry.previewAttachmentId,
                          ),
                        )}
                      </span>
                      <span className="memory-map-place-copy">
                        <strong>{point.label}</strong>
                        <span>
                          {t('memoryMap.memoryCount', { count: point.count })}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
