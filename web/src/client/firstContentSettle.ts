import { useEffect, useRef, useState } from 'react';

/** Long enough for the settle and the one-time glow to finish. */
const SETTLE_WINDOW_MS = 1400;

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
    const timer = window.setTimeout(() => setSettling(false), SETTLE_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [settling]);

  return settling;
}
