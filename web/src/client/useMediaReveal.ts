import { type SyntheticEvent, useCallback, useState } from 'react';

/**
 * Fades an image in once its pixels are decoded instead of letting it pop in
 * over an empty frame. An image that is already complete when attached shows
 * immediately. Failure also settles, so a broken source never stays hidden.
 * The fade uses motion tokens that collapse to zero under reduced motion.
 */
export function useMediaReveal(src: string | null | undefined) {
  const [settledSrc, setSettledSrc] = useState<string | null>(null);
  const settle = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) =>
      setSettledSrc(event.currentTarget.getAttribute('src')),
    [],
  );
  const ref = useCallback((image: HTMLImageElement | null) => {
    if (image?.complete && image.naturalWidth > 0)
      setSettledSrc(image.getAttribute('src'));
  }, []);
  return {
    ref,
    onLoad: settle,
    onError: settle,
    'data-media-reveal': src && settledSrc === src ? 'ready' : 'pending',
  } as const;
}
