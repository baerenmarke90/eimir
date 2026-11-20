import { useEffect } from 'react';

/** Root attribute that shows the status-bar backdrop (see styles.css). */
export const PAGE_SCROLLED_ATTRIBUTE = 'data-page-scrolled';

/**
 * Marks the root while the page is scrolled away from its top, so the
 * backdrop behind the system status bar fades in and scrolled content no
 * longer runs under the clock and status icons (#2063). At the very top the
 * backdrop stays hidden and hero colours reach the screen edge unchanged.
 *
 * Replace `scroll-state` (Motion Contract 4.2): the scroll position sets a
 * state, and styles.css cross-fades the backdrop with `--duration-transition`
 * (`0ms` with reduced motion). The state depends only on being at the very
 * top, so it needs no travel hysteresis (`ScrollState` is for travel-based
 * states such as the floating create tuck); there is no per-pixel
 * scroll-linked transform.
 */
export function useStatusBarScrim(): void {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    const evaluate = () => {
      frame = 0;
      if (window.scrollY > 0) root.setAttribute(PAGE_SCROLLED_ATTRIBUTE, '');
      else root.removeAttribute(PAGE_SCROLLED_ATTRIBUTE);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(evaluate);
    };
    evaluate();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      root.removeAttribute(PAGE_SCROLLED_ATTRIBUTE);
    };
  }, []);
}
