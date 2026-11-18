import { useEffect, useRef, useState } from 'react';
import type { DashboardMedia } from '../api/generated/models/DashboardMedia';
import type { ObjectUrlSource } from '../client/objectUrlResource';
import type { VideoSource } from '../client/video';
import { useTranslation } from '../i18n';
import { MemoryPreview } from './MemoryPreview';
import './WirMomentGallery.css';

export type MomentImageLoader = (
  memoryId: string,
  attachmentId: string,
  signal?: AbortSignal,
  variant?: 'original' | 'thumbnail',
) => Promise<ObjectUrlSource>;

export type MomentClipLoader = (
  memoryId: string,
  attachmentId: string,
  signal: AbortSignal,
) => Promise<VideoSource>;

type SlideState = 'active' | 'leaving' | 'next';

/** One clip, played silently while it is the picture on show. */
function MomentClip({
  memoryId,
  attachmentId,
  loadClip,
  playing,
  onEnded,
}: {
  memoryId: string;
  attachmentId: string;
  loadClip: MomentClipLoader;
  playing: boolean;
  onEnded: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: The grant is requested once per clip; a new loader closure is not a new clip.
  useEffect(() => {
    const request = new AbortController();
    void loadClip(memoryId, attachmentId, request.signal)
      .then((source) => {
        if (!request.signal.aborted) setUrl(source.url);
      })
      .catch(() => undefined);
    return () => request.abort();
  }, [memoryId, attachmentId]);

  useEffect(() => {
    const element = video.current;
    if (!element || !url) return;
    if (playing) void element.play().catch(() => undefined);
    else element.pause();
  }, [playing, url]);

  if (!url) return null;
  return (
    <video
      ref={video}
      className="wir-moment-clip"
      src={url}
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
      tabIndex={-1}
      onEnded={onEnded}
    />
  );
}

/**
 * The pictures of the shared moment, one on show, the next one already warm.
 * Presentation only: the link around it, its title and its date never change.
 */
export function WirMomentSlides({
  memoryId,
  media,
  index,
  previous,
  running,
  preloadNext,
  clipsAllowed,
  loadImage,
  loadClip,
  onClipEnded,
}: {
  memoryId: string;
  media: DashboardMedia[];
  index: number;
  previous: number | null;
  running: boolean;
  /** Warm the next picture; off when nothing will ever rotate to it. */
  preloadNext: boolean;
  clipsAllowed: boolean;
  loadImage: MomentImageLoader;
  loadClip?: MomentClipLoader;
  onClipEnded: () => void;
}) {
  const next = (index + 1) % media.length;
  const states = new Map<number, SlideState>();
  if (previous !== null && previous !== index) states.set(previous, 'leaving');
  if (preloadNext && next !== index && !states.has(next))
    states.set(next, 'next');
  states.set(index, 'active');

  return (
    <div className="wir-moment-gallery" data-rotating={running || undefined}>
      {media.map((item, position) => {
        const state = states.get(position);
        if (!state) return null;
        const clip = item.mediaType === 'VIDEO';
        return (
          <div
            key={item.attachmentId}
            className="wir-moment-slide"
            data-state={state}
            data-entering={
              state === 'active' && previous !== null ? true : undefined
            }
            aria-hidden={state === 'active' ? undefined : true}
          >
            <MemoryPreview
              memoryId={memoryId}
              attachmentId={item.attachmentId}
              hasThumbnail={item.hasThumbnail}
              isSensitive={false}
              loadImage={loadImage}
              resourceScopeKey={`wir-moment:${memoryId}`}
            />
            {clip && clipsAllowed && loadClip ? (
              <MomentClip
                memoryId={memoryId}
                attachmentId={item.attachmentId}
                loadClip={loadClip}
                playing={running && state === 'active'}
                onEnded={onClipEnded}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** The pause control and the quiet progress marks, outside the moment's link. */
export function WirMomentControls({
  count,
  index,
  paused,
  onToggle,
}: {
  count: number;
  index: number;
  paused: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const label = paused
    ? t('m5s5.today.momentGallery.play')
    : t('m5s5.today.momentGallery.pause');
  return (
    <div className="wir-moment-controls">
      <span className="wir-moment-marks" aria-hidden="true">
        {Array.from({ length: count }, (_, mark) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: The marks are positional and carry no identity.
            key={mark}
            className="wir-moment-mark"
            data-current={mark === index || undefined}
          />
        ))}
      </span>
      <button
        type="button"
        className="wir-moment-toggle"
        aria-label={label}
        aria-pressed={paused}
        onClick={onToggle}
      >
        <svg
          className="inline-icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          {paused ? (
            <path d="M8 5.5v13l10.5-6.5L8 5.5z" />
          ) : (
            <path d="M8.5 5.5v13M15.5 5.5v13" />
          )}
        </svg>
      </button>
    </div>
  );
}
