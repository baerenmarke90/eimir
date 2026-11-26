import {
  memo,
  type ReactNode,
  startTransition,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type Location,
  Route,
  Routes,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import { PrimaryTabActiveContext } from '../client/primaryTabActive';
import {
  primaryTabPeekGeometry,
  usePrimaryTabPeek,
} from '../client/primaryTabPeek';
import {
  DEFAULT_APP_ROUTE,
  PRIMARY_APP_ROUTES,
  primaryTabIndex,
} from '../client/routes';
import {
  PrimaryTabTaskOriginScope,
  taskOriginPath,
  useTaskOrigin,
} from '../client/taskOrigin';
import { stagesSettled } from '../motion/stage';
import { AppErrorBoundary } from './AppErrorBoundary';

/** About half a second at 60 Hz for a revealed panel to finish settling. */
const RESTORE_FRAMES = 30;
const USER_SCROLL_INTENTS = ['wheel', 'touchstart', 'keydown'] as const;
/** Preparing waits this long after the app shows its first tab. */
const PREWARM_AFTER_MS = 4_000;
/** ...and for this long without touch, scroll or keys. */
const PREWARM_QUIET_MS = 1_500;
/**
 * The tabs beside the current one are built sooner: a first swipe to a tab
 * that was never built mounts the whole page under the finger. They wait for
 * the shown tab's opening, so they never compete with it.
 */
const NEIGHBOUR_AFTER_MS = 1_000;
const NEIGHBOUR_QUIET_MS = 500;
const PREWARM_INPUT = [
  'pointerdown',
  'pointerup',
  'pointercancel',
  'touchstart',
  'touchend',
  'touchcancel',
  'wheel',
  'keydown',
  'scroll',
] as const;

/**
 * Asks for `paths` to be prepared once the app is quiet (#2063): a few
 * seconds after start or after the last change of `paths`, with no touch,
 * scroll or keys for a moment, in an idle period, and not while the page is
 * hidden or the person saves data. Prepared paths stay prepared. One path is
 * prepared per idle period, as a transition, so React builds it in short
 * slices instead of one long task.
 */
function usePrewarm(
  paths: readonly string[],
  afterMs = PREWARM_AFTER_MS,
  quietMs = PREWARM_QUIET_MS,
  ready?: () => Promise<void>,
): ReadonlySet<string> {
  const [prepared, setPrepared] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const pathsKey = paths.join('|');
  useEffect(() => {
    let key = pathsKey;
    if (!key) return;
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    if (connection?.saveData) return;
    const listeners = new AbortController();
    const contacts = new Set<number>();
    let touches = 0;
    let lastInput = performance.now();
    const touched = (event: Event) => {
      lastInput = performance.now();
      if ('touches' in event) touches = (event as TouchEvent).touches.length;
      if ('pointerId' in event && typeof event.pointerId === 'number') {
        if (event.type === 'pointerdown') contacts.add(event.pointerId);
        else contacts.delete(event.pointerId);
      }
    };
    const options = { passive: true, capture: true, signal: listeners.signal };
    for (const type of PREWARM_INPUT)
      window.addEventListener(type, touched, options);
    const releaseContacts = () => {
      touches = 0;
      contacts.clear();
      lastInput = performance.now();
    };
    window.addEventListener('blur', releaseContacts, options);
    document.addEventListener('visibilitychange', releaseContacts, options);
    let timer: number | undefined;
    let idle: number | undefined;
    const stop = () => {
      listeners.abort();
      window.clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
    };
    const attempt = (inIdlePeriod = false) => {
      if (listeners.signal.aborted) return;
      if (connection?.saveData) return stop();
      if (
        document.hidden ||
        contacts.size ||
        touches ||
        performance.now() - lastInput < quietMs
      ) {
        timer = window.setTimeout(attempt, quietMs);
        return;
      }
      if (inIdlePeriod) {
        const [next, ...rest] = key.split('|');
        startTransition(() =>
          setPrepared((current) => new Set([...current, next])),
        );
        if (!rest.length) return stop();
        // The next path waits for its own quiet idle period.
        timer = window.setTimeout(attempt, quietMs);
        key = rest.join('|');
        return;
      }
      // Input or page visibility can change between this request and its
      // actual callback. Re-check eligibility immediately before mounting.
      const prepare = () => attempt(true);
      if (typeof window.requestIdleCallback === 'function')
        idle = window.requestIdleCallback(prepare, { timeout: 2_000 });
      else timer = window.setTimeout(prepare, 0);
    };
    timer = window.setTimeout(() => {
      if (!ready) return attempt();
      void ready().then(() => attempt());
    }, afterMs);
    return stop;
  }, [pathsKey, afterMs, quietMs, ready]);
  return prepared;
}

export interface PrimaryTabPanel {
  path: string;
  element: ReactNode;
  /** Some roots share forms and IDs with separate routes and must unmount on exit. */
  retain?: boolean;
}

/**
 * Start Wir's lists, notes, agenda and activity tracks at their first item.
 * Only the tracks own horizontal scroll. Reading every descendant's offset
 * here would force layout reads across the dashboard during the swipe.
 */
function resetWirCarousels(panel: Element | null) {
  if (!panel) return;
  for (const track of panel.querySelectorAll<HTMLElement>(
    '.wir-lists-row, .today-agenda-list, .today-stream',
  ))
    track.scrollLeft = 0;
}

/**
 * The tab's routed page. It depends only on the location the tab sees, so
 * showing, hiding or peeking the tab never renders the page again.
 */
const KeptRoute = memo(function KeptRoute({
  path,
  element,
  location,
}: {
  path: string;
  element: ReactNode;
  location: Location;
}) {
  return (
    <Routes location={location}>
      <Route path={path} element={element} />
    </Routes>
  );
});

/**
 * Revealing a mounted neighbour only changes its panel's visibility. Keep
 * the nested router and its location consumers at rest during that gesture.
 */
const TabRouteContent = memo(function TabRouteContent({
  path,
  element,
  active,
  location,
  previewKey,
  fallback,
}: {
  path: string;
  element: ReactNode;
  active: boolean;
  location: Location;
  previewKey?: string;
  fallback: ReactNode;
}) {
  const kept = useMemo(
    () =>
      previewKey
        ? {
            ...location,
            pathname: path,
            search: '',
            hash: '',
            state: null,
            key: previewKey,
          }
        : location,
    [location, path, previewKey],
  );
  return (
    <PrimaryTabActiveContext.Provider value={active}>
      <PrimaryTabTaskOriginScope active={active}>
        <AppErrorBoundary resetKey={kept.key} fallback={fallback}>
          <KeptRoute path={path} element={element} location={kept} />
        </AppErrorBoundary>
      </PrimaryTabTaskOriginScope>
    </PrimaryTabActiveContext.Provider>
  );
});

/**
 * Keeps every visited primary tab mounted, like a native tab bar. Returning to
 * a tab reuses the view and its images and restores the reader on Back.
 * Inactive tabs keep their rendering state but skip it
 * (`content-visibility: hidden`, shell.css), so showing one again needs no
 * new style or layout pass and never restarts its CSS animations. They are
 * out of the reading flow, focus order and accessibility tree and see the
 * location they last had, so they never react to another tab's route. Queries in hidden tabs stay subscribed and follow the normal cache
 * freshness and invalidation contracts.
 */
export function PrimaryTabPanels({
  panels,
  fallback,
  prewarm = [],
  prewarmNeighbours = false,
}: {
  panels: readonly PrimaryTabPanel[];
  fallback: ReactNode;
  /**
   * Panels built in the background once the app is quiet, before their
   * first visit, so they open complete (#2063: the Momente map). They are
   * laid out invisibly, outside the reading flow, until visited. A nested
   * panel (`/story/map`) is prepared only after its tab (`/story`) was
   * opened, so it never competes with the app's first seconds.
   */
  prewarm?: readonly string[];
  /**
   * Also build the tabs beside the current one soon after start, so a first
   * swipe reveals a built page. They stay hidden like a parked tab (their
   * layout is skipped until they are revealed).
   */
  prewarmNeighbours?: boolean;
}) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const { resolveOrigin } = useTaskOrigin();
  const pathname = location.pathname.replace(/\/$/, '') || '/';
  const activePanel = panels.find((panel) => panel.path === pathname);
  const active = activePanel?.path ?? null;
  const state = location.state as {
    primaryRootEntry?: boolean;
    taskReturnKey?: unknown;
  } | null;
  const startAtTop =
    navigationType !== 'POP' &&
    (state?.primaryRootEntry === true || active === DEFAULT_APP_ROUTE) &&
    resolveOrigin(state?.taskReturnKey)?.to !==
      taskOriginPath(location.pathname, location.search);
  // Idempotent render-time bookkeeping: a newly visited tab mounts in the same
  // commit that makes it active.
  const locations = useRef(new Map<string, Location>());
  if (active && activePanel?.retain !== false)
    locations.current.set(active, location);
  // A nested panel waits until its own tab was opened.
  const candidates = prewarm.filter((path) => {
    const parent = panels.find(
      (panel) => panel.path !== path && path.startsWith(`${panel.path}/`),
    );
    return !parent || locations.current.has(parent.path);
  });
  const unbuilt = (path: string | undefined): path is string =>
    typeof path === 'string' &&
    path !== active &&
    !locations.current.has(path) &&
    panels.some((panel) => panel.path === path && panel.retain !== false);
  const prepared = usePrewarm(candidates.filter(unbuilt));
  const index = primaryTabIndex(pathname);
  const neighbours =
    prewarmNeighbours && index >= 0
      ? [
          PRIMARY_APP_ROUTES[index - 1]?.path,
          PRIMARY_APP_ROUTES[index + 1]?.path,
        ].filter(unbuilt)
      : [];
  const built = usePrewarm(
    neighbours,
    NEIGHBOUR_AFTER_MS,
    NEIGHBOUR_QUIET_MS,
    stagesSettled,
  );
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
    // A tab selection opens its overview at the top. History and task
    // returns keep their captured reading position.
    const target = startAtTop ? 0 : (scrollPositions.current.get(active) ?? 0);
    window.scrollTo({ top: target, behavior: 'instant' });
    if (startAtTop && active === DEFAULT_APP_ROUTE)
      resetWirCarousels(
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
  }, [active, startAtTop]);

  // While a swipe drags the pages, the neighbouring tab is laid over the
  // viewport at the top of its overview, in the column the gesture measured
  // before revealing it. Nothing is read from layout here: revealing the tab
  // must not force a synchronous layout of it inside the touch handler.
  useLayoutEffect(() => {
    const panel = peekRef.current;
    const geometry = primaryTabPeekGeometry();
    if (!panel || !peek || !geometry) return;
    panel.style.setProperty('--primary-tab-peek-left', `${geometry.left}px`);
    panel.style.setProperty('--primary-tab-peek-width', `${geometry.width}px`);
    panel.style.setProperty(
      '--primary-tab-peek-origin',
      `${geometry.origin}px`,
    );
    if (peek !== DEFAULT_APP_ROUTE) return;
    // Wir is always shown from its start, like it opens from the tab bar.
    // Scroll writes need layout, so they join the next frame's own pass.
    const frame = requestAnimationFrame(() => resetWirCarousels(panel));
    return () => cancelAnimationFrame(frame);
  }, [peek]);

  return panels.map(({ path, element }) => {
    const peeking = peek === path && path !== active;
    // A tab that was never opened is shown from its root while it is peeked,
    // but is not kept (and unmounts again if the swipe is cancelled).
    const visited = path === active ? location : locations.current.get(path);
    const preparing = !visited && !peeking && prepared.has(path);
    const prebuilt = !visited && !peeking && !preparing && built.has(path);
    if (!visited && !peeking && !preparing && !prebuilt) return null;
    const visible = path === active;
    return (
      <div
        key={path}
        ref={peeking ? peekRef : undefined}
        className="primary-tab-panel"
        data-primary-tab={path}
        data-primary-tab-peek={peeking ? 'true' : undefined}
        data-primary-tab-prewarm={preparing ? 'true' : undefined}
        // A hidden tab stays rendered (skipped), so it is also taken out of
        // the accessibility tree and focus order explicitly.
        aria-hidden={visible ? undefined : true}
        inert={!visible}
        hidden={!visible && !peeking && !preparing}
      >
        <TabRouteContent
          path={path}
          element={element}
          active={visible}
          location={visited ?? location}
          previewKey={
            visited ? undefined : `${peeking ? 'peek' : 'prewarm'}-${path}`
          }
          fallback={fallback}
        />
      </div>
    );
  });
}
