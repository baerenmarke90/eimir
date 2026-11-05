import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { taskOriginPath, useTaskOrigin } from './taskOrigin';

function documentLayoutTop(element: HTMLElement): number {
  let top = 0;
  let current: HTMLElement | null = element;
  while (current) {
    top += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  return top;
}

/** Restore authorized collection scope, loaded range, focus and layout position. */
export function useTaskListReturn({
  ready,
  busy,
  loadedPageCount,
  canLoadMore,
  loadMore,
}: {
  ready: boolean;
  busy: boolean;
  loadedPageCount: number;
  canLoadMore: boolean;
  loadMore: () => Promise<unknown>;
}) {
  const location = useLocation();
  const { resolveOrigin, registerOriginMetadata } = useTaskOrigin();
  const returnKey = (location.state as { taskReturnKey?: unknown } | null)
    ?.taskReturnKey;
  const candidateOrigin = resolveOrigin(returnKey);
  const returnOrigin =
    candidateOrigin?.to === taskOriginPath(location.pathname, location.search)
      ? candidateOrigin
      : null;
  const restoredEntryRef = useRef<string | null>(null);
  const [restoredEntry, setRestoredEntry] = useState<string | null>(null);
  const returnEntry = returnOrigin
    ? `${location.key}:${String(returnKey)}`
    : null;
  useEffect(
    () => registerOriginMetadata({ loadedPageCount }),
    [loadedPageCount, registerOriginMetadata],
  );
  useEffect(() => {
    if (!returnOrigin || !ready || busy) return;
    const entry = `${location.key}:${String(returnKey)}`;
    if (restoredEntryRef.current === entry) {
      setRestoredEntry(entry);
      return;
    }
    if (loadedPageCount < returnOrigin.loadedPageCount && canLoadMore) {
      void loadMore();
      return;
    }
    let settleFrame: number | null = null;
    const findSelected = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>('[data-task-item-key]'),
      ).find(
        (element) => element.dataset.taskItemKey === returnOrigin.selectedKey,
      );
    const restorePosition = () => {
      const selected = findSelected();
      const top =
        selected && returnOrigin.selectedOffset !== undefined
          ? documentLayoutTop(selected) - returnOrigin.selectedOffset
          : returnOrigin.scrollY;
      window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
      return selected;
    };
    const frame = window.requestAnimationFrame(() => {
      const selected = restorePosition();
      const focusTarget =
        selected ??
        (returnOrigin.focusTarget === 'quick-create'
          ? Array.from(
              document.querySelectorAll<HTMLElement>('.quick-create-trigger'),
            ).find((element) => element.getClientRects().length > 0)
          : null);
      focusTarget?.focus({ preventScroll: true });

      // Browser history restoration and late layout work can settle one frame
      // after the first paint. Re-apply the exact captured offset before the
      // task origin is marked restored so return continuity stays geometry-stable.
      // Use layout coordinates so task-return geometry stays independent of
      // bounded presentation transforms. Motion ownership must never become
      // part of the scroll-restoration coordinate system.
      settleFrame = window.requestAnimationFrame(() => {
        restorePosition();
        restoredEntryRef.current = entry;
        setRestoredEntry(entry);
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (settleFrame !== null) window.cancelAnimationFrame(settleFrame);
    };
  }, [
    returnOrigin,
    ready,
    busy,
    loadedPageCount,
    location.key,
    returnKey,
    canLoadMore,
    loadMore,
  ]);
  return Boolean(returnEntry && restoredEntry !== returnEntry);
}
