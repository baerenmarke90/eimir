import { type SyntheticEvent, useCallback, useState } from 'react';

/** Sources that already faded in during this runtime; bounded, URLs only. */
const revealedSources = new Set<string>();
const MAX_REVEALED_SOURCES = 4000;

function rememberRevealed(src: string | null): void {
  if (!src) return;
  revealedSources.delete(src);
  revealedSources.add(src);
  while (revealedSources.size > MAX_REVEALED_SOURCES) {
    const oldest = revealedSources.values().next().value;
    if (oldest === undefined) break;
    revealedSources.delete(oldest);
  }
}

/**
 * Fades an image in once its pixels are decoded instead of letting it pop in
 * over an empty frame. An image that is already complete when attached shows
 * immediately, and a source that already faded in once (a returning view of a
 * shared object URL) starts visible instead of fading again. Failure also
 * settles, so a broken source never stays hidden. The fade uses motion tokens
 * that collapse to zero under reduced motion.
 */
export function useMediaReveal(src: string | null | undefined) {
  const [settledSrc, setSettledSrc] = useState<string | null>(null);
  const settle = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
    const settled = event.currentTarget.getAttribute('src');
    if (event.type === 'load') rememberRevealed(settled);
    setSettledSrc(settled);
  }, []);
  const ref = useCallback((image: HTMLImageElement | null) => {
    if (image?.complete && image.naturalWidth > 0)
      setSettledSrc(image.getAttribute('src'));
  }, []);
  const ready =
    Boolean(src) && (settledSrc === src || revealedSources.has(src as string));
  return {
    ref,
    onLoad: settle,
    onError: settle,
    'data-media-reveal': ready ? 'ready' : 'pending',
  } as const;
}
