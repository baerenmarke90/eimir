import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import type { MemoryMapEntry } from '../api/generated/models/MemoryMapEntry';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import type { ObjectUrlSource } from '../client/objectUrlResource';
import { parseMapPlace } from '../client/photoPlaces';
import {
  ClientProblemError,
  normalizeClientError,
} from '../client/problemDetails';
import { sortByProductLabel } from '../client/productLabelOrder';
import { memoryDetailPath } from '../client/routes';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import {
  parseStoryFilters,
  storyFiltersToSearch,
} from '../client/storyProduct';
import { useTaskOrigin } from '../client/taskOrigin';
import { useTaskListReturn } from '../client/useTaskListReturn';
import { useWarmInfiniteQuery } from '../client/useWarmInfiniteQuery';
import { resolvedLocale, useTranslation } from '../i18n';
import { AppErrorBoundary } from './AppErrorBoundary';
import { AutoLoadMore } from './AutoLoadMore';
import { EimirIcon } from './EimirIcon';
import { MemoryPreview } from './MemoryPreview';
import { MomentCreateMenu } from './MomentCreateMenu';
import { PageHeader } from './PageHeader';
import type { MapLocation } from './PlaceMapCanvas';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import { type StoryView, StoryViewTabs } from './StoryViewTabs';
import { TaskBackButton } from './TaskBackButton';
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
  ) => Promise<ObjectUrlSource>;
}) {
  const { t } = useTranslation();
  const locale = resolvedLocale();
  const { captureOrigin, resolveOrigin, requestReturn } = useTaskOrigin();
  const location = useLocation();
  const navigate = useNavigate();
  const originKey = (location.state as { taskOriginKey?: unknown } | null)
    ?.taskOriginKey;
  const hasOrigin = Boolean(
    (location.state as { mapFromMoment?: boolean } | null)?.mapFromMoment &&
      resolveOrigin(originKey),
  );
  const [revealedPlaceId, setRevealedPlaceId] = useState<string | null>(null);
  const fullscreenScope = JSON.stringify([apiBaseUrl, accountId, spaceId]);
  const [fullscreen, setFullscreen] = useState({
    scope: fullscreenScope,
    open: false,
  });
  const expanded = fullscreen.scope === fullscreenScope && fullscreen.open;
  const setExpanded = (open: boolean) =>
    setFullscreen({ scope: fullscreenScope, open });
  const fullscreenTrigger = useRef<HTMLButtonElement>(null);
  const fullscreenSheet = useRef<ShortTaskSheetHandle>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const filterSheet = useRef<ShortTaskSheetHandle>(null);
  useLayoutEffect(() => {
    setFullscreen((current) =>
      current.scope === fullscreenScope
        ? current
        : { scope: fullscreenScope, open: false },
    );
  }, [fullscreenScope]);
  const [params, setParams] = useSearchParams();
  const placeParam = params.get('place');
  const focusPoint = useMemo(() => parseMapPlace(placeParam), [placeParam]);
  const selectedId = focusPoint ? placeParam : null;
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
  function resetPlace() {
    setRevealedPlaceId(null);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('place');
        return next;
      },
      { replace: true, state: location.state },
    );
  }
  const query = useWarmInfiniteQuery({
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
    staleTime: 60_000,
    gcTime: 30 * 60_000,
  });
  useTaskListReturn({
    ready: Boolean(query.data) || query.isError,
    busy: query.isFetching,
    loadedPageCount: query.data?.pages.length ?? 1,
    canLoadMore: Boolean(query.hasNextPage) && !query.isError,
    loadMore: query.fetchNextPage,
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
    return sortByProductLabel(
      [...grouped.values()],
      (group) => group.point.label,
      locale,
    );
  }, [query.data, locale]);
  const thumbnail = useCallback(
    (entry?: MemoryMapEntry) =>
      entry?.previewAttachmentId && loadMemoryImage ? (
        <MemoryPreview
          memoryId={entry.memoryId}
          attachmentId={entry.previewAttachmentId}
          isSensitive={entry.previewIsSensitive}
          hasThumbnail={entry.previewHasThumbnail}
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
  const visiblePoints = useMemo(
    () =>
      selectedId ? points.filter((point) => point.id === selectedId) : points,
    [points, selectedId],
  );
  useEffect(() => {
    if (
      selectedId &&
      !selected &&
      query.hasNextPage &&
      !query.isFetching &&
      !query.error
    )
      void query.fetchNextPage();
  }, [
    selectedId,
    selected,
    query.hasNextPage,
    query.isFetching,
    query.error,
    query.fetchNextPage,
  ]);
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
  function setView(view: StoryView) {
    if (view === 'map') return;
    const search = storyFiltersToSearch(parseStoryFilters(params));
    search.set('tab', view);
    void navigate(`/story?${search}`, {
      state: { ...location.state, focusStoryView: true },
    });
  }
  return (
    <div className="page memory-map-page">
      <PageHeader
        variant="root"
        title={t('story.timelineTitle')}
        before={
          hasOrigin ? (
            <TaskBackButton
              onClick={() => requestReturn(originKey, '/story')}
            />
          ) : undefined
        }
      />
      <StoryViewTabs activeView="map" onSelect={setView} />
      <MomentCreateMenu />
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
        ) : locations.length === 0 && !query.hasNextPage && !focusPoint ? (
          <UiState
            kind="empty"
            title={t('memoryMap.emptyTitle')}
            body={t('memoryMap.emptyBody')}
          />
        ) : (
          <>
            {locations.length || focusPoint ? (
              <div className="memory-map-surface">
                <div className="memory-map-tools">
                  <button
                    ref={filterTrigger}
                    type="button"
                    className={`secondary memory-map-filter${selectedId ? ' is-active' : ''}`}
                    aria-haspopup="dialog"
                    aria-expanded={filtersOpen}
                    aria-label={t('memoryMap.filter')}
                    title={t('memoryMap.filter')}
                    onClick={() => setFiltersOpen(true)}
                  >
                    <EimirIcon name="filter" />
                    {selectedId ? <span aria-hidden="true">1</span> : null}
                  </button>
                  <button
                    ref={fullscreenTrigger}
                    type="button"
                    className="secondary memory-map-expand"
                    onClick={() => setExpanded(true)}
                  >
                    <EimirIcon name="expand" />
                    {t('memoryMap.fullscreen')}
                  </button>
                </div>
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
                    {expanded ? (
                      <div
                        className="memory-map-placeholder"
                        aria-hidden="true"
                      />
                    ) : (
                      <MapCanvas
                        locations={visiblePoints}
                        focus={focusPoint}
                        value={selectedId && !selected ? focusPoint : undefined}
                        onLocationSelect={selectPlace}
                      />
                    )}
                  </Suspense>
                </AppErrorBoundary>
                <ShortTaskSheet
                  ref={fullscreenSheet}
                  open={expanded}
                  title={t('memoryMap.title')}
                  closeLabel={t('memoryMap.closeFullscreen')}
                  onClose={() => setExpanded(false)}
                  restoreFocusRef={fullscreenTrigger}
                  className="memory-map-fullscreen"
                  footer={
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setExpanded(false)}
                    >
                      {t('memoryMap.closeFullscreen')}
                    </button>
                  }
                >
                  <AppErrorBoundary
                    resetKey={`${spaceId}:${accountId}:fullscreen`}
                    fallback={<p role="alert">{t('m5s3.map.tileError')}</p>}
                  >
                    <Suspense
                      fallback={
                        <UiState
                          kind="loading"
                          title={t('states.loading.title')}
                        />
                      }
                    >
                      {expanded ? (
                        <MapCanvas
                          locations={visiblePoints}
                          focus={focusPoint}
                          value={
                            selectedId && !selected ? focusPoint : undefined
                          }
                          onLocationSelect={(id) => {
                            fullscreenSheet.current?.closeForNavigation(() =>
                              selectPlace(id),
                            );
                          }}
                        />
                      ) : null}
                    </Suspense>
                  </AppErrorBoundary>
                </ShortTaskSheet>
                <ShortTaskSheet
                  ref={filterSheet}
                  open={filtersOpen}
                  title={t('memoryMap.filter')}
                  onClose={() => setFiltersOpen(false)}
                  restoreFocusRef={filterTrigger}
                >
                  <fieldset className="memory-map-filter-choices">
                    <legend>{t('memoryMap.places')}</legend>
                    <label>
                      <input
                        type="radio"
                        name="map-place-filter"
                        checked={!selectedId}
                        onChange={() =>
                          filterSheet.current?.closeForNavigation(resetPlace)
                        }
                      />
                      {t('memoryMap.allPlaces')}
                    </label>
                    {locations.map(({ point }) => (
                      <label key={point.id}>
                        <input
                          type="radio"
                          name="map-place-filter"
                          checked={selectedId === point.id}
                          onChange={() =>
                            filterSheet.current?.closeForNavigation(() =>
                              selectPlace(point.id),
                            )
                          }
                        />
                        <span>{point.label}</span>
                      </label>
                    ))}
                  </fieldset>
                  {query.hasNextPage ? (
                    <AutoLoadMore
                      query={query}
                      className="tertiary"
                      blocked={query.isFetchingNextPage}
                    >
                      {t('memoryMap.loadMore')}
                    </AutoLoadMore>
                  ) : null}
                </ShortTaskSheet>
              </div>
            ) : null}
            {query.hasNextPage ? (
              <AutoLoadMore
                query={query}
                className="secondary"
                blocked={query.isFetchingNextPage}
              >
                {t(
                  query.isFetchingNextPage
                    ? 'states.loading.title'
                    : 'memoryMap.loadMore',
                )}
              </AutoLoadMore>
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
                    onClick={resetPlace}
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
                            {entry.happenedUntil
                              ? dateFormats.full.formatRange(
                                  entry.happenedOn,
                                  entry.happenedUntil,
                                )
                              : dateFormats.full.format(entry.happenedOn)}
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
