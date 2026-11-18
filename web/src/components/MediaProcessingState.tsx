import { useVideoTransfer } from '../client/backgroundVideoUploads';
import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';

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
  const pending = status === 'PENDING';
  const uploading = pending && transfer?.phase !== 'processing';
  const uploadFailed = pending && transfer?.phase === 'failed';
  const failed = status === 'FAILED' || uploadFailed;
  return (
    <div
      className={`media-processing-state${compact ? ' media-processing-state-compact' : ''}`}
      role={failed ? undefined : 'status'}
    >
      <EimirIcon name="video" />
      <span>
        {t(
          uploadFailed
            ? 'video.uploadInterrupted'
            : failed
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
      {!failed ? (
        <div className="media-processing-progress">
          <progress
            max={100}
            value={uploading ? transfer?.progress : undefined}
            aria-label={t(uploading ? 'video.uploading' : 'video.processing')}
          />
          <span className="media-processing-percent">
            {uploading && transfer
              ? new Intl.NumberFormat(resolvedLocale(), {
                  style: 'percent',
                  maximumFractionDigits: 0,
                }).format(transfer.progress / 100)
              : null}
          </span>
        </div>
      ) : null}
    </div>
  );
}
