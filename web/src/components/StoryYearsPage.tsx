import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import { AttachmentReadRequestParentTypeEnum } from '../api/generated/models/AttachmentReadRequest';
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
  appRoutePath,
  STORY_YEARS_ROUTE,
  storyYearPath,
} from '../client/routes';
import { loadAuthorizedStoryImage } from '../client/storyMediaLoader';
import {
  aggregateStoryPages,
  storyCacheResourceId,
  storyRequest,
  type StoryFilters,
} from '../client/storyProduct';
import { resolvedLocale, useTranslation } from '../i18n';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { StoryList } from './StoryList';
import { groupStoryItems } from './storyPresentation';
import { UiState } from './UiState';
import './StoryYearsPage.css';

const INDEX_RESOURCE_ID = 'years:index';
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

interface StoryYearsProps {
  apis: ReferenceApis;
  accountId: string;
  spaceId: string;
  loadMemoryImage: (
    memoryId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ) => Promise<string>;
  profilesApi?: ProfilesApi;
}

function parseYear(raw: string | undefined): number | null {
  if (!raw || !/^\d{4}$/.test(raw)) return null;
  const year = Number(raw);
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    return null;
  }
  return year;
}

function EmptyYearsState() {
  const { t } = useTranslation();
  return (
    <section
      className="story-years-empty"
      aria-labelledby="story-years-empty-title"
    >
      <h2 id="story-years-empty-title">{t('storyYears.emptyTitle')}</h2>
      <p>{t('storyYears.emptyBody')}</p>
      <Link className="button-link secondary-link" to={appRoutePath('story')}>
        {t('storyYears.backToMoments')}
      </Link>
    </section>
  );
}

