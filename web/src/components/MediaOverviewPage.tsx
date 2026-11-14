import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { MediaGalleryItem } from '../api/generated/models/MediaGalleryItem';
import {
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';
import type { ReferenceApis } from '../client/referenceFlow';
import {
  heartMomentDetailPath,
  memoryDetailPath,
  planDetailPath,
} from '../client/routes';
import { loadAuthorizedStoryImageResource } from '../client/storyMediaLoader';
import { taskOriginPath, useTaskOrigin } from '../client/taskOrigin';
import { useWarmInfiniteQuery } from '../client/useWarmInfiniteQuery';
import { loadVideoSource } from '../client/video';
import { voiceTime } from '../client/voiceNotes';
import { resolvedLocale, useTranslation } from '../i18n';
import { AutoLoadMore } from './AutoLoadMore';
import { EimirIcon } from './EimirIcon';
import { MediaGallery } from './MediaGallery';
import { MemoryPreview } from './MemoryPreview';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { SensitiveMediaCover } from './SensitiveMedia';
import { UiState } from './UiState';
import { VoiceNotePreview } from './VoiceNotePlayer';
import './MediaOverviewPage.css';

const mediaResourceId = (item: MediaGalleryItem) =>
  `${item.parentType}:${item.parentId}:${item.attachment.id}`;

const sourcePath = {
  MEMORY: memoryDetailPath,
  HEART_MOMENT: heartMomentDetailPath,
  PLAN: planDetailPath,
};

export function MediaOverviewPage({
  apis,
  accountId,
  spaceId,
}: {
  apis: ReferenceApis;
  accountId: string;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const locale = resolvedLocale();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useSearchParams();
  const isPrivate = search.get('visibility') === 'private';
  const visibility = isPrivate ? 'PRIVATE' : 'SHARED';
  const { captureOrigin, resolveOrigin, registerOriginMetadata } =
    useTaskOrigin();
  // Story parent writes invalidate both views of the gallery.
  const queryKey = ['story', spaceId, 'media', accountId, visibility] as const;
  const [offline, setOffline] = useState(navigator.onLine === false);
  useEffect(() => {
    const update = () => setOffline(navigator.onLine === false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  const mediaQuery = useWarmInfiniteQuery(
    {
      queryKey,
      initialPageParam: null as string | null,
      queryFn: async ({ pageParam, signal }) => {
        try {
          return await apis.story.getMediaGallery(
            { spaceId, visibility, cursor: pageParam ?? undefined, limit: 40 },
            { signal },
          );
        } catch (error) {
          throw await normalizeClientError(error);
        }
      },
      getNextPageParam: (page) =>
        page.hasMore ? (page.nextCursor ?? undefined) : undefined,
      refetchOnMount: 'always',
      staleTime: isPrivate ? 0 : undefined,
      retry: false,
    },
    { persist: !isPrivate },
  );
  const forbidden =
    mediaQuery.isError &&
    ['unauthorized', 'permission', 'notFound'].includes(
      clientProblemKind(mediaQuery.error),
    );
  const items = forbidden
    ? []
    : Array.from(
        new Map(
          (mediaQuery.data?.pages.flatMap((page) => page.items) ?? []).map(
            (item) => [item.attachment.id, item],
          ),
        ).values(),
      );
  const loadedPageCount = mediaQuery.data?.pages.length ?? 1;
  useEffect(
    () => registerOriginMetadata({ loadedPageCount }),
    [registerOriginMetadata, loadedPageCount],
  );
  const returnKey = (location.state as { taskReturnKey?: unknown } | null)
    ?.taskReturnKey;
  const origin = resolveOrigin(returnKey);
  const path = taskOriginPath(location.pathname, location.search);
  const restoredRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      !origin ||
      origin.to !== path ||
      !mediaQuery.data ||
      mediaQuery.isFetching
    )
      return;
    const entry = `${location.key}:${String(returnKey)}`;
    if (restoredRef.current === entry) return;
    if (
      loadedPageCount < origin.loadedPageCount &&
      mediaQuery.hasNextPage &&
      !mediaQuery.isError &&
      !offline
    ) {
      void mediaQuery.fetchNextPage();
      return;
    }
    let settleFrame = 0;
    const restore = () => {
      const selected = Array.from(
        document.querySelectorAll<HTMLElement>('[data-media-id]'),
      ).find((element) => element.dataset.mediaId === origin.selectedKey);
      const top =
        selected && origin.selectedOffset !== undefined
          ? selected.getBoundingClientRect().top +
            window.scrollY -
            origin.selectedOffset
          : origin.scrollY;
      window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
      selected?.focus({ preventScroll: true });
    };
    const frame = window.requestAnimationFrame(() => {
      restore();
      settleFrame = window.requestAnimationFrame(() => {
        restore();
        restoredRef.current = entry;
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(settleFrame);
    };
  }, [
    origin,
    path,
    location.key,
    returnKey,
    loadedPageCount,
    mediaQuery.data,
    mediaQuery.isFetching,
    mediaQuery.hasNextPage,
    mediaQuery.isError,
    mediaQuery.fetchNextPage,
    offline,
  ]);

  const handleMediaReadError = useCallback(
    async (error: unknown): Promise<never> => {
      const normalized = await normalizeClientError(error);
      if (
        ['unauthorized', 'permission', 'notFound'].includes(
          clientProblemKind(normalized),
        )
      ) {
        void queryClient.invalidateQueries({
          queryKey: ['story', spaceId, 'media', accountId],
        });
      }
      throw normalized;
    },
    [spaceId, accountId, queryClient],
  );
  const loadMedia = useCallback(
    (
      item: MediaGalleryItem,
      variant: 'thumbnail' | 'original',
      signal?: AbortSignal,
    ) =>
      loadAuthorizedStoryImageResource(
        apis,
        spaceId,
        item.parentType,
        item.parentId,
        item.attachment.id,
        { signal, variant },
      ).catch(handleMediaReadError),
    [apis, spaceId, handleMediaReadError],
  );

  const months = new Map<
    string,
    Array<{ item: MediaGalleryItem; index: number }>
  >();
  items.forEach((item, index) => {
    const month = item.effectiveDate.toISOString().slice(0, 7);
    const group = months.get(month) ?? [];
    group.push({ item, index });
    months.set(month, group);
  });
  const dateLabel = (item: MediaGalleryItem) =>
    item.effectiveDate.toLocaleDateString(locale, {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  const scope = `media-overview:${accountId}:${spaceId}:${visibility}`;
  const itemsByResourceId = new Map(
    items.map((item) => [mediaResourceId(item), item]),
  );

  function selectVisibility(showPrivate: boolean) {
    if (showPrivate === isPrivate) return;
    setSearch(showPrivate ? { visibility: 'private' } : {}, {
      replace: true,
      state: { taskOriginKey: location.state?.taskOriginKey },
    });
  }

  function renderTilePreview(item: MediaGalleryItem) {
    const { attachment } = item;
    const preview = (
      <MemoryPreview
        memoryId={item.parentId}
        attachmentId={attachment.id}
        hasThumbnail={attachment.hasThumbnail}
        isSensitive={attachment.isSensitive}
        resourceScopeKey={`${scope}:${item.parentType}:${item.parentId}:preview`}
        loadingMode="near-viewport"
        loadImage={(_parent, _attachment, signal, variant) =>
          loadMedia(item, variant ?? 'original', signal)
        }
      />
    );
    if (attachment.mediaType === 'IMAGE') return preview;
    if (attachment.isSensitive) return <SensitiveMediaCover />;
    if (attachment.mediaType === 'AUDIO') {
      return <VoiceNotePreview duration={attachment.durationSeconds} />;
    }
    return (
      <span className="video-poster">
        {attachment.hasThumbnail ? preview : null}
        <span className="video-play-mark" aria-hidden="true">
          <EimirIcon name="play" className="inline-icon" />
        </span>
        {attachment.durationSeconds != null ? (
          <span className="video-duration media-overlay">
            {voiceTime(attachment.durationSeconds)}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <div className="page page-reading media-overview-page">
      <PageHeader
        title={t('mediaOverview.title')}
        description={t('mediaOverview.description')}
      />
      <fieldset className="media-overview-visibility">
        <legend className="sr-only">{t('mediaOverview.filterLabel')}</legend>
        <button
          type="button"
          className="secondary"
          aria-pressed={!isPrivate}
          onClick={() => selectVisibility(false)}
        >
          {t('heartMomentProduct.visibilityShared')}
        </button>
        <button
          type="button"
          className="secondary"
          aria-pressed={isPrivate}
          onClick={() => selectVisibility(true)}
        >
          <EimirIcon name="nurfuer" />
          {t('heartMomentProduct.visibilityPrivate')}
        </button>
      </fieldset>
      {offline ? (
        <UiState
          compact
          kind="offline"
          title={t('mediaOverview.offline')}
          body={t('mediaOverview.offlineBody')}
        />
      ) : null}
      {mediaQuery.isPending && !offline ? (
        <UiState kind="loading" title={t('mediaOverview.loading')} />
      ) : null}
      {mediaQuery.isError && (forbidden || items.length === 0) ? (
        <ProblemState
          error={mediaQuery.error}
          onRetry={() => void mediaQuery.refetch()}
        />
      ) : null}
      {!mediaQuery.isPending && !mediaQuery.isError && items.length === 0 ? (
        <UiState
          kind="empty"
          title={t(
            isPrivate ? 'mediaOverview.privateEmpty' : 'mediaOverview.empty',
          )}
          body={t(
            isPrivate
              ? 'mediaOverview.privateEmptyBody'
              : 'mediaOverview.emptyBody',
          )}
        />
      ) : null}
      {items.length > 0 ? (
        <>
          <p className="media-overview-count">
            {t('mediaOverview.count', {
              count: mediaQuery.data?.pages[0].totalCount ?? items.length,
            })}
          </p>
          <MediaGallery
            resourceScopeKey={`${scope}:original`}
            items={items.map((item) => ({
              id: mediaResourceId(item),
              mediaType: item.attachment.mediaType,
              isSensitive: item.attachment.isSensitive,
              hasThumbnail: item.attachment.hasThumbnail,
              durationSeconds: item.attachment.durationSeconds,
            }))}
            loadMedia={(id, signal) => {
              const item = itemsByResourceId.get(id);
              if (!item)
                return Promise.reject(new Error('Media no longer available'));
              return loadMedia(item, 'original', signal);
            }}
            loadPoster={(id, signal) => {
              const item = itemsByResourceId.get(id);
              if (!item)
                return Promise.reject(new Error('Media no longer available'));
              return loadMedia(item, 'thumbnail', signal);
            }}
            loadPlayback={(id, signal) => {
              const item = itemsByResourceId.get(id);
              if (!item || item.parentType === 'PLAN') {
                return Promise.reject(new Error('Video no longer available'));
              }
              return loadVideoSource(
                apis,
                spaceId,
                item.parentType,
                item.parentId,
                item.attachment.id,
                signal,
              ).catch(handleMediaReadError);
            }}
            dismissWithHistory
            renderPreviews={(open) => (
              <div className="media-overview-months">
                {Array.from(months, ([month, group]) => (
                  <section key={month} aria-labelledby={`media-${month}`}>
                    <h2 id={`media-${month}`}>
                      {group[0].item.effectiveDate.toLocaleDateString(locale, {
                        timeZone: 'UTC',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </h2>
                    <div className="media-overview-grid">
                      {group.map(({ item, index }) => (
                        <button
                          key={item.attachment.id}
                          type="button"
                          className="media-overview-tile"
                          data-media-id={item.attachment.id}
                          onClick={() => open(index)}
                          aria-label={t(
                            `mediaOverview.open.${item.attachment.mediaType}`,
                            {
                              index: index + 1,
                              date: dateLabel(item),
                            },
                          )}
                          aria-description={
                            item.attachment.isSensitive
                              ? t('sensitiveMedia.label')
                              : undefined
                          }
                        >
                          {renderTilePreview(item)}
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
            renderCaption={(index, close) => {
              const item = items[index];
              if (!item) return null;
              return (
                <>
                  <span>{dateLabel(item)}</span>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      close(() => {
                        const selected = Array.from(
                          document.querySelectorAll<HTMLElement>(
                            '[data-media-id]',
                          ),
                        ).find(
                          (element) =>
                            element.dataset.mediaId === item.attachment.id,
                        );
                        const taskOriginKey = captureOrigin({
                          loadedPageCount,
                          selectedKey: item.attachment.id,
                          selectedOffset: selected?.getBoundingClientRect().top,
                        });
                        void navigate(
                          sourcePath[item.parentType](item.parentId),
                          { state: { taskOriginKey } },
                        );
                      })
                    }
                  >
                    {t(
                      item.parentType === 'PLAN'
                        ? 'mediaOverview.planSource'
                        : 'mediaOverview.source',
                    )}
                  </button>
                </>
              );
            }}
          />
          {mediaQuery.isError ? (
            <UiState
              compact
              kind="error"
              title={t('mediaOverview.pageError')}
              action={
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    void (mediaQuery.isFetchNextPageError
                      ? mediaQuery.fetchNextPage({ cancelRefetch: false })
                      : mediaQuery.refetch())
                  }
                >
                  {t('mediaOverview.retry')}
                </button>
              }
            />
          ) : null}
          {mediaQuery.hasNextPage && !mediaQuery.isError ? (
            <div className="media-overview-more">
              <AutoLoadMore
                query={mediaQuery}
                className="secondary"
                blocked={mediaQuery.isFetching || offline}
              >
                {t(
                  mediaQuery.isFetchingNextPage
                    ? 'mediaOverview.loadingMore'
                    : 'mediaOverview.more',
                )}
              </AutoLoadMore>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
