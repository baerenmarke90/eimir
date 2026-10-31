import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import {
  type MouseEvent,
  useCallback,
  useEffect,
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
import type { DashboardApi } from '../api/generated/apis/DashboardApi';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import { AttachmentReadRequestParentTypeEnum } from '../api/generated/models/AttachmentReadRequest';
import type { AuthorSummary } from '../api/generated/models/AuthorSummary';
import {
  DiscoverSelectionFromJSON,
  DiscoverSelectionToJSON,
} from '../api/generated/models/DiscoverSelection';
import type { MemoryAttachmentSummary } from '../api/generated/models/MemoryAttachmentSummary';
import type { StoryItem } from '../api/generated/models/StoryItem';
import {
  StoryKind,
  type StoryKind as StoryKindValue,
} from '../api/generated/models/StoryKind';
import { StoryOrder } from '../api/generated/models/StoryOrder';
import {
  StoryPageFromJSON,
  StoryPageToJSON,
} from '../api/generated/models/StoryPage';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { dashboardQueryKey } from '../client/dashboardQueries';
import { usePartnerNickname } from '../client/partnerNickname';
import { normalizeClientError } from '../client/problemDetails';
import {
  loadProductWithReadCache,
  type ProductReadResult,
  saveProductReadCacheEntry,
} from '../client/productReadCache';
import type { ReferenceApis } from '../client/referenceFlow';
import {
  heartMomentDetailPath,
  memoryDetailPath,
  MEMORY_MAP_ROUTE,
  milestoneDetailPath,
} from '../client/routes';
import { loadAuthorizedStoryImage } from '../client/storyMediaLoader';
import {
  aggregateStoryPages,
  DEFAULT_STORY_FILTERS,
  parseStoryFilters,
  type StoryFilters,
  storyCacheResourceId,
  storyFiltersToSearch,
  storyRequest,
} from '../client/storyProduct';
import { taskOriginPath, useTaskOrigin } from '../client/taskOrigin';
import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { MemoryPreview } from './MemoryPreview';
import { PageHeader } from './PageHeader';
import { AuthorAvatar } from './PersonIdentity';
import { ProblemState } from './ProblemState';
import { PullToRefreshIndicator } from './PullToRefreshIndicator';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import { StoryBrowseLayer } from './StoryBrowseLayer';
import { StoryRetrospective } from './StoryRetrospective';
import './StoryUnifiedPage.css';
import './PlanningReference.css';
import { StoryList } from './StoryList';
import './StoryDiscoverReveal.css';
import './StoryTaskFilters.css';
import './StoryYearsPage.css';
import {
  formatStoryDate,
  groupStoryItems,
  resolveStoryKindLabel,
  storyItemKey,
  storyItemPresentation,
  tapestryItemRole,
} from './storyPresentation';
import { UiState } from './UiState';
import { usePullToRefresh } from './usePullToRefresh';
import {
  useDiscoverReveal,
  useTimelineAutoPagination,
  useTimelineReveal,
} from './useTimelineProgressiveLoading';

function storyItemAuthor(item: StoryItem): AuthorSummary {
  switch (item.kind) {
    case 'MEMORY':
      return item.memory.author;
    case 'HEART_MOMENT':
      return item.heartMoment.author;
    case 'MILESTONE':
      return item.milestone.author;
  }
}

function isStoryKind(value: string | null): value is StoryKindValue {
  return (
    value !== null && Object.values(StoryKind).includes(value as StoryKindValue)
  );
}

interface TapestryEntry {
  key: string;
  role: ReturnType<typeof tapestryItemRole>;
  presentation: ReturnType<typeof storyItemPresentation>;
  firstAttachment: MemoryAttachmentSummary | undefined;
  path: string;
  memoryId: string;
  author: AuthorSummary;
  dateTime: string;
  dateLabel: string;
}

function buildTapestryEntry(
  item: StoryItem,
  t: TFunction,
  locale: string,
  nicknameFor?: (accountId: string) => string | null,
): TapestryEntry {
  const role = tapestryItemRole(item);
  const presentation = storyItemPresentation(item, t, nicknameFor);
  const firstAttachment =
    item.kind === 'MEMORY' ? item.memory.attachments[0] : undefined;
  const path =
    item.kind === 'MEMORY'
      ? memoryDetailPath(item.memory.id)
      : item.kind === 'HEART_MOMENT'
        ? heartMomentDetailPath(item.heartMoment.id)
        : milestoneDetailPath(item.milestone.id);
  const memoryId = item.kind === 'MEMORY' ? item.memory.id : '';
  const author = storyItemAuthor(item);
  const dateTime = item.effectiveDate.toISOString().slice(0, 10);
  const dateLabel = formatStoryDate(item.effectiveDate, locale);
  return {
    key: storyItemKey(item),
    role,
    presentation,
    firstAttachment,
    path,
    memoryId,
    author,
    dateTime,
    dateLabel,
  };
}

interface TapestryBand {
  key: string;
  label: string;
  entries: TapestryEntry[];
}

function buildTapestryBands(
  items: StoryItem[],
  t: TFunction,
  locale: string,
  nicknameFor?: (accountId: string) => string | null,
): TapestryBand[] {
  if (items.length === 0) return [];
  return [
    {
      key: 'discover',
      label: '',
      entries: items.map((item) =>
        buildTapestryEntry(item, t, locale, nicknameFor),
      ),
    },
  ];
}

function documentLayoutTop(element: HTMLElement): number {
  let top = 0;
  let current: HTMLElement | null = element;
  while (current) {
    top += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  return top;
}

export function StoryProductPage({
  apis,
  accountId,
  spaceId,
  loadMemoryImage,
  profilesApi,
  dashboardApi,
}: {
  apis: ReferenceApis;
  accountId: string;
  spaceId: string;
  loadMemoryImage: (
    memoryId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ) => Promise<string>;
  profilesApi?: ProfilesApi;
  dashboardApi?: DashboardApi;
}) {
  const { t } = useTranslation();
  const { nicknameFor } = usePartnerNickname();
  const location = useLocation();
  const saved = Boolean((location.state as { saved?: boolean } | null)?.saved);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { captureOrigin, resolveOrigin, registerOriginMetadata } =
    useTaskOrigin();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const viewTabsRef = useRef<HTMLDivElement>(null);
  const filterSheetRef = useRef<ShortTaskSheetHandle>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const [draftFilters, setDraftFilters] = useState<StoryFilters>(
    DEFAULT_STORY_FILTERS,
  );
  const filters = useMemo(
    () => parseStoryFilters(searchParams),
    [searchParams],
  );
  const activeFilterCount =
    Number(Boolean(filters.kind)) +
    Number(Boolean(filters.year)) +
    Number(filters.order !== StoryOrder.DESC);
  const hasActiveFilters = activeFilterCount > 0;
  const activeView = useMemo(() => {
    const tab = searchParams.get('tab');
    if (tab === 'timeline' || tab === 'discover') return tab;
    return hasActiveFilters ? 'timeline' : 'discover';
  }, [searchParams, hasActiveFilters]);
  // Discover does not inherit the retained Timeline scope.
  const effectiveFilters = filters;
  const cacheResourceId = useMemo(
    () => storyCacheResourceId(effectiveFilters),
    [effectiveFilters],
  );
  const loadHeartMomentImage = useCallback(
    (heartMomentId: string, attachmentId: string, signal?: AbortSignal) =>
      loadAuthorizedStoryImage(
        apis,
        spaceId,
        AttachmentReadRequestParentTypeEnum.HEART_MOMENT,
        heartMomentId,
        attachmentId,
        { signal },
      ),
    [apis, spaceId],
  );

  const storyQuery = useInfiniteQuery({
    queryKey: ['story', spaceId, cacheResourceId],
    initialPageParam: null as string | null,
    queryFn: async ({
      pageParam,
    }): Promise<ProductReadResult<ReturnType<typeof StoryPageFromJSON>>> => {
      if (pageParam === null) {
        return loadProductWithReadCache({
          accountId,
          spaceId,
          kind: 'story',
          resourceId: cacheResourceId,
          load: () =>
            apis.story.getStoryTimeline(
              storyRequest(spaceId, effectiveFilters, null),
            ),
          serialize: StoryPageToJSON,
          deserialize: (payload) => StoryPageFromJSON(payload),
        });
      }

      try {
        const value = await apis.story.getStoryTimeline(
          storyRequest(spaceId, effectiveFilters, pageParam),
        );
        return { value, source: 'network' };
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.source !== 'network') return undefined;
      return lastPage.value.hasMore && lastPage.value.nextCursor
        ? lastPage.value.nextCursor
        : undefined;
    },
    enabled: true,
    retry: false,
  });
  const discoverQuery = useQuery({
    queryKey: authorSummaryQueryKeys.discover(spaceId, accountId),
    queryFn: async () => {
      return loadProductWithReadCache({
        accountId,
        spaceId,
        kind: 'story-discover',
        resourceId: 'discover',
        load: () => apis.story.getStoryDiscover({ spaceId }),
        serialize: DiscoverSelectionToJSON,
        deserialize: (payload) => DiscoverSelectionFromJSON(payload),
      });
    },
    enabled: true,
    retry: false,
  });
  // Reuse Today's authorized #452 candidate and its canonical Query key.
  // Never manufacture a nostalgic Memory from the viewer's Story items.
  const retrospectiveQuery = useQuery({
    queryKey: dashboardQueryKey(spaceId),
    queryFn: async () => {
      if (!dashboardApi) throw new Error('Dashboard API unavailable.');
      try {
        return await dashboardApi.getDashboard({ spaceId });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    enabled: Boolean(dashboardApi),
    retry: false,
  });

  const [paginationGeneration, setPaginationGeneration] = useState(0);
  const pullRefresh = usePullToRefresh({
    enabled: true,
    blocked: storyQuery.isFetching || discoverQuery.isFetching,
    onRefresh: async () => {
      const [result] = await Promise.all([
        storyQuery.refetch(),
        discoverQuery.refetch(),
        ...(dashboardApi ? [retrospectiveQuery.refetch()] : []),
      ]);
      if (!result.isError)
        setPaginationGeneration((generation) => generation + 1);
    },
  });

  const combinedStory = useMemo(() => {
    if (!storyQuery.data) return null;
    return aggregateStoryPages(storyQuery.data.pages.map((page) => page.value));
  }, [storyQuery.data]);
  const allPagesFromNetwork =
    storyQuery.data?.pages.every((page) => page.source === 'network') ?? false;
  const offline =
    activeView === 'timeline'
      ? storyQuery.data?.pages[0]?.source === 'cache'
      : discoverQuery.data?.source === 'cache';

  useEffect(() => {
    if (!combinedStory || !allPagesFromNetwork) return;
    void saveProductReadCacheEntry({
      accountId,
      spaceId,
      kind: 'story',
      resourceId: cacheResourceId,
      value: combinedStory,
      serialize: StoryPageToJSON,
    });
  }, [accountId, allPagesFromNetwork, cacheResourceId, combinedStory, spaceId]);

  useEffect(() => {
    if (discoverQuery.data?.source !== 'network') return;
    void saveProductReadCacheEntry({
      accountId,
      spaceId,
      kind: 'story-discover',
      resourceId: 'discover',
      value: discoverQuery.data.value,
      serialize: DiscoverSelectionToJSON,
    });
  }, [accountId, spaceId, discoverQuery.data]);

  function setView(view: 'discover' | 'timeline') {
    if (view === activeView) return;
    const nextSearch = new URLSearchParams(searchParams);
    nextSearch.set('tab', view);
    setSearchParams(nextSearch);
  }

  function updateFilter<K extends keyof StoryFilters>(
    key: K,
    value: StoryFilters[K],
  ) {
    const nextFilters: StoryFilters = {
      ...filters,
      [key]: value,
    };
    const nextSearch = storyFiltersToSearch(nextFilters);
    nextSearch.set('tab', 'timeline');
    setSearchParams(nextSearch);
  }

  function resetAllFilters() {
    const nextSearch = new URLSearchParams();
    nextSearch.set('tab', 'timeline');
    setSearchParams(nextSearch);
  }

  const availableYears = useMemo(
    () => combinedStory?.availableYears ?? [],
    [combinedStory],
  );
  // A valid, applied year remains visible even when that scope has no matches.
  const dropdownYears = [
    ...new Set([...availableYears, ...(filters.year ? [filters.year] : [])]),
  ].sort((a, b) => b - a);

  const returnKey = (location.state as { taskReturnKey?: unknown } | null)
    ?.taskReturnKey;
  const candidateOrigin = resolveOrigin(returnKey);
  const returnOrigin =
    candidateOrigin?.to === taskOriginPath(location.pathname, location.search)
      ? candidateOrigin
      : null;
  const restoredEntryRef = useRef<string | null>(null);
  const [restoredTimelineEntry, setRestoredTimelineEntry] = useState<
    string | null
  >(null);
  const timelineMonthsRef = useRef<HTMLDivElement>(null);
  const paginationSentinelRef = useRef<HTMLDivElement>(null);
  const returnEntry = returnOrigin
    ? `${location.key}:${String(returnKey)}`
    : null;
  const restoringTimeline = Boolean(
    returnEntry && restoredTimelineEntry !== returnEntry,
  );
  const loadedPageCount = storyQuery.data?.pages.length ?? 1;
  useEffect(
    () => registerOriginMetadata({ loadedPageCount }),
    [loadedPageCount, registerOriginMetadata],
  );
  useEffect(() => {
    if (
      !returnOrigin ||
      (activeView === 'timeline' &&
        (!combinedStory || storyQuery.isFetching)) ||
      (activeView === 'discover' &&
        (!discoverQuery.data || discoverQuery.isFetching))
    )
      return;
    const entry = `${location.key}:${String(returnKey)}`;
    if (restoredEntryRef.current === entry) {
      setRestoredTimelineEntry(entry);
      return;
    }
    if (
      activeView === 'timeline' &&
      loadedPageCount < returnOrigin.loadedPageCount &&
      storyQuery.hasNextPage &&
      !storyQuery.isError &&
      !offline
    ) {
      void storyQuery.fetchNextPage();
      return;
    }
    let settleFrame: number | null = null;
    const findSelected = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>('[data-task-item-key]'),
      ).find(
        (element) => element.dataset.taskItemKey === returnOrigin.selectedKey,
      );
    const restorePosition = () => {
      const selected = findSelected();
      const top =
        selected && returnOrigin.selectedOffset !== undefined
          ? documentLayoutTop(selected) - returnOrigin.selectedOffset
          : returnOrigin.scrollY;
      window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
      return selected;
    };
    const frame = window.requestAnimationFrame(() => {
      const selected = restorePosition();
      const focusTarget =
        selected ??
        (returnOrigin.focusTarget === 'quick-create'
          ? Array.from(
              document.querySelectorAll<HTMLElement>('.quick-create-trigger'),
            ).find((element) => element.getClientRects().length > 0)
          : null);
      focusTarget?.focus({ preventScroll: true });

      // Browser history restoration and late layout work can settle one frame
      // after the first paint. Re-apply the exact captured offset before the
      // task origin is marked restored so return continuity stays geometry-stable.
      // Use layout coordinates so task-return geometry stays independent of
      // bounded presentation transforms. Motion ownership must never become
      // part of the scroll-restoration coordinate system.
      settleFrame = window.requestAnimationFrame(() => {
        restorePosition();
        restoredEntryRef.current = entry;
        setRestoredTimelineEntry(entry);
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (settleFrame !== null) window.cancelAnimationFrame(settleFrame);
    };
  }, [
    returnOrigin,
    combinedStory,
    loadedPageCount,
    location.key,
    returnKey,
    storyQuery.isFetching,
    storyQuery.hasNextPage,
    storyQuery.isError,
    storyQuery.fetchNextPage,
    offline,
    activeView,
    discoverQuery.data,
    discoverQuery.isFetching,
  ]);

  const timelineItems = useMemo(
    () => combinedStory?.items ?? [],
    [combinedStory],
  );
  const discoverItems = useMemo(
    () => discoverQuery.data?.value.items ?? [],
    [discoverQuery.data],
  );
  // The authoritative selection can be replaced in place by a different,
  // same-length set (e.g. after a refresh). A plain count would then never
  // change, so the reveal observer would silently skip the newly mounted
  // keyed nodes. The joined item keys change whenever composition or order
  // does, while staying stable (no replay) for an unchanged selection.
  const discoverContentKey = useMemo(
    () => discoverItems.map((item) => storyItemKey(item)).join('|'),
    [discoverItems],
  );
  const featuredItem = discoverQuery.data?.value.lead ?? null;
  const leadContext = discoverQuery.data?.value.leadContext ?? null;
  const locale = resolvedLocale();
  // A cached Discover selection from another account-day must never be
  // paired with a new Dashboard day or presented as today's retrospective.
  const discoverDay = discoverQuery.data?.value.selectionDate;
  const dashboardDay = retrospectiveQuery.data?.viewerLocalDate;
  const sameSelectionDay =
    discoverDay != null &&
    dashboardDay != null &&
    discoverDay.getTime() === dashboardDay.getTime();
  const retrospective = sameSelectionDay
    ? (retrospectiveQuery.data?.retrospective ?? null)
    : null;
  const featuredId = featuredItem
    ? featuredItem.kind === 'MEMORY'
      ? featuredItem.memory.id
      : featuredItem.kind === 'HEART_MOMENT'
        ? featuredItem.heartMoment.id
        : featuredItem.milestone.id
    : null;
  const visibleRetrospective =
    retrospective &&
    (retrospective.type === 'MEMORY' ||
      retrospective.type === 'HEART_MOMENT' ||
      retrospective.type === 'MILESTONE') &&
    !(
      featuredItem?.kind === retrospective.type &&
      featuredId === retrospective.id
    )
      ? retrospective
      : null;

  const timelineMonthGroups = useMemo(
    () => groupStoryItems(timelineItems, locale),
    [timelineItems, locale],
  );
  useTimelineReveal({
    rootRef: timelineMonthsRef,
    enabled: activeView === 'timeline' && timelineItems.length > 0,
    scopeKey: `${spaceId}:${cacheResourceId}`,
    revision: timelineItems.length,
  });

  const discoverTapestryRef = useRef<HTMLDivElement>(null);
  useDiscoverReveal({
    rootRef: discoverTapestryRef,
    enabled: activeView === 'discover' && discoverItems.length > 0,
    scopeKey: `discover:${accountId}:${spaceId}`,
    revision: `${discoverContentKey}|${visibleRetrospective?.type ?? ''}|${visibleRetrospective?.id ?? ''}`,
  });

  const nextStoryCursor = storyQuery.hasNextPage
    ? (storyQuery.data?.pages.at(-1)?.value.nextCursor ?? null)
    : null;
  const loadNextStoryPage = useCallback(async () => {
    if (
      !storyQuery.hasNextPage ||
      storyQuery.isFetchingNextPage ||
      pullRefresh.refreshing
    ) {
      return false;
    }
    const result = await storyQuery.fetchNextPage({ cancelRefetch: false });
    return !result.isError;
  }, [
    pullRefresh.refreshing,
    storyQuery.fetchNextPage,
    storyQuery.hasNextPage,
    storyQuery.isFetchingNextPage,
  ]);
  const progressivePagination = useTimelineAutoPagination({
    sentinelRef: paginationSentinelRef,
    enabled: activeView === 'timeline',
    blocked:
      (storyQuery.isFetching && !storyQuery.isFetchingNextPage) ||
      pullRefresh.refreshing ||
      restoringTimeline ||
      Boolean(offline),
    hasNextPage: Boolean(storyQuery.hasNextPage),
    isFetchingNextPage: storyQuery.isFetchingNextPage,
    cursor: nextStoryCursor,
    scopeKey: `${spaceId}:${cacheResourceId}:${paginationGeneration}`,
    loadNextPage: loadNextStoryPage,
  });

  const tapestryBands = useMemo(
    () =>
      buildTapestryBands(
        discoverItems.filter(
          (item) =>
            (!featuredItem ||
              storyItemKey(item) !== storyItemKey(featuredItem)) &&
            (!visibleRetrospective ||
              item.kind !== visibleRetrospective.type ||
              (item.kind === 'MEMORY'
                ? item.memory.id
                : item.kind === 'HEART_MOMENT'
                  ? item.heartMoment.id
                  : item.milestone.id) !== visibleRetrospective.id),
        ),
        t,
        locale,
        nicknameFor,
      ),
    [discoverItems, featuredItem, visibleRetrospective, t, locale, nicknameFor],
  );

  const curatedBands =
    visibleRetrospective && tapestryBands.length === 0
      ? [{ key: 'discover', label: '', entries: [] }]
      : tapestryBands;
  const featuredMedia =
    featuredItem?.kind === 'MEMORY'
      ? featuredItem.memory.attachments[0]
      : undefined;
  const featuredPresentation = featuredItem
    ? storyItemPresentation(featuredItem, t, nicknameFor)
    : null;
  const featuredAuthor = featuredItem ? storyItemAuthor(featuredItem) : null;
  const featuredPath = featuredItem
    ? featuredItem.kind === 'MEMORY'
      ? memoryDetailPath(featuredItem.memory.id)
      : featuredItem.kind === 'HEART_MOMENT'
        ? heartMomentDetailPath(featuredItem.heartMoment.id)
        : milestoneDetailPath(featuredItem.milestone.id)
    : '';

  /**
   * Discover's featured highlight and tapestry links have no per-item
   * loaded-range/scroll metadata to preserve (Discover is a single bounded
   * fetch, not a paginated scope), but opening an item must still capture
   * the exact tab+filter URL active at that moment. Without this, the
   * TaskOrigin fallback for an uncaptured origin resets to bare `/story`
   * on Back, which would silently discard a Timeline filter still parked
   * in the URL while the user was merely looking at Discover.
   */
  function openDiscoverItem(event: MouseEvent<HTMLAnchorElement>, to: string) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const taskOriginKey = captureOrigin();
    if (!taskOriginKey) return;
    event.preventDefault();
    void navigate(to, { state: { taskOriginKey } });
  }

  const emptyState = (
    <div className="new-space-experience">
      <div className="new-space-mark" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          width="36"
          height="36"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      </div>
      <h2 className="new-space-title">{t('story.emptyTitle')}</h2>
      <p className="new-space-body">{t('story.emptyBody')}</p>
      <div className="new-space-actions">
        <Link
          to="/story/memories/new"
          className="button-link primary new-space-cta"
        >
          {t('story.emptyAction')}
        </Link>
      </div>
    </div>
  );

  return (
    <div className="page story-page story-page-unified">
      {saved ? (
        <div className="inline-message inline-message-success" role="status">
          <strong>{t('story.savedTitle')}</strong>
          <span>{t('story.savedBody')}</span>
        </div>
      ) : null}
      {offline ? (
        <div className="inline-message" role="status">
          {t('offlineCache.banner')}
        </div>
      ) : null}

      <PullToRefreshIndicator state={pullRefresh} />

      <PageHeader
        variant="root"
        title={t('story.timelineTitle')}
        titleAction={
          <Link
            to={MEMORY_MAP_ROUTE}
            className="button-link secondary"
            onClick={(event) => openDiscoverItem(event, MEMORY_MAP_ROUTE)}
          >
            <EimirIcon name="orte" />
            {t('memoryMap.entry')}
          </Link>
        }
      />

      <div
        ref={viewTabsRef}
        className="planen-segmented"
        role="tablist"
        aria-label={t('story.viewToggleAria')}
        onKeyDown={(event) => {
          let nextView: 'discover' | 'timeline';
          if (event.key === 'Home') nextView = 'discover';
          else if (event.key === 'End') nextView = 'timeline';
          else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
            nextView = activeView === 'discover' ? 'timeline' : 'discover';
          else return;
          event.preventDefault();
          setView(nextView);
          viewTabsRef.current
            ?.querySelector<HTMLButtonElement>(`#momente-tab-${nextView}`)
            ?.focus();
        }}
      >
        {(['discover', 'timeline'] as const).map((view) => (
          <button
            key={view}
            type="button"
            role="tab"
            id={`momente-tab-${view}`}
            aria-selected={activeView === view}
            aria-controls={`momente-panel-${view}`}
            tabIndex={activeView === view ? 0 : -1}
            className={`planen-segment ${activeView === view ? 'is-active' : ''}`}
            onClick={() => setView(view)}
          >
            {t(view === 'discover' ? 'story.tabDiscover' : 'story.tabTimeline')}
          </button>
        ))}
      </div>

      <div
        id="momente-panel-discover"
        role="tabpanel"
        aria-labelledby="momente-tab-discover"
        hidden={activeView !== 'discover'}
      >
        {activeView === 'discover' && discoverQuery.isLoading ? (
          <UiState kind="loading" title={t('story.loadingAria')} />
        ) : null}
        {activeView === 'discover' && discoverQuery.error ? (
          <ProblemState
            error={discoverQuery.error}
            onRetry={() => void discoverQuery.refetch()}
          />
        ) : null}
        {activeView === 'discover' &&
        discoverQuery.data &&
        !featuredItem &&
        discoverItems.length === 0
          ? emptyState
          : null}
        {activeView === 'discover' &&
        discoverQuery.data &&
        (featuredItem || discoverItems.length > 0) ? (
          <section
            className="momente-discover-page"
            aria-labelledby="momente-tab-discover"
          >
            {/* 1. Featured Editorial Highlight */}
            {featuredItem && featuredPresentation ? (
              <article className="momente-hero-highlight">
                <Link
                  to={featuredPath}
                  className={`momente-hero-link ${featuredMedia ? 'has-media' : ''}`}
                  aria-label={`${t('story.featuredHighlight')}: ${featuredPresentation.title}`}
                  onClick={(event) => openDiscoverItem(event, featuredPath)}
                >
                  {featuredMedia ? (
                    <div className="momente-hero-media">
                      <MemoryPreview
                        memoryId={
                          featuredItem.kind === 'MEMORY'
                            ? featuredItem.memory.id
                            : ''
                        }
                        attachmentId={featuredMedia.id}
                        isSensitive={featuredMedia.isSensitive}
                        loadImage={loadMemoryImage}
                        loadingMode="immediate"
                      />
                    </div>
                  ) : null}
                  <div className="momente-hero-body">
                    <span className="momente-hero-kicker">
                      <svg
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        fill="currentColor"
                        aria-hidden="true"
                        className="kicker-icon"
                      >
                        <path d="M12 2l2.4 7.4h7.6l-6.1 4.5 2.3 7.1-6.2-4.5-6.2 4.5 2.3-7.1-6.1-4.5h7.6z" />
                      </svg>
                      <span>
                        {leadContext?.type === 'ON_THIS_DAY' && sameSelectionDay
                          ? t('story.onThisDay', {
                              count: leadContext.yearsAgo,
                            })
                          : t('story.featuredKicker')}
                      </span>
                    </span>
                    {featuredItem.kind === 'HEART_MOMENT' ? (
                      <blockquote className="momente-hero-quote">
                        "{featuredPresentation.title}"
                      </blockquote>
                    ) : (
                      <h3 className="momente-hero-title">
                        {featuredPresentation.title}
                      </h3>
                    )}
                    <div className="momente-hero-meta">
                      {!featuredPresentation.titleIsDate ? (
                        <time
                          dateTime={featuredItem.effectiveDate
                            .toISOString()
                            .slice(0, 10)}
                        >
                          {formatStoryDate(featuredItem.effectiveDate, locale)}
                        </time>
                      ) : null}
                      {featuredAuthor ? (
                        <span className="momente-author-meta">
                          <AuthorAvatar
                            author={featuredAuthor}
                            profilesApi={profilesApi}
                            spaceId={spaceId}
                          />
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </article>
            ) : null}

            {/* 2. Keepsake / Editorial Tapestry — an asymmetric mixed archive,
              not a fixed-width carousel of equal cards. Column height is the
              item's real content height, so a photo memory naturally takes
              more visual area than a short note or a milestone marker. */}
            <section
              className="momente-tapestry-section"
              aria-labelledby="momente-tapestry-heading"
            >
              <div className="momente-tapestry-bands" ref={discoverTapestryRef}>
                {curatedBands.map((band) => (
                  <section
                    className="momente-tapestry-band"
                    key={band.key}
                    aria-labelledby={`momente-band-${band.key}`}
                  >
                    {band.label ? (
                      <h4
                        id={`momente-band-${band.key}`}
                        className="momente-band-heading"
                      >
                        {band.label}
                      </h4>
                    ) : null}
                    <div className="momente-tapestry">
                      {visibleRetrospective ? (
                        <StoryRetrospective
                          compact
                          item={visibleRetrospective}
                          loadMemoryImage={loadMemoryImage}
                          onOpen={openDiscoverItem}
                        />
                      ) : null}
                      {band.entries.map((entry) => {
                        const {
                          role,
                          presentation,
                          path,
                          dateTime,
                          dateLabel,
                        } = entry;

                        if (role === 'milestone') {
                          return (
                            <Link
                              key={entry.key}
                              to={path}
                              className="momente-tapestry-item momente-tapestry-milestone momente-tapestry-reveal"
                              data-discover-reveal-key={`item:${entry.key}`}
                              aria-label={`${t(`storyItem.${role}`)}: ${presentation.title}`}
                              onClick={(event) => openDiscoverItem(event, path)}
                            >
                              <span
                                className="momente-tapestry-milestone-icon"
                                aria-hidden="true"
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  width="16"
                                  height="16"
                                  fill="currentColor"
                                  aria-hidden="true"
                                >
                                  <path d="M12 2l2.4 7.4h7.6l-6.1 4.5 2.3 7.1-6.2-4.5-6.2 4.5 2.3-7.1-6.1-4.5h7.6z" />
                                </svg>
                              </span>
                              <span className="momente-tapestry-milestone-copy">
                                <span className="momente-tapestry-milestone-title">
                                  {presentation.title}
                                </span>
                                <time
                                  className="momente-tapestry-milestone-date"
                                  dateTime={dateTime}
                                >
                                  {dateLabel}
                                </time>
                              </span>
                            </Link>
                          );
                        }

                        return (
                          <Link
                            key={entry.key}
                            to={path}
                            className={`momente-tapestry-item momente-tapestry-${role} momente-tapestry-reveal`}
                            data-discover-reveal-key={`item:${entry.key}`}
                            aria-label={`${t(`storyItem.${role}`)}: ${presentation.title}`}
                            onClick={(event) => openDiscoverItem(event, path)}
                          >
                            {role === 'media' && entry.firstAttachment ? (
                              <div className="momente-tapestry-media-frame">
                                <MemoryPreview
                                  memoryId={entry.memoryId}
                                  attachmentId={entry.firstAttachment.id}
                                  isSensitive={
                                    entry.firstAttachment.isSensitive
                                  }
                                  loadImage={loadMemoryImage}
                                  loadingMode="near-viewport"
                                />
                              </div>
                            ) : null}
                            <div className="momente-tapestry-body">
                              <span
                                className="momente-tapestry-kind"
                                aria-hidden="true"
                              >
                                <EimirIcon
                                  name={
                                    role === 'note' ? 'momente' : 'erinnerungen'
                                  }
                                />
                              </span>
                              {role === 'note' ? (
                                <blockquote className="momente-tapestry-quote">
                                  "{presentation.title}"
                                </blockquote>
                              ) : (
                                <h4 className="momente-tapestry-title">
                                  {presentation.title}
                                </h4>
                              )}
                              <div className="momente-tapestry-meta">
                                {!presentation.titleIsDate ? (
                                  <time dateTime={dateTime}>{dateLabel}</time>
                                ) : null}
                                {entry.author ? (
                                  <span className="momente-author-meta">
                                    <AuthorAvatar
                                      author={entry.author}
                                      profilesApi={profilesApi}
                                      spaceId={spaceId}
                                    />
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </section>
          </section>
        ) : null}
      </div>
      <div
        id="momente-panel-timeline"
        role="tabpanel"
        aria-labelledby="momente-tab-timeline"
        hidden={activeView !== 'timeline'}
      >
        {activeView === 'timeline' && storyQuery.isLoading ? (
          <UiState kind="loading" title={t('story.loadingAria')} />
        ) : null}
        {activeView === 'timeline' && storyQuery.error ? (
          <ProblemState
            error={storyQuery.error}
            onRetry={() => void storyQuery.refetch()}
          />
        ) : null}
        {activeView === 'timeline' &&
        storyQuery.data &&
        timelineItems.length === 0 &&
        availableYears.length === 0 &&
        !hasActiveFilters
          ? emptyState
          : null}
        <section
          id="momente-diary"
          aria-labelledby="momente-tab-timeline"
          className="momente-diary-section"
        >
          <header className="momente-section-header">
            <button
              type="button"
              className={`story-filter-toggle story-filter-icon-button story-task-filter-trigger ${hasActiveFilters ? 'is-active' : ''}`}
              ref={filterTriggerRef}
              aria-haspopup="dialog"
              aria-expanded={mobileFiltersOpen}
              aria-controls="story-filter-panel"
              aria-label={t('storyFilters.toggleButton')}
              title={t('storyFilters.toggleButton')}
              onClick={() => {
                setDraftFilters(filters);
                setMobileFiltersOpen(true);
              }}
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 4h18l-7 8v7l-4 2v-9L3 4Z" />
              </svg>
              {hasActiveFilters ? (
                <span className="story-filter-active-badge" aria-hidden="true">
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
          </header>
          <StoryBrowseLayer
            onOpen={(event, path) => {
              if (
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              event.preventDefault();
              const taskOriginKey = captureOrigin();
              void navigate(path, { state: { taskOriginKey } });
            }}
          />
          {activeView === 'timeline' &&
          combinedStory &&
          (timelineItems.length > 0 ||
            availableYears.length > 0 ||
            hasActiveFilters) ? (
            <div className="layout-single-column">
              <div className="story-filter-container">
                <ShortTaskSheet
                  ref={filterSheetRef}
                  id="story-filter-panel"
                  open={mobileFiltersOpen}
                  title={t('storyFilters.aria')}
                  onClose={() => setMobileFiltersOpen(false)}
                  restoreFocusRef={filterTriggerRef}
                  className="story-task-filter-sheet"
                >
                  <section
                    className="story-filter-bar"
                    aria-label={t('storyFilters.aria')}
                  >
                    <div className="story-filter-group">
                      <label htmlFor="story-filter-type">
                        {t('storyFilters.type')}
                      </label>
                      <select
                        id="story-filter-type"
                        name="type"
                        value={draftFilters.kind ?? ''}
                        onChange={(e) =>
                          setDraftFilters((draft) => ({
                            ...draft,
                            kind: isStoryKind(e.target.value)
                              ? e.target.value
                              : null,
                          }))
                        }
                      >
                        <option value="">{t('storyFilters.allTypes')}</option>
                        <option value={StoryKind.MEMORY}>
                          {t('story.kind.memory')}
                        </option>
                        <option value={StoryKind.HEART_MOMENT}>
                          {t('story.kind.heartMoment')}
                        </option>
                        <option value={StoryKind.MILESTONE}>
                          {t('story.kind.milestone')}
                        </option>
                      </select>
                    </div>
                    <div className="story-filter-group">
                      <label htmlFor="story-filter-year">
                        {t('storyFilters.year')}
                      </label>
                      <select
                        id="story-filter-year"
                        name="year"
                        value={draftFilters.year ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDraftFilters((draft) => ({
                            ...draft,
                            year: val ? Number(val) : null,
                          }));
                        }}
                      >
                        <option value="">{t('storyFilters.anyYear')}</option>
                        {dropdownYears.map((year) => (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="story-filter-group">
                      <label htmlFor="story-filter-order">
                        {t('storyFilters.order')}
                      </label>
                      <select
                        id="story-filter-order"
                        name="order"
                        value={draftFilters.order}
                        onChange={(e) =>
                          setDraftFilters((draft) => ({
                            ...draft,
                            order:
                              e.target.value === StoryOrder.ASC
                                ? StoryOrder.ASC
                                : StoryOrder.DESC,
                          }))
                        }
                      >
                        <option value={StoryOrder.DESC}>
                          {t('storyFilters.newest')}
                        </option>
                        <option value={StoryOrder.ASC}>
                          {t('storyFilters.oldest')}
                        </option>
                      </select>
                    </div>
                    {(draftFilters.kind ||
                      draftFilters.year ||
                      draftFilters.order !== StoryOrder.DESC) && (
                      <button
                        type="button"
                        className="story-filter-reset-header-action"
                        onClick={() => setDraftFilters(DEFAULT_STORY_FILTERS)}
                      >
                        {t('storyFilters.reset')}
                      </button>
                    )}
                  </section>

                  <div className="short-task-sheet-actions">
                    <button
                      type="button"
                      onClick={() => {
                        filterSheetRef.current?.closeForNavigation(() => {
                          const next = storyFiltersToSearch(draftFilters);
                          next.set('tab', 'timeline');
                          setSearchParams(next);
                        });
                      }}
                    >
                      {t('storyFilters.apply')}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        filterSheetRef.current?.closeForNavigation(() =>
                          filterTriggerRef.current?.focus({
                            preventScroll: true,
                          }),
                        )
                      }
                    >
                      {t('taskSheets.filterCancel')}
                    </button>
                  </div>
                </ShortTaskSheet>
                {hasActiveFilters && (
                  <div
                    className="story-active-chips story-task-active-scope"
                    role="status"
                    aria-live="polite"
                  >
                    {filters.kind && (
                      <button
                        type="button"
                        className="active-chip"
                        onClick={() => updateFilter('kind', null)}
                        aria-label={`${t('storyFilters.removeFilter')}: ${resolveStoryKindLabel(filters.kind, t)}`}
                      >
                        <span>{resolveStoryKindLabel(filters.kind, t)}</span>
                        <span className="chip-remove" aria-hidden="true">
                          ✕
                        </span>
                      </button>
                    )}
                    {filters.year && (
                      <button
                        type="button"
                        className="active-chip"
                        onClick={() => updateFilter('year', null)}
                        aria-label={`${t('storyFilters.removeFilter')}: ${filters.year}`}
                      >
                        <span>{filters.year}</span>
                        <span className="chip-remove" aria-hidden="true">
                          ✕
                        </span>
                      </button>
                    )}
                    {filters.order === StoryOrder.ASC && (
                      <button
                        type="button"
                        className="active-chip"
                        onClick={() => updateFilter('order', StoryOrder.DESC)}
                        aria-label={`${t('storyFilters.removeFilter')}: ${t('storyFilters.oldest')}`}
                      >
                        <span>{t('storyFilters.oldest')}</span>
                        <span className="chip-remove" aria-hidden="true">
                          ✕
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="layout-main">
                <section
                  className="story-surface"
                  aria-labelledby="timeline-heading"
                >
                  <h2 id="timeline-heading" className="sr-only">
                    {t('story.timelineHeading')}
                  </h2>

                  {timelineItems.length === 0 ? (
                    <div className="story-filter-empty-state">
                      <p className="story-filter-empty-text">
                        {t('storyFilters.noMatches')}
                      </p>
                      <button
                        type="button"
                        className="button secondary compact-action"
                        onClick={resetAllFilters}
                      >
                        {t('storyFilters.noMatchesAction')}
                      </button>
                    </div>
                  ) : (
                    <>
                      <div
                        ref={timelineMonthsRef}
                        className="story-year-months story-timeline-months"
                      >
                        {timelineMonthGroups.map((group) => (
                          <section
                            key={group.key}
                            className="story-year-month"
                            aria-labelledby={`story-timeline-month-${group.key}`}
                          >
                            <header
                              className="story-year-month-header story-timeline-progressive-reveal story-timeline-heading-reveal"
                              data-timeline-reveal-key={`month:${group.key}`}
                            >
                              <h2 id={`story-timeline-month-${group.key}`}>
                                {group.label}
                              </h2>
                            </header>
                            <StoryList
                              items={group.items}
                              loadMemoryImage={loadMemoryImage}
                              loadHeartMomentImage={loadHeartMomentImage}
                              profilesApi={profilesApi}
                              spaceId={spaceId}
                              currentAccountId={accountId}
                              progressiveReveal
                              onOpenItem={(event, item, to) => {
                                if (
                                  event.button !== 0 ||
                                  event.metaKey ||
                                  event.ctrlKey ||
                                  event.shiftKey ||
                                  event.altKey
                                )
                                  return;
                                const taskOriginKey = captureOrigin({
                                  selectedKey: storyItemKey(item),
                                  selectedOffset:
                                    event.currentTarget.getBoundingClientRect()
                                      .top,
                                  loadedPageCount,
                                });
                                if (!taskOriginKey) return;
                                event.preventDefault();
                                void navigate(to, { state: { taskOriginKey } });
                              }}
                            />
                          </section>
                        ))}
                      </div>

                      {storyQuery.hasNextPage ? (
                        <>
                          <div
                            ref={paginationSentinelRef}
                            className="story-pagination-sentinel"
                            aria-hidden="true"
                          />
                          <div
                            className={`story-pagination story-pagination-progressive ${progressivePagination.manualFallback ? 'is-retry' : ''}`}
                            data-pagination-mode={
                              progressivePagination.manualFallback
                                ? 'manual-retry'
                                : 'automatic'
                            }
                          >
                            {storyQuery.isFetchingNextPage ? (
                              <span
                                className="story-pagination-status"
                                role="status"
                                aria-live="polite"
                              >
                                <span
                                  className="story-pagination-spinner"
                                  aria-hidden="true"
                                />
                                {t('storyFilters.loadingMore')}
                              </span>
                            ) : progressivePagination.manualFallback ? (
                              <button
                                type="button"
                                className="secondary"
                                onClick={() =>
                                  void progressivePagination.retry()
                                }
                                disabled={
                                  storyQuery.isFetching ||
                                  pullRefresh.refreshing
                                }
                              >
                                {t('storyFilters.loadMore')}
                              </button>
                            ) : null}
                          </div>
                        </>
                      ) : null}
                    </>
                  )}
                </section>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
