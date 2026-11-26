/**
 * Visibility controller (Motion Contract M4, M8, M12).
 *
 * An element is visible for motion when all three hold:
 *
 * - the page is visible (`document.visibilityState`, `visibilitychange`);
 * - its kept view is shown: the primary tabs in `PrimaryTabPanels` hide an
 *   inactive tab with the `hidden` attribute on its `[data-primary-tab]`
 *   panel, and mark a panel prepared before its first visit with
 *   `data-primary-tab-prewarm`; both are observed here without changing the
 *   panel component;
 * - it is on screen (`IntersectionObserver`; treated as on screen where the
 *   observer is unavailable).
 *
 * One-shot motion uses `isVisibleNow()` to show its final state instead of
 * playing unseen (M12). Ambient motion subscribes with `observeVisibility()`
 * to pause and resume where it paused (M4, M8).
 */

export const KEPT_VIEW_SELECTOR = '[data-primary-tab]';
/** A kept view prepared (and possibly resting) before anyone has seen it. */
const PREPARED_VIEW_ATTRIBUTE = 'data-primary-tab-prewarm';

export interface VisibilityState {
  page: boolean;
  keptView: boolean;
  onScreen: boolean;
  visible: boolean;
}

function pageVisible(): boolean {
  return (
    typeof document === 'undefined' || document.visibilityState !== 'hidden'
  );
}

function keptViewShown(element: Element): boolean {
  const panel = element.closest(KEPT_VIEW_SELECTOR);
  return (
    !panel?.closest('[hidden]') && !panel?.hasAttribute(PREPARED_VIEW_ATTRIBUTE)
  );
}

function intersectsViewport(element: Element): boolean {
  if (typeof window === 'undefined') return true;
  const rect = element.getBoundingClientRect();
  // Layout-free environments (and elements without a box) count as on screen;
  // the kept-view and page checks above still apply.
  if (rect.width === 0 && rect.height === 0) return true;
  return (
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  );
}

/** Synchronous check for one-shot motion at the moment it would start. */
export function isVisibleNow(element: Element): VisibilityState {
  const page = pageVisible();
  const keptView = element.isConnected && keptViewShown(element);
  const onScreen = intersectsViewport(element);
  return { page, keptView, onScreen, visible: page && keptView && onScreen };
}

/**
 * Calls `listener` with the new state whenever the element's visibility for
 * motion changes, and once with the initial state. Returns the unsubscribe
 * function.
 */
export function observeVisibility(
  element: Element,
  listener: (state: VisibilityState) => void,
  options: { onScreen?: boolean } = {},
): () => void {
  const trackScreen = options.onScreen ?? true;
  let state = isVisibleNow(element);
  if (!trackScreen)
    state = { ...state, onScreen: true, visible: state.page && state.keptView };
  const emit = (patch: Partial<VisibilityState>) => {
    const next = { ...state, ...patch };
    next.visible = next.page && next.keptView && next.onScreen;
    const changed =
      next.page !== state.page ||
      next.keptView !== state.keptView ||
      next.onScreen !== state.onScreen;
    state = next;
    if (changed) listener(state);
  };
  listener(state);

  const cleanups: Array<() => void> = [];
  if (typeof document !== 'undefined') {
    const onPage = () => emit({ page: pageVisible() });
    document.addEventListener('visibilitychange', onPage);
    cleanups.push(() =>
      document.removeEventListener('visibilitychange', onPage),
    );
  }

  const panel = element.closest(KEPT_VIEW_SELECTOR);
  if (panel && typeof MutationObserver === 'function') {
    const observer = new MutationObserver(() =>
      emit({ keptView: keptViewShown(element) }),
    );
    // A hidden ancestor of the panel also hides the view; the first visit
    // of a prepared panel shows it.
    observer.observe(panel, {
      attributes: true,
      attributeFilter: ['hidden', PREPARED_VIEW_ATTRIBUTE],
    });
    let node: Element | null = panel.parentElement;
    while (node) {
      observer.observe(node, { attributes: true, attributeFilter: ['hidden'] });
      node = node.parentElement;
    }
    cleanups.push(() => observer.disconnect());
  }

  if (trackScreen && typeof IntersectionObserver === 'function') {
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) emit({ onScreen: entry.isIntersecting });
    });
    observer.observe(element);
    cleanups.push(() => observer.disconnect());
  }

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
