import type { AttachmentDraft } from '../client/attachmentDraftState';
import { useTranslation } from '../i18n';

export interface AttachmentDraftPickerController {
  items: AttachmentDraft[];
  addFiles: (files: FileList | null) => void;
  cancel: (id: string) => void;
  remove: (id: string) => void;
  retry: (draft: AttachmentDraft) => void;
  hasPending: boolean;
  rejectedCount?: number;
}

export function AttachmentDraftPicker({
  id,
  attachments,
  multiple = true,
}: {
  id: string;
  attachments: AttachmentDraftPickerController;
  multiple?: boolean;
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
          ＋
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

      {attachments.items.length > 0 ? (
        <ul
          className="attachment-draft-list"
          aria-label={t('memory.photoDraftsAria')}
        >
          {attachments.items.map((attachment) => {
            const statusText =
              attachment.status === 'uploading'
                ? t('memory.photoUploading')
                : attachment.status === 'validating'
                  ? t('memory.photoValidating')
                  : attachment.status === 'ready'
                    ? t('memory.photoReady')
                    : t('memory.photoFailed');

            return (
              <li className="attachment-draft-item" key={attachment.id}>
                <div className="attachment-preview-wrap">
                  <img
                    className="attachment-preview"
                    src={attachment.previewUrl}
                    alt={t('memory.photoPreviewAlt', {
                      name: attachment.file.name,
                    })}
                  />
                  <span className="attachment-preview-label">
                    {t('memory.photoLocalPreview')}
                  </span>
                </div>
                <div className="attachment-draft-meta">
                  <strong>{attachment.file.name}</strong>
                  <span
                    className={`attachment-status attachment-status-${attachment.status}`}
                    role={attachment.status === 'failed' ? 'alert' : 'status'}
                    aria-live="polite"
                  >
                    {statusText}
                  </span>
                  {attachment.status === 'uploading' ? (
                    <>
                      <progress max={100} value={attachment.progress}>
                        {attachment.progress}%
                      </progress>
                      <small>
                        {t('upload.progress', {
                          progress: attachment.progress,
                        })}
                      </small>
                    </>
                  ) : null}
                  {attachment.status === 'failed' ? (
                    <>
                      <small className="attachment-draft-error">
                        {attachment.error}
                      </small>
                      <small>{t('memory.photoFailedNotSaved')}</small>
                    </>
                  ) : null}
                </div>
                <div className="attachment-draft-actions">
                  {attachment.status === 'failed' ? (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => attachments.retry(attachment)}
                    >
                      {t('common.retry')}
                    </button>
                  ) : null}
                  {attachment.status === 'uploading' ||
                  attachment.status === 'validating' ? (
                    <button
                      type="button"
                      className="tertiary"
                      onClick={() => attachments.remove(attachment.id)}
                    >
                      {t('upload.cancel')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="tertiary"
                      onClick={() => attachments.remove(attachment.id)}
                    >
                      {t('memory.photoRemove')}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
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
