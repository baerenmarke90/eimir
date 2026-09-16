import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import type { AuthorSummary } from '../api/generated/models/AuthorSummary';
import type { StoryItem } from '../api/generated/models/StoryItem';
import {
  heartMomentDetailPath,
  memoryDetailPath,
  milestoneDetailPath,
} from '../client/routes';
import { resolvedLocale, useTranslation } from '../i18n';
import { MemoryPreview } from './MemoryPreview';
import { AuthorAvatar } from './PersonIdentity';
import {
  formatTimelineDate,
  storyAuthorLabel,
  storyItemKey,
  storyItemPresentation,
} from './storyPresentation';
import { UiState } from './UiState';
import { VisibilityBadge } from './VisibilityBadge';
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

export function StoryList({
  items,
  loadMemoryImage,
  loadHeartMomentImage,
  profilesApi,
  spaceId,
  onOpenItem,
}: {
  items: StoryItem[];
  loadMemoryImage: (memoryId: string, attachmentId: string) => Promise<string>;
  loadHeartMomentImage: (
    heartMomentId: string,
    attachmentId: string,
  ) => Promise<string>;
  profilesApi?: ProfilesApi;
  spaceId?: string;
  onOpenItem?: (
    event: MouseEvent<HTMLAnchorElement>,
    item: StoryItem,
    to: string,
  ) => void;
}) {
  const { t } = useTranslation();

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
        {items.map((item) => {
          const presentation = storyItemPresentation(item, t);
          const author = storyItemAuthor(item);
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

          const cardClasses = [
            'story-card',
            `story-card-${item.kind.toLowerCase().replace('_', '-')}`,
            imageAttachment ? 'has-image' : 'no-image',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <li key={storyItemKey(item)} className="story-timeline-item">
              <span className="story-timeline-marker" aria-hidden="true" />
              <Link
                className="story-card-link"
                to={productPath}
                data-task-item-key={storyItemKey(item)}
                onClick={(event) => onOpenItem?.(event, item, productPath)}
                aria-label={`${presentation.kindLabel}: ${presentation.title}`}
              >
                <article className={cardClasses}>
                  <div className="story-card-meta">
                    <span className="kind-badge">{presentation.kindLabel}</span>
                    {presentation.sharedLabel ? (
                      <VisibilityBadge
                        visibility="SPACE_SHARED"
                        size="small"
                        customLabel={presentation.sharedLabel}
                        className="shared-badge"
                      />
                    ) : null}
                  </div>

                  {imageAttachment && imageEntityId ? (
                    <MemoryPreview
                      memoryId={imageEntityId}
                      attachmentId={imageAttachment.id}
                      loadImage={imageLoader}
                    />
                  ) : null}

                  <h4>{presentation.title}</h4>
                  {presentation.preview ? (
                    <p className="story-preview">{presentation.preview}</p>
                  ) : null}

                  <div className="story-card-footer">
                    <time
                      dateTime={item.effectiveDate.toISOString().slice(0, 10)}
                    >
                      {formatTimelineDate(item.effectiveDate, locale)}
                    </time>
                    <div className="story-card-footer-author">
                      {author ? (
                        <span className="momente-author-meta">
                          <AuthorAvatar
                            author={author}
                            profilesApi={profilesApi}
                            spaceId={spaceId}
                          />
                          <span>
                            {t('story.byAuthor', {
                              author: storyAuthorLabel(author),
                            })}
                          </span>
                        </span>
                      ) : (
                        <span>
                          {t('story.byAuthor', {
                            author: presentation.author,
                          })}
                        </span>
                      )}
                      {presentation.mediaLabel ? (
                        <span className="media-label">
                          <svg
                            viewBox="0 0 24 24"
                            width="12"
                            height="12"
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
                          <span>{presentation.mediaLabel}</span>
                        </span>
                      ) : null}
                    </div>
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
