import { useEffect, useRef, useState } from 'react';
import { durationMs } from '../motion/tokens';

/** Long enough for the module entrance and the one-time glow after it. */
function settleWindowMs(): number {
  return durationMs('module-enter') + durationMs('gesture-moment');
}

/**
 * True for a short moment when an area that was seen empty receives its
 * first item (#1907 I1), so the first content settles into place instead of
 * replacing the empty state abruptly. Areas that load with content, or that
 * were never seen empty in this mount, do not animate.
 */
export function useFirstContentSettle(empty: boolean | undefined): boolean {
  const seenEmpty = useRef(false);
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    if (empty === true) {
      seenEmpty.current = true;
      return;
    }
    if (empty === false && seenEmpty.current) {
      seenEmpty.current = false;
      setSettling(true);
    }
  }, [empty]);

  useEffect(() => {
    if (!settling) return;
    const timer = window.setTimeout(() => setSettling(false), settleWindowMs());
    return () => window.clearTimeout(timer);
  }, [settling]);

  return settling;
}
