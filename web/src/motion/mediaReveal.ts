/**
 * Media reveal registry for the Enter `media` variant (Motion Contract 4.1,
 * M5).
 *
 * - The media is drawn over its placeholder only after `decode()` resolved
 *   (or `load` where `decode()` is missing).
 * - It fades in only the first time its URL is shown in this session. A URL
 *   that was shown before, or that decodes within one frame (from cache),
 *   appears at once.
 * - A remount or a refetch with the same URL never shows the placeholder again
 *   and never fades again: `isMediaShown(url)` is true in the first render.
 *
 * URLs are kept in memory only (never persisted, logged or sent), bounded to
 * the most recent `MAX_REMEMBERED_URLS`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './reducedMotion';

export const MAX_REMEMBERED_URLS = 512;
/** A decode that resolves within one frame counts as cached. */
export const CACHED_DECODE_MS = 17;

const shown = new Set<string>();

export function isMediaShown(url: string | null | undefined): boolean {
  return !!url && shown.has(url);
}

export function markMediaShown(url: string): void {
  shown.delete(url);
  shown.add(url);
  if (shown.size > MAX_REMEMBERED_URLS) {
    const oldest = shown.values().next().value;
    if (oldest !== undefined) shown.delete(oldest);
  }
}

export type MediaReveal = 'fade' | 'instant';

/** How a media element that just became ready is revealed. */
export function mediaRevealMode(url: string, decodeMs: number): MediaReveal {
  if (shown.has(url)) return 'instant';
  if (decodeMs <= CACHED_DECODE_MS) return 'instant';
  if (prefersReducedMotion()) return 'instant';
  return 'fade';
}

function decoded(image: HTMLImageElement): Promise<void> {
  if (image.complete && image.naturalWidth > 0) {
    return typeof image.decode === 'function'
      ? image.decode().catch(() => undefined)
      : Promise.resolve();
  }
  if (typeof image.decode === 'function') return image.decode();
  return new Promise((resolve, reject) => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => reject(new Error('media')), {
      once: true,
    });
  });
}

/**
 * Waits for `image` to be decoded and returns how to reveal it, marking its
 * URL as shown. Rejects when the media fails; the placeholder then stays.
 */
export async function revealMedia(
  image: HTMLImageElement,
  url: string,
  clock: () => number = () => performance.now(),
): Promise<MediaReveal> {
  if (shown.has(url)) return 'instant';
  const started = clock();
  await decoded(image);
  const mode = mediaRevealMode(url, clock() - started);
  markMediaShown(url);
  return mode;
}

export interface MediaRevealState {
  /** Draw the media over the placeholder. */
  shown: boolean;
  /** Apply the `media` fade (data-motion-enter="media") once. */
  fade: boolean;
  /** Attach to the `img` element. */
  ref: (image: HTMLImageElement | null) => void;
}

/**
 * React binding. A URL that was shown before is shown in the first render
 * (no placeholder, no fade). A changed URL keeps the previous image until
 * the new one is decoded (the caller cross-fades with Replace `crossfade`).
 */
export function useMediaReveal(
  url: string | null | undefined,
): MediaRevealState {
  const [state, setState] = useState(() => ({
    url,
    shown: isMediaShown(url),
    fade: false,
  }));
  const image = useRef<HTMLImageElement | null>(null);
  const current = state.url === url ? state : null;

  const reveal = useCallback(() => {
    const element = image.current;
    if (!element || !url || isMediaShown(url)) {
      if (url && isMediaShown(url))
        setState((previous) =>
          previous.url === url && previous.shown
            ? previous
            : { url, shown: true, fade: false },
        );
      return;
    }
    let cancelled = false;
    revealMedia(element, url).then(
      (mode) => {
        if (!cancelled) setState({ url, shown: true, fade: mode === 'fade' });
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => reveal(), [reveal]);

  const ref = useCallback((element: HTMLImageElement | null) => {
    image.current = element;
  }, []);

  return {
    shown: current?.shown ?? isMediaShown(url),
    fade: current?.fade ?? false,
    ref,
  };
}

/** Test support. */
export function resetMediaRevealForTests(): void {
  shown.clear();
}
