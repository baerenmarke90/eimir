import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { SharedPhoto } from '../api/generated/models/SharedPhoto';
import {
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';
import type { ReferenceApis } from '../client/referenceFlow';
import {
  heartMomentDetailPath,
  memoryDetailPath,
  STORY_PHOTOS_ROUTE,
} from '../client/routes';
import { loadAuthorizedStoryImage } from '../client/storyMediaLoader';
import { useTaskOrigin } from '../client/taskOrigin';
import { resolvedLocale, useTranslation } from '../i18n';
import { MediaGallery } from './MediaGallery';
import { MemoryPreview } from './MemoryPreview';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';
import './SharedPhotosPage.css';

const photoResourceId = (photo: SharedPhoto) =>
  `${photo.parentType}:${photo.parentId}:${photo.attachment.id}`;

export function SharedPhotosPage({
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
  const { captureOrigin, resolveOrigin, registerOriginMetadata } =
    useTaskOrigin();
  // Under the existing Story prefix so parent mutations invalidate this projection too.
  const queryKey = ['story', spaceId, 'photos', accountId] as const;
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
  const photosQuery = useInfiniteQuery({
    queryKey,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      try {
        return await apis.story.getSharedPhotos(
          { spaceId, cursor: pageParam ?? undefined, limit: 40 },
          { signal },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    getNextPageParam: (page) =>
      page.hasMore ? (page.nextCursor ?? undefined) : undefined,
    retry: false,
  });
  const forbidden =
    photosQuery.isError &&
    ['unauthorized', 'permission', 'notFound'].includes(
      clientProblemKind(photosQuery.error),
    );
  const photos = forbidden
    ? []
    : Array.from(
        new Map(
          (photosQuery.data?.pages.flatMap((page) => page.items) ?? []).map(
            (photo) => [photo.attachment.id, photo],
          ),
        ).values(),
      );
  const loadedPageCount = photosQuery.data?.pages.length ?? 1;
  useEffect(
    () => registerOriginMetadata({ loadedPageCount }),
    [registerOriginMetadata, loadedPageCount],
  );
  const returnKey = (location.state as { taskReturnKey?: unknown } | null)
    ?.taskReturnKey;
  const origin = resolveOrigin(returnKey);
  const restoredRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      !origin ||
      origin.to !== STORY_PHOTOS_ROUTE ||
      !photosQuery.data ||
      photosQuery.isFetching
    )
      return;
    const entry = `${location.key}:${String(returnKey)}`;
    if (restoredRef.current === entry) return;
    if (
      loadedPageCount < origin.loadedPageCount &&
      photosQuery.hasNextPage &&
      !photosQuery.isError &&
      !offline
    ) {
      void photosQuery.fetchNextPage();
      return;
    }
    let settleFrame = 0;
    const restore = () => {
      const selected = Array.from(
        document.querySelectorAll<HTMLElement>('[data-photo-id]'),
      ).find((element) => element.dataset.photoId === origin.selectedKey);
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
    location.key,
    returnKey,
    loadedPageCount,
    photosQuery.data,
    photosQuery.isFetching,
    photosQuery.hasNextPage,
    photosQuery.isError,
    photosQuery.fetchNextPage,
    offline,
  ]);

  const loadPhoto = useCallback(
    async (
      photo: SharedPhoto,
      variant: 'thumbnail' | 'original',
      signal?: AbortSignal,
    ) => {
      try {
        return await loadAuthorizedStoryImage(
          apis,
          spaceId,
          photo.parentType,
          photo.parentId,
          photo.attachment.id,
          { signal, variant },
        );
      } catch (error) {
        const normalized = await normalizeClientError(error);
        if (
          ['unauthorized', 'permission', 'notFound'].includes(
            clientProblemKind(normalized),
          )
        ) {
          void queryClient.invalidateQueries({
            queryKey: ['story', spaceId, 'photos', accountId],
          });
        }
        throw normalized;
      }
    },
    [apis, spaceId, accountId, queryClient],
  );

  const months = new Map<
    string,
    Array<{ photo: SharedPhoto; index: number }>
  >();
  photos.forEach((photo, index) => {
    const month = photo.effectiveDate.toISOString().slice(0, 7);
    const group = months.get(month) ?? [];
    group.push({ photo, index });
    months.set(month, group);
  });
  const dateLabel = (photo: SharedPhoto) =>
    photo.effectiveDate.toLocaleDateString(locale, {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  const scope = `shared-photos:${accountId}:${spaceId}`;

  return (
    <div className="page page-reading shared-photos-page">
      <PageHeader
        before={
          <Link className="back-link" to="/story">
            {t('storyYears.backToMoments')}
          </Link>
        }
        eyebrow={t('sharedPhotos.eyebrow')}
        title={t('sharedPhotos.title')}
        description={t('sharedPhotos.description')}
      />
      {offline ? (
        <UiState
          compact
          kind="offline"
          title={t('sharedPhotos.offline')}
          body={t('sharedPhotos.offlineBody')}
        />
      ) : null}
      {photosQuery.isPending && !offline ? (
        <UiState kind="loading" title={t('sharedPhotos.loading')} />
      ) : null}
      {photosQuery.isError && (forbidden || photos.length === 0) ? (
        <ProblemState
          error={photosQuery.error}
          onRetry={() => void photosQuery.refetch()}
        />
      ) : null}
      {!photosQuery.isPending && !photosQuery.isError && photos.length === 0 ? (
        <UiState
          kind="empty"
          title={t('sharedPhotos.empty')}
          body={t('sharedPhotos.emptyBody')}
        />
      ) : null}
      {photos.length > 0 ? (
        <>
          <p className="shared-photos-count">
            {t('sharedPhotos.count', {
              count: photosQuery.data?.pages[0].totalCount ?? photos.length,
            })}
          </p>
          <MediaGallery
            resourceScopeKey={`${scope}:original`}
            items={photos.map((photo) => ({
              id: photoResourceId(photo),
              mediaType: photo.attachment.mediaType,
            }))}
            loadMedia={(id, signal) => {
              const photo = photos.find((item) => photoResourceId(item) === id);
              if (!photo)
                return Promise.reject(
                  new Error('Photo no longer in projection'),
                );
              return loadPhoto(photo, 'original', signal);
            }}
            dismissWithHistory
            renderPreviews={(open) => (
              <div className="shared-photos-months">
                {Array.from(months, ([month, group]) => (
                  <section key={month} aria-labelledby={`photos-${month}`}>
                    <h2 id={`photos-${month}`}>
                      {group[0].photo.effectiveDate.toLocaleDateString(locale, {
                        timeZone: 'UTC',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </h2>
                    <div className="shared-photos-grid">
                      {group.map(({ photo, index }) => (
                        <button
                          key={photo.attachment.id}
                          type="button"
                          className="shared-photos-tile"
                          data-photo-id={photo.attachment.id}
                          onClick={() => open(index)}
                          aria-label={t('sharedPhotos.open', {
                            index: index + 1,
                            date: dateLabel(photo),
                          })}
                        >
                          <MemoryPreview
                            memoryId={photo.parentId}
                            attachmentId={photo.attachment.id}
                            resourceScopeKey={`${scope}:${photo.parentType}:${photo.parentId}:preview`}
                            loadingMode="near-viewport"
                            loadImage={(_parent, _attachment, signal) =>
                              loadPhoto(
                                photo,
                                photo.attachment.hasThumbnail
                                  ? 'thumbnail'
                                  : 'original',
                                signal,
                              )
                            }
                          />
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
            renderCaption={(index, close) => {
              const photo = photos[index];
              if (!photo) return null;
              return (
                <>
                  <span>{dateLabel(photo)}</span>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      close(() => {
                        const selected = Array.from(
                          document.querySelectorAll<HTMLElement>(
                            '[data-photo-id]',
                          ),
                        ).find(
                          (element) =>
                            element.dataset.photoId === photo.attachment.id,
                        );
                        const taskOriginKey = captureOrigin({
                          loadedPageCount,
                          selectedKey: photo.attachment.id,
                          selectedOffset: selected?.getBoundingClientRect().top,
                        });
                        void navigate(
                          photo.parentType === 'MEMORY'
                            ? memoryDetailPath(photo.parentId)
                            : heartMomentDetailPath(photo.parentId),
                          { state: { taskOriginKey } },
                        );
                      })
                    }
                  >
                    {t('sharedPhotos.source')}
                  </button>
                </>
              );
            }}
          />
          {photosQuery.isError ? (
            <UiState
              compact
              kind="error"
              title={t('sharedPhotos.pageError')}
              action={
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    void (photosQuery.isFetchNextPageError
                      ? photosQuery.fetchNextPage()
                      : photosQuery.refetch())
                  }
                >
                  {t('sharedPhotos.retry')}
                </button>
              }
            />
          ) : null}
          {photosQuery.hasNextPage && !photosQuery.isError ? (
            <div className="shared-photos-more">
              <button
                type="button"
                className="secondary"
                disabled={photosQuery.isFetching || offline}
                onClick={() => void photosQuery.fetchNextPage()}
              >
                {t(
                  photosQuery.isFetchingNextPage
                    ? 'sharedPhotos.loadingMore'
                    : 'sharedPhotos.more',
                )}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
