import type { AttachmentDraft } from '../client/attachmentDraftState';
import { SensitiveMediaCheckbox, SensitiveMediaCover } from './SensitiveMedia';
import { useState } from 'react';
import { useTranslation } from '../i18n';
import { selectedPhotoUnavailable } from '../client/selectedMediaRetention';
import { EimirIcon } from './EimirIcon';

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
}: {
  id: string;
  attachments: AttachmentDraftPickerController;
  multiple?: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [moved, setMoved] = useState('');
  function moveFile(
    attachment: AttachmentDraft,
    index: number,
    offset: -1 | 1,
  ) {
    const position = index + offset;
    if (position < 0 || position >= attachments.items.length) return;
    attachments.move?.(attachment.id, offset);
    setMoved(
      t('memory.photoMoved', {
        name: attachment.file.name,
        position: position + 1,
        count: attachments.items.length,
      }),
    );
  }

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

      {attachments.items.length > 0 ? (
        <p className="field-help">{t('sensitiveMedia.help')}</p>
      ) : null}
      {attachments.items.length > 0 ? (
        <ul
          className="attachment-draft-list"
          aria-label={t('memory.photoDraftsAria')}
        >
          {attachments.items.map((attachment, index) => {
            const unavailable = selectedPhotoUnavailable(attachment.file);
            const statusText = unavailable
              ? t('memory.diary.photoMissing')
              : attachment.status === 'uploading'
                ? t('memory.photoUploading')
                : attachment.status === 'validating'
                  ? t('memory.photoValidating')
                  : attachment.status === 'ready'
                    ? t('memory.photoReady')
                    : t('memory.photoFailed');

            return (
              <li className="attachment-draft-item" key={attachment.id}>
                <div className="attachment-preview-wrap">
                  {unavailable ? (
                    <span
                      className="attachment-preview attachment-preview-placeholder"
                      role="img"
                      aria-label={t('memory.diary.photoMissing')}
                    >
                      <EimirIcon name="foto" />
                    </span>
                  ) : attachment.isSensitive ? (
                    <SensitiveMediaCover />
                  ) : (
                    <img
                      className="attachment-preview"
                      src={attachment.previewUrl}
                      alt={t('memory.photoPreviewAlt', {
                        name: attachment.file.name,
                      })}
                    />
                  )}
                  {!unavailable ? (
                    <span className="attachment-preview-label">
                      {t('memory.photoLocalPreview')}
                    </span>
                  ) : null}
                </div>
                <div className="attachment-draft-meta">
                  <strong>{attachment.file.name}</strong>
                  {attachments.setSensitive ? (
                    <SensitiveMediaCheckbox
                      checked={attachment.isSensitive === true}
                      disabled={disabled}
                      onChange={(value) =>
                        attachments.setSensitive?.(attachment.id, value)
                      }
                    />
                  ) : null}
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
                      {!unavailable ? (
                        <small>{t('memory.photoFailedNotSaved')}</small>
                      ) : null}
                    </>
                  ) : null}
                </div>
                <div className="attachment-draft-actions">
                  {multiple &&
                  attachments.move &&
                  attachments.items.length > 1 ? (
                    <>
                      <button
                        type="button"
                        className="tertiary"
                        aria-disabled={index === 0}
                        onClick={() => moveFile(attachment, index, -1)}
                        aria-label={t('memory.photoMoveEarlier', {
                          name: attachment.file.name,
                        })}
                      >
                        {t('memory.photoEarlier')}
                      </button>
                      <button
                        type="button"
                        className="tertiary"
                        aria-disabled={index === attachments.items.length - 1}
                        onClick={() => moveFile(attachment, index, 1)}
                        aria-label={t('memory.photoMoveLater', {
                          name: attachment.file.name,
                        })}
                      >
                        {t('memory.photoLater')}
                      </button>
                    </>
                  ) : null}
                  {attachment.status === 'failed' ? (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => attachments.retry(attachment)}
                    >
                      {t(
                        unavailable
                          ? 'memory.diary.photoRetry'
                          : 'common.retry',
                      )}
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
      {moved ? (
        <span className="sr-only" role="status">
          {moved}
        </span>
      ) : null}
      {attachments.rejectedCount ? (
        <p className="field-help" role="alert" aria-live="assertive">
          {t('memory.photoLimitReached', { count: attachments.rejectedCount })}
        </p>
      ) : null}
    </div>
  );
}
