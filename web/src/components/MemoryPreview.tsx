import { type ReactNode, useContext, useEffect, useRef, useState } from 'react';
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
  loadImage: (
    memoryId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ) => Promise<string>;
  loadingMode?: 'immediate' | 'near-viewport';
  resourceScopeKey?: string;
  /** Resource completion, including reuse/failure; never grants media visibility. */
  onSettled?: () => void;
  fallback?: ReactNode;
}) {
  const { t } = useTranslation();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(loadingMode === 'immediate');
  const locationKey = useContext(PreviewCardLocationContext);
  const scope = resourceScopeKey ?? `story-preview:${memoryId}`;
  const reveals = useSensitiveMediaReveals(
    JSON.stringify([scope, memoryId, attachmentId, isSensitive, locationKey]),
    allowReveal && isSensitive === true,
  );
  const revealed = isSensitive === true && reveals.isRevealed(attachmentId);

  useEffect(() => {
    if (loadingMode === 'immediate' || shouldLoad) {
      setShouldLoad(true);
      return;
    }
    if (typeof isSensitive !== 'boolean') return;

    const node = sentinelRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      {
        root: null,
        rootMargin: '75% 0px',
        threshold: 0,
      },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadingMode, shouldLoad, isSensitive]);

  const mediaResource = useObjectUrlResource(
    scope,
    shouldLoad && typeof isSensitive === 'boolean' ? attachmentId : null,
    (_resourceId, signal) => loadImage(memoryId, attachmentId, signal),
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
