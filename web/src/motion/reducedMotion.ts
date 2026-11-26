/**
 * The one reduced-motion source of the app (Motion Contract M9).
 *
 * Feature code never calls `matchMedia('(prefers-reduced-motion: reduce)')`
 * itself. It reads `prefersReducedMotion()` or subscribes through
 * `useReducedMotion()`, which follows a change of the preference at runtime.
 *
 * The query list is kept while `window.matchMedia` stays the same function:
 * its `matches` is live, so a preference change between two calls is always
 * seen, and a test that swaps `window.matchMedia` gets a new list. Creating a
 * list per call was measurable, since every motion role read asks.
 */
import { useSyncExternalStore } from 'react';

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

let cached: {
  matchMedia: typeof window.matchMedia;
  list: MediaQueryList;
} | null = null;

function query(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return null;
  if (cached?.matchMedia !== window.matchMedia)
    cached = {
      matchMedia: window.matchMedia,
      list: window.matchMedia(REDUCED_MOTION_QUERY),
    };
  return cached.list;
}

/**
 * True when the person asked for reduced motion. Without `matchMedia` (very
 * old engines, layout-free test environments) the preference cannot be known,
 * so motion stays off: every primitive then shows its final state.
 */
export function prefersReducedMotion(): boolean {
  return query()?.matches ?? true;
}

/**
 * Calls `listener` whenever the preference changes. Returns the
 * unsubscribe function.
 */
export function subscribeReducedMotion(listener: () => void): () => void {
  const list = query();
  if (!list) return () => {};
  if (typeof list.addEventListener === 'function') {
    list.addEventListener('change', listener);
    return () => list.removeEventListener('change', listener);
  }
  list.addListener?.(listener);
  return () => list.removeListener?.(listener);
}

/** React binding: re-renders when the preference changes at runtime. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
    () => true,
  );
}
