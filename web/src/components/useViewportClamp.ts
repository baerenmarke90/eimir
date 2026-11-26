import { type RefObject, useLayoutEffect } from 'react';

const VIEWPORT_EDGE_GAP_PX = 8;

/**
 * While a primary-tab swipe or slide is in flight the page is offset or
 * transformed, so its on-screen rectangle says nothing about where the
 * decoration will sit once the page has settled.
 */
const NAVIGATION_MOTION_SELECTOR =
  '[data-primary-tab-dragging], [data-navigation-slide], [data-primary-tab-peek]';
const NAVIGATION_MOTION_ATTRIBUTES = [
  'data-primary-tab-dragging',
  'data-navigation-slide',
  'data-primary-tab-peek',
];

/**
 * Shifts an absolutely positioned decoration horizontally so it never clips
 * at the screen edge, e.g. avatar badges at large text sizes. The shift is a
 * CSS custom property (`--viewport-clamp-shift`) the caller's stylesheet
 * applies with `translate`, so layout ownership stays in CSS.
 *
 * Measuring is skipped while the page is being swiped or slid, and repeated
 * when that motion ends: a measurement taken mid-swipe sees a page outside the
 * screen, would pin the decoration far from its avatar, and nothing would
 * resize afterwards to correct it.
 */
export function useViewportClamp(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof window === 'undefined') return;
    let frame = 0;
    // Start from no shift; afterwards every change is written only when the
    // measured shift differs.
    let applied = 0;
    element.style.setProperty('--viewport-clamp-shift', '0px');
    const measure = () => {
      // Not laid out (hidden tab) or mid-motion: keep the last settled value.
      if (element.closest(`${NAVIGATION_MOTION_SELECTOR}, [hidden]`)) return;
      // Read before writing, and take the applied shift out of the measured
      // box, so the measurement never forces a second layout.
      const box = element.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) return;
      const left = box.left - applied;
      const right = box.right - applied;
      const viewport = document.documentElement.clientWidth;
      let shift = 0;
      if (left < VIEWPORT_EDGE_GAP_PX) {
        shift = VIEWPORT_EDGE_GAP_PX - left;
      } else if (right > viewport - VIEWPORT_EDGE_GAP_PX) {
        shift = viewport - VIEWPORT_EDGE_GAP_PX - right;
      }
      if (shift === applied) return;
      applied = shift;
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
    // The swipe markers live on the shell surface and the peeked panel; their
    // removal is the moment the page is back where it belongs.
    const surface = element.closest('.product-main');
    const motionObserver =
      surface && typeof MutationObserver === 'function'
        ? new MutationObserver(schedule)
        : null;
    if (surface)
      motionObserver?.observe(surface, {
        attributes: true,
        attributeFilter: NAVIGATION_MOTION_ATTRIBUTES,
        subtree: true,
      });
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      motionObserver?.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [ref]);
}
