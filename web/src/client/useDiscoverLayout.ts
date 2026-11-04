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
          for (const child of Array.from(grid.children)) {
            const item = child as HTMLElement;
            item.style.removeProperty('--discover-rows');
            delete item.dataset.discoverFillRow;
          }
          continue;
        }
        // A full-width card clears both columns. Promote the unpaired card
        // before it instead of leaving an empty half row or reordering focus.
        let unpaired: HTMLElement | undefined;
        for (const child of Array.from(grid.children)) {
          const item = child as HTMLElement;
          delete item.dataset.discoverFillRow;
          if (item.dataset.discoverWide === 'true') {
            if (unpaired) unpaired.dataset.discoverFillRow = 'true';
            unpaired = undefined;
          } else {
            unpaired = unpaired ? undefined : item;
          }
        }
        if (unpaired) unpaired.dataset.discoverFillRow = 'true';
        // Let native grid size paired cards from their content before quantizing
        // rows. Equal row bounds avoid outside holes beside shorter notes/photos.
        delete grid.dataset.discoverMeasured;
        const items = Array.from(grid.children) as HTMLElement[];
        const heights = items.map((item) => item.offsetHeight);
        // Inline milestones may center within their cells, so their natural
        // boxes can differ. Both occupied columns still need the same row span.
        for (let index = 0; index < items.length; index += 1) {
          const item = items[index];
          if (
            item.dataset.discoverWide === 'true' ||
            item.dataset.discoverFillRow === 'true'
          )
            continue;
          const next = index + 1;
          if (next < items.length)
            heights[index] = heights[next] = Math.max(
              heights[index],
              heights[next],
            );
          index += 1;
        }
        grid.dataset.discoverMeasured = 'true';
        const measured = getComputedStyle(grid);
        const unit = Number.parseFloat(measured.gridAutoRows);
        const gap = Number.parseFloat(measured.rowGap) || 0;
        if (!Number.isFinite(unit) || unit <= 0) continue;
        for (const [index, item] of items.entries()) {
          // Layout dimensions do not include the viewport reveal's transform.
          const span = Math.max(
            1,
            Math.ceil((heights[index] + gap) / (unit + gap)),
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
        for (const child of Array.from(grid.children)) {
          (child as HTMLElement).style.removeProperty('--discover-rows');
          delete (child as HTMLElement).dataset.discoverFillRow;
        }
      }
    };
  }, [rootRef, revision, enabled]);
}
