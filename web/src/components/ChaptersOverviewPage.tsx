import { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { ChapterDetail } from '../api/generated/models/ChapterDetail';
import { formatChapterPeriod } from '../client/chapterPresentation';
import {
  type DeleteFocusTarget,
  PLANNING_DELETE_FOCUS_STATE_KEY,
} from '../client/deleteFocusTarget';
import { normalizeClientError } from '../client/problemDetails';
import { CHAPTER_CREATE_ROUTE, chapterDetailPath } from '../client/routes';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { useTaskOrigin } from '../client/taskOrigin';
import { useTaskListReturn } from '../client/useTaskListReturn';
import { useWarmInfiniteQuery } from '../client/useWarmInfiniteQuery';
import { resolvedLocale, useTranslation } from '../i18n';
import { AddActionLink } from './AddAction';
import { AutoLoadMore } from './AutoLoadMore';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';
import './SharedPlanningPages.css';
import './ChapterExperience.css';

const PAGE_SIZE = 20;

type PageShape<T> = { items: T[]; nextCursor: string | null };

async function apiCall<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

function nextCursor<T>(page: PageShape<T>): string | undefined {
  return page.nextCursor ?? undefined;
}

export function ChaptersOverviewPage({
  apis,
  spaceId,
}: {
  apis: SharedPlanningApis;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { captureOrigin } = useTaskOrigin();
  const createActionRef = useRef<HTMLAnchorElement>(null);
  const chapterRefs = useRef(new Map<string, HTMLAnchorElement>());
  const restoredDeleteFocusRef = useRef(false);

  const chapters = useWarmInfiniteQuery({
    queryKey: ['m5-s3', 'chapters', spaceId],
    queryFn: ({ pageParam, signal }) =>
      apiCall(() =>
        apis.chapters.listChapters(
          {
            spaceId,
            cursor: pageParam,
            limit: PAGE_SIZE,
          },
          { signal },
        ),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor<ChapterDetail>,
    retry: false,
  });

  useTaskListReturn({
    ready: Boolean(chapters.data),
    busy: chapters.isFetching,
    loadedPageCount: chapters.data?.pages.length ?? 1,
    canLoadMore: Boolean(chapters.hasNextPage) && !chapters.isError,
    loadMore: chapters.fetchNextPage,
  });
  const chapterItems = chapters.data?.pages.flatMap((page) => page.items) ?? [];
  const deleteFocusTarget = (
    location.state as Record<string, unknown> | null
  )?.[PLANNING_DELETE_FOCUS_STATE_KEY] as DeleteFocusTarget | undefined;

  useEffect(() => {
    if (restoredDeleteFocusRef.current || !deleteFocusTarget) return;
    const requestedTarget =
      deleteFocusTarget.kind === 'item'
        ? chapterRefs.current.get(deleteFocusTarget.id)
        : createActionRef.current;
    if (!requestedTarget && chapters.isFetching) return;
    (requestedTarget ?? createActionRef.current)?.focus();
    restoredDeleteFocusRef.current = true;
  }, [chapters.isFetching, deleteFocusTarget]);

  return (
    <div className="page planning-page chapter-page">
      <PageHeader
        eyebrow={t('navigation.story')}
        title={t('m5s3.chapter.heading')}
        description={t('m5s3.chapter.intro')}
        action={
          <AddActionLink
            floating
            label={t('m5s3.chapter.create')}
            ref={createActionRef}
            to={CHAPTER_CREATE_ROUTE}
            onClick={(event) => {
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
              void navigate(CHAPTER_CREATE_ROUTE, { state: { taskOriginKey } });
            }}
          />
        }
      />

      <section className="chapter-overview-content">
        {chapters.isLoading ? (
          <UiState kind="loading" title={t('states.loading.title')} />
        ) : null}
        {chapters.error ? (
          <ProblemState
            error={chapters.error}
            onRetry={() => void chapters.refetch()}
          />
        ) : null}

        {chapterItems.length === 0 && !chapters.isLoading && !chapters.error ? (
          <UiState
            kind="empty"
            title={t('m5s3.chapter.emptyTitle')}
            body={t('m5s3.chapter.emptyBody')}
          />
        ) : (
          <ul className="chapter-shelf">
            {chapterItems.map((chapter) => {
              const period = formatChapterPeriod(chapter, t, resolvedLocale());
              return (
                <li key={chapter.id}>
                  <Link
                    ref={(element) => {
                      if (element) chapterRefs.current.set(chapter.id, element);
                      else chapterRefs.current.delete(chapter.id);
                    }}
                    className="chapter-shelf-link"
                    data-task-item-key={`chapter-${chapter.id}`}
                    to={chapterDetailPath(chapter.id)}
                    onClick={(event) => {
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
                        loadedPageCount: chapters.data?.pages.length ?? 1,
                      });
                      if (!taskOriginKey) return;
                      event.preventDefault();
                      void navigate(chapterDetailPath(chapter.id), {
                        state: { taskOriginKey },
                      });
                    }}
                  >
                    <h2>{chapter.title}</h2>
                    {period ? <p className="chapter-period">{period}</p> : null}
                    {chapter.description?.trim() ? (
                      <p className="chapter-excerpt">{chapter.description}</p>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {chapters.hasNextPage ? (
          <AutoLoadMore
            query={chapters}
            className="tertiary compact-action"
            blocked={chapters.isFetchingNextPage}
          >
            {chapters.isFetchingNextPage
              ? t('m5s3.common.loadingMore')
              : t('m5s3.common.loadMore')}
          </AutoLoadMore>
        ) : null}
      </section>
    </div>
  );
}
