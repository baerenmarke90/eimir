import { type ReactNode, useState } from 'react';
import type { AttachmentDraft } from '../client/attachmentDraftState';
import { selectedPhotoUnavailable } from '../client/selectedMediaRetention';
import { useTranslation } from '../i18n';
import { SensitiveMediaCheckbox } from './SensitiveMedia';
import './PhotoDraftGallery.css';

export interface PhotoDraftGalleryItem {
  key: string;
  name: string;
  preview: ReactNode;
  isSensitive: boolean;
  draft?: AttachmentDraft;
  mediaType?: 'IMAGE' | 'VIDEO';
  canRemove?: boolean;
  canEditSensitivity?: boolean;
}

/** One bounded media selection with one inspector, independent of persistence. */
export function PhotoDraftGallery({
  items,
  disabled = false,
  onMove,
  onSensitive,
  onRemove,
  onRetry,
  removeLabel,
}: {
  items: PhotoDraftGalleryItem[];
  disabled?: boolean;
  onMove?: (key: string, offset: -1 | 1) => void;
  onSensitive?: (key: string, value: boolean) => void;
  onRemove: (key: string) => void;
  onRetry?: (key: string) => void;
  removeLabel?: (key: string) => string;
}) {
  const { t } = useTranslation();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const selected = items.find((item) => item.key === selectedKey) ?? items[0];
  if (!selected) return null;
  const index = items.indexOf(selected);
  const failed = items.filter((item) => item.draft?.status === 'failed');
  const visibleItems = expanded ? items : items.slice(0, 6);
  const draft = selected.draft;
  const isVideo = (item: PhotoDraftGalleryItem) =>
    item.mediaType === 'VIDEO' || item.draft?.file.type.startsWith('video/');
  const mixed = items.some(isVideo);
  const unavailable = draft && selectedPhotoUnavailable(draft.file);
  const pending =
    draft?.status === 'uploading' || draft?.status === 'validating';
  function move(offset: -1 | 1) {
    if (disabled || index + offset < 0 || index + offset >= items.length)
      return;
    setSelectedKey(selected.key);
    if (index + offset >= 6) setExpanded(true);
    onMove?.(selected.key, offset);
    setAnnouncement(
      t('memory.photoMoved', {
        name: selected.name,
        position: index + offset + 1,
        count: items.length,
      }),
    );
  }
  function status(item: PhotoDraftGalleryItem) {
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
        : item.draft?.status === 'uploading'
          ? 'memory.photoUploading'
          : item.draft?.status === 'validating'
            ? 'memory.photoValidating'
            : 'memory.photoReady',
    );
  }
  return (
    <div className="photo-draft-gallery">
      <ol
        className="photo-draft-grid"
        aria-label={t(mixed ? 'video.selected' : 'memory.photoDraftsAria')}
      >
        {visibleItems.map((item, position) => (
          <li key={item.key}>
            <button
              type="button"
              className="photo-draft-tile"
              disabled={disabled}
              aria-pressed={item.key === selected.key}
              aria-label={t(
                isVideo(item) ? 'video.selectItem' : 'memory.photoSelectItem',
                {
                  name: item.name,
                  position: position + 1,
                  count: items.length,
                  status: status(item),
                },
              )}
              onClick={() => setSelectedKey(item.key)}
            >
              <span className="photo-draft-tile-preview">{item.preview}</span>
              <span className="photo-draft-number" aria-hidden="true">
                {position + 1}
              </span>
              {item.key === selected.key ? (
                <span className="photo-draft-selected" aria-hidden="true">
                  ✓
                </span>
              ) : null}
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
          </li>
        ))}
      </ol>
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
            }}
          >
            {t('memory.photoReviewFailure')}
          </button>
        </div>
      ) : null}
      <fieldset className="photo-draft-inspector">
        <legend className="sr-only">
          {t(isVideo(selected) ? 'video.selectedItem' : 'memory.photoSelected')}
        </legend>
        <div className="photo-draft-inspector-heading">
          <strong>
            {t(isVideo(selected) ? 'video.position' : 'memory.photoPosition', {
              position: index + 1,
              count: items.length,
            })}
          </strong>
          <span className="photo-draft-filename">{selected.name}</span>
        </div>
        {onSensitive && selected.canEditSensitivity !== false ? (
          <SensitiveMediaCheckbox
            checked={selected.isSensitive}
            disabled={disabled}
            onChange={(value) => onSensitive(selected.key, value)}
          />
        ) : null}
        <span
          className={`attachment-status attachment-status-${draft?.status ?? 'ready'}`}
          role="status"
        >
          {status(selected)}
        </span>
        {draft?.status === 'uploading' ? (
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
          {onMove && items.length > 1 ? (
            <>
              <button
                type="button"
                className="secondary"
                disabled={disabled}
                aria-disabled={index === 0}
                aria-label={t('memory.photoMoveEarlier', {
                  name: selected.name,
                })}
                onClick={() => move(-1)}
              >
                {t('memory.photoEarlier')}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={disabled}
                aria-disabled={index === items.length - 1}
                aria-label={t('memory.photoMoveLater', { name: selected.name })}
                onClick={() => move(1)}
              >
                {t('memory.photoLater')}
              </button>
            </>
          ) : null}
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
          {selected.canRemove !== false ? (
            <button
              type="button"
              className="tertiary"
              disabled={disabled}
              onClick={() => {
                setSelectedKey(
                  items[index + 1]?.key ?? items[index - 1]?.key ?? null,
                );
                onRemove(selected.key);
              }}
            >
              {removeLabel?.(selected.key) ??
                t(pending ? 'upload.cancel' : 'memory.photoRemove')}
            </button>
          ) : null}
        </div>
      </fieldset>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
