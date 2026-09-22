import { useCallback, useEffect, useRef, useState } from 'react';

export type PresentationPresenceState = 'open' | 'exiting';
export type OverlayPresenceState = PresentationPresenceState;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function motionEnabledByPreference(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return false;
  return !window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * Presentation-only presence for short-lived UI that needs a real exit phase.
 *
 * The semantic owner remains authoritative: `open=false` is immediate state.
 * When motion is enabled, presentation stays mounted only until its real CSS
 * completion signal calls `completeExit`. Reduced motion never introduces a
 * retained exit phase. Callers own all domain, focus, and modality semantics.
 */
export function usePresentationPresence(open: boolean): {
  present: boolean;
  presenceState: PresentationPresenceState;
  completeExit: () => void;
} {
  const [retained, setRetained] = useState(open);
  const [motionEnabled, setMotionEnabled] = useState(motionEnabledByPreference);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    )
      return;

    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const handleChange = () => setMotionEnabled(!mediaQuery.matches);
    handleChange();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener?.(handleChange);
    return () => mediaQuery.removeListener?.(handleChange);
  }, []);

  useEffect(() => {
    if (open) {
      setRetained(true);
      return;
    }
    if (!motionEnabled) setRetained(false);
  }, [motionEnabled, open]);

  const present = open || (retained && motionEnabled);
  const presenceState: PresentationPresenceState =
    !open && present ? 'exiting' : 'open';

  const completeExit = useCallback(() => {
    // A stale completion signal from an interrupted exit must never tear down
    // a reopened presentation. Only authoritative closed state releases it.
    if (!openRef.current) setRetained(false);
  }, []);

  return { present, presenceState, completeExit };
}

/**
 * Semantic alias for modal/sheet consumers. Keeping this name preserves the
 * #1215 overlay contract while other short-lived presentation states can reuse
 * the same lifecycle without creating another retained-presence machine.
 */
export function useOverlayPresence(open: boolean): {
  present: boolean;
  presenceState: OverlayPresenceState;
  completeExit: () => void;
} {
  return usePresentationPresence(open);
}
