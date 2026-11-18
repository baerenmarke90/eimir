import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { VideoSource } from '../client/video';
import { useTranslation } from '../i18n';

export type VideoSourceLoader = (
  id: string,
  signal: AbortSignal,
) => Promise<VideoSource>;

/** One active player owns one transient grant; it never owns a Blob cache. */
interface VideoPlayerProps {
  id: string;
  scope: string;
  poster?: string;
  load: VideoSourceLoader;
}

export function VideoPlayer(props: VideoPlayerProps) {
  return (
    <ActiveVideoPlayer
      key={JSON.stringify([props.scope, props.id])}
      {...props}
    />
  );
}

function ActiveVideoPlayer({ id, scope, poster, load }: VideoPlayerProps) {
  const { t } = useTranslation();
  const element = useRef<HTMLVideoElement>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  const [source, setSource] = useState<VideoSource | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const seek = useRef(0);
  const wantsPlay = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: A retry replaces the grant; the loader closure is not resource identity.
  useEffect(() => {
    const request = new AbortController();
    setSource(null);
    setFailed(false);
    void loadRef
      .current(id, request.signal)
      .then((value) => {
        if (!request.signal.aborted) setSource(value);
      })
      .catch(() => {
        if (!request.signal.aborted) setFailed(true);
      });
    return () => request.abort();
  }, [id, scope, attempt]);
  useLayoutEffect(() => {
    if (!source || failed) return;
    const player = element.current;
    if (!player) return;
    if (wantsPlay.current) void player.play().catch(() => undefined);
    const pause = () => player.pause();
    document.addEventListener('visibilitychange', pause);
    return () => {
      document.removeEventListener('visibilitychange', pause);
      player.pause();
      player.removeAttribute('src');
      player.load();
    };
  }, [source, failed]);
  const retry = () => {
    seek.current = element.current?.currentTime ?? seek.current;
    wantsPlay.current = true;
    setSource(null);
    setFailed(false);
    setAttempt((value) => value + 1);
  };
  if (failed)
    return (
      <div className="media-gallery-unavailable" role="status">
        <p>{t('video.unavailable')}</p>
        <button type="button" onClick={retry}>
          {t('video.retry')}
        </button>
      </div>
    );
  if (!source)
    return (
      <div
        className="media-gallery-loading"
        role="status"
        aria-label={t('media.loading')}
      />
    );
  return (
    // biome-ignore lint/a11y/useMediaCaption: Authored uploads have no caption-track contract; the parent's narrative and native accessible controls remain available.
    <video
      key={attempt}
      ref={element}
      className="media-lightbox-content video-player"
      src={source.url}
      poster={poster}
      controls
      playsInline
      preload="none"
      aria-label={t('video.play')}
      onError={() => setFailed(true)}
      onPlay={() => {
        if (source.expiresAt.getTime() <= Date.now()) retry();
      }}
      onLoadedMetadata={() => {
        const player = element.current;
        if (!player) return;
        if (seek.current > 0)
          player.currentTime = Math.min(
            seek.current,
            player.duration || seek.current,
          );
        if (wantsPlay.current) {
          wantsPlay.current = false;
          void player.play().catch(() => undefined);
        }
      }}
    />
  );
}
