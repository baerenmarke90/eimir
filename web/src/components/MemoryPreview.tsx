import type { ObjectUrlSource } from '../client/objectUrlResource';
import { type ReactNode, useContext, useEffect } from 'react';
import { usePreviewLoadGate } from '../client/usePreviewLoadGate';
import { useObjectUrlResource } from '../client/useObjectUrlResources';
import {
  SensitiveMediaControl,
  SensitiveMediaCover,
  useSensitiveMediaReveals,
} from './SensitiveMedia';
import { PreviewCardLocationContext } from './PreviewCardLink';
import { useTranslation } from '../i18n';

export function MemoryPreview({
  memoryId,
  attachmentId,
  hasThumbnail = false,
  loadImage,
  loadingMode = 'immediate',
  resourceScopeKey,
  isSensitive,
  allowReveal = false,
  onSettled,
  fallback,
}: {
  memoryId: string;
  isSensitive?: boolean;
  allowReveal?: boolean;
  attachmentId: string;
  hasThumbnail?: boolean;
  loadImage: (
    memoryId: string,
    attachmentId: string,
    signal?: AbortSignal,
    variant?: 'original' | 'thumbnail',
  ) => Promise<ObjectUrlSource>;
  loadingMode?: 'immediate' | 'near-viewport';
  resourceScopeKey?: string;
  /** Resource completion, including reuse/failure; never grants media visibility. */
  onSettled?: () => void;
  fallback?: ReactNode;
}) {
  const { t } = useTranslation();
  const { ref: sentinelRef, shouldLoad } = usePreviewLoadGate(
    loadingMode,
    typeof isSensitive === 'boolean',
  );
  const locationKey = useContext(PreviewCardLocationContext);
  const scope = resourceScopeKey ?? `story-preview:${memoryId}`;
  const reveals = useSensitiveMediaReveals(
    JSON.stringify([scope, memoryId, attachmentId, isSensitive, locationKey]),
    allowReveal && isSensitive === true,
  );
  const revealed = isSensitive === true && reveals.isRevealed(attachmentId);

  const mediaResource = useObjectUrlResource(
    hasThumbnail ? `${scope}:thumbnail` : scope,
    shouldLoad && typeof isSensitive === 'boolean' ? attachmentId : null,
    (_resourceId, signal) =>
      hasThumbnail
        ? loadImage(memoryId, attachmentId, signal, 'thumbnail')
        : loadImage(memoryId, attachmentId, signal),
  );
  const url = mediaResource.url;
  const failed = mediaResource.error !== null;

  useEffect(() => {
    if (url || failed || typeof isSensitive !== 'boolean') onSettled?.();
  }, [url, failed, isSensitive, onSettled]);

  if (typeof isSensitive !== 'boolean')
    return <SensitiveMediaCover className="story-media-preview" />;

  if (isSensitive && (shouldLoad || url)) {
    return (
      <span className="story-media-preview sensitive-media-preview">
        {revealed && url ? (
          <img src={url} alt={t('media.alt')} loading="lazy" decoding="async" />
        ) : (
          <SensitiveMediaCover showLabel={!allowReveal}>
            {url ? (
              <img src={url} alt="" loading="lazy" decoding="async" />
            ) : null}
          </SensitiveMediaCover>
        )}
        {failed ? (
          <span className="sr-only">{t('media.unavailable')}</span>
        ) : null}
        {allowReveal ? (
          <SensitiveMediaControl
            className="sensitive-media-preview-control"
            overlay
            revealed={revealed}
            onToggle={() => reveals.toggle(attachmentId)}
          />
        ) : null}
      </span>
    );
  }

  if (failed) {
    return (
      <div className="story-media-placeholder">
        {fallback ?? t('media.unavailable')}
      </div>
    );
  }

  if (!url && !shouldLoad) {
    return (
      <div
        ref={sentinelRef}
        className="story-media-skeleton"
        aria-hidden="true"
        data-media-deferred="true"
      />
    );
  }

  if (!url) {
    return (
      <div className="story-media-skeleton" role="status">
        <span className="sr-only">{t('media.loading')}</span>
      </div>
    );
  }

  return (
    <img
      className="story-media-preview"
      src={url}
      alt={t('media.alt')}
      loading="lazy"
      decoding="async"
    />
  );
}
