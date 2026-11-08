import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { useVideoTransfer } from '../client/backgroundVideoUploads';

export function MediaProcessingState({
  status,
  attachmentId,
  compact = false,
}: {
  status: string;
  attachmentId?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const transfer = useVideoTransfer(attachmentId);
  const uploading = status === 'PENDING';
  const failed =
    status === 'FAILED' || (uploading && transfer?.phase === 'failed');
  return (
    <div
      className={`media-processing-state${compact ? ' media-processing-state-compact' : ''}`}
      role={failed ? undefined : 'status'}
    >
      <EimirIcon name="video" />
      <span>
        {t(
          failed
            ? compact
              ? 'video.savedFailedShort'
              : 'video.savedFailed'
            : uploading
              ? 'video.uploading'
              : compact
                ? 'video.processingShort'
                : 'video.processing',
        )}
      </span>
      {uploading && !failed ? (
        <>
          <progress
            max={100}
            value={transfer?.progress}
            aria-label={t('video.uploading')}
          />
          {transfer ? (
            <span>
              {new Intl.NumberFormat(resolvedLocale(), {
                style: 'percent',
                maximumFractionDigits: 0,
              }).format(transfer.progress / 100)}
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
