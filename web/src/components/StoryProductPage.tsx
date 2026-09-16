import { useInfiniteQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import { AttachmentReadRequestParentTypeEnum } from '../api/generated/models/AttachmentReadRequest';
import type { AuthorSummary } from '../api/generated/models/AuthorSummary';
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
  milestoneDetailPath,
  STORY_CHAPTERS_ROUTE,
  STORY_YEARS_ROUTE,
  storyYearPath,
} from '../client/routes';
import { loadAuthorizedStoryImage } from '../client/storyMediaLoader';
import {
  aggregateStoryPages,
  DEFAULT_STORY_FILTERS,
  parseStoryFilters,
  type StoryFilters,
  selectFeaturedStoryItem,
  storyCacheResourceId,
  storyFiltersToSearch,
  storyRequest,
} from '../client/storyProduct';
import { taskOriginPath, useTaskOrigin } from '../client/taskOrigin';
import { resolvedLocale, useTranslation } from '../i18n';
import { MemoryPreview } from './MemoryPreview';
import { PageHeader } from './PageHeader';
import { AuthorAvatar } from './PersonIdentity';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import { StoryList } from './StoryList';
import './StoryTaskFilters.css';
import {
  distributeIntoTapestryColumns,
  formatStoryDate,
  groupStoryItems,
  resolveStoryKindLabel,
  storyAuthorLabel,
  storyItemKey,
  storyItemPresentation,
  tapestryItemRole,
  tapestryRoleWeight,
} from './storyPresentation';
import { UiState } from './UiState';

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
): TapestryEntry {
  const role = tapestryItemRole(item);
  const presentation = storyItemPresentation(item, t);
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
  columns: TapestryEntry[][];
}

const TAPESTRY_ITEM_LIMIT = 12;

/**
 * Newest-first month bands, each internally column-balanced (#790/#791):
 * chronology reads as "newest month first, newest item first within a
 * month" without requiring the viewer to reverse-engineer a column-balancing
 * algorithm across the whole grid. Items are sorted defensively by
 * `effectiveDate` rather than trusting incoming array order, since Discover
 * can be reached with a non-default Timeline `order` filter still applied
 * via the `tab` URL param.
 */
