import { type RefObject, useLayoutEffect, useRef } from 'react';
import { cssDurationMilliseconds } from '../client/cssDuration';
import { setPrimaryTabPeek } from '../client/primaryTabPeek';
import { PRIMARY_APP_ROUTES } from '../client/routes';
import { isDocumentLeaveBlocked } from '../client/useDocumentLeaveGuard';

const EDGE_INSET = 24;
const DIRECTION_SLOP = 10;
const HORIZONTAL_BIAS = 1.25;
const ENTRY_OPACITY = 0.92;
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
// Count only page-level loading states and the visible overview panel.
// A kept primary tab renders its page inside a visible tab panel.
const PAGE_PARENTS = [
  ':scope >',
  ':scope > .primary-tab-panel:not([hidden]):not([data-primary-tab-peek]) >',
];
const PEEK_PAGE = ':scope > .primary-tab-panel[data-primary-tab-peek] > .page';
/** A cancelled or never-committed route change releases the drag state. */
const COMMIT_FALLBACK_MS = 800;
/** Past the end of the tab row the page only gives a little, never a neighbour. */
const EDGE_RESISTANCE = 0.25;
const EDGE_MAX_TRAVEL = 48;
const ROUTE_LOADING = PAGE_PARENTS.flatMap((parent) => [
  `${parent} .ui-state-loading`,
  `${parent} .page > .ui-state-loading`,
  `${parent} .page > [role="tabpanel"]:not([hidden]) > .ui-state-loading`,
]).join(', ');
const CURRENT_PAGE = PAGE_PARENTS.map((parent) => `${parent} .page`).join(', ');
const BLOCKED_TARGETS =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="switch"], [role="slider"], [role="tablist"], [draggable="true"], video, audio, .place-map-viewport, .media-gallery, .eimir-media-snap-track, [data-primary-tab-swipe-block]';

function dragOffset(distance: number, hasNeighbour: boolean): number {
  const width = window.innerWidth;
  if (hasNeighbour) return Math.max(-width, Math.min(width, distance));
  return (
    Math.sign(distance) *
    Math.min(EDGE_MAX_TRAVEL, Math.abs(distance) * EDGE_RESISTANCE)
  );
}

interface Settle {
  /** Jump to the end state now and report the outcome. */
  finish: () => void;
  /** Drop the animations without reporting. */
  abort: () => void;
}

/**
 * Settle the dragged pages like a pager: the current page and the revealed
 * neighbour finish their travel together. Returns null when there is nothing
 * to animate (reduced motion, no Web Animations), so the caller applies the
 * outcome immediately.
 */
function settlePages(
  surface: HTMLElement,
  from: { current: number; peek: number },
  to: { current: number; peek: number },
  onSettled: () => void,
): Settle | null {
  if (window.matchMedia?.(REDUCED_MOTION).matches) return null;
  const pages = [
    [
      surface.querySelector<HTMLElement>(CURRENT_PAGE),
      from.current,
      to.current,
    ],
    [surface.querySelector<HTMLElement>(PEEK_PAGE), from.peek, to.peek],
  ] as const;
  const style = window.getComputedStyle(surface);
  const timing = {
    duration: cssDurationMilliseconds(
      style.getPropertyValue('--duration-transition'),
    ),
    easing: style.getPropertyValue('--easing-standard').trim() || 'ease-out',
    // The end state holds until the committed route replaces the pages.
    fill: 'forwards' as const,
  };
  const animations = pages.flatMap(([page, start, end]) =>
    page && typeof page.animate === 'function'
      ? [
          page.animate(
            [
              { transform: `translate3d(${start}px, 0, 0)` },
              { transform: `translate3d(${end}px, 0, 0)` },
            ],
            timing,
          ),
        ]
      : [],
  );
  if (!animations.length) return null;
  let open = true;
  let pending = animations.length;
  const finish = () => {
    if (!open) return;
    open = false;
    for (const animation of animations) {
      animation.onfinish = null;
      animation.finish();
    }
    onSettled();
  };
  for (const animation of animations)
    animation.onfinish = () => {
      if (--pending === 0) finish();
    };
  return {
    finish,
    abort: () => {
      open = false;
      for (const animation of animations) {
        animation.onfinish = null;
        animation.cancel();
      }
    },
  };
}

