import type { AttachmentDraft } from '../client/attachmentDraftState';
import { useTranslation } from '../i18n';
import { DraftMediaPreview } from './DraftMediaPreview';
import { PhotoDraftGallery } from './PhotoDraftGallery';
import {
  type VideoCaptureContext,
  VideoUploadAction,
} from './VideoUploadAction';

export interface AttachmentDraftPickerController {
  items: AttachmentDraft[];
  addFiles: (files: FileList | readonly File[] | null) => void;
  cancel: (id: string) => void;
  remove: (id: string) => void;
  retry: (draft: AttachmentDraft) => void;
  move?: (id: string, offset: -1 | 1) => void;
  hasPending: boolean;
  setSensitive?: (id: string, value: boolean) => void;
  rejectedCount?: number;
}

export function AttachmentDraftPicker({
  id,
  attachments,
  multiple = true,
  disabled = false,
  showItems = true,
  videoContext,
}: {
  id: string;
  attachments: AttachmentDraftPickerController;
  multiple?: boolean;
  disabled?: boolean;
  showItems?: boolean;
  videoContext?: VideoCaptureContext;
}) {
  const { t } = useTranslation();

  return (
    <div className="field-group attachment-draft-picker">
      <label htmlFor={id}>{t('memory.photoLabel')}</label>
      <input
        className="visually-hidden-input"
        id={id}
        name={id}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple={multiple}
        disabled={disabled}
        onChange={(event) => {
          const files = event.currentTarget.files;
          if (!multiple && files && files.length > 0) {
            for (const item of attachments.items) attachments.remove(item.id);
          }
          attachments.addFiles(files);
          event.currentTarget.value = '';
        }}
      />
      <label className="file-picker" htmlFor={id}>
        <span className="file-picker-icon" aria-hidden="true">
          +
        </span>
        <span>
          <strong>
            {attachments.items.length
              ? t('memory.photoAddMore')
              : t('memory.photoSelect')}
          </strong>
          <small>{t('memory.photoFormats')}</small>
        </span>
      </label>

      {videoContext ? (
        <VideoUploadAction
          id={id}
          context={videoContext}
          multiple={multiple}
          disabled={disabled}
          onFiles={(files) => {
            if (!multiple)
              for (const item of attachments.items) attachments.remove(item.id);
            attachments.addFiles(files);
          }}
        />
      ) : null}

      {showItems && attachments.items.length > 0 ? (
        <p className="field-help">{t('sensitiveMedia.help')}</p>
      ) : null}
      {showItems && attachments.items.length > 0 ? (
        <PhotoDraftGallery
          disabled={disabled}
          items={attachments.items.map((attachment) => ({
            key: attachment.id,
            name: attachment.file.name,
            draft: attachment,
            isSensitive: attachment.isSensitive === true,
            preview: (
              <DraftMediaPreview draft={attachment} context={videoContext} />
            ),
          }))}
          onMove={multiple ? attachments.move : undefined}
          onSensitive={attachments.setSensitive}
          onRemove={attachments.remove}
          onRetry={(key) => {
            const draft = attachments.items.find((item) => item.id === key);
            if (draft) attachments.retry(draft);
          }}
        />
      ) : null}
      {attachments.hasPending ? (
        <p className="field-help" role="status" aria-live="polite">
          {t('memory.photoPendingSave')}
        </p>
      ) : null}
      {attachments.rejectedCount ? (
        <p className="field-help" role="alert" aria-live="assertive">
          {t('memory.photoLimitReached', { count: attachments.rejectedCount })}
        </p>
      ) : null}
    </div>
  );
}
