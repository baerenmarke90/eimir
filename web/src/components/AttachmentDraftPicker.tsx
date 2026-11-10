import type { AttachmentDraft } from '../client/attachmentDraftState';
import type { AttachmentDraftSelection } from '../client/useAttachmentDrafts';
import { useTranslation } from '../i18n';
import { DeviceMediaPicker } from './DeviceMediaPicker';
import { DraftMediaPreview } from './DraftMediaPreview';
import { PhotoDraftGallery } from './PhotoDraftGallery';
import { PhotoSourcePicker } from './PhotoSourcePicker';
import { AttachmentMediaDropZone } from './MediaDropZone';
import type { VideoCaptureContext } from './VideoUploadAction';
import { type ReactNode, useRef } from 'react';
import { MediaIntakeButton } from './MediaIntakeButton';
import { EimirIcon } from './EimirIcon';
import { MediaActionGroup } from './MediaActionGroup';

export interface AttachmentDraftPickerController {
  items: AttachmentDraft[];
  addFiles: (files: FileList | readonly File[] | null) => void;
  cancel: (id: string) => void;
  remove: (id: string) => void;
  retry: (draft: AttachmentDraft) => void;
  reorder?: (keys: string[]) => void;
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
  sourceContext,
  selectedCoverKey,
  onSelectCover,
  additionalActions,
  gallery,
  presentation = 'default',
  mediaTrigger,
  pageWideDrop = false,
  hasMedia,
}: {
  presentation?: 'default' | 'diary' | 'tools';
  mediaTrigger?: (open: () => void) => ReactNode;
  pageWideDrop?: boolean;
  additionalActions?: ReactNode;
  gallery?: ReactNode | ((addAction: ReactNode) => ReactNode);
  hasMedia?: boolean;
  id: string;
  selectedCoverKey?: string | null;
  onSelectCover?: (key: string | null) => void;
  attachments: AttachmentDraftPickerController;
  multiple?: boolean;
  disabled?: boolean;
  showItems?: boolean;
  videoContext?: VideoCaptureContext;
  sourceContext?: {
    apiBaseUrl: string;
    accessToken: string;
    accountId: string;
    spaceId: string;
    remaining: number;
    beginSelection: () => AttachmentDraftSelection;
  };
}) {
  const { t } = useTranslation();
  const openSource = useRef<() => void>(() => {});
  const populated =
    hasMedia ?? (attachments.items.length > 0 || Boolean(gallery));
  const addAction =
    presentation !== 'default' ? (
      <button
        type="button"
        className="photo-draft-add"
        aria-label={t('photoSources.addMedia')}
        disabled={disabled}
        onClick={() => openSource.current()}
      >
        <EimirIcon name="hinzufuegen" />
      </button>
    ) : undefined;
  const devicePicker = (
    close: () => void,
    actionContainer?: HTMLElement | null,
    blocked = false,
  ) => (
    <DeviceMediaPicker
      id={`${id}-source`}
      multiple={multiple}
      disabled={disabled || blocked}
      inSourceChooser={Boolean(sourceContext)}
      actionContainer={actionContainer}
      context={videoContext}
      onFiles={(files) => {
        if (!multiple && files.length)
          for (const item of attachments.items) attachments.remove(item.id);
        attachments.addFiles(files);
        close();
      }}
    />
  );

  return (
    <AttachmentMediaDropZone
      videoContext={videoContext}
      pageWide={pageWideDrop}
      multiple={multiple}
      disabled={disabled}
      onFiles={(files) => {
        if (!multiple && files.length)
          for (const item of attachments.items) attachments.remove(item.id);
        attachments.addFiles(files);
      }}
    >
      <div className="field-group attachment-draft-picker">
        <MediaActionGroup unframed>
          {typeof gallery === 'function' ? gallery(addAction) : gallery}
          {showItems && attachments.items.length > 0 ? (
            <PhotoDraftGallery
              key={JSON.stringify([
                id,
                sourceContext?.apiBaseUrl,
                sourceContext?.accountId,
                sourceContext?.spaceId,
                videoContext?.accountId,
                videoContext?.spaceId,
              ])}
              resourceScopeKey={JSON.stringify([
                id,
                sourceContext?.apiBaseUrl,
                sourceContext?.accountId,
                sourceContext?.spaceId,
                videoContext?.accountId,
                videoContext?.spaceId,
              ])}
              disabled={disabled}
              items={attachments.items.map((attachment) => ({
                key: attachment.id,
                name: attachment.file.name,
                draft: attachment,
                isSensitive: attachment.isSensitive === true,
                preview: (
                  <DraftMediaPreview
                    draft={attachment}
                    context={videoContext}
                  />
                ),
              }))}
              addAction={
                presentation !== 'default' ? (
                  <button
                    type="button"
                    className="photo-draft-add"
                    aria-label={t('photoSources.addMedia')}
                    disabled={disabled}
                    onClick={() => openSource.current()}
                  >
                    <EimirIcon name="hinzufuegen" />
                  </button>
                ) : undefined
              }
              onOrderChange={multiple ? attachments.reorder : undefined}
              selectedCoverKey={selectedCoverKey}
              onSelectCover={onSelectCover}
              onSensitive={attachments.setSensitive}
              onRemove={attachments.remove}
              onRetry={(key) => {
                const draft = attachments.items.find((item) => item.id === key);
                if (draft) attachments.retry(draft);
              }}
            />
          ) : null}

          <div
            className={
              presentation === 'diary' && !populated
                ? 'composer-diary-intake'
                : undefined
            }
          >
            {presentation === 'diary' &&
            !attachments.items.length &&
            !gallery ? (
              <DeviceMediaPicker
                id={id}
                multiple={multiple}
                disabled={disabled}
                intake
                context={videoContext}
                onFiles={attachments.addFiles}
              />
            ) : null}
            {sourceContext ? (
              <PhotoSourcePicker
                {...sourceContext}
                unified
                renderTrigger={
                  presentation !== 'default'
                    ? (open) => {
                        openSource.current = open;
                        if (mediaTrigger) return mediaTrigger(open);
                        return presentation === 'diary' &&
                          !attachments.items.length &&
                          !gallery ? (
                          <MediaIntakeButton
                            label={t('photoSources.more')}
                            icon="photo-library"
                            variant="source"
                            proLabel={t('photoSources.pro')}
                            className="photo-source-trigger"
                            disabled={disabled}
                            onClick={open}
                          />
                        ) : null;
                      }
                    : undefined
                }
                beginSelection={() => {
                  const ticket = sourceContext.beginSelection();
                  return {
                    ...ticket,
                    commit: (files) => {
                      if (ticket.signal.aborted || !files.length) return false;
                      if (!multiple)
                        for (const item of attachments.items)
                          attachments.remove(item.id);
                      return ticket.commit(files);
                    },
                  };
                }}
                disabled={disabled}
                devicePicker={devicePicker}
              />
            ) : (
              <DeviceMediaPicker
                id={id}
                multiple={multiple}
                disabled={disabled}
                context={videoContext}
                onFiles={attachments.addFiles}
                renderTrigger={
                  presentation !== 'default'
                    ? (open) => {
                        openSource.current = open;
                        return mediaTrigger?.(open) ?? null;
                      }
                    : undefined
                }
              />
            )}
          </div>
          {additionalActions}
        </MediaActionGroup>

        {attachments.hasPending ? (
          <p className="field-help" role="status" aria-live="polite">
            {t(
              attachments.items.some((item) =>
                item.file.type.startsWith('video/'),
              )
                ? 'video.pendingSave'
                : 'memory.photoPendingSave',
            )}
          </p>
        ) : null}
        {attachments.rejectedCount ? (
          <p className="field-help" role="alert" aria-live="assertive">
            {t('memory.photoLimitReached', {
              count: attachments.rejectedCount,
            })}
          </p>
        ) : null}
      </div>
    </AttachmentMediaDropZone>
  );
}
