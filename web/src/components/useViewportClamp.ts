import { type RefObject, useLayoutEffect } from 'react';

const VIEWPORT_EDGE_GAP_PX = 8;

/**
 * Shifts an absolutely positioned decoration horizontally so it never clips
 * at the screen edge, e.g. avatar badges at large text sizes. The shift is a
 * CSS custom property (`--viewport-clamp-shift`) the caller's stylesheet
 * applies with `translate`, so layout ownership stays in CSS.
 */
export function useViewportClamp(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof window === 'undefined') return;
    let frame = 0;
    const measure = () => {
      element.style.setProperty('--viewport-clamp-shift', '0px');
      const rect = element.getBoundingClientRect();
      const viewport = document.documentElement.clientWidth;
      let shift = 0;
      if (rect.left < VIEWPORT_EDGE_GAP_PX) {
        shift = VIEWPORT_EDGE_GAP_PX - rect.left;
      } else if (rect.right > viewport - VIEWPORT_EDGE_GAP_PX) {
        shift = viewport - VIEWPORT_EDGE_GAP_PX - rect.right;
      }
      element.style.setProperty('--viewport-clamp-shift', `${shift}px`);
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    measure();
    const observer =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(schedule)
        : null;
    observer?.observe(element);
    if (element.parentElement) observer?.observe(element.parentElement);
    window.addEventListener('resize', schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [ref]);
}