function buildTapestryBands(
  items: StoryItem[],
  t: TFunction,
  locale: string,
  columnCount: number,
): TapestryBand[] {
  const newestFirst = [...items].sort(
    (a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime(),
  );
  const groups = groupStoryItems(
    newestFirst.slice(0, TAPESTRY_ITEM_LIMIT),
    locale,
  );
  return groups.map((group) => ({
    key: group.key,
    label: group.label,
    columns: distributeIntoTapestryColumns(
      group.items.map((item) => buildTapestryEntry(item, t, locale)),
      columnCount,
      (entry) => tapestryRoleWeight(entry.role),
    ),
  }));
}

const TAPESTRY_TABLET_QUERY = '(min-width: 640px)';
const TAPESTRY_DESKTOP_QUERY = '(min-width: 1024px)';

function tapestryColumnCountForViewport(): number {
  if (typeof window === 'undefined') return 1;
  if (window.matchMedia(TAPESTRY_DESKTOP_QUERY).matches) return 3;
  if (window.matchMedia(TAPESTRY_TABLET_QUERY).matches) return 2;
  return 1;
}

/**
 * Mobile always resolves to exactly one column: no masonry reshuffling, just
 * the plain chronological/priority order (#790 requires no forced desktop
 * masonry tricks on mobile, only a clear vertical, emotional sequence).
 */
function useTapestryColumnCount(): number {
  const [count, setCount] = useState(tapestryColumnCountForViewport);

  useEffect(() => {
    const tablet = window.matchMedia(TAPESTRY_TABLET_QUERY);
    const desktop = window.matchMedia(TAPESTRY_DESKTOP_QUERY);
    const update = () => setCount(tapestryColumnCountForViewport());
    update();
    tablet.addEventListener('change', update);
    desktop.addEventListener('change', update);
    return () => {
      tablet.removeEventListener('change', update);
      desktop.removeEventListener('change', update);
    };
  }, []);

  return count;
}

export function StoryProductPage({
  apis,
  accountId,
  spaceId,
  loadMemoryImage,
  profilesApi,
}: {
  apis: ReferenceApis;
  accountId: string;
  spaceId: string;
  loadMemoryImage: (memoryId: string, attachmentId: string) => Promise<string>;
  profilesApi?: ProfilesApi;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const saved = Boolean((location.state as { saved?: boolean } | null)?.saved);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { captureOrigin, resolveOrigin, registerOriginMetadata } =
    useTaskOrigin();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const filterSheetRef = useRef<ShortTaskSheetHandle>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const [draftFilters, setDraftFilters] = useState<StoryFilters>(
    DEFAULT_STORY_FILTERS,
  );
  const filters = useMemo(
    () => parseStoryFilters(searchParams),
    [searchParams],
  );
  const hasActiveFilters = Boolean(
    filters.kind || filters.year || filters.order !== StoryOrder.DESC,
  );
  const activeView = useMemo(() => {
    const tab = searchParams.get('tab');
    if (tab === 'timeline' || tab === 'discover') return tab;
    return hasActiveFilters ? 'timeline' : 'discover';
  }, [searchParams, hasActiveFilters]);
  // Discover does not inherit the retained Timeline scope.
  const effectiveFilters =
    activeView === 'timeline' ? filters : DEFAULT_STORY_FILTERS;
  const cacheResourceId = useMemo(
    () => storyCacheResourceId(effectiveFilters),
    [effectiveFilters],
  );
  const loadHeartMomentImage = useCallback(
    (heartMomentId: string, attachmentId: string) =>
      loadAuthorizedStoryImage(
        apis,
        spaceId,
        AttachmentReadRequestParentTypeEnum.HEART_MOMENT,
        heartMomentId,
        attachmentId,
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
    retry: false,
  });

  const combinedStory = useMemo(() => {
    if (!storyQuery.data) return null;
    return aggregateStoryPages(storyQuery.data.pages.map((page) => page.value));
  }, [storyQuery.data]);
  const allPagesFromNetwork =
    storyQuery.data?.pages.every((page) => page.source === 'network') ?? false;
  const offline = storyQuery.data?.pages[0]?.source === 'cache';

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

  function setView(view: 'discover' | 'timeline') {
    const next = new URLSearchParams(searchParams);
    next.set('tab', view);
    setSearchParams(next);
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
  const loadedPageCount = storyQuery.data?.pages.length ?? 1;
  useEffect(
    () => registerOriginMetadata({ loadedPageCount }),
    [loadedPageCount, registerOriginMetadata],
  );
  useEffect(() => {
    if (!returnOrigin || !combinedStory || storyQuery.isFetching) return;
    const entry = `${location.key}:${String(returnKey)}`;
    if (restoredEntryRef.current === entry) return;
    if (
      loadedPageCount < returnOrigin.loadedPageCount &&
      storyQuery.hasNextPage &&
      !storyQuery.isError &&
      !offline
    ) {
      void storyQuery.fetchNextPage();
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const selected = Array.from(
        document.querySelectorAll<HTMLElement>('[data-task-item-key]'),
      ).find(
        (element) => element.dataset.taskItemKey === returnOrigin.selectedKey,
      );
      const top =
        selected && returnOrigin.selectedOffset !== undefined
          ? window.scrollY +
            selected.getBoundingClientRect().top -
            returnOrigin.selectedOffset
          : returnOrigin.scrollY;
      window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
      const focusTarget =
        selected ??
        (returnOrigin.focusTarget === 'quick-create'
          ? Array.from(
              document.querySelectorAll<HTMLElement>('.quick-create-trigger'),
            ).find((element) => element.getClientRects().length > 0)
          : null);
      focusTarget?.focus({ preventScroll: true });
      restoredEntryRef.current = entry;
    });
    return () => window.cancelAnimationFrame(frame);
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
  ]);

  const items = useMemo(() => combinedStory?.items ?? [], [combinedStory]);
  const locale = resolvedLocale();

  const milestones = useMemo(
    () => items.filter((item) => item.kind === 'MILESTONE'),
    [items],
  );
  const featuredItem = useMemo(() => selectFeaturedStoryItem(items), [items]);

  const tapestryColumnCount = useTapestryColumnCount();
  const tapestryBands = useMemo(
    () => buildTapestryBands(items, t, locale, tapestryColumnCount),
    [items, t, locale, tapestryColumnCount],
  );

  const featuredMedia =
    featuredItem?.kind === 'MEMORY'
      ? featuredItem.memory.attachments[0]
      : undefined;
  const featuredPresentation = featuredItem
    ? storyItemPresentation(featuredItem, t)
    : null;
  const featuredAuthor = featuredItem ? storyItemAuthor(featuredItem) : null;
  const featuredPath = featuredItem
    ? featuredItem.kind === 'MEMORY'
      ? memoryDetailPath(featuredItem.memory.id)
      : featuredItem.kind === 'HEART_MOMENT'
        ? heartMomentDetailPath(featuredItem.heartMoment.id)
        : milestoneDetailPath(featuredItem.milestone.id)
    : '';

  return (
    <div className="page story-page">
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

      {activeView === 'timeline' ? (
        <PageHeader
          title={t('story.timelineTitle')}
          description={t('story.timelineIntro')}
          className="momente-timeline-header"
        />
      ) : (
        <PageHeader
          eyebrow={t('story.eyebrow')}
          title={t('story.title')}
          description={t('story.intro')}
        />
      )}

      <div className="momente-tabs-container eimir-motion-reveal">
        <div
          className="momente-tabs"
          role="tablist"
          aria-label={t('story.viewToggleAria')}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'discover'}
            className={`momente-tab-btn ${activeView === 'discover' ? 'active' : ''}`}
            onClick={() => setView('discover')}
          >
            <svg
              className="tab-icon"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 2l2.4 7.4h7.6l-6.1 4.5 2.3 7.1-6.2-4.5-6.2 4.5 2.3-7.1-6.1-4.5h7.6z" />
            </svg>
            <span>{t('story.tabDiscover')}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'timeline'}
            className={`momente-tab-btn ${activeView === 'timeline' ? 'active' : ''}`}
            onClick={() => setView('timeline')}
          >
            <svg
              className="tab-icon"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z" />
            </svg>
            <span>{t('story.tabTimeline')}</span>
          </button>
        </div>
      </div>

      {storyQuery.isLoading ? (
        <UiState kind="loading" title={t('story.loadingAria')} />
      ) : null}
      {storyQuery.error ? (
        <ProblemState
          error={storyQuery.error}
          onRetry={() => void storyQuery.refetch()}
        />
      ) : null}

      {combinedStory &&
      items.length === 0 &&
      availableYears.length === 0 &&
      !(activeView === 'timeline' && hasActiveFilters) ? (
        <div className="new-space-experience eimir-motion-reveal">
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
      ) : combinedStory && activeView === 'discover' && items.length > 0 ? (
        <div className="momente-discover-page eimir-motion-reveal">
          {/* 1. Featured Editorial Highlight */}
          {featuredItem && featuredPresentation ? (
            <article className="momente-hero-highlight">
              <Link
                to={featuredPath}
                className={`momente-hero-link ${featuredMedia ? 'has-media' : ''}`}
                aria-label={`${t('story.featuredHighlight')}: ${featuredPresentation.title}`}
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
                      loadImage={loadMemoryImage}
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
                    <span>{t('story.featuredKicker')}</span>
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
                    <time
                      dateTime={featuredItem.effectiveDate
                        .toISOString()
                        .slice(0, 10)}
                    >
                      {formatStoryDate(featuredItem.effectiveDate, locale)}
                    </time>
                    {featuredAuthor ? (
                      <span className="momente-author-meta">
                        <AuthorAvatar
                          author={featuredAuthor}
                          profilesApi={profilesApi}
                          spaceId={spaceId}
                        />
                        <span>
                          {t('story.byAuthor', {
                            author: storyAuthorLabel(featuredAuthor),
                          })}
                        </span>
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
            <div className="momente-section-header">
              <div>
                <h3
                  id="momente-tapestry-heading"
                  className="momente-section-title"
                >
                  {t('story.discoverHeading')}
                </h3>
                <p className="momente-section-subhead">
                  {t('story.discoverSubhead')}
                </p>
              </div>
              <button
                type="button"
                className="momente-stream-all-link"
                onClick={() => setView('timeline')}
              >
                {t('story.streamAll')}
              </button>
            </div>
            <div className="momente-tapestry-bands">
              {tapestryBands.map((band) => (
                <section
                  className="momente-tapestry-band"
                  key={band.key}
                  aria-labelledby={`momente-band-${band.key}`}
                >
                  <h4
                    id={`momente-band-${band.key}`}
                    className="momente-band-heading"
                  >
                    {band.label}
                  </h4>
                  <div className="momente-tapestry">
                    {band.columns
                      .filter((column) => column.length > 0)
                      .map((column) => (
                        <div
                          className="momente-tapestry-column"
                          key={column[0].key}
                        >
                          {column.map((entry) => {
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
                                  className="momente-tapestry-item momente-tapestry-milestone"
                                  aria-label={presentation.title}
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
                                className={`momente-tapestry-item momente-tapestry-${role}`}
                                aria-label={presentation.title}
                              >
                                {role === 'media' && entry.firstAttachment ? (
                                  <div className="momente-tapestry-media-frame">
                                    <MemoryPreview
                                      memoryId={entry.memoryId}
                                      attachmentId={entry.firstAttachment.id}
                                      loadImage={loadMemoryImage}
                                    />
                                  </div>
                                ) : null}
                                <div className="momente-tapestry-body">
                                  <span className="momente-tapestry-kind">
                                    {role === 'note' ? (
                                      <svg
                                        viewBox="0 0 24 24"
                                        width="12"
                                        height="12"
                                        fill="currentColor"
                                        aria-hidden="true"
                                        className="kind-glyph"
                                      >
                                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                                      </svg>
                                    ) : null}
                                    <span>{presentation.kindLabel}</span>
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
                                    <time dateTime={dateTime}>{dateLabel}</time>
                                    {entry.author ? (
                                      <span className="momente-author-meta">
                                        <AuthorAvatar
                                          author={entry.author}
                                          profilesApi={profilesApi}
                                          spaceId={spaceId}
                                        />
                                        <span>
                                          {t('story.byAuthor', {
                                            author: storyAuthorLabel(
                                              entry.author,
                                            ),
                                          })}
                                        </span>
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      ))}
                  </div>
                </section>
              ))}
            </div>
          </section>

          {/* 3. Milestones & Chapters archive entries — quiet rows that read
              as part of the shared archive, not standalone feature-navigation
              cards. */}
          <div className="momente-archive-links">
            {milestones.length > 0 ? (
              <Link
                to="/story?tab=timeline&type=MILESTONE"
                className="momente-archive-link"
              >
                <span className="momente-archive-icon" aria-hidden="true">
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
                <span className="momente-archive-copy">
                  <span className="momente-archive-title">
                    {t('story.milestonesTitle')}
                  </span>
                  <span className="momente-archive-desc">
                    {t('story.milestonesDesc')}
                  </span>
                </span>
              </Link>
            ) : null}
            <Link to={STORY_CHAPTERS_ROUTE} className="momente-archive-link">
              <span className="momente-archive-icon" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z" />
                </svg>
              </span>
              <span className="momente-archive-copy">
                <span className="momente-archive-title">
                  {t('story.chaptersTitle')}
                </span>
                <span className="momente-archive-desc">
                  {t('story.chaptersDesc')}
                </span>
              </span>
            </Link>
          </div>

          {/* 4. Year Archive — availability comes from the authorized
              server projection, never from the currently loaded page. */}
          {availableYears.length > 0 ? (
            <section
              className="momente-year-archive"
              aria-labelledby="momente-years-heading"
            >
              <div className="momente-section-header">
                <div>
                  <h3
                    id="momente-years-heading"
                    className="momente-section-title"
                  >
                    {t('story.yearArchiveTitle')}
                  </h3>
                  <p className="momente-section-subhead">
                    {t('story.yearArchiveSubtitle')}
                  </p>
                </div>
                <Link
                  to={STORY_YEARS_ROUTE}
                  className="momente-stream-all-link"
                >
                  {t('story.yearArchiveAll')}
                </Link>
              </div>
              <div className="momente-year-pills">
                {availableYears.slice(0, 4).map((year) => (
                  <Link
                    key={year}
                    to={storyYearPath(year)}
                    className="momente-year-pill"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className="year-pill-icon"
                    >
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    <span>{year}</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : combinedStory && activeView === 'timeline' ? (
        <div className="layout-single-column eimir-motion-reveal">
          <div className="story-filter-container">
            <div className="story-timeline-toolbar">
              <button
                type="button"
                className="story-filter-toggle story-task-filter-trigger"
                ref={filterTriggerRef}
                aria-haspopup="dialog"
                aria-expanded={mobileFiltersOpen}
                aria-controls="story-filter-panel"
                aria-label={
                  hasActiveFilters
                    ? t('storyFilters.toggleButtonActive')
                    : t('storyFilters.toggleButton')
                }
                onClick={() => {
                  setDraftFilters(filters);
                  setMobileFiltersOpen(true);
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 5h16l-6 7v6l-4 2v-8z" />
                </svg>
                <span>{t('storyFilters.toggleButton')}</span>
                {hasActiveFilters ? (
                  <span
                    className="story-filter-toggle-dot"
                    aria-hidden="true"
                  />
                ) : null}
              </button>

              <button
                type="button"
                className="secondary compact-action story-timeline-refresh"
                onClick={() => void storyQuery.refetch()}
                disabled={storyQuery.isFetching}
              >
                {storyQuery.isFetching && !storyQuery.isFetchingNextPage
                  ? t('common.refreshing')
                  : t('common.refresh')}
              </button>
            </div>
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
                      filterTriggerRef.current?.focus({ preventScroll: true }),
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

              {items.length === 0 ? (
                <div className="story-filter-empty-state eimir-motion-reveal">
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
                  <StoryList
                    items={combinedStory.items}
                    loadMemoryImage={loadMemoryImage}
                    loadHeartMomentImage={loadHeartMomentImage}
                    profilesApi={profilesApi}
                    spaceId={spaceId}
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
                          event.currentTarget.getBoundingClientRect().top,
                        loadedPageCount,
                      });
                      if (!taskOriginKey) return;
                      event.preventDefault();
                      void navigate(to, { state: { taskOriginKey } });
                    }}
                  />

                  {storyQuery.hasNextPage ? (
                    <div className="story-pagination">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => void storyQuery.fetchNextPage()}
                        disabled={storyQuery.isFetchingNextPage}
                      >
                        {storyQuery.isFetchingNextPage
                          ? t('storyFilters.loadingMore')
                          : t('storyFilters.loadMore')}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