function editingOrOverlayActive(): boolean {
  return Boolean(
    isDocumentLeaveBlocked() ||
      document.body.style.overflow === 'hidden' ||
      document.querySelector(
        'dialog[open], [aria-modal="true"], [role="menu"]',
      ) ||
      document.activeElement?.matches(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
      ) ||
      window.getSelection()?.isCollapsed === false ||
      (window.visualViewport && window.visualViewport.scale !== 1),
  );
}

function contentOwnsGesture(target: Element, surface: HTMLElement): boolean {
  if (target.closest(BLOCKED_TARGETS)) return true;
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
  x: number;
  y: number;
  scrollY: number;
  horizontal: boolean;
  offset: number;
  /** Which way the pages travel: 1 reveals the next tab, -1 the previous one. */
  direction: number;
  /** The neighbour currently shown beside the page, if any. */
  peek: string | null;
  startedAt: number;
}

function animateContent(
  surface: HTMLElement,
  owner: RefObject<(() => void) | null>,
  opacity: number,
  createEntry = false,
): void {
  owner.current?.();
  const reducedMotion = window.matchMedia?.(REDUCED_MOTION);
  if (reducedMotion?.matches || typeof surface.animate !== 'function') return;
  const style = getComputedStyle(surface);
  // A transform would make the main element the containing block of fixed
  // controls, including the contextual add action and composer toolbar.
  const animation = surface.animate([{ opacity }, { opacity: 1 }], {
    duration: cssDurationMilliseconds(
      style.getPropertyValue('--duration-transition'),
    ),
    easing: style.getPropertyValue('--easing-standard').trim() || 'ease-out',
  });
  surface.dataset.navigationMotion = createEntry ? 'create' : 'content';
  const complete = () => {
    if (owner.current !== cancel) return;
    owner.current = null;
    delete surface.dataset.navigationMotion;
    animation.onfinish = null;
    animation.oncancel = null;
    reducedMotion?.removeEventListener('change', motionChanged);
  };
  const cancel = () => {
    animation.cancel();
    complete();
  };
  const motionChanged = () => {
    if (reducedMotion?.matches) cancel();
  };
  owner.current = cancel;
  animation.onfinish = complete;
  animation.oncancel = complete;
  reducedMotion?.addEventListener('change', motionChanged);
}

/** Move only the page content, never the main shell (fixed actions stay fixed). */
function animatePageSlide(
  surface: HTMLElement,
  owner: RefObject<(() => void) | null>,
  fromX: number,
): boolean {
  owner.current?.();
  const page = surface.querySelector<HTMLElement>(CURRENT_PAGE);
  const reduced = window.matchMedia?.(REDUCED_MOTION);
  if (!page || !fromX || reduced?.matches || typeof page.animate !== 'function')
    return false;
  const style = window.getComputedStyle(surface);
  const animation = page.animate(
    [
      { transform: `translate3d(${fromX}px, 0, 0)` },
      { transform: 'translate3d(0, 0, 0)' },
    ],
    {
      duration: cssDurationMilliseconds(
        style.getPropertyValue('--duration-transition'),
      ),
      easing: style.getPropertyValue('--easing-standard').trim() || 'ease-out',
    },
  );
  // Clip the page's transformed visual bounds for the complete animation,
  // including after touchend has released the drag state.
  surface.dataset.navigationSlide = 'true';
  const complete = () => {
    if (owner.current !== cancel) return;
    owner.current = null;
    delete surface.dataset.navigationSlide;
    animation.onfinish = null;
    animation.oncancel = null;
    reduced?.removeEventListener('change', onMotionChanged);
  };
  const cancel = () => {
    animation.cancel();
    complete();
  };
  const onMotionChanged = () => {
    if (reduced?.matches) cancel();
  };
  owner.current = cancel;
  animation.onfinish = complete;
  animation.oncancel = complete;
  reduced?.addEventListener('change', onMotionChanged);
  return true;
}

