import { type RefObject, useLayoutEffect, useRef } from 'react';
import { setPrimaryTabPeek } from '../client/primaryTabPeek';
import { PRIMARY_APP_ROUTES } from '../client/routes';
import { isDocumentLeaveBlocked } from '../client/useDocumentLeaveGuard';
import {
  commitDistance,
  decideRelease,
  GESTURE,
  resolveOwnership,
  rubberBand,
} from '../motion/gesture/follow';
import { sampleSpring, springDuration } from '../motion/gesture/spring';
import { VelocityTracker } from '../motion/gesture/velocity';
import { haptic } from '../motion/haptics';
import {
  prefersReducedMotion,
  subscribeReducedMotion,
} from '../motion/reducedMotion';
import { run } from '../motion/run';
import {
  crossfade,
  type NavigateDirection,
  navigate as navigateMotion,
} from '../motion/replace';

const EDGE_INSET = 24;
const ENTRY_OPACITY = 0.92;
// Count only page-level loading states and the visible overview panel.
// A kept primary tab renders its page inside a visible tab panel.
const PAGE_PARENTS = [
  ':scope >',
  ':scope > .primary-tab-panel:not([hidden], [data-primary-tab-peek], [data-primary-tab-prewarm]) >',
];
const PEEK_PAGE = ':scope > .primary-tab-panel[data-primary-tab-peek] > .page';
/** A cancelled or never-committed route change releases the drag state. */
const COMMIT_FALLBACK_MS = 800;
const ROUTE_LOADING = PAGE_PARENTS.flatMap((parent) => [
  `${parent} .ui-state-loading`,
  `${parent} .page > .ui-state-loading`,
  `${parent} .page > [role="tabpanel"]:not([hidden]) > .ui-state-loading`,
]).join(', ');
const CURRENT_PAGE = PAGE_PARENTS.map((parent) => `${parent} .page`).join(', ');
const BLOCKED_TARGETS =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="switch"], [role="slider"], [role="tablist"], [draggable="true"], video, audio, .place-map-viewport, .media-gallery, .eimir-media-snap-track, [data-primary-tab-swipe-block]';

/**
 * A primary destination or one of its peer views (Momente's map, the shared
 * notes): these share the primary surface, so a change between them is in
 * place, never a deeper page.
 */
function isPrimarySurface(path: string): boolean {
  return PRIMARY_APP_ROUTES.some(
    (route) =>
      route.path === path ||
      ('peerPaths' in route &&
        (route.peerPaths as readonly string[]).includes(path)),
  );
}

/**
 * The pager follows the finger 1:1 toward a neighbour that exists; past the
 * end of the tab row it gives a little with rubber-banding (Gesture follow,
 * Motion Contract 4.6), never a neighbour that does not exist.
 */
function dragOffset(
  distance: number,
  width: number,
  neighbours: { previous: boolean; next: boolean },
): number {
  return rubberBand(
    distance,
    neighbours.next ? -width : 0,
    neighbours.previous ? width : 0,
  );
}

interface Settle {
  /** Jump to the end state now and report the outcome. */
  finish: () => void;
  /** Drop the animations without reporting. */
  abort: () => void;
  /** Stop where the pages are now and return that offset (interruption). */
  grab: () => number;
  /** Which way the pages travel: 1 reveals the next tab, -1 the previous one. */
  direction: number;
}

/**
 * The release handoff of the pager (Gesture follow into Replace `navigate`):
 * the current page and the revealed neighbour continue together from where
 * the finger left them, with the release velocity, through the sampled
 * settle spring. The end state is applied before the animation starts, so
 * nothing is held with `fill: forwards`. Returns null when there is nothing
 * to animate (reduced motion, no Web Animations, already at rest), so the
 * caller applies the outcome immediately.
 */
