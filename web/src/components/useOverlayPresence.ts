import { useCallback, useEffect, useRef, useState } from 'react';

export type OverlayPresenceState = 'open' | 'exiting';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function motionEnabledByPreference(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return false;
  return !window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * Presentation-only presence for modal/sheet layers.
 *
 * The owner remains authoritative: `open=false` is the close intent. When
 * motion is enabled, the layer stays present only until its real CSS
 * transition/animation completion signal calls `completeExit`. Reduced
 * motion never introduces a retained exit phase.
 */
export function useOverlayPresence(open: boolean): {
  present: boolean;
  presenceState: OverlayPresenceState;
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
  const presenceState: OverlayPresenceState =
    !open && present ? 'exiting' : 'open';

  const completeExit = useCallback(() => {
    // A stale completion signal from an interrupted exit must never tear down
    // a reopened layer. Only the authoritative closed state may release presence.
    if (!openRef.current) setRetained(false);
  }, []);

  return { present, presenceState, completeExit };
}
