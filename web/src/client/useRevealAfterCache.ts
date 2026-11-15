import { useEffect, useRef, useState } from 'react';

/** How long a module that just left its cached placeholder may ease in. */
export const REVEAL_AFTER_CACHE_MS = 600;

/**
 * True briefly after saved data was replaced by live data, so modules that
 * only exist for live data can ease in rather than pop.
 */
export function useRevealAfterCache(isCached: boolean): boolean {
  const wasCached = useRef(isCached);
  const [reveal, setReveal] = useState(false);
  useEffect(() => {
    if (wasCached.current && !isCached) {
      wasCached.current = false;
      setReveal(true);
      const timer = setTimeout(() => setReveal(false), REVEAL_AFTER_CACHE_MS);
      return () => clearTimeout(timer);
    }
    wasCached.current = isCached;
    setReveal(false);
    return undefined;
  }, [isCached]);
  return reveal;
}