export function StoryYearsIndexPage({
  apis,
  accountId,
  spaceId,
}: StoryYearsProps) {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();
  const yearsQuery = useQuery({
    queryKey: ['story-years', spaceId],
    queryFn: async (): Promise<
      ProductReadResult<ReturnType<typeof StoryPageFromJSON>>
    > =>
      loadProductWithReadCache({
        accountId,
        spaceId,
        kind: 'story',
        resourceId: INDEX_RESOURCE_ID,
        load: () =>
          apis.story.getStoryTimeline({
            spaceId,
            order: StoryOrder.DESC,
            limit: 1,
          }),
        serialize: StoryPageToJSON,
        deserialize: StoryPageFromJSON,
      }),
    retry: false,
  });

  useEffect(() => {
    const result = yearsQuery.data;
    if (result?.source !== 'network') return;
    void saveProductReadCacheEntry({
      accountId,
      spaceId,
      kind: 'story',
      resourceId: INDEX_RESOURCE_ID,
      value: result.value,
      serialize: StoryPageToJSON,
    });
  }, [accountId, spaceId, yearsQuery.data]);

  const availableYears = yearsQuery.data?.value.availableYears ?? [];
  const offline = yearsQuery.data?.source === 'cache';

  return (
    <div className="page page-reading story-years-page">
      <PageHeader
        before={
          <Link className="back-link" to={appRoutePath('story')}>
            {t('storyYears.backToMoments')}
          </Link>
        }
        eyebrow={t('storyYears.eyebrow')}
        title={t('storyYears.title')}
        description={t('storyYears.intro')}
      />

      {offline ? (
        <div className="inline-message" role="status">
          {t('storyYears.offline')}
        </div>
      ) : null}
      {yearsQuery.isLoading ? (
        <UiState kind="loading" title={t('story.loadingAria')} />
      ) : null}
      {yearsQuery.error ? (
        <ProblemState
          error={yearsQuery.error}
          onRetry={() => void yearsQuery.refetch()}
        />
      ) : null}

      {yearsQuery.data && availableYears.length === 0 ? (
        <EmptyYearsState />
      ) : null}

      {availableYears.length > 0 ? (
        <ol className="story-years-list" aria-label={t('storyYears.listAria')}>
          {availableYears.map((year) => {
            const isCurrent = year === currentYear;
            return (
              <li key={year}>
                <Link
                  to={storyYearPath(year)}
                  className={`story-year-link ${isCurrent ? 'is-current' : ''}`}
                  aria-label={t('storyYears.openYear', { year })}
                >
                  <span className="story-year-number">{year}</span>
                  <span className="story-year-copy">
                    <strong>
                      {isCurrent
                        ? t('storyYears.currentYearLabel')
                        : t('storyYears.pastYearLabel', { year })}
                    </strong>
                    <span>
                      {isCurrent
                        ? t('storyYears.currentYearHint')
                        : t('storyYears.pastYearHint')}
                    </span>
                  </span>
                  <span className="story-year-arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}

export function StoryYearDetailPage({
  apis,
  accountId,
  spaceId,
  loadMemoryImage,
  profilesApi,
}: StoryYearsProps) {
  const { t } = useTranslation();
  const { year: yearParam } = useParams<{ year: string }>();
  const year = parseYear(yearParam);
  const currentYear = new Date().getFullYear();
  const filters = useMemo<StoryFilters>(
    () => ({
      kind: null,
      year,
      order: StoryOrder.ASC,
    }),
    [year],
  );
  const cacheResourceId = useMemo(
    () => storyCacheResourceId(filters),
    [filters],
  );

  const storyQuery = useInfiniteQuery({
    queryKey: ['story-year', spaceId, cacheResourceId],
    initialPageParam: null as string | null,
    enabled: year !== null,
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
            apis.story.getStoryTimeline(storyRequest(spaceId, filters, null)),
          serialize: StoryPageToJSON,
          deserialize: StoryPageFromJSON,
        });
      }
      try {
        const value = await apis.story.getStoryTimeline(
          storyRequest(spaceId, filters, pageParam),
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
    if (!combinedStory || !allPagesFromNetwork || year === null) return;
    void saveProductReadCacheEntry({
      accountId,
      spaceId,
      kind: 'story',
      resourceId: cacheResourceId,
      value: combinedStory,
      serialize: StoryPageToJSON,
    });
  }, [
    accountId,
    allPagesFromNetwork,
    cacheResourceId,
    combinedStory,
    spaceId,
    year,
  ]);

  const loadHeartMomentImage = useCallback(
    (
      heartMomentId: string,
      attachmentId: string,
      signal?: AbortSignal,
    ) =>
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

  const items = useMemo(() => combinedStory?.items ?? [], [combinedStory]);
  const locale = resolvedLocale();
  const monthGroups = useMemo(
    () => groupStoryItems(items, locale),
    [items, locale],
  );
  const availableYears = combinedStory?.availableYears ?? [];
  const isAvailable = year !== null && availableYears.includes(year);
  const title =
    year === null
      ? t('storyYears.invalidTitle')
      : t('storyYears.detailTitle', { year });
  const description =
    year === null
      ? t('storyYears.invalidBody')
      : year === currentYear
        ? t('storyYears.currentYearIntro', { year })
        : t('storyYears.pastYearIntro', { year });

  return (
    <div className="page page-reading story-year-page">
      <PageHeader
        before={
          <Link className="back-link" to={STORY_YEARS_ROUTE}>
            {t('storyYears.backToYears')}
          </Link>
        }
        eyebrow={t('storyYears.eyebrow')}
        title={title}
        description={description}
        className="story-year-header"
      />

      {year === null ? (
        <section
          className="story-years-empty"
          aria-labelledby="story-year-invalid-title"
        >
          <h2 id="story-year-invalid-title">{t('storyYears.invalidTitle')}</h2>
          <p>{t('storyYears.invalidBody')}</p>
          <Link className="button-link secondary-link" to={STORY_YEARS_ROUTE}>
            {t('storyYears.backToYears')}
          </Link>
        </section>
      ) : null}

      {offline ? (
        <div className="inline-message" role="status">
          {t('storyYears.offline')}
        </div>
      ) : null}
      {year !== null && storyQuery.isLoading ? (
        <UiState kind="loading" title={t('story.loadingAria')} />
      ) : null}
      {year !== null && storyQuery.error ? (
        <ProblemState
          error={storyQuery.error}
          onRetry={() => void storyQuery.refetch()}
        />
      ) : null}

      {year !== null && combinedStory && !isAvailable && items.length === 0 ? (
        <section
          className="story-years-empty"
          aria-labelledby="story-year-unavailable-title"
        >
          <h2 id="story-year-unavailable-title">
            {t('storyYears.unavailableTitle')}
          </h2>
          <p>{t('storyYears.unavailableBody', { year })}</p>
          <Link className="button-link secondary-link" to={STORY_YEARS_ROUTE}>
            {t('storyYears.backToYears')}
          </Link>
        </section>
      ) : null}

      {year !== null && items.length > 0 ? (
        <div className="story-year-months">
          {monthGroups.map((group) => (
            <section
              key={group.key}
              className="story-year-month"
              aria-labelledby={`story-year-month-${group.key}`}
            >
              <header className="story-year-month-header">
                <h2 id={`story-year-month-${group.key}`}>{group.label}</h2>
              </header>
              <StoryList
                items={group.items}
                loadMemoryImage={loadMemoryImage}
                loadHeartMomentImage={loadHeartMomentImage}
                profilesApi={profilesApi}
                spaceId={spaceId}
                currentAccountId={accountId}
              />
            </section>
          ))}

          {storyQuery.hasNextPage ? (
            <div className="story-year-pagination">
              <button
                type="button"
                className="secondary"
                onClick={() => void storyQuery.fetchNextPage()}
                disabled={storyQuery.isFetchingNextPage}
              >
                {storyQuery.isFetchingNextPage
                  ? t('storyYears.loadingMore')
                  : t('storyYears.loadMore')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
