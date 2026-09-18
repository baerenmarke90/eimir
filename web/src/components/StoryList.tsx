import { useQuery } from '@tanstack/react-query';
import {
  type MouseEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { CommentsApi } from '../api/generated/apis/CommentsApi';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import type { AuthorSummary } from '../api/generated/models/AuthorSummary';
import type { StoryItem } from '../api/generated/models/StoryItem';
import { Configuration } from '../api/generated/runtime';
import { useApiRuntime } from '../client/apiRuntimeContext';
import {
  commentPresenceQueryKey,
  type CommentParentKind,
  listCommentsPage,
} from '../client/commentQueries';
import {
  heartMomentDetailPath,
  memoryDetailPath,
  milestoneDetailPath,
} from '../client/routes';
import { resolvedLocale, useTranslation } from '../i18n';
import { HeartEmotionBadge } from './HeartEmotionVisual';
import { MemoryPreview } from './MemoryPreview';
import { AuthorAvatar } from './PersonIdentity';
import {
  formatTimelineDate,
  storyAuthorLabel,
  storyItemKey,
  storyItemPresentation,
} from './storyPresentation';
import { UiState } from './UiState';
import { VisibilityGlyph } from './VisibilityBadge';
import './StoryListPolish.css';

function storyProductPath(item: StoryItem): string {
  switch (item.kind) {
    case 'MEMORY':
      return memoryDetailPath(item.memory.id);
    case 'HEART_MOMENT':
      return heartMomentDetailPath(item.heartMoment.id);
    case 'MILESTONE':
      return milestoneDetailPath(item.milestone.id);
  }
}

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

function storyCommentParent(item: StoryItem): {
  parentKind: CommentParentKind;
  parentId: string;
} {
  switch (item.kind) {
    case 'MEMORY':
      return { parentKind: 'memory', parentId: item.memory.id };
    case 'HEART_MOMENT':
      return { parentKind: 'heartMoment', parentId: item.heartMoment.id };
    case 'MILESTONE':
      return { parentKind: 'milestone', parentId: item.milestone.id };
  }
}

function StoryCommentPresence({
  item,
  commentsApi,
  spaceId,
}: {
  item: StoryItem;
  commentsApi?: CommentsApi;
  spaceId?: string;
}) {
  const { t } = useTranslation();
  const sentinelRef = useRef<HTMLSpanElement | null>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const { parentKind, parentId } = storyCommentParent(item);

  useEffect(() => {
    if (!commentsApi || !spaceId) return;
    const node = sentinelRef.current;
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      setNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setNearViewport(true);
        observer.disconnect();
      },
      { rootMargin: '160px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [commentsApi, spaceId]);

  const presenceQuery = useQuery({
    queryKey: commentPresenceQueryKey(spaceId ?? '', parentKind, parentId),
    queryFn: async () => {
      if (!commentsApi || !spaceId) return false;
      const page = await listCommentsPage(
        commentsApi,
        parentKind,
        spaceId,
        parentId,
        null,
        1,
      );
      return page.items.length > 0;
    },
    enabled: Boolean(commentsApi && spaceId && nearViewport),
    staleTime: 60_000,
    retry: false,
  });

  return (
    <>
      <span
        ref={sentinelRef}
        className="story-comment-presence-sentinel"
        aria-hidden="true"
      />
      {presenceQuery.data ? (
        <span
          className="story-card-meta-item comment-label"
          role="img"
          aria-label={t('comments.timelinePresence')}
          title={t('comments.timelinePresence')}
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
          >
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
          </svg>
        </span>
      ) : null}
    </>
  );
}

/**
 * The Timeline node carries the kind (#969): a plain dot for the default
 * Memory, a heart for a Heart Moment and a ringed star for a Milestone, so a
 * special point in time is marked on the chronology itself rather than with a
 * badge or stripe inside the card. Shapes differ, so the distinction never
 * relies on colour; the card link's accessible name states the kind.
 */
function StoryTimelineMarker({ kind }: { kind: StoryItem['kind'] }) {
  if (kind === 'HEART_MOMENT') {
    return (
      <span
        className="story-timeline-marker story-timeline-marker-heart-moment"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      </span>
    );
  }
  if (kind === 'MILESTONE') {
    return (
      <span
        className="story-timeline-marker story-timeline-marker-milestone"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          width="12"
          height="12"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 2l2.4 7.4h7.6l-6.1 4.5 2.3 7.1-6.2-4.5-6.2 4.5 2.3-7.1-6.1-4.5h7.6z" />
        </svg>
      </span>
    );
  }
  return <span className="story-timeline-marker" aria-hidden="true" />;
}

export function StoryList({
  items,
  loadMemoryImage,
  loadHeartMomentImage,
  profilesApi,
  spaceId,
  currentAccountId,
  onOpenItem,
  progressiveReveal = false,
}: {
  items: StoryItem[];
  loadMemoryImage: (memoryId: string, attachmentId: string) => Promise<string>;
  loadHeartMomentImage: (
    heartMomentId: string,
    attachmentId: string,
  ) => Promise<string>;
  profilesApi?: ProfilesApi;
  spaceId?: string;
  currentAccountId?: string;
  onOpenItem?: (
    event: MouseEvent<HTMLAnchorElement>,
    item: StoryItem,
    to: string,
  ) => void;
  progressiveReveal?: boolean;
}) {
  const { t } = useTranslation();
  const listId = useId();
  const apiRuntime = useApiRuntime();
  const commentsApi = useMemo(
    () =>
      apiRuntime
        ? new CommentsApi(
            new Configuration({
              basePath: apiRuntime.apiBaseUrl,
              headers: {
                Authorization: `Bearer ${apiRuntime.accessToken}`,
              },
            }),
          )
        : undefined,
    [apiRuntime],
  );

  if (items.length === 0) {
    return (
      <UiState
        kind="empty"
        title={t('story.emptyTitle')}
        body={t('story.emptyBody')}
      />
    );
  }

  const locale = resolvedLocale();

  return (
    <section className="story-timeline" aria-label={t('story.aria')}>
      <ol className="story-list">
        {items.map((item, index) => {
          const itemKey = storyItemKey(item);
          const presentation = storyItemPresentation(item, t);
          const author = storyItemAuthor(item);
          const authorLabel = storyAuthorLabel(author, currentAccountId);
          const authorAttribution = t('story.byAuthor', {
            author: authorLabel,
          });
          const firstMemoryAttachment =
            item.kind === 'MEMORY' ? item.memory.attachments[0] : undefined;
          const heartAttachment =
            item.kind === 'HEART_MOMENT'
              ? (item.heartMoment.attachment ?? undefined)
              : undefined;
          const imageAttachment = firstMemoryAttachment ?? heartAttachment;
          const imageEntityId =
            item.kind === 'MEMORY'
              ? item.memory.id
              : item.kind === 'HEART_MOMENT'
                ? item.heartMoment.id
                : '';
          const imageLoader =
            item.kind === 'HEART_MOMENT'
              ? loadHeartMomentImage
              : loadMemoryImage;
          const productPath = storyProductPath(item);
          const kindSlug = item.kind.toLowerCase().replace('_', '-');

          const cardClasses = [
            'story-card',
            `story-card-${kindSlug}`,
            imageAttachment ? 'has-image' : 'no-image',
          ]
            .filter(Boolean)
            .join(' ');

          const metaId = `${listId}-meta-${index}`;
          const accessibleName = `${presentation.kindLabel}: ${presentation.title}${
            item.kind === 'HEART_MOMENT' && presentation.preview
              ? ` ${t('heartMomentProduct.emotionLabel')}: ${presentation.preview}`
              : ''
          }`;

          return (
            <li
              key={itemKey}
              className={`story-timeline-item story-timeline-item-${kindSlug}${progressiveReveal ? ' story-timeline-progressive-reveal' : ''}`}
              data-timeline-reveal-key={
                progressiveReveal ? `item:${itemKey}` : undefined
              }
            >
              <StoryTimelineMarker kind={item.kind} />
              <Link
                className="story-card-link"
                to={productPath}
                data-task-item-key={itemKey}
                onClick={(event) => onOpenItem?.(event, item, productPath)}
                aria-label={accessibleName}
                aria-describedby={metaId}
              >
                <article
                  className={cardClasses}
                  data-heart-emotion={
                    item.kind === 'HEART_MOMENT'
                      ? item.heartMoment.emotion
                      : undefined
                  }
                >
                  {imageAttachment && imageEntityId ? (
                    <MemoryPreview
                      memoryId={imageEntityId}
                      attachmentId={imageAttachment.id}
                      loadImage={imageLoader}
                      loadingMode={
                        progressiveReveal ? 'near-viewport' : 'immediate'
                      }
                    />
                  ) : null}

                  <h4>{presentation.title}</h4>
                  {item.kind === 'HEART_MOMENT' ? (
                    <HeartEmotionBadge emotion={item.heartMoment.emotion} />
                  ) : presentation.preview ? (
                    <p className="story-preview">{presentation.preview}</p>
                  ) : null}

                  <div className="story-card-footer" id={metaId}>
                    <time
                      dateTime={item.effectiveDate.toISOString().slice(0, 10)}
                    >
                      {formatTimelineDate(item.effectiveDate, locale)}
                    </time>
                    <span className="story-card-footer-author">
                      {author ? (
                        <span
                          className="momente-author-meta"
                          role="group"
                          aria-label={authorAttribution}
                        >
                          <span aria-hidden="true">
                            <AuthorAvatar
                              author={author}
                              profilesApi={profilesApi}
                              spaceId={spaceId}
                            />
                          </span>
                          <span
                            className="story-card-author"
                            aria-hidden="true"
                          >
                            {authorAttribution}
                          </span>
                        </span>
                      ) : (
                        <span className="story-card-author">
                          {presentation.author}
                        </span>
                      )}
                      {presentation.visibility ? (
                        <span
                          className={`story-card-meta-item story-card-visibility story-card-visibility-${presentation.visibility.toLowerCase()}`}
                          role="img"
                          aria-label={presentation.visibilityLabel}
                          title={presentation.visibilityLabel}
                        >
                          <VisibilityGlyph
                            visibility={presentation.visibility}
                          />
                        </span>
                      ) : null}
                      {presentation.mediaCount ? (
                        <span
                          className="story-card-meta-item media-label"
                          role="img"
                          aria-label={presentation.mediaLabel}
                          title={presentation.mediaLabel}
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
                          >
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <path d="m21 15-5-5L5 21" />
                          </svg>
                          {presentation.mediaCount}
                        </span>
                      ) : null}
                      {commentsApi && spaceId ? (
                        <StoryCommentPresence
                          item={item}
                          commentsApi={commentsApi}
                          spaceId={spaceId}
                        />
                      ) : null}
                    </span>
                  </div>
                </article>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
