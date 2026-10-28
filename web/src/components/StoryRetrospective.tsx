import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardItem } from '../api/generated/models/DashboardItem';
import { dashboardItemPath } from '../client/m4Product';
import { resolvedLocale, useTranslation } from '../i18n';
import { MemoryPreview } from './MemoryPreview';
import { formatStoryDate } from './storyPresentation';

/**
 * Discover presentation of the already-authorized #452 Dashboard candidate.
 * It deliberately neither selects nor stores any historic relationship content.
 */
export function StoryRetrospective({
  item,
  loadMemoryImage,
  onOpen,
}: {
  item: DashboardItem;
  loadMemoryImage: (
    memoryId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ) => Promise<string>;
  onOpen: (event: MouseEvent<HTMLAnchorElement>, path: string) => void;
}) {
  const { t } = useTranslation();
  const path = dashboardItemPath(item.type, item.id);
  if (!path) return null;

  const attachmentId = item.type === 'MEMORY' ? item.previewAttachmentId : null;
  const date = item.occurredOn ?? item.createdAt ?? null;
  const title = item.titleOrText || t('m5s5.dashboard.itemFallback');

  return (
    <section
      className="momente-retrospective"
      aria-labelledby="momente-retrospective-heading"
    >
      <div className="momente-section-header">
        <div>
          <h3
            id="momente-retrospective-heading"
            className="momente-section-title"
          >
            {t('story.retrospectiveHeading')}
          </h3>
          <p className="momente-section-subhead">
            {t('story.retrospectiveSubhead')}
          </p>
        </div>
      </div>
      <Link
        to={path}
        className={`momente-retrospective-link${attachmentId ? ' has-media' : ''}`}
        onClick={(event) => onOpen(event, path)}
      >
        {attachmentId ? (
          <span className="momente-retrospective-media">
            <MemoryPreview
              memoryId={item.id}
              attachmentId={attachmentId}
              isSensitive={item.previewIsSensitive}
              loadImage={loadMemoryImage}
              loadingMode="near-viewport"
            />
          </span>
        ) : null}
        <span className="momente-retrospective-copy">
          <span className="momente-retrospective-kicker">
            {t('m5s5.today.living.retrospectiveLabel')}
          </span>
          <span className="momente-retrospective-title">{title}</span>
          {date ? (
            <time
              className="momente-retrospective-date"
              dateTime={date.toISOString().slice(0, 10)}
            >
              {formatStoryDate(date, resolvedLocale())}
            </time>
          ) : null}
          <span className="momente-retrospective-action">
            {t('story.retrospectiveOpen')} →
          </span>
        </span>
      </Link>
    </section>
  );
}
