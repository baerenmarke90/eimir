import { type RefObject, useLayoutEffect } from 'react';

/**
 * Above this share of the viewport the app bar is already so tall (large
 * text, browser zoom, a wrapped bar) that a second pinned band below it would
 * cost too much reading space. Month headings then stay ordinary content.
 */
const MAX_PINNED_BAR_SHARE = 0.2;

/**
 * Pins Timeline month headings directly below the product app bar (#969).
 *
 * The bar's height is not a constant: it is 64 CSS px on a phone, 72 on a
 * wide window and grows when text is enlarged, while `--topbar-height` is a
 * fixed estimate. The offset is therefore measured from the rendered bar and
 * kept current as it resizes, so a heading never sits half-hidden beneath
 * it. Pinning is switched off entirely when the bar is not sticky or is too
 * tall to leave room for a second band.
 */
export function useStickyTimelineMonths(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!active || !container) return;
    const bar = document.querySelector<HTMLElement>('.product-topbar');

    const update = () => {
      const barHeight =
        bar && getComputedStyle(bar).position === 'sticky'
          ? bar.getBoundingClientRect().height
          : 0;
      const pinned =
        barHeight > 0 && barHeight <= window.innerHeight * MAX_PINNED_BAR_SHARE;
      container.style.setProperty(
        '--story-month-sticky-top',
        `${Math.round(barHeight)}px`,
      );
      container.toggleAttribute('data-sticky-months', pinned);
    };

    update();
    const observer =
      typeof ResizeObserver === 'undefined' || !bar
        ? null
        : new ResizeObserver(update);
    if (bar) observer?.observe(bar);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      container.removeAttribute('data-sticky-months');
      container.style.removeProperty('--story-month-sticky-top');
    };
  }, [active, containerRef]);
}