function settlePages(
  surface: HTMLElement,
  from: number,
  to: number,
  velocity: number,
  direction: number,
  place: (offset: number) => void,
  onSettled: () => void,
): Settle | null {
  if (prefersReducedMotion() || Math.abs(from - to) < 0.5) return null;
  const width = window.innerWidth;
  const frames = sampleSpring(from, to, velocity, undefined, true);
  const duration = springDuration(frames);
  // The current page is offset with `left`, not a transform: a transformed
  // page would become the containing block of its fixed add action and make
  // that control travel with the page's bottom edge before snapping back
  // (the sanctioned shell exception of Motion Contract M6).
  const current = surface.querySelector<HTMLElement>(CURRENT_PAGE);
  const peek = surface.querySelector<HTMLElement>(PEEK_PAGE);
  place(to);
  const options = {
    duration,
    easing: 'linear',
    channel: 'gesture',
  } as const;
  const animations = [
    run(
      current,
      frames.map((value) => ({ left: `${value}px` })),
      options,
    ),
    run(
      peek,
      frames.map((value) => ({
        transform: `translate3d(${direction * width + value}px, 0, 0)`,
      })),
      { ...options, willChange: 'transform' },
    ),
  ].filter((animation): animation is Animation => animation !== null);
  if (!animations.length) return null;
  let open = true;
  let pending = animations.length;
  const stop = () => {
    open = false;
    for (const animation of animations) {
      animation.onfinish = null;
      animation.cancel();
    }
  };
  const finish = () => {
    if (!open) return;
    stop();
    onSettled();
  };
  for (const animation of animations)
    animation.onfinish = () => {
      if (--pending === 0) finish();
    };
  return {
    finish,
    abort: stop,
    grab: () => {
      // The linear keyframes are interpolated the same way here, so the
      // pages stop exactly where they are drawn.
      const time = Number(animations[0]?.currentTime ?? duration);
      const position = Math.min(
        frames.length - 1,
        Math.max(0, (time / duration) * (frames.length - 1)),
      );
      const index = Math.floor(position);
      const next = frames[Math.min(frames.length - 1, index + 1)] ?? to;
      const offset =
        (frames[index] ?? to) +
        (next - (frames[index] ?? to)) * (position - index);
      stop();
      place(offset);
      return offset;
    },
    direction,
  };
}

const OPEN_OVERLAY = 'dialog[open], [aria-modal="true"], [role="menu"]';

function editingActive(): boolean {
  return Boolean(
    isDocumentLeaveBlocked() ||
      document.body.style.overflow === 'hidden' ||
      document.activeElement?.matches(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
      ) ||
      window.getSelection()?.isCollapsed === false ||
      (window.visualViewport && window.visualViewport.scale !== 1),
  );
}

function scrollRegionOwnsGesture(
  target: Element,
  surface: HTMLElement,
): boolean {
  for (
    let node: Element | null = target;
    node && node !== surface;
    node = node.parentElement
  ) {
    const style = window.getComputedStyle(node);
    // A vertical scroller can compute overflow-x:auto without owning any
    // horizontal gesture. Keep explicit carousels and real horizontal overflow.
    const verticalOnlyScroller =
      /(auto|scroll)/.test(style.overflowY) &&
      node.scrollHeight > node.clientHeight + 1 &&
      node.scrollWidth <= node.clientWidth + 1;
    if (
      (/(auto|scroll)/.test(style.overflowX) && !verticalOnlyScroller) ||
      style.touchAction === 'none' ||
      style.touchAction === 'pan-x'
    )
      return true;
  }
  return false;
}

interface Gesture {
  id: number;
  target: Element;
  x: number;
  y: number;
  width: number;
  scrollY: number;
  horizontal: boolean;
  /** Where the pages were when the finger landed (a grabbed settle). */
  base: number;
  offset: number;
  /** Which way the pages travel: 1 reveals the next tab, -1 the previous one. */
  direction: number;
  /** The neighbour currently shown beside the page, if any. */
  peek: string | null;
  /** The furthest travel toward each neighbour, for the reversal cancel. */
  peakNext: number;
  peakPrevious: number;
  /** Past the commit distance toward the current neighbour (haptic tick). */
  beyond: boolean;
  velocity: VelocityTracker;
}

/**
 * The arriving content fades up from `ENTRY_OPACITY` on the main surface
 * (Replace `crossfade` on the motion layer). Only opacity: a transform would
 * make the main element the containing block of fixed controls, including the
 * contextual add action and composer toolbar.
 */
function animateContent(
  surface: HTMLElement,
  owner: RefObject<(() => void) | null>,
  opacity: number,
  createEntry = false,
): void {
  owner.current?.();
  const animation = crossfade(surface, { from: opacity });
  if (!animation) return;
  surface.dataset.navigationMotion = createEntry ? 'create' : 'content';
  trackMotion(animation, owner, () => {
    delete surface.dataset.navigationMotion;
  });
}

