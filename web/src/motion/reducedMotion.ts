/**
 * The one reduced-motion source of the app (Motion Contract M9).
 *
 * Feature code never calls `matchMedia('(prefers-reduced-motion: reduce)')`
 * itself. It reads `prefersReducedMotion()` or subscribes through
 * `useReducedMotion()`, which follows a change of the preference at runtime.
 *
 * The media query is read on every call instead of being cached at module
 * load, so a preference change between two calls (or a test that swaps
 * `window.matchMedia`) is always seen.
 */
import { useSyncExternalStore } from 'react';

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function query(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return null;
  return window.matchMedia(REDUCED_MOTION_QUERY);
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
