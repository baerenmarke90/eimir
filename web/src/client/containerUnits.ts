/**
 * Pixel units that replace CSS container query units (cqi/cqw).
 *
 * Measured on Android WebView (Pixel 10 Pro Fold, #2283): CSS containers
 * made every layout of the whole page about four times as expensive
 * (19.7 ms vs 5.4 ms per forced layout; ~50 ms frames in the record crate
 * whenever anything changed). Instead, every element that would be a
 * container gets its own width as a pixel unit:
 *   --cu        1% of the element's content-box inline size (like 1cqi inside it)
 *   --cu-outer  the same unit of the nearest unit element above it
 *               (what 1cqi meant for the element's own properties)
 * Stylesheets use calc(N * var(--cu)) / calc(N * var(--cu-outer)). Units are
 * only written when a size really changes, so ordinary state changes never
 * touch them.
 */
import { type RefObject, useLayoutEffect } from 'react';

/** The content-box inline size of an element in px. */
export function contentWidth(el: HTMLElement): number {
  const style = getComputedStyle(el);
  const pad =
    (Number.parseFloat(style.paddingLeft) || 0) +
    (Number.parseFloat(style.paddingRight) || 0);
  const border =
    (Number.parseFloat(style.borderLeftWidth) || 0) +
    (Number.parseFloat(style.borderRightWidth) || 0);
  return Math.max(0, el.getBoundingClientRect().width - pad - border);
}

/** Outer elements first, so inner ones can read their outer unit. */
export function outerFirst(elements: HTMLElement[]): HTMLElement[] {
  return elements
    .slice()
    .sort((a, b) => (a.contains(b) ? -1 : b.contains(a) ? 1 : 0));
}

/**
 * Writes `--cu` / `--cu-outer` on every element matching `unitSelector`
 * inside `rootRef` (and on the root itself when it matches), and keeps them
 * current while sizes change or unit elements mount later.
 */
export function useContainerUnits(
  rootRef: RefObject<HTMLElement | null>,
  unitSelector: string,
) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const units = new Map<HTMLElement, number>();
    const viewportUnit = () =>
      Math.min(
        window.innerWidth,
        document.documentElement.clientWidth || window.innerWidth,
      ) / 100;

    const outerOf = (el: HTMLElement) => {
      const outer = el.parentElement?.closest<HTMLElement>(unitSelector);
      return outer && root.contains(outer)
        ? (units.get(outer) ?? contentWidth(outer) / 100)
        : viewportUnit();
    };
    const write = (el: HTMLElement, unit: number) => {
      const previous = units.get(el);
      if (previous !== undefined && Math.abs(previous - unit) < 0.01)
        return false;
      units.set(el, unit);
      el.style.setProperty('--cu', `${unit.toFixed(3)}px`);
      return true;
    };
    const writeOuter = (el: HTMLElement) => {
      const value = `${outerOf(el).toFixed(3)}px`;
      if (el.style.getPropertyValue('--cu-outer') !== value)
        el.style.setProperty('--cu-outer', value);
    };
    const all = () =>
      outerFirst(
        Array.from(root.querySelectorAll<HTMLElement>(unitSelector)).concat(
          root.matches(unitSelector) ? [root] : [],
        ),
      );
    const refresh = (els: HTMLElement[]) => {
      for (const el of els) writeOuter(el);
      for (const el of els) write(el, contentWidth(el) / 100);
      for (const el of els) writeOuter(el);
    };

    const initial = all();
    refresh(initial);
    if (typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        const box = entry.contentBoxSize?.[0];
        const width = box ? box.inlineSize : entry.contentRect.width;
        if (write(el, width / 100)) changed = true;
      }
      // A unit changed: the elements inside it need a new outer unit.
      if (changed) for (const el of all()) writeOuter(el);
    });
    for (const el of initial) observer.observe(el);

    // Unit elements that mount later (sleeves, cards, layers).
    const mutations = new MutationObserver((records) => {
      const fresh: HTMLElement[] = [];
      for (const record of records)
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.matches(unitSelector)) fresh.push(node);
          fresh.push(
            ...Array.from(node.querySelectorAll<HTMLElement>(unitSelector)),
          );
        }
      if (fresh.length === 0) return;
      const ordered = outerFirst(fresh);
      refresh(ordered);
      for (const el of ordered) observer.observe(el);
    });
    mutations.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [rootRef, unitSelector]);
}
