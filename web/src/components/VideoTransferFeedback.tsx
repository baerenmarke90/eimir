import { useState } from 'react';
import {
  retryVideoTransfer,
  useVideoTransfer,
} from '../client/backgroundVideoUploads';
import { useTranslation } from '../i18n';

/** Recovery actions stay outside gallery buttons and preserve the saved parent. */
export function VideoTransferFeedback({
  attachmentId,
}: {
  attachmentId: string;
}) {
  const { t } = useTranslation();
  const transfer = useVideoTransfer(attachmentId);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  if (transfer?.phase !== 'failed') return null;
  return (
    <div className="video-transfer-feedback">
      <p role="status">{t('video.uploadFailed')}</p>
      <button
        type="button"
        className="secondary"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setFailed(false);
          try {
            await retryVideoTransfer(attachmentId);
          } catch {
            setFailed(true);
          } finally {
            setPending(false);
          }
        }}
      >
        {t('video.retryUpload')}
      </button>
      {failed ? <p role="alert">{t('video.retryUnavailable')}</p> : null}
    </div>
  );
}
