import { type ReactNode, useRef, useState } from 'react';
import type { AttachmentDraft } from '../client/attachmentDraftState';
import { loadPhotoCropSource, type PhotoCropSource } from '../client/photoCrop';
import type { AttachmentDraftSelection } from '../client/useAttachmentDrafts';
import { useTranslation } from '../i18n';
import { DeviceMediaPicker } from './DeviceMediaPicker';
import { DraftMediaPreview } from './DraftMediaPreview';
import { EimirIcon } from './EimirIcon';
import { MediaActionGroup } from './MediaActionGroup';
import { AttachmentMediaDropZone } from './MediaDropZone';
import { PhotoDraftGallery } from './PhotoDraftGallery';
import { PhotoEditTask } from './PhotoEditTask';
import { PhotoSourcePicker } from './PhotoSourcePicker';
import type { VideoCaptureContext } from './VideoUploadAction';

/** Open the edit step for a photo; the edited file goes to `apply`. */
export type EditPhotoFile = (
  file: Promise<File> | File,
  apply: (file: File) => void,
) => void;

export interface AttachmentDraftPickerController {
  items: AttachmentDraft[];
  addFiles: (files: FileList | readonly File[] | null) => void;
  cancel: (id: string) => void;
  remove: (id: string) => void;
  retry: (draft: AttachmentDraft) => void;
  /** Swap a selected photo for its edited version (#1907 G1). */
  replaceFile?: (id: string, file: File) => void;
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
  /**
   * A custom gallery. `editDraft` opens the edit step for a selected, not yet
   * saved photo by its draft id; `editFile` opens it for any photo, such as
   * the original of a saved one, and hands the edited file to `apply`. Both
   * exist only when this picker can replace drafts.
   */
  gallery?:
    | ReactNode
    | ((
        addAction: ReactNode,
        editDraft?: (draftId: string) => void,
        editFile?: EditPhotoFile,
      ) => ReactNode);
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
  // #1790 D1: with an external source the diary intake opens the shared sheet.
  const [externalSources, setExternalSources] = useState(false);
  const [editing, setEditing] = useState<{
    source: PhotoCropSource;
    replacesSaved: boolean;
    apply: (file: File) => void;
  } | null>(null);
  const [editUnavailable, setEditUnavailable] = useState(false);
  const replaceFile = attachments.replaceFile;
  async function startEdit(
    file: Promise<File> | File,
    apply: (file: File) => void,
    replacesSaved: boolean,
  ) {
    setEditUnavailable(false);
    let source: PhotoCropSource | null = null;
    try {
      source = await loadPhotoCropSource(await file);
    } catch {
      source = null;
    }
    if (source) setEditing({ source, replacesSaved, apply });
    else setEditUnavailable(true);
  }
  const editable = Boolean(replaceFile) && presentation !== 'default';
  const editDraft = editable
    ? (draftId: string) => {
        const draft = attachments.items.find((item) => item.id === draftId);
        if (draft)
          void startEdit(
            draft.file,
            (file) => replaceFile?.(draftId, file),
            false,
          );
      }
    : undefined;
  const editFile: EditPhotoFile | undefined = editable
    ? (file, apply) => void startEdit(file, apply, true)
    : undefined;
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
      <div
        className="field-group attachment-draft-picker"
        data-presentation={presentation}
        data-has-media={populated}
      >
        <MediaActionGroup unframed>
          {typeof gallery === 'function'
            ? gallery(addAction, editDraft, editFile)
            : gallery}
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
                    blurSensitivePreview={presentation !== 'default'}
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
              onEdit={editDraft}
            />
          ) : null}
          <PhotoEditTask
            source={editing?.source ?? null}
            replacesSaved={editing?.replacesSaved}
            onCancel={() => setEditing(null)}
            onConfirm={(file) => {
              if (editing && file) editing.apply(file);
              setEditing(null);
            }}
          />

          <div
            className={
              presentation === 'diary' && !populated
                ? 'composer-diary-intake'
                : undefined
            }
          >
            {presentation === 'diary' && !populated ? (
              <DeviceMediaPicker
                id={id}
                multiple={multiple}
                disabled={disabled}
                intake
                onChooseSource={
                  sourceContext && externalSources
                    ? () => openSource.current()
                    : undefined
                }
                context={videoContext}
                onFiles={attachments.addFiles}
              />
            ) : null}
            {sourceContext ? (
              <PhotoSourcePicker
                {...sourceContext}
                // Destinations without a video context (Plans) stay image-only.
                videoContext={videoContext}
                unified
                onExternalAvailability={setExternalSources}
                renderTrigger={
                  presentation !== 'default'
                    ? (open) => {
                        openSource.current = open;
                        return mediaTrigger?.(open) ?? null;
                      }
                    : undefined
                }
                beginSelection={() => {
                  const ticket = sourceContext.beginSelection();
                  return {
                    ...ticket,
                    commit: (files, staged) => {
                      if (
                        ticket.signal.aborted ||
                        (!files.length && !staged?.length)
                      )
                        return false;
                      if (!multiple)
                        for (const item of attachments.items)
                          attachments.remove(item.id);
                      return ticket.commit(files, staged);
                    },
                  };
                }}
                disabled={disabled}
                devicePicker={devicePicker}
              />
            ) : (
              <DeviceMediaPicker
                id={presentation === 'default' ? id : `${id}-fallback`}
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
        {editUnavailable ? (
          <p className="field-help" role="status" aria-live="polite">
            {t('photoEdit.unavailable')}
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
