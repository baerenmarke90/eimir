import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useMediaQuery } from './useMediaQuery';

/** Finite, deliberate page playback; media loading never consumes reading time. */
export function useStoryPlayback({
  pageKey,
  duration,
  ready,
  blocked,
  autoStart,
  onAdvance,
}: {
  pageKey: string;
  duration: number;
  ready: boolean;
  blocked: boolean;
  autoStart: boolean;
  onAdvance: () => void;
}) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)', true);
  const [playing, setPlaying] = useState(
    () => autoStart && !reducedMotion && document.visibilityState !== 'hidden',
  );
  const remaining = useRef({ key: pageKey, duration, value: duration });
  const advance = useRef(onAdvance);
  useLayoutEffect(() => {
    advance.current = onAdvance;
  }, [onAdvance]);
  const pause = useCallback(() => setPlaying(false), []);

  useEffect(() => {
    if (blocked) pause();
  }, [blocked, pause]);
  useEffect(() => {
    if (reducedMotion) pause();
  }, [reducedMotion, pause]);
  useEffect(() => {
    const visibility = () => {
      if (document.visibilityState === 'hidden') pause();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pause);
    window.addEventListener('blur', pause);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pause);
      window.removeEventListener('blur', pause);
    };
  }, [pause]);

  useEffect(() => {
    if (
      remaining.current.key !== pageKey ||
      remaining.current.duration !== duration
    ) {
      remaining.current = { key: pageKey, duration, value: duration };
    }
    if (!playing || !ready || blocked || document.visibilityState === 'hidden')
      return;
    const started = performance.now();
    let finished = false;
    const timer = window.setTimeout(() => {
      finished = true;
      remaining.current.value = 0;
      advance.current();
    }, remaining.current.value);
    return () => {
      window.clearTimeout(timer);
      if (!finished && remaining.current.key === pageKey) {
        remaining.current.value = Math.max(
          0,
          remaining.current.value - (performance.now() - started),
        );
      }
    };
  }, [blocked, duration, pageKey, playing, ready]);

  return {
    playing: playing && !blocked,
    running: playing && ready && !blocked,
    reducedMotion,
    pause,
    play: () => {
      if (document.visibilityState !== 'hidden') setPlaying(true);
    },
  };
}

/** An album caption gets time proportional to its words, with a photo minimum. */
export function storyReadingDuration(text: string): number {
  const words = text.trim().split(/\s+/u).filter(Boolean).length;
  return Math.min(90_000, Math.max(6_000, 2_000 + words * 400));
}
