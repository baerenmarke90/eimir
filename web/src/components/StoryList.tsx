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
import { Configuration } from '../client/apiConfiguration';
import { useApiRuntime } from '../client/apiRuntimeContext';
import {
  type CommentParentKind,
  commentPresenceQueryKey,
  listCommentsPage,
} from '../client/commentQueries';
import { galleryCover } from '../client/galleryCover';
import type { ObjectUrlSource } from '../client/objectUrlResource';
import { usePartnerNickname } from '../client/partnerNickname';
import {
  heartMomentDetailPath,
  memoryDetailPath,
  milestoneDetailPath,
} from '../client/routes';
import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { ExperienceAnswers } from './ExperienceAnswers';
import { HeartEmotionBadge } from './HeartEmotionVisual';
import { MemoryPreview } from './MemoryPreview';
import { MomentDate } from './MomentDate';
import {
  formatTimelineDate,
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
          <EimirIcon name="comment" className="inline-icon" />
        </span>
      ) : null}
    </>
  );
}

/**
 * The Timeline node carries the kind (#969): a plain dot for the default
 * Memory, a heart for a Heart Moment and a ringed star for a Milestone, so a
 * special point in time is marked on the chronology itself rather than with a
 * badge or stripe inside the card. Happiness uses the existing highlights glyph.
 * Shapes differ, so the distinction never relies on colour; the card link's
 * accessible name states the kind.
 */
function StoryTimelineMarker({ item }: { item: StoryItem }) {
  const { kind } = item;
  if (kind === 'MEMORY' && item.memory.experienceKind === 'HAPPINESS') {
    return (
      <span
        className="story-timeline-marker story-timeline-marker-happiness"
        aria-hidden="true"
      >
        <EimirIcon name="highlights" />
      </span>
    );
  }
  if (kind === 'HEART_MOMENT') {
    return (
      <span
        className="story-timeline-marker story-timeline-marker-heart-moment"
        aria-hidden="true"
      >
        <EimirIcon name="heart" variant="filled" />
      </span>
    );
  }
  if (kind === 'MILESTONE') {
    return (
      <span
        className="story-timeline-marker story-timeline-marker-milestone"
        aria-hidden="true"
      >
        <EimirIcon name="star" variant="filled" />
      </span>
    );
  }
  return <span className="story-timeline-marker" aria-hidden="true" />;
}

export function StoryList({
  items,
  loadMemoryImage,
  loadHeartMomentImage,
  spaceId,
  onOpenItem,
  progressiveReveal = false,
}: {
  items: StoryItem[];
  loadMemoryImage: (
    memoryId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ) => Promise<ObjectUrlSource>;
  loadHeartMomentImage: (
    heartMomentId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ) => Promise<ObjectUrlSource>;
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
  const { nicknameFor } = usePartnerNickname();
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
          const presentation = storyItemPresentation(item, t, nicknameFor);
          const _author = storyItemAuthor(item);
          const firstMemoryAttachment =
            item.kind === 'MEMORY' ? galleryCover(item.memory) : undefined;
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
          const isHappiness =
            item.kind === 'MEMORY' &&
            item.memory.experienceKind === 'HAPPINESS';
          const accessibleKind = isHappiness
            ? t('coupleExperiences.sharedHappiness')
            : presentation.kindLabel;
          const accessibleName = `${accessibleKind}: ${presentation.title}${
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
              <StoryTimelineMarker item={item} />
              <Link
                className={`story-card-link${imageAttachment ? ' story-card-photo-led' : ''}`}
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
                      hasThumbnail={imageAttachment.hasThumbnail}
                      isSensitive={imageAttachment.isSensitive}
                      resourceScopeKey={`story-preview:${spaceId ?? ''}:${imageEntityId}`}
                      loadImage={imageLoader}
                      loadingMode={
                        progressiveReveal ? 'near-viewport' : 'immediate'
                      }
                    />
                  ) : null}

                  {!presentation.titleIsDate ? (
                    <h4>{presentation.title}</h4>
                  ) : null}
                  {item.kind === 'MEMORY' &&
                  item.memory.experienceKind &&
                  (item.memory.experienceAnswers?.length ?? 0) > 0 ? (
                    <ExperienceAnswers
                      answers={item.memory.experienceAnswers ?? []}
                      kind={item.memory.experienceKind}
                      compact
                      showLabel={!isHappiness}
                    />
                  ) : null}
                  {item.kind === 'HEART_MOMENT' ? (
                    <HeartEmotionBadge emotion={item.heartMoment.emotion} />
                  ) : presentation.preview ? (
                    <p className="story-preview">{presentation.preview}</p>
                  ) : null}

                  <div className="story-card-footer" id={metaId}>
                    <span className="story-card-when-where">
                      <MomentDate
                        dateTime={item.effectiveDate.toISOString().slice(0, 10)}
                      >
                        {formatTimelineDate(item.effectiveDate, locale)}
                      </MomentDate>
                      {(item.kind === 'MEMORY'
                        ? item.memory.places
                        : item.kind === 'HEART_MOMENT'
                          ? item.heartMoment.places
                          : item.milestone.places
                      )?.map((place) => (
                        <span className="story-card-place" key={place.id}>
                          <EimirIcon name="orte" />
                          {place.name}
                        </span>
                      ))}
                    </span>
                    <span className="story-card-footer-author">
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
                          <EimirIcon name="foto" className="inline-icon" />
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