/**
 * Releases a route entrance on its own finish or cancel (M2), cancels it when
 * reduced motion is switched on mid-way (M9), and lets only the newest
 * entrance clear the shared attribute (M11).
 */
function trackMotion(
  animation: Animation,
  owner: RefObject<(() => void) | null>,
  release: () => void,
): void {
  const complete = () => {
    if (owner.current !== cancel) return;
    owner.current = null;
    release();
    animation.onfinish = null;
    animation.oncancel = null;
    stopWatching();
  };
  const cancel = () => {
    animation.cancel();
    complete();
  };
  const stopWatching = subscribeReducedMotion(() => {
    if (prefersReducedMotion()) cancel();
  });
  owner.current = cancel;
  animation.onfinish = complete;
  animation.oncancel = complete;
}

/**
 * Brings the routed page in from the side its direction names (Replace
 * `navigate`, Motion Contract 4.2). Only the page's horizontal offset moves,
 * never the main shell, so fixed actions stay fixed and scroll restoration
 * keeps its own coordinates.
 */
function animatePageSlide(
  surface: HTMLElement,
  owner: RefObject<(() => void) | null>,
  direction: NavigateDirection,
): boolean {
  owner.current?.();
  const page = surface.querySelector<HTMLElement>(CURRENT_PAGE);
  // The page is positioned while `data-navigation-slide` is set (shell.css),
  // so set it before the first frame of the offset.
  surface.dataset.navigationSlide = 'true';
  const animation = navigateMotion(page, direction, { offset: 'inset' });
  if (!animation) {
    delete surface.dataset.navigationSlide;
    return false;
  }
  // Clip the page's visual bounds for the complete animation, including after
  // touchend has released the drag state.
  trackMotion(animation, owner, () => {
    delete surface.dataset.navigationSlide;
  });
  return true;
}

