import { type RefObject, useLayoutEffect, useRef } from 'react';
import { cssDurationMilliseconds } from '../client/cssDuration';
import { PRIMARY_APP_ROUTES } from '../client/routes';
import { isDocumentLeaveBlocked } from '../client/useDocumentLeaveGuard';

const EDGE_INSET = 24;
const DIRECTION_SLOP = 10;
const HORIZONTAL_BIAS = 1.25;
const ENTRY_OPACITY = 0.92;
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
// Count only page-level loading states and the visible overview panel.
const ROUTE_LOADING = [
  ':scope > .ui-state-loading',
  ':scope > .page > .ui-state-loading',
  ':scope > .page > [role="tabpanel"]:not([hidden]) > .ui-state-loading',
].join(', ');
const BLOCKED_TARGETS =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="switch"], [role="slider"], [role="tablist"], [draggable="true"], video, audio, .leaflet-container, .media-gallery, .eimir-media-snap-track, [data-primary-tab-swipe-block]';

/** Bounded visual travel avoids displacing fixed shell controls or the page layout. */
function swipeTravel(distance: number): number {
  return Math.sign(distance) * Math.min(48, Math.abs(distance) * 0.28);
}

function swipeOpacity(distance: number): number {
  const progress = Math.min(1, (2 * Math.abs(distance)) / window.innerWidth);
  return 1 - progress * (1 - ENTRY_OPACITY);
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
  const page = surface.querySelector<HTMLElement>(':scope > .page');
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
  const complete = () => {
    if (owner.current !== cancel) return;
    owner.current = null;
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
  const incomingSwipeDirection = useRef(0);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    const changedPage = previousPath.current !== pathname;
    previousPath.current = pathname;
    const swipeDirection = incomingSwipeDirection.current;
    incomingSwipeDirection.current = 0;
    if (
      !surface ||
      !changedPage ||
      skipEntry ||
      window.matchMedia?.(REDUCED_MOTION).matches
    )
      return;

    const arrive = () => {
      if (surface.hasAttribute('data-primary-tab-dragging')) return;
      animateContent(surface, mainMotionCleanup, ENTRY_OPACITY, createEntry);
      if (swipeDirection) {
        animatePageSlide(surface, pageSlideCleanup, swipeDirection * 32);
      }
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
    let frame = 0;
    const clearDrag = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      delete surface.dataset.primaryTabDragging;
      surface.style.removeProperty('--primary-tab-opacity');
      surface.style.removeProperty('--primary-tab-offset');
    };
    const cancel = () => {
      gesture = null;
      clearDrag();
    };
    const start = (event: TouchEvent) => {
      cancel();
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
        cancel();
        return;
      }
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      if (!gesture.horizontal) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < DIRECTION_SLOP) return;
        if (Math.abs(dx) < Math.abs(dy) * HORIZONTAL_BIAS) {
          cancel();
          return;
        }
        gesture.horizontal = true;
      }
      const direction = dx < 0 ? 1 : -1;
      if (!PRIMARY_APP_ROUTES[index + direction]) {
        cancel();
        return;
      }
      if (!event.cancelable) {
        cancel();
        return;
      }
      event.preventDefault();
      suppressClick.current = true;
      gesture.offset = dx;
      if (!frame)
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          if (!gesture) return;
          surface.dataset.primaryTabDragging = 'true';
          surface.style.setProperty(
            '--primary-tab-opacity',
            String(swipeOpacity(gesture.offset)),
          );
          surface.style.setProperty(
            '--primary-tab-offset',
            `${swipeTravel(gesture.offset)}px`,
          );
        });
    };
    const end = (event: TouchEvent) => {
      const current = gesture;
      cancel();
      if (
        currentRoute.current !== routeKey ||
        !current?.horizontal ||
        event.touches.length ||
        editingOrOverlayActive() ||
        Math.abs(window.scrollY - current.scrollY) > 1
      )
        return;
      const touch = Array.from(event.changedTouches).find(
        (item) => item.identifier === current.id,
      );
      if (!touch) return;
      const dx = touch.clientX - current.x;
      const dy = touch.clientY - current.y;
      const threshold = Math.min(80, Math.max(48, window.innerWidth * 0.18));
      const elapsed = event.timeStamp - current.startedAt;
      const velocity = Math.abs(dx) / Math.max(1, elapsed);
      if (
        (Math.abs(dx) < threshold &&
          !(elapsed >= 32 && Math.abs(dx) >= 32 && velocity > 0.5)) ||
        Math.abs(dx) < Math.abs(dy) * HORIZONTAL_BIAS
      ) {
        if (
          !animatePageSlide(
            surface,
            pageSlideCleanup,
            swipeTravel(current.offset),
          )
        ) {
          animateContent(
            surface,
            mainMotionCleanup,
            swipeOpacity(current.offset),
          );
        }
        return;
      }
      const direction = dx < 0 ? 1 : -1;
      const destination = PRIMARY_APP_ROUTES[index + direction];
      if (!destination) return;
      incomingSwipeDirection.current = direction;
      navigateRef.current(destination.path);
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
    surface.addEventListener('touchcancel', cancel, { passive: true });
    surface.addEventListener('contextmenu', cancel);
    surface.addEventListener('click', click, true);
    surface.addEventListener('pointerdown', pointer, true);
    // A second finger can land outside main; it still cancels this gesture.
    const multiTouch = (event: TouchEvent) => {
      if (event.touches.length !== 1) cancel();
    };
    document.addEventListener('touchstart', multiTouch, { passive: true });
    document.addEventListener('visibilitychange', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('resize', cancel);
    return () => {
      cancel();
      mainMotionCleanup.current?.();
      pageSlideCleanup.current?.();
      surface.removeEventListener('touchstart', start);
      surface.removeEventListener('touchmove', move);
      surface.removeEventListener('touchend', end);
      surface.removeEventListener('touchcancel', cancel);
      surface.removeEventListener('contextmenu', cancel);
      surface.removeEventListener('click', click, true);
      surface.removeEventListener('pointerdown', pointer, true);
      document.removeEventListener('touchstart', multiTouch);
      document.removeEventListener('visibilitychange', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('resize', cancel);
    };
  }, [pathname, routeKey, surfaceRef]);
}
