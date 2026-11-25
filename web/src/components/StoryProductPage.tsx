import {
  type QueryStatus,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import type { DashboardApi } from '../api/generated/apis/DashboardApi';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import type { RecapsApi } from '../api/generated/apis/RecapsApi';
import { AttachmentReadRequestParentTypeEnum } from '../api/generated/models/AttachmentReadRequest';
import type { AuthorSummary } from '../api/generated/models/AuthorSummary';
import {
  DiscoverSelectionFromJSON,
  DiscoverSelectionToJSON,
} from '../api/generated/models/DiscoverSelection';
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
import { assertOnlineWrite } from '../client/connectivity';
import { dashboardQueryKey } from '../client/dashboardQueries';
import { storyEntryTone } from '../client/entryTone';
import { useFirstContentSettle } from '../client/firstContentSettle';
import { galleryCover } from '../client/galleryCover';
import type { ObjectUrlSource } from '../client/objectUrlResource';
import { usePartnerNickname } from '../client/partnerNickname';
import { usePrimaryTabPeeked } from '../client/primaryTabPeek';
import { photoShape } from '../client/photoShape';
import {
  type ClientProblemError,
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';
import {
  loadProductWithReadCache,
  type ProductReadResult,
  saveProductReadCacheEntry,
} from '../client/productReadCache';
import { useHideProFeatureMarks } from '../client/proPresentation';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { newNoteOpen, useQuietHint } from '../client/quietHints';
import type { ReferenceApis } from '../client/referenceFlow';
import { useRootTabIntro } from '../client/rootTabIntro';
import {
  appRoutePath,
  heartMomentDetailPath,
  MEMORY_CREATE_ROUTE,
  MEMORY_MAP_ROUTE,
  memoryDetailPath,
  milestoneDetailPath,
  STORY_OURS_ROUTE,
  STORY_PHOTOS_ROUTE,
  STORY_CHAPTERS_ROUTE,
} from '../client/routes';
import { loadAuthorizedStoryImageResource } from '../client/storyMediaLoader';
import {
  aggregateStoryPages,
  DEFAULT_STORY_FILTERS,
  parseStoryFilters,
  type StoryFilters,
  storyCacheResourceId,
  storyFiltersToSearch,
  storyRequest,
} from '../client/storyProduct';
import type { StoryStartupReads } from '../client/storyStartup';
import { useOpenTaskLink, useTaskOrigin } from '../client/taskOrigin';
import { useDiaryLayout } from '../client/useDiaryLayout';
import { useTaskListReturn } from '../client/useTaskListReturn';
import { resolvedLocale, useTranslation } from '../i18n';
import { CoupleExperienceLinks } from './CoupleExperienceLinks';
import { FirstStepAction } from './FirstStepAction';
import { useKeepsakeSway } from './useKeepsakeSway';
import './FirstContentSettle.css';
import { DiaryChapterPeriods } from './DiaryChapterPeriods';
import { DiscoverStory } from './DiscoverStory';
import { MemoryPreview } from './MemoryPreview';
import { MomentCreateMenu } from './MomentCreateMenu';
import { useAppLayout } from '../client/wirDesign';
import { PageHeader } from './PageHeader';
import { EimirIcon } from './EimirIcon';
import { ProblemState } from './ProblemState';
import { PullToRefreshIndicator } from './PullToRefreshIndicator';
import { QuietHint } from './QuietHint';
import { RecapDiscoverLead } from './RecapDiscoverLead';
import {
  RediscoverySecondaryLine,
  useRediscoveryWording,
} from './RediscoveryWording';
import {
  calendarDayOf,
  storyRediscoverySource,
  viewerToday,
} from './rediscoverySelection';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import { type StoryView, StoryViewTabs } from './StoryViewTabs';
import './StoryUnifiedPage.css';
import './StoryHandmade.css';
import './StoryHandmadeChapters.css';
import './StoryHandmadeDiscover.css';
import './PlanningReference.css';
import { groupDiaryEntries } from '../client/diaryEntries';
import { DiaryList } from './DiaryList';
import './StoryTaskFilters.css';
import './StoryYearsPage.css';
import type { MemoryMapSession } from '../client/memoryMapSession';
import { parseMapPlace } from '../client/photoPlaces';
import {
  formatStoryDate,
  resolveStoryKindLabel,
  storyItemKey,
  storyItemPresentation,
} from './storyPresentation';
import { UiState } from './UiState';
import { MemoryWorldSwitch } from './MemoryWorldSwitch';
import { MemoryWorldView } from './memoryWorlds/MemoryWorldView';
import { WorldEnter } from './memoryWorlds/WorldEnter';
import { useMemoryWorld } from '../client/memoryWorldContext';
import {
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

export function StoryProductPage({
  apis,
  active = true,
  accountId,
  spaceId,
  loadMemoryImage,
  profilesApi,
  dashboardApi,
  recapsApi,
  startupReads,
  mapSession,
}: {
  apis: ReferenceApis;
  /** A kept or previewed panel retains its data while the active route owns input. */
  active?: boolean;
  accountId: string;
  spaceId: string;
  loadMemoryImage: (
    memoryId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ) => Promise<ObjectUrlSource>;
  profilesApi?: ProfilesApi;
  dashboardApi?: DashboardApi;
  recapsApi?: RecapsApi;
  startupReads?: Extract<StoryStartupReads, { kind: 'diary' }>;
  /** The map's session memory: the Karte segment reopens its Place. */
  mapSession?: MemoryMapSession;
}) {
  const rootIntro = useRootTabIntro<HTMLDivElement>('story');
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [renewing, setRenewing] = useState(false);
  const [renewProblem, setRenewProblem] = useState<ClientProblemError | null>(
    null,
  );
  const [renewed, setRenewed] = useState(false);
  const renewal = useRef<AbortController | null>(null);
  const scope = JSON.stringify([accountId, spaceId]);
  const liveScope = useRef(scope);
  liveScope.current = scope;
  useEffect(() => {
    const current = scope;
    return () => {
      if (current) renewal.current?.abort();
    };
  }, [scope]);
  const { nicknameFor } = usePartnerNickname();
  const layout = useAppLayout();
  const location = useLocation();
  const saved =
    active && Boolean((location.state as { saved?: boolean } | null)?.saved);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { captureOrigin } = useTaskOrigin();
  /**
   * Discover's featured highlight and tapestry links have no per-item
   * loaded-range/scroll metadata to preserve (Discover is a single bounded
   * fetch, not a paginated scope), but opening an item must still capture
   * the exact tab+filter URL active at that moment. Without this, the
   * TaskOrigin fallback for an uncaptured origin resets to bare `/story`
   * on Back, which would silently discard a Timeline filter still parked
   * in the URL while the user was merely looking at Discover.
   */
  const openDiscoverItem = useOpenTaskLink();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const filterSheetRef = useRef<ShortTaskSheetHandle>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  // Chosen in Mehr > Einstellungen > Darstellung; read-only here.
  const [diaryLayout] = useDiaryLayout();
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
  // A primary selection opens Discover. The parked Timeline keeps its URL,
  // filters and mounted content for Back, even while a swipe previews Discover.
  // A parked panel nobody sees keeps showing its own view: it must not mount
  // Discover content (and read its recap) before it is revealed.
  const peeked = usePrimaryTabPeeked(appRoutePath('story'));
  const displayedView = active || !peeked ? activeView : 'discover';
  // Discover does not inherit the retained Timeline scope.
  const effectiveFilters = filters;
  const cacheResourceId = useMemo(
    () => storyCacheResourceId(effectiveFilters),
    [effectiveFilters],
  );
  const loadHeartMomentImage = useCallback(
    (
      heartMomentId: string,
      attachmentId: string,
      signal?: AbortSignal,
      variant?: 'original' | 'thumbnail',
      persist?: boolean,
    ) =>
      loadAuthorizedStoryImageResource(
        apis,
        spaceId,
        AttachmentReadRequestParentTypeEnum.HEART_MOMENT,
        heartMomentId,
        attachmentId,
        { signal, variant, persist },
      ),
    [apis, spaceId],
  );

  // A first swipe preview can load its content. Once populated, a retained
  // panel displays that snapshot and resumes revalidation when opened.
  const needsRead = (query: { state: { status: QueryStatus } }) =>
    active || query.state.status === 'pending';
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
            startupReads?.takeTimeline() ??
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
    enabled: needsRead,
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
        load: () =>
          startupReads?.takeDiscover() ??
          apis.story.getStoryDiscover({ spaceId }),
        serialize: DiscoverSelectionToJSON,
        deserialize: (payload) => DiscoverSelectionFromJSON(payload),
      });
    },
    enabled: needsRead,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval:
      activeView === 'discover' && !renewing ? 15 * 60_000 : false,
    retry: false,
  });
  // Use the server's viewer day for the featured lead and recap invitation.
  const dashboardQuery = useQuery({
    queryKey: dashboardQueryKey(spaceId),
    queryFn: async () => {
      if (!dashboardApi) throw new Error('Dashboard API unavailable.');
      try {
        return await dashboardApi.getDashboard({ spaceId });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    enabled: (query) => Boolean(dashboardApi) && needsRead(query),
    refetchOnWindowFocus: 'always',
    refetchInterval:
      activeView === 'discover' && !renewing ? 15 * 60_000 : false,
    retry: false,
  });

  const [paginationGeneration, setPaginationGeneration] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  async function refreshStory() {
    setRefreshing(true);
    try {
      const [result] = await Promise.all([
        storyQuery.refetch(),
        renewSelection(),
        ...(dashboardApi ? [dashboardQuery.refetch()] : []),
      ]);
      if (!result.isError)
        setPaginationGeneration((generation) => generation + 1);
    } finally {
      setRefreshing(false);
    }
  }

  const combinedStory = useMemo(() => {
    if (!storyQuery.data) return null;
    return aggregateStoryPages(storyQuery.data.pages.map((page) => page.value));
  }, [storyQuery.data]);
  const allPagesFromNetwork =
    storyQuery.data?.pages.every((page) => page.source === 'network') ?? false;
  const offline =
    displayedView === 'timeline'
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

  function setView(view: StoryView) {
    if (view === 'map') {
      const taskOriginKey = captureOrigin();
      const retained = storyFiltersToSearch(filters);
      // The segment returns to the Place the couple last selected on the map
      // (Product Owner decision 2026-11-20, #2078).
      const keptPlace = mapSession?.place;
      if (keptPlace && parseMapPlace(keptPlace))
        retained.set('place', keptPlace);
      const retainedFilters = retained.toString();
      void navigate(
        `${MEMORY_MAP_ROUTE}${retainedFilters ? `?${retainedFilters}` : ''}`,
        { state: { taskOriginKey, focusStoryView: true } },
      );
      return;
    }
    const nextSearch = new URLSearchParams(searchParams);
    nextSearch.set('tab', view);
    setSearchParams(nextSearch, {
      state: { ...location.state, focusStoryView: true },
    });
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

  const timelineMonthsRef = useRef<HTMLDivElement>(null);
  const paginationSentinelRef = useRef<HTMLDivElement>(null);
  const loadedPageCount = storyQuery.data?.pages.length ?? 1;
  const restoringTimeline = useTaskListReturn({
    ready:
      active &&
      (activeView === 'timeline'
        ? Boolean(combinedStory)
        : Boolean(discoverQuery.data)),
    busy:
      activeView === 'timeline'
        ? storyQuery.isFetching
        : discoverQuery.isFetching,
    loadedPageCount,
    canLoadMore:
      activeView === 'timeline' &&
      Boolean(storyQuery.hasNextPage) &&
      !storyQuery.isError &&
      !offline,
    loadMore: storyQuery.fetchNextPage,
  });

  const timelineItems = useMemo(
    () => combinedStory?.items ?? [],
    [combinedStory],
  );
  const discoverItems = useMemo(
    () => discoverQuery.data?.value.items ?? [],
    [discoverQuery.data],
  );
  const discoverDenied = ['unauthorized', 'permission', 'notFound'].includes(
    clientProblemKind(discoverQuery.error ?? renewProblem),
  );
  const discoverError =
    discoverQuery.error ?? (discoverDenied ? renewProblem : null);
  const featuredItem = discoverQuery.data?.value.lead ?? null;
  const memoryWorld = useMemoryWorld()?.world ?? 'story';
  const leadContext = discoverQuery.data?.value.leadContext ?? null;
  const locale = resolvedLocale();
  // Only show the anniversary label when the selection matches the viewer day.
  const discoverDay = discoverQuery.data?.value.selectionDate;
  const dashboardDay = dashboardQuery.data?.viewerLocalDate;
  // #1907 F4: a new monthly recap leads the experiences only until opened,
  // on the same viewer day and receipt as the Wir invitation.
  const recapLead = recapsApi ? (
    <RecapDiscoverLead
      api={recapsApi}
      today={dashboardDay ?? new Date()}
      mediaApis={apis}
      account={{ id: accountId }}
      spaceId={spaceId}
      onOpen={openDiscoverItem}
    />
  ) : null;
  const sameSelectionDay =
    discoverDay != null &&
    dashboardDay != null &&
    discoverDay.getTime() === dashboardDay.getTime();

  const timelineChapterMarkers = useMemo(
    () => (filters.kind ? [] : (combinedStory?.chapterMarkers ?? [])),
    [combinedStory, filters.kind],
  );
  const timelineEntryCount =
    timelineItems.length + timelineChapterMarkers.length;
  const timelineMonthGroups = useMemo(
    () =>
      groupDiaryEntries(
        timelineItems,
        timelineChapterMarkers,
        locale,
        filters.kind ? [] : (combinedStory?.chapterPeriods ?? []),
        filters.year,
      ),
    [
      timelineItems,
      timelineChapterMarkers,
      locale,
      combinedStory?.chapterPeriods,
      filters.kind,
      filters.year,
    ],
  );
  useTimelineReveal({
    rootRef: timelineMonthsRef,
    enabled: activeView === 'timeline' && timelineEntryCount > 0,
    scopeKey: `${spaceId}:${cacheResourceId}`,
    revision: timelineEntryCount,
  });

  const nextStoryCursor = storyQuery.hasNextPage
    ? (storyQuery.data?.pages.at(-1)?.value.nextCursor ?? null)
    : null;
  const loadNextStoryPage = useCallback(async () => {
    if (
      !storyQuery.hasNextPage ||
      storyQuery.isFetchingNextPage ||
      refreshing
    ) {
      return false;
    }
    const result = await storyQuery.fetchNextPage({ cancelRefetch: false });
    return !result.isError;
  }, [
    refreshing,
    storyQuery.fetchNextPage,
    storyQuery.hasNextPage,
    storyQuery.isFetchingNextPage,
  ]);
  const progressivePagination = useTimelineAutoPagination({
    sentinelRef: paginationSentinelRef,
    enabled: active && activeView === 'timeline',
    blocked:
      (storyQuery.isFetching && !storyQuery.isFetchingNextPage) ||
      refreshing ||
      restoringTimeline ||
      Boolean(offline),
    hasNextPage: Boolean(storyQuery.hasNextPage),
    isFetchingNextPage: storyQuery.isFetchingNextPage,
    cursor: nextStoryCursor,
    scopeKey: `${spaceId}:${cacheResourceId}:${paginationGeneration}`,
    loadNextPage: loadNextStoryPage,
  });

  const curatedItems = useMemo(() => {
    if (!featuredItem) return discoverItems;
    const featuredKey = storyItemKey(featuredItem);
    return discoverItems.filter((item) => storyItemKey(item) !== featuredKey);
  }, [discoverItems, featuredItem]);

  const featuredMedia =
    featuredItem?.kind === 'MEMORY'
      ? galleryCover(featuredItem.memory)
      : undefined;
  const featuredPresentation = featuredItem
    ? storyItemPresentation(featuredItem, t, nicknameFor)
    : null;
  const _featuredAuthor = featuredItem ? storyItemAuthor(featuredItem) : null;
  const featuredTone = featuredItem
    ? storyEntryTone(featuredItem, Boolean(featuredMedia))
    : undefined;
  const featuredSwayRef = useKeepsakeSway<HTMLDivElement>(
    diaryLayout === 'album' && featuredTone === 'playful',
  );
  const onThisDayKicker =
    leadContext?.type === 'ON_THIS_DAY' && sameSelectionDay;
  // #1790 C2: varying wording instead of a bare date as the title. A heart
  // moment keeps its own (compacted) words as the quote headline.
  const featuredWording = useRediscoveryWording(
    featuredItem && featuredPresentation
      ? {
          ...storyRediscoverySource(
            featuredItem,
            discoverQuery.data?.value.leadRediscovery,
          ),
          ...(featuredItem.kind === 'HEART_MOMENT'
            ? { authoredHeadline: featuredPresentation.title }
            : {}),
        }
      : null,
    {
      today: discoverDay ? calendarDayOf(discoverDay) : viewerToday(),
      // The kicker already says "Heute vor N Jahren".
      exclude: onThisDayKicker ? ['relativeTime'] : [],
    },
  );
  const featuredHeadline =
    featuredWording?.headline ?? featuredPresentation?.title ?? '';
  const featuredPath = featuredItem
    ? featuredItem.kind === 'MEMORY'
      ? memoryDetailPath(featuredItem.memory.id)
      : featuredItem.kind === 'HEART_MOMENT'
        ? heartMomentDetailPath(featuredItem.heartMoment.id)
        : milestoneDetailPath(featuredItem.milestone.id)
    : '';

  async function renewSelection() {
    if (renewal.current) return;
    const mayReconcile = captureAuthorizedQuery(
      queryClient,
      authorSummaryQueryKeys.discover(spaceId, accountId),
    );
    const controller = new AbortController();
    renewal.current = controller;
    setRenewing(true);
    setRenewProblem(null);
    setRenewed(false);
    try {
      await queryClient.cancelQueries({
        queryKey: authorSummaryQueryKeys.discover(spaceId, accountId),
        exact: true,
      });
      assertOnlineWrite();
      if (controller.signal.aborted || liveScope.current !== scope) return;
      const value = await apis.story.renewStoryDiscover(
        { spaceId },
        { signal: controller.signal },
      );
      if (controller.signal.aborted || liveScope.current !== scope) return;
      if (!mayReconcile()) return;
      queryClient.setQueryData(
        authorSummaryQueryKeys.discover(spaceId, accountId),
        { value, source: 'network' },
      );
      setRenewed(true);
    } catch (error) {
      const problem = await normalizeClientError(error);
      if (!controller.signal.aborted && liveScope.current === scope)
        setRenewProblem(problem);
    } finally {
      if (renewal.current === controller) renewal.current = null;
      if (!controller.signal.aborted && liveScope.current === scope)
        setRenewing(false);
    }
  }

  const filterTrigger = (
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
        className="inline-icon"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
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
  );

  const emptyState = (
    <div className="new-space-experience">
      <div className="new-space-mark" aria-hidden="true">
        <svg
          className="inline-icon"
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
      <FirstStepAction
        to={MEMORY_CREATE_ROUTE}
        label={t('story.emptyAction')}
        icon="foto"
        selectedKey="story-first-moment"
      />
    </div>
  );

  // #1907 I1: the first moment settles in where the empty state stood.
  const discoverHasContent = Boolean(featuredItem || discoverItems.length > 0);
  const discoverSettle = useFirstContentSettle(
    discoverQuery.data && !discoverDenied ? !discoverHasContent : undefined,
  );
  // "New in eimir." for a Pro feature is shown only where it is usable.
  const proActive = useHideProFeatureMarks();
  const newsHint = useQuietHint(accountId, spaceId, [
    {
      id: 'new:waymarks',
      eligible:
        activeView === 'discover' &&
        discoverHasContent &&
        proActive &&
        newNoteOpen('waymarks'),
    },
  ]);

  // The rediscovery lead (`story.featuredKicker`) opens the Fotostory as its
  // first slide; its polaroid develops on the slide instead of hanging above
  // the story. The story's open link opens it, so the composition holds no
  // link.
  const storyLead =
    featuredItem && featuredPresentation
      ? {
          key: storyItemKey(featuredItem),
          path: featuredPath,
          kindLabel: t('story.featuredHighlight'),
          title: featuredHeadline,
          face: featuredMedia ? (
            <MemoryPreview
              memoryId={
                featuredItem.kind === 'MEMORY' ? featuredItem.memory.id : ''
              }
              attachmentId={featuredMedia.id}
              hasThumbnail={featuredMedia.hasThumbnail}
              isSensitive={featuredMedia.isSensitive}
              loadImage={loadMemoryImage}
              loadingMode="immediate"
            />
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 2l2.4 7.4h7.6l-6.1 4.5 2.3 7.1-6.2-4.5-6.2 4.5 2.3-7.1-6.1-4.5h7.6z" />
            </svg>
          ),
          content: (
            <div
              className="momente-hero-highlight"
              data-tone={featuredTone}
              data-photo-shape={
                featuredMedia ? photoShape(featuredMedia) : undefined
              }
              data-color-world={featuredMedia ? undefined : 'warm'}
            >
              <div
                ref={featuredSwayRef}
                className={`momente-hero-link ${featuredMedia ? 'has-media' : ''}`}
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
                      hasThumbnail={featuredMedia.hasThumbnail}
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
                      className="kicker-icon inline-icon"
                    >
                      <path d="M12 2l2.4 7.4h7.6l-6.1 4.5 2.3 7.1-6.2-4.5-6.2 4.5 2.3-7.1-6.1-4.5h7.6z" />
                    </svg>
                    <span>
                      {onThisDayKicker
                        ? t('story.onThisDay', {
                            count: leadContext.yearsAgo,
                          })
                        : t('story.featuredKicker')}
                    </span>
                  </span>
                  {featuredItem.kind === 'HEART_MOMENT' ? (
                    <blockquote className="momente-hero-quote">
                      "{featuredHeadline}"
                    </blockquote>
                  ) : (
                    <h3 className="momente-hero-title">{featuredHeadline}</h3>
                  )}
                  <div className="momente-hero-meta">
                    <RediscoverySecondaryLine
                      variantLine={featuredWording?.variantLine ?? null}
                      date={formatStoryDate(featuredItem.effectiveDate, locale)}
                      dateTime={featuredItem.effectiveDate
                        .toISOString()
                        .slice(0, 10)}
                    />
                  </div>
                </div>
              </div>
            </div>
          ),
        }
      : null;

  return (
    <div className="page story-page story-page-unified" ref={rootIntro}>
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

      <PullToRefreshIndicator
        enabled={active}
        blocked={renewing || storyQuery.isFetching || discoverQuery.isFetching}
        onRefresh={refreshStory}
      />

      <PageHeader
        variant="root"
        className="content-overview-heading"
        title={t(
          layout === 'rooms'
            ? 'wirDesign.homeRooms.remember'
            : layout === 'chapters'
              ? 'wirDesign.rhythm.history'
              : 'story.timelineTitle',
        )}
        titleContext={
          layout === 'rooms' ? (
            <nav
              className="home-archive-links"
              aria-label={t('wirDesign.homeRooms.archiveNavigation')}
            >
              <Link to={STORY_PHOTOS_ROUTE}>
                {t('wirDesign.homeRooms.photoArchive')}
                <EimirIcon name="chevron-right" />
              </Link>
              <Link to={STORY_CHAPTERS_ROUTE}>
                {t('wirDesign.homeRooms.chapters')}
                <EimirIcon name="chevron-right" />
              </Link>
            </nav>
          ) : undefined
        }
        action={<MomentCreateMenu floating />}
      />
      <StoryViewTabs activeView={displayedView} onSelect={setView} />

      <div
        id="momente-panel-discover"
        role="tabpanel"
        aria-labelledby="momente-tab-discover"
        hidden={displayedView !== 'discover'}
      >
        {displayedView === 'discover' && discoverQuery.isLoading ? (
          <UiState kind="loading" title={t('story.loadingAria')} />
        ) : null}
        {displayedView === 'discover' && discoverError ? (
          <ProblemState
            error={discoverError}
            onRetry={() =>
              void discoverQuery.refetch().then((result) => {
                if (!result.isError) setRenewProblem(null);
              })
            }
          />
        ) : null}
        {displayedView === 'discover' &&
        discoverQuery.data &&
        !discoverDenied &&
        !featuredItem &&
        discoverItems.length === 0
          ? emptyState
          : null}
        {displayedView === 'discover' &&
        discoverQuery.data &&
        !discoverDenied &&
        (featuredItem || discoverItems.length > 0) ? (
          <section
            className={
              discoverSettle
                ? 'momente-discover-page first-content-settle'
                : 'momente-discover-page'
            }
            aria-busy={
              renewing || storyQuery.isFetching || discoverQuery.isFetching
            }
            aria-labelledby="momente-tab-discover"
            data-diary-layout={diaryLayout}
          >
            {/* 2. The person's memory world (#2283): Story (curated
              Fotostory, the default) or another world. The loading card
              stays until the world is painted and cross-fades into it. The
              Expanded renew action replaces the touch-only pull gesture. */}
            <WorldEnter
              cover={<UiState kind="loading" title={t('story.loadingAria')} />}
            >
              <MemoryWorldSwitch world={memoryWorld} />
              <div className="momente-discover-renew">
                <button
                  type="button"
                  className="secondary"
                  disabled={renewing}
                  aria-busy={renewing}
                  onClick={() => void renewSelection()}
                >
                  {renewing
                    ? t('story.discoverRenewing')
                    : t('story.discoverRenew')}
                </button>
              </div>
              {memoryWorld === 'story' ? (
                <DiscoverStory
                  lead={storyLead}
                  items={curatedItems}
                  loadMemoryImage={loadMemoryImage}
                  onOpen={openDiscoverItem}
                  nicknameFor={nicknameFor}
                />
              ) : (
                <MemoryWorldView
                  world={memoryWorld}
                  lead={featuredItem}
                  leadHeadline={featuredHeadline}
                  leadKicker={
                    onThisDayKicker && leadContext
                      ? t('story.onThisDay', { count: leadContext.yearsAgo })
                      : t('story.featuredKicker')
                  }
                  items={curatedItems}
                  loadMemoryImage={loadMemoryImage}
                  onOpen={openDiscoverItem}
                  nicknameFor={nicknameFor}
                />
              )}
              {newsHint.activeId ? (
                <QuietHint
                  tone="new"
                  onDismiss={newsHint.dismiss}
                  action={{
                    to: STORY_OURS_ROUTE,
                    label: t('quietHints.news.waymarksAction'),
                  }}
                >
                  {t('quietHints.news.waymarks')}
                </QuietHint>
              ) : null}

              <CoupleExperienceLinks
                onOpen={openDiscoverItem}
                lead={recapLead}
              />
            </WorldEnter>
            {renewed ? (
              <p className="sr-only" role="status">
                {t('story.discoverRenewed')}
              </p>
            ) : null}
            {renewProblem ? (
              <p className="discover-feedback" role="alert">
                {t(
                  clientProblemKind(renewProblem) === 'offline'
                    ? 'story.discoverOffline'
                    : clientProblemKind(renewProblem) === 'rateLimit'
                      ? 'story.discoverRateLimit'
                      : 'story.discoverRenewError',
                )}
              </p>
            ) : null}
          </section>
        ) : null}
        {displayedView === 'discover' &&
        !discoverQuery.isLoading &&
        !featuredItem &&
        discoverItems.length === 0 ? (
          <CoupleExperienceLinks onOpen={openDiscoverItem} lead={recapLead} />
        ) : null}
      </div>
      <div
        id="momente-panel-timeline"
        role="tabpanel"
        aria-labelledby="momente-tab-timeline"
        hidden={displayedView !== 'timeline'}
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
        timelineMonthGroups.length === 0 &&
        availableYears.length === 0 &&
        !hasActiveFilters
          ? emptyState
          : null}
        <section
          id="momente-diary"
          aria-labelledby="momente-tab-timeline"
          className="momente-diary-section"
          data-diary-layout={diaryLayout}
        >
          {timelineMonthGroups.length === 0 ? (
            <header className="momente-section-header">{filterTrigger}</header>
          ) : null}
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
                      kind: isStoryKind(e.target.value) ? e.target.value : null,
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
          {activeView === 'timeline' &&
          combinedStory &&
          (timelineMonthGroups.length > 0 ||
            availableYears.length > 0 ||
            hasActiveFilters) ? (
            <div className="layout-single-column">
              <div className="story-filter-container">
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

                  {timelineMonthGroups.length === 0 ? (
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
                        {timelineMonthGroups.map((group, groupIndex) => (
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
                              {groupIndex === 0 ? filterTrigger : null}
                            </header>
                            <DiaryChapterPeriods
                              chapters={group.periods}
                              month={group.key}
                              loadedPageCount={loadedPageCount}
                            />
                            <DiaryList
                              entries={group.entries}
                              onOpenChapter={(event, chapter, to) => {
                                if (
                                  event.button !== 0 ||
                                  event.metaKey ||
                                  event.ctrlKey ||
                                  event.shiftKey ||
                                  event.altKey
                                )
                                  return;
                                const taskOriginKey = captureOrigin({
                                  selectedKey: `chapter-${chapter.id}`,
                                  selectedOffset:
                                    event.currentTarget.getBoundingClientRect()
                                      .top,
                                  loadedPageCount,
                                });
                                if (!taskOriginKey) return;
                                event.preventDefault();
                                void navigate(to, { state: { taskOriginKey } });
                              }}
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
                                disabled={storyQuery.isFetching || refreshing}
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