/** Animate committed destinations and give direct feedback during a root swipe. */
export function useNavigationMotion({
  surfaceRef,
  pathname,
  routeKey,
  skipEntry = false,
  createEntry = false,
  returning = false,
  onNavigate,
}: {
  surfaceRef: RefObject<HTMLElement | null>;
  pathname: string;
  routeKey: string;
  skipEntry?: boolean;
  createEntry?: boolean;
  /** The route change is a Back/return to where the person came from. */
  returning?: boolean;
  onNavigate: (root: string) => void;
}): void {
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;
  const currentRoute = useRef(routeKey);
  currentRoute.current = routeKey;
  // Read when the route changes; it must not restart a running motion itself.
  const returningRef = useRef(returning);
  returningRef.current = returning;
  const suppressClick = useRef(false);
  const previousPath = useRef(pathname);
  const mainMotionCleanup = useRef<(() => void) | null>(null);
  const pageSlideCleanup = useRef<(() => void) | null>(null);
  // The committed swipe already travelled the pages; no second entry motion.
  const settledSwipe = useRef(false);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    const previous = previousPath.current;
    const changedPage = previous !== pathname;
    previousPath.current = pathname;
    const settled = settledSwipe.current;
    if (changedPage) settledSwipe.current = false;
    const before = PRIMARY_APP_ROUTES.findIndex(
      (route) => route.path === previous,
    );
    const after = PRIMARY_APP_ROUTES.findIndex(
      (route) => route.path === pathname,
    );
    // Tapping and history navigation slide the page in from the side they
    // travel to; a swipe has already moved the pages under the finger.
    // Nested tasks keep their own entry motion.
    const tabDirection =
      before >= 0 && after >= 0 && before !== after
        ? Math.sign(after - before)
        : 0;
    if (
      !surface ||
      !changedPage ||
      settled ||
      skipEntry ||
      prefersReducedMotion()
    )
      return;

    // Start the root handoff on the committed destination, even if it still
    // displays loading UI. The content reveal below waits for usable data.
    // The direction follows the spatial model of the Motion Contract (4.2):
    // primary tabs move laterally in tab order like a pager; a Back or task
    // return comes in from the inline start; opening a deeper page (a detail,
    // a further step) comes in from the inline end. A create task keeps its
    // own entry, and any other change (a tab chosen from a detail page, a
    // switch between a tab and its peer view such as the map) is in place:
    // the content only fades.
    const direction: NavigateDirection =
      tabDirection > 0
        ? 'next'
        : tabDirection < 0
          ? 'previous'
          : returningRef.current
            ? 'back'
            : !isPrimarySurface(pathname) && !createEntry
              ? 'forward'
              : 'in-place';
    // A lazy route shows only its loading fallback at first, without a page
    // to move; its page then travels when it arrives.
    let slid =
      direction !== 'in-place' &&
      animatePageSlide(surface, pageSlideCleanup, direction);

    const arrive = () => {
      if (surface.hasAttribute('data-primary-tab-dragging')) return;
      if (!slid && direction !== 'in-place')
        slid = animatePageSlide(surface, pageSlideCleanup, direction);
      animateContent(surface, mainMotionCleanup, ENTRY_OPACITY, createEntry);
    };
    let observer: MutationObserver | undefined;
    // The destination and its loading status commit immediately. Its entry
    // motion belongs to the first available content on that same route.
    if (surface.querySelector(ROUTE_LOADING)) {
      observer = new MutationObserver(() => {
        if (
          currentRoute.current !== routeKey ||
          surface.querySelector(ROUTE_LOADING)
        )
          return;
        observer?.disconnect();
        arrive();
      });
      observer.observe(surface, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['hidden'],
      });
    } else {
      arrive();
    }
    return () => {
      observer?.disconnect();
      mainMotionCleanup.current?.();
      pageSlideCleanup.current?.();
    };
  }, [createEntry, pathname, routeKey, skipEntry, surfaceRef]);

  // Bind ownership before the committed destination can receive another touch.
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    const index = PRIMARY_APP_ROUTES.findIndex(
      (route) => route.path === pathname,
    );
    if (!surface || index < 0) return;
    const neighbours = {
      previous: Boolean(PRIMARY_APP_ROUTES[index - 1]),
      next: Boolean(PRIMARY_APP_ROUTES[index + 1]),
    };
    let gesture: Gesture | null = null;
    let settle: Settle | null = null;
    let frame = 0;
    let fallback = 0;
    let reducedMotion = prefersReducedMotion();
    const applyDrag = (drag: Gesture) => {
      if (reducedMotion) return;
      if (!surface.hasAttribute('data-primary-tab-dragging'))
        surface.dataset.primaryTabDragging = 'true';
      surface.style.setProperty('--primary-tab-offset', `${drag.offset}px`);
      surface.style.setProperty(
        '--primary-tab-peek-offset',
        `${drag.direction * drag.width + drag.offset}px`,
      );
    };
    const clearDrag = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      delete surface.dataset.primaryTabDragging;
      surface.style.removeProperty('--primary-tab-offset');
      surface.style.removeProperty('--primary-tab-peek-offset');
      setPrimaryTabPeek(null);
    };
    // A drag that ends without a settle (multitouch, scroll, overlay).
    const abortGesture = () => {
      if (!gesture) return;
      gesture = null;
      overlays.disconnect();
      clearDrag();
    };
    // An overlay may open during a swipe. Inspect it when the document changes
    // instead of searching every retained tab on each touch sample.
    const overlays = new MutationObserver(() => {
      if (gesture && document.querySelector(OPEN_OVERLAY)) abortGesture();
    });
    const stopWatchingMotion = subscribeReducedMotion(() => {
      reducedMotion = prefersReducedMotion();
      if (!reducedMotion) return;
      settle?.finish();
      if (gesture) {
        gesture.peek = null;
        clearDrag();
      }
    });
    const teardown = () => {
      window.clearTimeout(fallback);
      settle?.abort();
      settle = null;
      gesture = null;
      clearDrag();
    };
    // A running settle finishes at once when the app is interrupted, so a
    // committed swipe is never lost to a paused animation.
    const interrupt = () => {
      settle?.finish();
      abortGesture();
    };
    const start = (event: TouchEvent) => {
      const grabbed = settle;
      settle = null;
      abortGesture();
      mainMotionCleanup.current?.();
      pageSlideCleanup.current?.();
      suppressClick.current = false;
      const touch = event.touches[0];
      const width = window.innerWidth;
      if (
        currentRoute.current !== routeKey ||
        event.defaultPrevented ||
        event.touches.length !== 1 ||
        !touch ||
        touch.clientX < EDGE_INSET ||
        touch.clientX > width - EDGE_INSET ||
        !(event.target instanceof Element) ||
        event.target.closest(BLOCKED_TARGETS) ||
        editingActive() ||
        document.querySelector(OPEN_OVERLAY) ||
        (grabbed && scrollRegionOwnsGesture(event.target, surface))
      ) {
        // A settle that cannot be grabbed lands where it was headed.
        if (grabbed) {
          settle = grabbed;
          grabbed.finish();
        }
        return;
      }
      // Grabbing settling pages stops them where they are and continues the
      // same swipe from there, without a jump (Motion Contract 4.6).
      const base = grabbed ? grabbed.grab() : 0;
      if (grabbed) settledSwipe.current = false;
      gesture = {
        id: touch.identifier,
        target: event.target,
        x: touch.clientX,
        y: touch.clientY,
        width,
        scrollY: window.scrollY,
        horizontal: grabbed !== null,
        base,
        offset: base,
        direction: grabbed?.direction ?? 0,
        peek: null,
        peakNext: Math.max(0, -base),
        peakPrevious: Math.max(0, base),
        beyond: false,
        velocity: new VelocityTracker(),
      };
      if (grabbed) {
        gesture.peek =
          PRIMARY_APP_ROUTES[index + grabbed.direction]?.path ?? null;
        gesture.beyond =
          Math.abs(base) >= commitDistance('pager', window.innerWidth);
      }
      gesture.velocity.add(event.timeStamp, touch.clientX);
      overlays.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['open', 'role', 'aria-modal'],
      });
    };
    const move = (event: TouchEvent) => {
      if (!gesture) return;
      const touch = event.touches[0];
      if (
        currentRoute.current !== routeKey ||
        event.defaultPrevented ||
        event.touches.length !== 1 ||
        !touch ||
        touch.identifier !== gesture.id ||
        editingActive() ||
        Math.abs(window.scrollY - gesture.scrollY) > 1
      ) {
        abortGesture();
        return;
      }
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      if (!gesture.horizontal) {
        // One ownership rule for every Gesture follow owner: vertical page
        // scrolling wins an ambiguous start (Motion Contract 4.6).
        const ownership = resolveOwnership('x', dx, dy);
        if (ownership === 'pending') return;
        // A tap or ordinary vertical scroll never needs to measure the
        // overflow of every ancestor. Resolve nested ownership before the
        // first horizontal move is claimed.
        if (
          ownership === 'reject' ||
          !surface.contains(gesture.target) ||
          scrollRegionOwnsGesture(gesture.target, surface)
        ) {
          abortGesture();
          return;
        }
        gesture.horizontal = true;
      }
      if (!event.cancelable) {
        abortGesture();
        return;
      }
      event.preventDefault();
      suppressClick.current = true;
      gesture.velocity.add(event.timeStamp, touch.clientX);
      const distance = gesture.base + dx;
      const direction = distance < 0 ? 1 : -1;
      const neighbour = PRIMARY_APP_ROUTES[index + direction];
      gesture.direction = direction;
      gesture.offset = dragOffset(distance, gesture.width, neighbours);
      gesture.peakNext = Math.max(gesture.peakNext, -gesture.offset);
      gesture.peakPrevious = Math.max(gesture.peakPrevious, gesture.offset);
      const beyond =
        Boolean(neighbour) &&
        Math.abs(gesture.offset) >= commitDistance('pager', window.innerWidth);
      if (beyond !== gesture.beyond) {
        gesture.beyond = beyond;
        haptic('threshold');
      }
      // The neighbour joins the drag like the next page of a pager, but only
      // when the pages may move (reduced motion keeps the pages still, since
      // a whole page travelling sideways is large-area motion).
      const peek = reducedMotion ? null : (neighbour?.path ?? null);
      if (gesture.peek !== peek) {
        gesture.peek = peek;
        setPrimaryTabPeek(peek);
      }
      if (!reducedMotion && !frame)
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          if (gesture) applyDrag(gesture);
        });
    };
    const end = (event: TouchEvent) => {
      const current = gesture;
      if (!current) return;
      gesture = null;
      overlays.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      if (
        currentRoute.current !== routeKey ||
        !current.horizontal ||
        event.touches.length ||
        editingActive() ||
        document.querySelector(OPEN_OVERLAY) ||
        Math.abs(window.scrollY - current.scrollY) > 1
      ) {
        clearDrag();
        return;
      }
      const touch = Array.from(event.changedTouches).find(
        (item) => item.identifier === current.id,
      );
      if (!touch) {
        clearDrag();
        return;
      }
      const dx = touch.clientX - current.x;
      const dy = touch.clientY - current.y;
      const width = current.width;
      const distance = current.base + dx;
      const direction = distance < 0 ? 1 : -1;
      const destination = PRIMARY_APP_ROUTES[index + direction];
      current.direction = direction;
      current.offset = dragOffset(distance, width, neighbours);
      // Velocity toward larger x in px/ms, measured up to the release (Motion
      // Contract 4.6, the #2073 tracker). Past the end of the tab row the
      // pages moved slower than the finger.
      const finger = current.velocity.velocity({
        t: event.timeStamp,
        p: touch.clientX,
      });
      const pageVelocity = destination
        ? finger
        : finger * GESTURE.edgeResistance;
      const decision =
        destination && Math.abs(dx) >= Math.abs(dy) * GESTURE.axisDominance
          ? decideRelease({
              travel: Math.abs(current.offset),
              peak: direction === 1 ? current.peakNext : current.peakPrevious,
              velocity: -direction * pageVelocity,
              threshold: commitDistance('pager', width),
            })
          : 'cancel';
      const commit = decision === 'commit';
      const finishCommit = () => {
        if (!destination) return;
        settledSwipe.current = true;
        navigateRef.current(destination.path);
        // The route change releases the drag (this effect is replaced). If it
        // never commits, release it here instead of leaving the pages parked.
        fallback = window.setTimeout(() => {
          settledSwipe.current = false;
          settle?.abort();
          settle = null;
          clearDrag();
        }, COMMIT_FALLBACK_MS);
      };
      const finishSnapBack = () => {
        settle?.abort();
        settle = null;
        clearDrag();
      };
      if (commit) haptic('commit');
      applyDrag(current);
      settle = settlePages(
        surface,
        current.offset,
        commit ? -direction * width : 0,
        pageVelocity,
        direction,
        (offset) => applyDrag({ ...current, offset }),
        commit ? finishCommit : finishSnapBack,
      );
      if (settle) return;
      // Nothing to animate: apply the outcome immediately.
      clearDrag();
      if (commit) finishCommit();
    };
    const click = (event: MouseEvent) => {
      if (!suppressClick.current || event.detail === 0) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    };
    const pointer = () => {
      suppressClick.current = false;
    };
    surface.addEventListener('touchstart', start, { passive: true });
    surface.addEventListener('touchmove', move, { passive: false });
    surface.addEventListener('touchend', end, { passive: true });
    surface.addEventListener('touchcancel', abortGesture, { passive: true });
    surface.addEventListener('contextmenu', abortGesture);
    surface.addEventListener('click', click, true);
    surface.addEventListener('pointerdown', pointer, true);
    // A second finger can land outside main; it still cancels this gesture.
    const multiTouch = (event: TouchEvent) => {
      if (event.touches.length !== 1) abortGesture();
    };
    document.addEventListener('touchstart', multiTouch, { passive: true });
    document.addEventListener('visibilitychange', interrupt);
    window.addEventListener('blur', interrupt);
    window.addEventListener('resize', interrupt);
    return () => {
      overlays.disconnect();
      stopWatchingMotion();
      teardown();
      mainMotionCleanup.current?.();
      pageSlideCleanup.current?.();
      surface.removeEventListener('touchstart', start);
      surface.removeEventListener('touchmove', move);
      surface.removeEventListener('touchend', end);
      surface.removeEventListener('touchcancel', abortGesture);
      surface.removeEventListener('contextmenu', abortGesture);
      surface.removeEventListener('click', click, true);
      surface.removeEventListener('pointerdown', pointer, true);
      document.removeEventListener('touchstart', multiTouch);
      document.removeEventListener('visibilitychange', interrupt);
      window.removeEventListener('blur', interrupt);
      window.removeEventListener('resize', interrupt);
    };
  }, [pathname, routeKey, surfaceRef]);
}
