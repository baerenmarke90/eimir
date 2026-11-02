import type { AttachmentDraft } from '../client/attachmentDraftState';
import { selectedPhotoUnavailable } from '../client/selectedMediaRetention';
import { loadAuthorizedStoryImage } from '../client/storyMediaLoader';
import { useObjectUrlResource } from '../client/useObjectUrlResources';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { SensitiveMediaCover } from './SensitiveMedia';
import type { VideoCaptureContext } from './VideoUploadAction';

export function DraftMediaPreview({
  draft,
  context,
}: {
  draft: AttachmentDraft;
  context?: VideoCaptureContext;
}) {
  const { t } = useTranslation();
  const video = draft.file.type.startsWith('video/');
  const poster = useObjectUrlResource(
    JSON.stringify([
      'video-draft',
      context?.accountId,
      context?.spaceId,
      context?.apis.attachments.contentBaseUrl,
    ]),
    video &&
      context &&
      draft.status === 'ready' &&
      draft.hasThumbnail !== false &&
      !draft.isSensitive
      ? (draft.attachmentId ?? null)
      : null,
    (id, signal) => {
      if (!context)
        return Promise.reject(
          new Error('Video capture context is unavailable.'),
        );
      return loadAuthorizedStoryImage(
        context.apis,
        context.spaceId,
        'NONE',
        id,
        id,
        { signal, variant: 'thumbnail' },
      );
    },
  );
  if (
    selectedPhotoUnavailable(draft.file) &&
    !(video && draft.attachmentId && draft.status === 'ready')
  )
    return (
      <span
        role="img"
        aria-label={t(video ? 'video.missing' : 'memory.diary.photoMissing')}
      >
        <EimirIcon name="foto" />
      </span>
    );
  if (draft.isSensitive) return <SensitiveMediaCover />;
  if (!video)
    return (
      <img
        src={draft.previewUrl}
        alt={t('memory.photoPreviewAlt', { name: draft.file.name })}
      />
    );
  return (
    <span className="video-poster" role="img" aria-label={t('video.preview')}>
      {poster.url ? <img src={poster.url} alt="" /> : null}
      <span className="video-play-mark" aria-hidden="true">
        ▶
      </span>
    </span>
  );
}
