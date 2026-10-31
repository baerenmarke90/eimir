import { type RefObject, useLayoutEffect } from 'react';

/** Measure natural card heights; sparse CSS placement keeps source and focus order. */
export function useDiscoverLayout(
  rootRef: RefObject<HTMLDivElement | null>,
  revision: string,
  enabled: boolean,
) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!enabled || !revision || !root || typeof ResizeObserver === 'undefined')
      return;
    let frame = 0;
    let active = true;
    const grids = Array.from(
      root.querySelectorAll<HTMLElement>('.momente-tapestry'),
    );
    function measure() {
      frame = 0;
      if (!active) return;
      for (const grid of grids) {
        const style = getComputedStyle(grid);
        const columns = style.gridTemplateColumns
          .split(' ')
          .filter(Boolean).length;
        if (grid.clientWidth === 0 || columns < 2) {
          delete grid.dataset.discoverMeasured;
          for (const child of Array.from(grid.children))
            (child as HTMLElement).style.removeProperty('--discover-rows');
          continue;
        }
        grid.dataset.discoverMeasured = 'true';
        const measured = getComputedStyle(grid);
        const unit = Number.parseFloat(measured.gridAutoRows);
        const gap = Number.parseFloat(measured.rowGap) || 0;
        if (!Number.isFinite(unit) || unit <= 0) continue;
        for (const child of Array.from(grid.children)) {
          const item = child as HTMLElement;
          // Layout dimensions do not include the viewport reveal's transform.
          const span = Math.max(
            1,
            Math.ceil((item.offsetHeight + gap) / (unit + gap)),
          );
          const value = String(span);
          if (item.style.getPropertyValue('--discover-rows') !== value)
            item.style.setProperty('--discover-rows', value);
        }
      }
    }
    const observer = new ResizeObserver(() => {
      if (!frame) frame = requestAnimationFrame(measure);
    });
    for (const grid of grids) {
      observer.observe(grid);
      for (const child of Array.from(grid.children)) observer.observe(child);
    }
    measure();
    return () => {
      active = false;
      observer.disconnect();
      cancelAnimationFrame(frame);
      for (const grid of grids) {
        delete grid.dataset.discoverMeasured;
        for (const child of Array.from(grid.children))
          (child as HTMLElement).style.removeProperty('--discover-rows');
      }
    };
  }, [rootRef, revision, enabled]);
}
