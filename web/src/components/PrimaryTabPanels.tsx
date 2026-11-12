import { type ReactNode, useLayoutEffect, useRef } from 'react';
import { type Location, Route, Routes, useLocation } from 'react-router-dom';
import { usePrimaryTabPeek } from '../client/primaryTabPeek';
import { PrimaryTabTaskOriginScope } from '../client/taskOrigin';
import { AppErrorBoundary } from './AppErrorBoundary';

/** About half a second at 60 Hz for a revealed panel to finish settling. */
const RESTORE_FRAMES = 30;
const USER_SCROLL_INTENTS = ['wheel', 'touchstart', 'keydown'] as const;

export interface PrimaryTabPanel {
  path: string;
  element: ReactNode;
}

/**
 * Keeps every visited primary tab mounted, like a native tab bar. Returning to
 * a tab shows the view, its images and its scroll position as they were left,
 * instead of rebuilding it behind loading and image placeholders. Inactive
 * tabs are hidden (removed from layout, focus order and accessibility tree)
 * and see the location they last had, so they never react to another tab's
 * route. Queries in hidden tabs stay subscribed and follow the normal cache
 * freshness and invalidation contracts.
 */
export function PrimaryTabPanels({
  panels,
  fallback,
}: {
  panels: readonly PrimaryTabPanel[];
  fallback: ReactNode;
}) {
  const location = useLocation();
  const pathname = location.pathname.replace(/\/$/, '') || '/';
  const active = panels.some((panel) => panel.path === pathname)
    ? pathname
    : null;
  // Idempotent render-time bookkeeping: a newly visited tab mounts in the same
  // commit that makes it active.
  const locations = useRef(new Map<string, Location>());
  if (active) locations.current.set(active, location);
  const scrollPositions = useRef(new Map<string, number>());
  const peek = usePrimaryTabPeek();
  const peekRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<string | null>(null);
  const renderedTab = useRef<string | null>(null);

  // Capture the outgoing reading position while its panel is still visible.
  // Once React hides that panel, the shorter destination can clamp scrollY
  // before a scroll event runs and silently overwrite the saved position.
  if (renderedTab.current !== active) {
    if (renderedTab.current && typeof window !== 'undefined')
      scrollPositions.current.set(renderedTab.current, window.scrollY);
    renderedTab.current = active;
  }

  useLayoutEffect(() => {
    const previous = activeRef.current;
    activeRef.current = active;
    if (!active || previous === active) return;
    const target = scrollPositions.current.get(active) ?? 0;
    // New tabs start at the top; revisited tabs restore their reading position.
    window.scrollTo({ top: target, behavior: 'instant' });
    if (target === 0) return;
    // The revealed panel can still be briefly shorter than when it was left
    // (content settling after it becomes visible), which clamps the restore.
    // Re-apply it for a few frames while the page grows, and stop as soon as
    // anything else scrolls.
    let frames = 0;
    let request = 0;
    // Any scroll this restore did not make (the person, or reselecting the
    // tab to return to the top) ends it.
    let expected = window.scrollY;
    const stop = () => {
      cancelAnimationFrame(request);
      for (const type of USER_SCROLL_INTENTS)
        window.removeEventListener(type, stop);
    };
    const settle = () => {
      if (
        Math.abs(window.scrollY - expected) > 1 ||
        Math.abs(window.scrollY - target) <= 1 ||
        ++frames > RESTORE_FRAMES
      )
        return stop();
      window.scrollTo({ top: target, behavior: 'instant' });
      expected = window.scrollY;
      request = requestAnimationFrame(settle);
    };
    for (const type of USER_SCROLL_INTENTS)
      window.addEventListener(type, stop, { passive: true });
    request = requestAnimationFrame(settle);
    return stop;
  }, [active]);

  // While a swipe drags the pages, the neighbouring tab is laid over the
  // viewport at the reading position it was left in. Measure once per peek
  // and let CSS place it; the gesture only supplies the horizontal offset.
  useLayoutEffect(() => {
    const panel = peekRef.current;
    const main = panel?.parentElement;
    if (!panel || !main || !peek) return;
    const box = main.getBoundingClientRect();
    const paddingTop = Number.parseFloat(getComputedStyle(main).paddingTop);
    const saved = scrollPositions.current.get(peek) ?? 0;
    panel.style.setProperty('--primary-tab-peek-left', `${box.left}px`);
    panel.style.setProperty('--primary-tab-peek-width', `${box.width}px`);
    panel.style.setProperty(
      '--primary-tab-peek-origin',
      `${box.top + window.scrollY - saved + (paddingTop || 0)}px`,
    );
  }, [peek]);

  return panels.map(({ path, element }) => {
    const peeking = peek === path && path !== active;
    // A tab that was never opened is shown from its root while it is peeked,
    // but is not kept (and unmounts again if the swipe is cancelled).
    const kept =
      locations.current.get(path) ??
      (peeking
        ? {
            ...location,
            pathname: path,
            search: '',
            hash: '',
            state: null,
            key: `peek-${path}`,
          }
        : undefined);
    if (!kept) return null;
    const visible = path === active;
    return (
      <div
        key={path}
        ref={peeking ? peekRef : undefined}
        className="primary-tab-panel"
        data-primary-tab={path}
        data-primary-tab-peek={peeking ? 'true' : undefined}
        aria-hidden={peeking ? true : undefined}
        inert={peeking}
        hidden={!visible && !peeking}
      >
        <PrimaryTabTaskOriginScope active={visible}>
          <AppErrorBoundary resetKey={kept.key} fallback={fallback}>
            <Routes location={kept}>
              <Route path={path} element={element} />
            </Routes>
          </AppErrorBoundary>
        </PrimaryTabTaskOriginScope>
      </div>
    );
  });
}
