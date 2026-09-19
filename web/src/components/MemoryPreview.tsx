import { useEffect, useRef, useState } from 'react';
import { useObjectUrlResource } from '../client/useObjectUrlResources';
import { useTranslation } from '../i18n';

export function MemoryPreview({
  memoryId,
  attachmentId,
  loadImage,
  loadingMode = 'immediate',
}: {
  memoryId: string;
  attachmentId: string;
  loadImage: (
    memoryId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ) => Promise<string>;
  loadingMode?: 'immediate' | 'near-viewport';
}) {
  const { t } = useTranslation();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(loadingMode === 'immediate');

  useEffect(() => {
    if (loadingMode === 'immediate' || shouldLoad) {
      setShouldLoad(true);
      return;
    }

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
  }, [loadingMode, shouldLoad]);

  const mediaResource = useObjectUrlResource(
    `story-preview:${memoryId}`,
    shouldLoad ? attachmentId : null,
    (_resourceId, signal) => loadImage(memoryId, attachmentId, signal),
  );
  const url = mediaResource.url;
  const failed = mediaResource.error !== null;

  if (failed) {
    return (
      <div className="story-media-placeholder">{t('media.unavailable')}</div>
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
