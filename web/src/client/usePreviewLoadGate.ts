import { useEffect, useRef, useState } from 'react';

/** One-shot viewport admission; media ownership and privacy stay with the caller. */
export function usePreviewLoadGate(
  mode: 'immediate' | 'near-viewport',
  enabled = true,
) {
  const ref = useRef<HTMLDivElement>(null);
  const [admitted, setAdmitted] = useState(mode === 'immediate');
  useEffect(() => {
    if (!enabled) return;
    if (mode === 'immediate' || admitted) {
      setAdmitted(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setAdmitted(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setAdmitted(true);
        observer.disconnect();
      },
      { root: null, rootMargin: '75% 0px', threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [mode, enabled, admitted]);
  return { ref, shouldLoad: enabled && (mode === 'immediate' || admitted) };
}
