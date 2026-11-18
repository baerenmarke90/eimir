import { useLayoutEffect, useRef, useState } from 'react';

/** The admission band reaches three quarters of a viewport beyond each edge. */
const ADMISSION_MARGIN = 0.75;

function isWithinAdmissionBand(node: Element): boolean {
  const height = window.innerHeight || document.documentElement.clientHeight;
  if (!height) return false;
  const rect = node.getBoundingClientRect();
  // An element without a laid-out box (hidden, detached) waits for the observer.
  if (rect.width === 0 && rect.height === 0) return false;
  return (
    rect.bottom >= -height * ADMISSION_MARGIN &&
    rect.top <= height * (1 + ADMISSION_MARGIN)
  );
}

/**
 * One-shot viewport admission; media ownership and privacy stay with the caller.
 * A preview already inside the admission band is admitted before the first
 * paint, so a returning view never paints a deferred skeleton for an image it
 * can show at once. Others wait for the IntersectionObserver.
 */
export function usePreviewLoadGate(
  mode: 'immediate' | 'near-viewport',
  enabled = true,
) {
  const ref = useRef<HTMLDivElement>(null);
  const [admitted, setAdmitted] = useState(mode === 'immediate');
  useLayoutEffect(() => {
    if (!enabled) return;
    if (mode === 'immediate' || admitted) {
      setAdmitted(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    if (
      typeof IntersectionObserver === 'undefined' ||
      isWithinAdmissionBand(node)
    ) {
      setAdmitted(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setAdmitted(true);
        observer.disconnect();
      },
      {
        root: null,
        rootMargin: `${ADMISSION_MARGIN * 100}% 0px`,
        threshold: 0,
      },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [mode, enabled, admitted]);
  return { ref, shouldLoad: enabled && (mode === 'immediate' || admitted) };
}