/** Animate committed destinations and give direct feedback during a root swipe. */
export function useNavigationMotion({
  surfaceRef,
  pathname,
  routeKey,
  skipEntry = false,
  createEntry = false,
  onNavigate,
}: {
  surfaceRef: RefObject<HTMLElement | null>;
  pathname: string;
  routeKey: string;
  skipEntry?: boolean;
  createEntry?: boolean;
  onNavigate: (root: string) => void;
}): void {
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;
  const currentRoute = useRef(routeKey);
  currentRoute.current = routeKey;
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
      window.matchMedia?.(REDUCED_MOTION).matches
    )
      return;

    // Start the root handoff on the committed destination, even if it still
    // displays loading UI. The content reveal below waits for usable data.
    if (tabDirection)
      animatePageSlide(surface, pageSlideCleanup, tabDirection * 32);

    const arrive = () => {
      if (surface.hasAttribute('data-primary-tab-dragging')) return;
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
    let gesture: Gesture | null = null;
    let settle: Settle | null = null;
    let frame = 0;
    let fallback = 0;
    const applyDrag = (drag: Gesture) => {
      surface.dataset.primaryTabDragging = 'true';
      surface.style.setProperty('--primary-tab-offset', `${drag.offset}px`);
      surface.style.setProperty(
        '--primary-tab-peek-offset',
        `${drag.direction * window.innerWidth + drag.offset}px`,
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
      clearDrag();
    };
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
      // A touch catches the pages mid-settle: they land where they were
      // headed and the new gesture starts from there.
      settle?.finish();
      abortGesture();
      mainMotionCleanup.current?.();
      pageSlideCleanup.current?.();
      suppressClick.current = false;
      const touch = event.touches[0];
      if (
        currentRoute.current !== routeKey ||
        event.defaultPrevented ||
        event.touches.length !== 1 ||
        !touch ||
        touch.clientX < EDGE_INSET ||
        touch.clientX > window.innerWidth - EDGE_INSET ||
        !(event.target instanceof Element) ||
        editingOrOverlayActive() ||
        contentOwnsGesture(event.target, surface)
      )
        return;
      gesture = {
        id: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
        scrollY: window.scrollY,
        horizontal: false,
        offset: 0,
        direction: 0,
        peek: null,
        startedAt: event.timeStamp,
      };
    };
    const move = (event: TouchEvent) => {
      if (!gesture) return;
      const touch = Array.from(event.touches).find(
        (item) => item.identifier === gesture?.id,
      );
      if (
        currentRoute.current !== routeKey ||
        event.defaultPrevented ||
        event.touches.length !== 1 ||
        !touch ||
        editingOrOverlayActive() ||
        Math.abs(window.scrollY - gesture.scrollY) > 1
      ) {
        abortGesture();
        return;
      }
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      if (!gesture.horizontal) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < DIRECTION_SLOP) return;
        if (Math.abs(dx) < Math.abs(dy) * HORIZONTAL_BIAS) {
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
      const direction = dx < 0 ? 1 : -1;
      const neighbour = PRIMARY_APP_ROUTES[index + direction];
      gesture.direction = direction;
      gesture.offset = dragOffset(dx, Boolean(neighbour));
      // The neighbour joins the drag like the next page of a pager, but only
      // when the pages may move (reduced motion keeps the swipe invisible).
      const peek = window.matchMedia?.(REDUCED_MOTION).matches
        ? null
        : (neighbour?.path ?? null);
      if (gesture.peek !== peek) {
        gesture.peek = peek;
        setPrimaryTabPeek(peek);
      }
      if (!frame)
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          if (gesture) applyDrag(gesture);
        });
    };
    const end = (event: TouchEvent) => {
      const current = gesture;
      gesture = null;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      if (
        currentRoute.current !== routeKey ||
        !current?.horizontal ||
        event.touches.length ||
        editingOrOverlayActive() ||
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
      const threshold = Math.min(80, Math.max(48, window.innerWidth * 0.18));
      const elapsed = event.timeStamp - current.startedAt;
      const velocity = Math.abs(dx) / Math.max(1, elapsed);
      const direction = dx < 0 ? 1 : -1;
      const destination = PRIMARY_APP_ROUTES[index + direction];
      const commit =
        Boolean(destination) &&
        !(
          (Math.abs(dx) < threshold &&
            !(elapsed >= 32 && Math.abs(dx) >= 32 && velocity > 0.5)) ||
          Math.abs(dx) < Math.abs(dy) * HORIZONTAL_BIAS
        );
      const width = window.innerWidth;
      current.direction = direction;
      current.offset = dragOffset(dx, Boolean(destination));
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
      applyDrag(current);
      settle = settlePages(
        surface,
        { current: current.offset, peek: direction * width + current.offset },
        commit
          ? { current: -direction * width, peek: 0 }
          : { current: 0, peek: direction * width },
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
