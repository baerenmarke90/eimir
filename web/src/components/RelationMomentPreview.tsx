import { MomentDate } from './MomentDate';
import { memoryPreviewTitle } from '../client/memoryProduct';
import { useCallback } from 'react';
import type { ReferenceApis } from '../client/referenceFlow';
import type { PlanningRelationTarget } from '../client/sharedPlanning';
import { loadAuthorizedStoryImageResource } from '../client/storyMediaLoader';
import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { MemoryPreview } from './MemoryPreview';

/** The same recognizable content anatomy in the picker and saved relations. */
export function RelationMomentPreview({
  target,
  spaceId,
  mediaApis,
  mediaProminent = false,
}: {
  target: PlanningRelationTarget;
  spaceId: string;
  mediaApis: ReferenceApis | null;
  mediaProminent?: boolean;
}) {
  const { t } = useTranslation();
  const { title, titleIsDate } =
    target.kind === 'MEMORY'
      ? memoryPreviewTitle(target.label, target.effectiveDate, t)
      : { title: target.label, titleIsDate: false };
  const loadImage = useCallback(
    (parentId: string, attachmentId: string, signal?: AbortSignal) => {
      if (!mediaApis || target.kind === 'MILESTONE')
        return Promise.reject(new Error('Media is unavailable.'));
      return loadAuthorizedStoryImageResource(
        mediaApis,
        spaceId,
        target.kind,
        parentId,
        attachmentId,
        { signal, variant: 'thumbnail' },
      );
    },
    [mediaApis, spaceId, target.kind],
  );
  const date =
    target.effectiveDate.getTime() === 0
      ? null
      : new Intl.DateTimeFormat(resolvedLocale(), {
          dateStyle: 'medium',
          timeZone: 'UTC',
        }).format(target.effectiveDate);
  return (
    <span
      className={`relation-moment-preview relation-moment-preview-${target.kind.toLowerCase()} ${mediaProminent ? 'relation-moment-prominent' : ''}`}
    >
      {target.attachment || !mediaProminent ? (
        <span className="relation-moment-art" aria-hidden="true">
          {target.attachment && mediaApis ? (
            <MemoryPreview
              memoryId={target.id}
              attachmentId={target.attachment.id}
              isSensitive={target.attachment.isSensitive}
              loadImage={loadImage}
              loadingMode="near-viewport"
              resourceScopeKey={`relation-preview:${spaceId}:${target.kind}:${target.id}`}
            />
          ) : (
            <EimirIcon
              name={
                target.kind === 'MEMORY'
                  ? 'erinnerungen'
                  : target.kind === 'HEART_MOMENT'
                    ? 'denken'
                    : 'meilensteine'
              }
            />
          )}
        </span>
      ) : null}
      <span className="relation-moment-copy">
        <strong>{title}</strong>
        {target.excerpt && target.excerpt !== target.label ? (
          <span className="relation-moment-excerpt">{target.excerpt}</span>
        ) : null}
        <span className="planning-meta">
          {t(`m5s3.relations.kind.${target.kind}`)}
          {date && !titleIsDate ? (
            <>
              {' '}
              ·{' '}
              <MomentDate
                dateTime={target.effectiveDate.toISOString().slice(0, 10)}
              >
                {date}
              </MomentDate>
            </>
          ) : null}
        </span>
      </span>
    </span>
  );
}
