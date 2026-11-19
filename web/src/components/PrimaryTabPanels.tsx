import { type ReactNode, useLayoutEffect, useRef } from 'react';
import {
  type Location,
  Route,
  Routes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import { usePrimaryTabPeek } from '../client/primaryTabPeek';
import { DEFAULT_APP_ROUTE } from '../client/routes';
import {
  PrimaryTabTaskOriginScope,
  taskOriginPath,
  useTaskOrigin,
} from '../client/taskOrigin';
import { AppErrorBoundary } from './AppErrorBoundary';

/** About half a second at 60 Hz for a revealed panel to finish settling. */
const RESTORE_FRAMES = 30;
const USER_SCROLL_INTENTS = ['wheel', 'touchstart', 'keydown'] as const;

/**
 * A kept tab that is shown again is the same view, not a new arrival. Un-hiding
 * a `display: none` subtree restarts every CSS animation in it, so entrances
 * (the Wir opening, the quote's fade, a badge's arrival) would replay each
 * time and could be cut off half-way by the next render. Finish the single
 * runs at once, before paint. Repeating ambient motion (the rings' breath,
 * garden life) restarts softly from its resting frame and is left running;
 * script-driven animations (flights) are not CSS animations and are kept.
 */
export function settleRestartedEntrances(panel: Element | null) {
  if (
    !panel ||
    typeof panel.getAnimations !== 'function' ||
    typeof CSSAnimation === 'undefined'
  )
    return;
  for (const animation of panel.getAnimations({ subtree: true })) {
    if (
      !(animation instanceof CSSAnimation) ||
      animation.timeline !== document.timeline
    )
      continue;
    const timing = animation.effect?.getComputedTiming();
    if (timing?.iterations !== 1 || !Number.isFinite(timing.endTime)) continue;
    animation.finish();
  }
}

export interface PrimaryTabPanel {
  path: string;
  element: ReactNode;
}

/**
 * Wir starts fresh when it is opened again: the carousels inside it (lists,
 * what is coming up, recent activity) show their first item again instead of
 * wherever they were swiped to. They are the only scrollers a person can leave
 * half-way, so any element with a horizontal offset is put back.
 */
function resetHorizontalScroll(panel: Element | null) {
  if (!panel) return;
  for (const element of panel.querySelectorAll<HTMLElement>('*'))
    if (element.scrollLeft !== 0) element.scrollLeft = 0;
}

/**
 * Keeps every visited primary tab mounted, like a native tab bar. Returning to
 * a tab reuses the view and its images and restores the reader on Back.
 * Inactive tabs are removed from layout, focus order and accessibility tree
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
  const navigationType = useNavigationType();
  const { resolveOrigin } = useTaskOrigin();
  const pathname = location.pathname.replace(/\/$/, '') || '/';
  const active = panels.some((panel) => panel.path === pathname)
    ? pathname
    : null;
  const startWirAtTop =
    active === DEFAULT_APP_ROUTE &&
    navigationType !== 'POP' &&
    resolveOrigin(
      (location.state as { taskReturnKey?: unknown } | null)?.taskReturnKey,
    )?.to !== taskOriginPath(location.pathname, location.search);
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

  // A kept tab that is shown again (made active or peeked) settles the
  // entrances its un-hiding restarted; its first showing plays them.
  const shownTabs = useRef(new Set<string>());
  const everShownTabs = useRef(new Set<string>());
  const shownNow = [active, peek].filter(
    (path): path is string => typeof path === 'string',
  );
  const shownKey = shownNow.join('\u0000');
  useLayoutEffect(() => {
    const now = new Set(shownKey ? shownKey.split('\u0000') : []);
    for (const path of now) {
      if (!shownTabs.current.has(path) && everShownTabs.current.has(path))
        settleRestartedEntrances(
          document.querySelector(`[data-primary-tab="${path}"]`),
        );
      // A peeked tab that was never opened is not kept and may unmount.
      if (locations.current.has(path)) everShownTabs.current.add(path);
    }
    shownTabs.current = now;
  }, [shownKey]);

  useLayoutEffect(() => {
    const previous = activeRef.current;
    activeRef.current = active;
    if (!active || previous === active) return;
    // Opening Wir from the tab bar starts at the portraits. Back and task
    // returns keep their captured reading position.
    const target = startWirAtTop
      ? 0
      : (scrollPositions.current.get(active) ?? 0);
    window.scrollTo({ top: target, behavior: 'instant' });
    if (startWirAtTop)
      resetHorizontalScroll(
        document.querySelector(`[data-primary-tab="${active}"]`),
      );
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
  }, [active, startWirAtTop]);

  // While a swipe drags the pages, the neighbouring tab is laid over the
  // viewport at the reading position it was left in. Measure once per peek
  // and let CSS place it; the gesture only supplies the horizontal offset.
  useLayoutEffect(() => {
    const panel = peekRef.current;
    const main = panel?.parentElement;
    if (!panel || !main || !peek) return;
    // Wir is always shown from its start, like it opens from the tab bar.
    if (peek === DEFAULT_APP_ROUTE) resetHorizontalScroll(panel);
    const box = main.getBoundingClientRect();
    const paddingTop = Number.parseFloat(getComputedStyle(main).paddingTop);
    const saved =
      peek === DEFAULT_APP_ROUTE ? 0 : (scrollPositions.current.get(peek) ?? 0);
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
