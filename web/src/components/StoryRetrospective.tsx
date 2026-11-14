import type { ObjectUrlSource } from '../client/objectUrlResource';
import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardItem } from '../api/generated/models/DashboardItem';
import type { RediscoveryContext } from '../api/generated/models/RediscoveryContext';
import { dashboardItemTitle } from '../client/dashboardPresentation';
import { dashboardItemPath } from '../client/m4Product';
import { resolvedLocale, useTranslation } from '../i18n';
import { MemoryPreview } from './MemoryPreview';
import {
  RediscoverySecondaryLine,
  useRediscoveryWording,
} from './RediscoveryWording';
import {
  dashboardRediscoverySource,
  viewerToday,
} from './rediscoverySelection';
import { EimirIcon } from './EimirIcon';
import { formatStoryDate } from './storyPresentation';

/**
 * Discover presentation of the already-authorized #452 Dashboard candidate.
 * It deliberately neither selects nor stores any historic relationship content.
 */
export function StoryRetrospective({
  item,
  loadMemoryImage,
  onOpen,
  compact = false,
  rediscovery,
  viewerLocalDate,
}: {
  item: DashboardItem;
  rediscovery?: RediscoveryContext | null;
  viewerLocalDate?: Date | null;
  compact?: boolean;
  loadMemoryImage: (
    memoryId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ) => Promise<ObjectUrlSource>;
  onOpen: (event: MouseEvent<HTMLAnchorElement>, path: string) => void;
}) {
  const { t } = useTranslation();
  // #1790 C2: same wording as the Wir card for the same moment and day.
  const wording = useRediscoveryWording(
    dashboardRediscoverySource(item, rediscovery),
    { today: viewerToday(viewerLocalDate) },
  );
  const path = dashboardItemPath(item.type, item.id);
  if (!path) return null;

  const attachmentId = item.type === 'MEMORY' ? item.previewAttachmentId : null;
  const date = item.occurredOn ?? item.createdAt ?? null;
  const title = wording?.headline ?? dashboardItemTitle(item, t).title;

  return (
    <section
      className={`momente-retrospective${compact ? ' momente-retrospective-compact' : ''}`}
      data-discover-wide={compact || undefined}
      aria-labelledby={compact ? undefined : 'momente-retrospective-heading'}
      aria-label={compact ? t('story.retrospectiveHeading') : undefined}
    >
      {!compact ? (
        <div className="momente-section-header">
          <div>
            <h3
              id="momente-retrospective-heading"
              className="momente-section-title"
            >
              {t('story.retrospectiveHeading')}
            </h3>
          </div>
        </div>
      ) : null}
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
              hasThumbnail={item.previewHasThumbnail}
              isSensitive={item.previewIsSensitive}
              loadImage={loadMemoryImage}
              loadingMode="near-viewport"
            />
          </span>
        ) : null}
        <span className="momente-retrospective-copy">
          <span
            className="momente-retrospective-title"
            data-long={title.length > 180 || undefined}
          >
            {title}
          </span>
          <RediscoverySecondaryLine
            className="momente-retrospective-date"
            variantLine={wording?.variantLine ?? null}
            date={date ? formatStoryDate(date, resolvedLocale()) : null}
            dateTime={date?.toISOString().slice(0, 10)}
          />
          <EimirIcon
            name="chevron-right"
            className="momente-retrospective-chevron"
          />
        </span>
      </Link>
    </section>
  );
}
