import { type RefObject, useLayoutEffect, useRef } from 'react';
import { PRIMARY_APP_ROUTES } from '../client/routes';
import { isDocumentLeaveBlocked } from '../client/useDocumentLeaveGuard';
import './PrimaryTabSwipe.css';

const EDGE_INSET = 24;
const DIRECTION_SLOP = 10;
const HORIZONTAL_BIAS = 1.25;
const BLOCKED_TARGETS =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="switch"], [role="slider"], [role="tablist"], [draggable="true"], video, audio, .leaflet-container, .media-gallery, .eimir-media-snap-track, [data-primary-tab-swipe-block]';

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

/** Shell-owned root navigation; content scrollers and task layers keep priority. */
export function usePrimaryTabSwipe({
  surfaceRef,
  pathname,
  routeKey,
  onNavigate,
}: {
  surfaceRef: RefObject<HTMLElement | null>;
  pathname: string;
  routeKey: string;
  onNavigate: (root: string) => void;
}): void {
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;
  const currentRoute = useRef(routeKey);
  currentRoute.current = routeKey;
  const suppressClick = useRef(false);
  const entry = useRef<{ to: string; offset: number; from: string } | null>(
    null,
  );

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    const pending = entry.current;
    entry.current = null;
    const reducedMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    );
    if (
      surface &&
      pending?.to === pathname &&
      pending.from !== routeKey &&
      // React owns the snapshot handoff when browser View Transitions exist.
      typeof document.startViewTransition !== 'function' &&
      !reducedMotion?.matches
    ) {
      surface.style.setProperty(
        '--primary-tab-entry-offset',
        `${pending.offset}px`,
      );
      surface.dataset.primaryTabEntry = 'true';
      const complete = (event: Event) => {
        if (event.type === 'change' || event.target === surface) {
          delete surface.dataset.primaryTabEntry;
          surface.style.removeProperty('--primary-tab-entry-offset');
        }
      };
      surface.addEventListener('animationend', complete);
      surface.addEventListener('animationcancel', complete);
      reducedMotion?.addEventListener('change', complete);
      return () => {
        delete surface.dataset.primaryTabEntry;
        surface.style.removeProperty('--primary-tab-entry-offset');
        surface.removeEventListener('animationend', complete);
        surface.removeEventListener('animationcancel', complete);
        reducedMotion?.removeEventListener('change', complete);
      };
    }
  }, [pathname, routeKey, surfaceRef]);

  // Bind ownership before the committed destination can receive another touch.
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    const index = PRIMARY_APP_ROUTES.findIndex(
      (route) => route.path === pathname,
    );
    if (!surface || index < 0) return;
    let gesture: Gesture | null = null;
    let frame = 0;
    let snapBack: Animation | undefined;
    const clearDrag = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      delete surface.dataset.primaryTabDragging;
      surface.style.removeProperty('--primary-tab-offset');
    };
    const cancel = () => {
      gesture = null;
      clearDrag();
    };
    const start = (event: TouchEvent) => {
      cancel();
      snapBack?.cancel();
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
      delete surface.dataset.primaryTabEntry;
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
          // A subtle touch-following offset, not a whole-screen translation:
          // the destination is captured by the ViewTransition after release.
          const offset = Math.max(-24, Math.min(24, gesture.offset * 0.12));
          surface.dataset.primaryTabDragging = 'true';
          surface.style.setProperty('--primary-tab-offset', `${offset}px`);
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
          !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches &&
          surface.animate
        ) {
          const style = getComputedStyle(surface);
          snapBack = surface.animate(
            [
              {
                transform: `translateX(${Math.max(-24, Math.min(24, current.offset * 0.12))}px)`,
              },
              { transform: 'none' },
            ],
            {
              duration:
                parseFloat(style.getPropertyValue('--duration-transition')) ||
                180,
              easing:
                style.getPropertyValue('--easing-standard').trim() ||
                'ease-out',
            },
          );
        }
        return;
      }
      const direction = dx < 0 ? 1 : -1;
      const destination = PRIMARY_APP_ROUTES[index + direction];
      if (!destination) return;
      entry.current = {
        to: destination.path,
        offset: direction * 24,
        from: routeKey,
      };
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
      snapBack?.cancel();
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
