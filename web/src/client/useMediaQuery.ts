import { useEffect, useState } from 'react';

/**
 * Reactive wrapper around matchMedia for product breakpoints and preferences.
 *
 * Components own the semantic query they need; this hook only centralizes the
 * browser subscription lifecycle so responsive overlays do not invent local
 * resize state machines.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  const [matches, setMatches] = useState(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return fallback;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      setMatches(fallback);
      return;
    }

    const media = window.matchMedia(query);
    setMatches(media.matches);

    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }

    media.addListener?.(listener);
    return () => media.removeListener?.(listener);
  }, [fallback, query]);

  return matches;
}
