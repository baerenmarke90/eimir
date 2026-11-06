import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';

export function MediaProcessingState({
  status,
  compact = false,
}: {
  status: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const failed = status === 'FAILED';
  return (
    <div
      className={`media-processing-state${compact ? ' media-processing-state-compact' : ''}`}
      role={failed ? undefined : 'status'}
    >
      <EimirIcon name="foto" />
      <span>
        {t(
          failed
            ? compact
              ? 'video.savedFailedShort'
              : 'video.savedFailed'
            : compact
              ? 'video.processingShort'
              : 'video.processing',
        )}
      </span>
    </div>
  );
}
