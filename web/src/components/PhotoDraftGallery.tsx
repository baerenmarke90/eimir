import { type ReactNode, useState } from 'react';
import type { AttachmentDraft } from '../client/attachmentDraftState';
import { selectedPhotoUnavailable } from '../client/selectedMediaRetention';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import './PhotoDraftGallery.css';
import {
  insertMedia,
  PhotoDraftSorting,
  SortablePhotoDraftItem,
} from './PhotoDraftSorting';

export interface PhotoDraftGalleryItem {
  key: string;
  name: string;
  preview: ReactNode;
  isSensitive: boolean;
  draft?: AttachmentDraft;
  mediaType?: 'IMAGE' | 'VIDEO' | 'AUDIO';
  status?: string;
  canRemove?: boolean;
  canEditSensitivity?: boolean;
}

/** Bounded media selection with contextual inline actions. */
export function PhotoDraftGallery({
  items,
  disabled = false,
  onSensitive,
  onRemove,
  onRetry,
  removeLabel,
  onOrderChange,
  selectedCoverKey,
  onSelectCover,
}: {
  items: PhotoDraftGalleryItem[];
  disabled?: boolean;
  onOrderChange?: (keys: string[]) => void;
  selectedCoverKey?: string | null;
  onSelectCover?: (key: string | null) => void;
  onSensitive?: (key: string, value: boolean) => void;
  onRemove: (key: string) => void;
  onRetry?: (key: string) => void;
  removeLabel?: (key: string) => string;
}) {
  const { t } = useTranslation();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const selected = items.find((item) => item.key === selectedKey) ?? items[0];
  if (!selected) return null;
  const failed = items.filter((item) => item.draft?.status === 'failed');
  const visibleItems = expanded ? items : items.slice(0, 6);
  const draft = selected.draft;
  const isVideo = (item: PhotoDraftGalleryItem) =>
    item.mediaType === 'VIDEO' || item.draft?.file.type.startsWith('video/');
  const mixed = items.some(isVideo);
  const unavailable = draft && selectedPhotoUnavailable(draft.file);
  const pending =
    draft?.status === 'preparing' ||
    draft?.status === 'uploading' ||
    draft?.status === 'validating';
  function status(item: PhotoDraftGalleryItem) {
    if (item.status === 'PROCESSING') return t('video.processing');
    if (item.status === 'FAILED') return t('video.savedFailed');
    if (item.draft?.processing) return t('video.processing');
    if (item.draft && selectedPhotoUnavailable(item.draft.file))
      return t(
        isVideo(item) && item.draft.status !== 'ready'
          ? 'video.missing'
          : item.draft.status === 'ready'
            ? 'memory.photoReady'
            : 'memory.diary.photoMissing',
      );
    return t(
      item.draft?.status === 'failed'
        ? 'memory.photoFailed'
        : item.draft?.status === 'preparing'
          ? 'video.preparing'
          : item.draft?.status === 'uploading'
            ? 'memory.photoUploading'
            : item.draft?.status === 'validating'
              ? isVideo(item)
                ? 'video.processing'
                : 'memory.photoValidating'
              : 'memory.photoReady',
    );
  }
  const coverKey = items.some((item) => item.key === selectedCoverKey)
    ? selectedCoverKey
    : items[0].key;
  const showInspector =
    actionsOpen &&
    (pending ||
      draft?.status === 'failed' ||
      selected.status === 'PROCESSING' ||
      selected.status === 'FAILED');
  return (
    <div className="photo-draft-gallery">
      <PhotoDraftSorting
        onAnnounce={setAnnouncement}
        onMove={(key, target) => {
          if (!disabled) {
            setSelectedKey(key);
            setAnnouncement(
              t('memory.photoMoved', {
                name: items.find((item) => item.key === key)?.name,
                position: target + 1,
                count: items.length,
              }),
            );
            onOrderChange?.(
              insertMedia(
                items.map((item) => item.key),
                key,
                target,
              ),
            );
          }
        }}
      >
        <ol
          className="photo-draft-grid"
          aria-label={t(mixed ? 'video.selected' : 'memory.photoDraftsAria')}
        >
          {visibleItems.map((item, position) => (
            <SortablePhotoDraftItem
              key={item.key}
              id={item.key}
              index={position}
              disabled={disabled}
              reorderable={Boolean(onOrderChange && items.length > 1)}
            >
              <fieldset
                className="photo-draft-frame"
                aria-label={
                  item.key === selected.key
                    ? t(
                        isVideo(item)
                          ? 'video.selectedItem'
                          : 'memory.photoSelected',
                      )
                    : item.name
                }
              >
                <button
                  type="button"
                  className="photo-draft-tile"
                  data-media-key={item.key}
                  disabled={disabled}
                  aria-pressed={item.key === selected.key}
                  aria-label={t(
                    isVideo(item)
                      ? 'video.selectItem'
                      : 'memory.photoSelectItem',
                    {
                      name: item.name,
                      position: position + 1,
                      count: items.length,
                      status: status(item),
                    },
                  )}
                  onClick={() => {
                    setSelectedKey(item.key);
                    setActionsOpen(true);
                  }}
                >
                  <span className="photo-draft-tile-preview">
                    {item.preview}
                  </span>
                  <span className="photo-draft-number" aria-hidden="true">
                    {position + 1}
                  </span>
                  {item.draft && item.draft.status !== 'ready' ? (
                    <span
                      className={`photo-draft-tile-status${item.draft.status === 'failed' ? ' is-failed' : ''}`}
                      aria-hidden="true"
                    >
                      {item.draft.status === 'failed'
                        ? t('memory.photoNeedsHelp')
                        : item.draft.status === 'uploading'
                          ? `${item.draft.progress}%`
                          : t('memory.photoChecking')}
                    </span>
                  ) : null}
                </button>
                {item.canRemove !== false ? (
                  <button
                    type="button"
                    className="photo-draft-action photo-draft-remove"
                    disabled={disabled}
                    aria-label={
                      removeLabel?.(item.key) ??
                      t(
                        item.draft &&
                          ['preparing', 'uploading', 'validating'].includes(
                            item.draft.status,
                          )
                          ? 'upload.cancel'
                          : 'memory.photoRemove',
                      )
                    }
                    onClick={() => {
                      if (item.key === selected.key)
                        setSelectedKey(
                          items[position + 1]?.key ??
                            items[position - 1]?.key ??
                            null,
                        );
                      onRemove(item.key);
                    }}
                  >
                    <EimirIcon name="close" />
                  </button>
                ) : null}
                {onSensitive ? (
                  <label className="photo-draft-action photo-draft-sensitive">
                    <input
                      type="checkbox"
                      disabled={disabled || item.canEditSensitivity === false}
                      checked={item.isSensitive}
                      aria-label={t('sensitiveMedia.mark')}
                      onChange={(event) => {
                        if (!disabled && item.canEditSensitivity !== false)
                          onSensitive(item.key, event.currentTarget.checked);
                      }}
                    />
                    <EimirIcon
                      name={item.isSensitive ? 'privatsphaere' : 'lock-open'}
                    />
                  </label>
                ) : null}
                {onSelectCover ? (
                  <button
                    type="button"
                    className="photo-draft-action photo-draft-cover-toggle"
                    disabled={disabled}
                    aria-label={t('experiences.chooseCover')}
                    aria-pressed={item.key === coverKey}
                    onClick={() => onSelectCover(item.key)}
                  >
                    <EimirIcon
                      name={item.key === coverKey ? 'check' : 'square'}
                    />
                  </button>
                ) : null}
              </fieldset>
            </SortablePhotoDraftItem>
          ))}
        </ol>
      </PhotoDraftSorting>
      {items.length > 6 ? (
        <button
          type="button"
          className="tertiary"
          disabled={disabled}
          aria-expanded={expanded}
          onClick={() => {
            if (expanded) setSelectedKey(items[0].key);
            setExpanded(!expanded);
          }}
        >
          {t(
            mixed
              ? expanded
                ? 'video.showLess'
                : 'video.showAll'
              : expanded
                ? 'memory.photoShowLess'
                : 'memory.photoShowAll',
            {
              count: items.length,
            },
          )}
        </button>
      ) : null}
      {failed.length ? (
        <div className="photo-draft-failures" role="alert">
          <span>
            {t(mixed ? 'video.failures' : 'memory.photoFailures', {
              count: failed.length,
            })}
          </span>
          <button
            type="button"
            className="tertiary"
            disabled={disabled}
            onClick={() => {
              if (items.indexOf(failed[0]) >= 6) setExpanded(true);
              setSelectedKey(failed[0].key);
              setActionsOpen(true);
            }}
          >
            {t('memory.photoReviewFailure')}
          </button>
        </div>
      ) : null}
      {showInspector ? (
        <div className="photo-draft-inspector">
          {draft ? (
            <div className="photo-draft-inspector-heading">
              <span className="photo-draft-filename">{selected.name}</span>
            </div>
          ) : null}
          <span
            className={`attachment-status attachment-status-${draft?.status ?? 'ready'}`}
            role="status"
          >
            {status(selected)}
          </span>
          {draft?.status === 'uploading' || draft?.status === 'preparing' ? (
            <progress
              max={100}
              value={draft.progress}
              aria-label={t('upload.progress', { progress: draft.progress })}
            />
          ) : null}
          {isVideo(selected) && pending ? (
            <p className="field-help">{t('video.volatile')}</p>
          ) : null}
          {draft?.status === 'failed' ? (
            <div className="photo-draft-error">
              <p>{draft.error}</p>
              {!unavailable ? (
                <p>
                  {t(
                    isVideo(selected)
                      ? 'video.failedNotSaved'
                      : 'memory.photoFailedNotSaved',
                  )}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="photo-draft-controls">
            {draft?.status === 'failed' &&
            onRetry &&
            !(isVideo(selected) && unavailable) ? (
              <button
                type="button"
                className="secondary"
                disabled={disabled}
                onClick={() => onRetry(selected.key)}
              >
                {t(unavailable ? 'memory.diary.photoRetry' : 'common.retry')}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
