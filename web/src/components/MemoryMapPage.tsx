import {
  lazy,
  type MouseEvent,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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
import { taskOriginPath, useTaskOrigin } from '../client/taskOrigin';
import { useTaskListReturn } from '../client/useTaskListReturn';
import { useWarmInfiniteQuery } from '../client/useWarmInfiniteQuery';
import { resolvedLocale, useTranslation } from '../i18n';
import { AppErrorBoundary } from './AppErrorBoundary';
import { AutoLoadMore } from './AutoLoadMore';
import { EimirIcon } from './EimirIcon';
import { MemoryMapMemories, MemoryMapPhotoStack } from './MemoryMapMemories';
import { MemoryPreview } from './MemoryPreview';
import { PageHeader } from './PageHeader';
import type { MapLocation, MapViewport } from './PlaceMapCanvas';
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
  const {
    captureOrigin,
    resolveOrigin,
    requestReturn,
    registerOriginMetadata,
  } = useTaskOrigin();
  const location = useLocation();
  const navigate = useNavigate();
  const captureOriginRef = useRef(captureOrigin);
  captureOriginRef.current = captureOrigin;
  const returnKey = (location.state as { taskReturnKey?: unknown } | null)
    ?.taskReturnKey;
  const returnOrigin = resolveOrigin(returnKey);
  const returnContext =
    returnOrigin?.to === taskOriginPath(location.pathname, location.search)
      ? returnOrigin?.memoryMap
      : undefined;
  const [params, setParams] = useSearchParams();
  const placeParam = params.get('place');
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
    open: returnContext?.fullscreen ?? false,
    placeId: returnContext?.placeId ?? placeParam,
  });
  const expanded = fullscreen.scope === fullscreenScope && fullscreen.open;
  const setExpanded = (open: boolean) =>
    setFullscreen({ scope: fullscreenScope, open, placeId: placeParam });
  const [activeMemory, setActiveMemory] = useState({
    scope: fullscreenScope,
    placeId: returnContext?.placeId ?? placeParam,
    memoryId: returnContext?.memoryId,
  });
  const viewport = useRef<{ scope: string; value?: MapViewport }>({
    scope: fullscreenScope,
    value: returnContext?.viewport,
  });
  if (viewport.current.scope !== fullscreenScope)
    viewport.current = { scope: fullscreenScope };
  const rememberViewport = useCallback(
    (value: MapViewport) => {
      if (viewport.current.scope === fullscreenScope)
        viewport.current.value = value;
    },
    [fullscreenScope],
  );
  const fullscreenTrigger = useRef<HTMLButtonElement>(null);
  const fullscreenSheet = useRef<ShortTaskSheetHandle>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const fullscreenFilterTrigger = useRef<HTMLButtonElement>(null);
  const filterSheet = useRef<ShortTaskSheetHandle>(null);
  useLayoutEffect(() => {
    setFullscreen((current) =>
      current.scope === fullscreenScope
        ? current
        : { scope: fullscreenScope, open: false, placeId: null },
    );
  }, [fullscreenScope]);
  const scopedPlace = expanded ? fullscreen.placeId : placeParam;
  const focusPoint = useMemo(() => parseMapPlace(scopedPlace), [scopedPlace]);
  const selectedId = focusPoint ? scopedPlace : null;
  const activeMemoryId =
    activeMemory.scope === fullscreenScope &&
    activeMemory.placeId === selectedId
      ? activeMemory.memoryId
      : undefined;
  const selectMemory = useCallback(
    (memoryId: string) => {
      setActiveMemory({
        scope: fullscreenScope,
        placeId: selectedId,
        memoryId,
      });
    },
    [fullscreenScope, selectedId],
  );
  useEffect(
    () =>
      registerOriginMetadata({
        memoryMap: {
          placeId: selectedId,
          memoryId: activeMemoryId,
          fullscreen: expanded,
          viewport: viewport.current.value,
        },
      }),
    [registerOriginMetadata, selectedId, activeMemoryId, expanded],
  );
  const selectPlace = useCallback(
    (id: string) => {
      setRevealedPlaceId(id);
      if (expanded) {
        setFullscreen((current) => ({ ...current, placeId: id }));
        return;
      }
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set('place', id);
          return next;
        },
        { replace: true, state: location.state },
      );
    },
    [setParams, location.state, expanded],
  );
  function resetPlace() {
    setRevealedPlaceId(null);
    if (expanded) {
      setFullscreen((current) => ({ ...current, placeId: null }));
      return;
    }
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('place');
        return next;
      },
      { replace: true, state: location.state },
    );
  }
  function closeFullscreen() {
    const selectedPlace = fullscreen.placeId;
    setExpanded(false);
    // The modal owns a native history entry. Publish its final local scope only
    // after that entry is closed, preserving the shared Back/Close contract.
    if (selectedPlace === placeParam) return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (selectedPlace) next.set('place', selectedPlace);
        else next.delete('place');
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
  const selected = locations.find(({ point }) => point.id === selectedId);
  const selectedItems = useMemo(
    () => [...(selected?.memories.values() ?? [])],
    [selected],
  );
  const currentMemoryId =
    selectedItems.find((entry) => entry.memoryId === activeMemoryId)
      ?.memoryId ?? selectedItems[0]?.memoryId;
  const points = useMemo(
    () =>
      locations.map(({ point, memories }) => ({
        ...point,
        preview: (
          <MemoryMapPhotoStack
            entries={[...memories.values()]}
            activeMemoryId={
              point.id === selectedId ? currentMemoryId : undefined
            }
            expanded={point.id === selectedId}
            preview={thumbnail}
          />
        ),
        label: t('memoryMap.locationCount', {
          name: point.label,
          count: point.count,
        }),
      })),
    [locations, t, thumbnail, selectedId, currentMemoryId],
  );
  const visiblePoints = useMemo(
    () =>
      selectedId ? points.filter((point) => point.id === selectedId) : points,
    [points, selectedId],
  );
  useEffect(() => {
    if (
      selectedId &&
      (!selected ||
        (activeMemoryId && !selected.memories.has(activeMemoryId))) &&
      query.hasNextPage &&
      !query.isFetching &&
      !query.error
    )
      void query.fetchNextPage();
  }, [
    selectedId,
    selected,
    activeMemoryId,
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
  function openMemory(
    event: MouseEvent<HTMLAnchorElement>,
    entry: MemoryMapEntry,
  ) {
    if (
      event.button ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    selectMemory(entry.memoryId);
    const context = {
      placeId: selectedId,
      memoryId: entry.memoryId,
      viewport: viewport.current.value,
      fullscreen: expanded,
    };
    const open = () => {
      const taskOriginKey = captureOriginRef.current({
        selectedKey: `map-memory:${entry.memoryId}`,
        memoryMap: context,
      });
      void navigate(memoryDetailPath(entry.memoryId), {
        state: { taskOriginKey },
      });
    };
    if (expanded) fullscreenSheet.current?.closeForNavigation(open);
    else open();
  }
  const memoryStrip = selected ? (
    <MemoryMapMemories
      key={`${fullscreenScope}:${selectedId}`}
      placeName={selected.point.label}
      items={selectedItems}
      activeMemoryId={currentMemoryId}
      initialMemoryId={activeMemoryId}
      onSelect={selectMemory}
      onOpen={openMemory}
      onReset={resetPlace}
      preview={thumbnail}
      formatDate={(entry) =>
        entry.happenedUntil
          ? dateFormats.full.formatRange(entry.happenedOn, entry.happenedUntil)
          : dateFormats.full.format(entry.happenedOn)
      }
      reveal={revealedPlaceId === selected.point.id}
    />
  ) : null;
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
        className="content-overview-heading"
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
                    aria-label={t('memoryMap.fullscreen')}
                    title={t('memoryMap.fullscreen')}
                    onClick={() => setExpanded(true)}
                  >
                    <EimirIcon name="expand" />
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
                        key={`${fullscreenScope}:inline`}
                        initialViewport={viewport.current.value}
                        onViewportChange={rememberViewport}
                        locations={visiblePoints}
                        focus={focusPoint}
                        value={selectedId && !selected ? focusPoint : undefined}
                        onLocationSelect={selectPlace}
                      />
                    )}
                  </Suspense>
                </AppErrorBoundary>
                {!expanded ? memoryStrip : null}
                <ShortTaskSheet
                  ref={fullscreenSheet}
                  open={expanded}
                  title={t('memoryMap.title')}
                  closeLabel={t('memoryMap.closeFullscreen')}
                  onClose={closeFullscreen}
                  restoreFocusRef={fullscreenTrigger}
                  className="memory-map-fullscreen"
                >
                  <div className="memory-map-fullscreen-surface">
                    {expanded ? (
                      <div className="memory-map-fullscreen-tools">
                        <button
                          ref={fullscreenFilterTrigger}
                          type="button"
                          className={`secondary memory-map-filter${selectedId ? ' is-active' : ''}`}
                          aria-label={t('memoryMap.filter')}
                          aria-haspopup="dialog"
                          aria-expanded={filtersOpen}
                          onClick={() => setFiltersOpen(true)}
                        >
                          <EimirIcon name="filter" />
                          {selectedId ? (
                            <span aria-hidden="true">1</span>
                          ) : null}
                        </button>
                      </div>
                    ) : null}
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
                            key={`${fullscreenScope}:fullscreen`}
                            initialViewport={viewport.current.value}
                            onViewportChange={rememberViewport}
                            locations={visiblePoints}
                            focus={focusPoint}
                            value={
                              selectedId && !selected ? focusPoint : undefined
                            }
                            onLocationSelect={selectPlace}
                          />
                        ) : null}
                      </Suspense>
                    </AppErrorBoundary>
                  </div>
                  {expanded ? memoryStrip : null}
                </ShortTaskSheet>
                <ShortTaskSheet
                  ref={filterSheet}
                  open={filtersOpen}
                  title={t('memoryMap.filter')}
                  onClose={() => setFiltersOpen(false)}
                  restoreFocusRef={
                    expanded ? fullscreenFilterTrigger : filterTrigger
                  }
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
            {!selected ? (
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
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
