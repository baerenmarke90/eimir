import { useEffect } from 'react';
import { ScrollState } from '../motion/replace';

/** Root attribute that tucks the floating create action away (see AddAction.css). */
export const FLOATING_CREATE_TUCKED_ATTRIBUTE = 'data-floating-create-tucked';

/** Near the top of a page the create action is always shown. */
export const FLOATING_CREATE_TOP_ZONE = 48;
/** Downward travel of the viewer's own scroll before the action tucks away. */
export const FLOATING_CREATE_HIDE_DISTANCE = 24;
/** Upward travel of the viewer's own scroll before the action returns. */
export const FLOATING_CREATE_SHOW_DISTANCE = 12;
/** Scrolls this long after the viewer's last input still count as their own. */
export const FLOATING_CREATE_GESTURE_WINDOW_MS = 1200;

const SCROLL_KEYS = new Set([
  'ArrowDown',
  'ArrowUp',
  'PageDown',
  'PageUp',
  'End',
  'Home',
  ' ',
]);

/**
 * Hide the floating create action while the viewer scrolls down and bring it
 * back as soon as they scroll up (#1790 B3, Product Owner 2026-11-13), on
 * every page that shows it. Only the viewer's own gestures count:
 * programmatic scrolling such as route changes or restored return positions
 * shows the action again, so it is never missing on arrival.
 *
 * Replace `scroll-state` on the motion layer (Motion Contract 4.2): the scroll
 * sets a state with hysteresis (`ScrollState`), and AddAction.css transitions
 * the state change with `--duration-transition`. There is no per-pixel
 * scroll-linked transform.
 */
export function useFloatingCreateScrollTuck(): void {
  useEffect(() => {
    const root = document.documentElement;
    const tuck = new ScrollState(
      FLOATING_CREATE_HIDE_DISTANCE,
      FLOATING_CREATE_SHOW_DISTANCE,
    );
    tuck.reset(Math.max(0, window.scrollY));
    let lastInputAt = Number.NEGATIVE_INFINITY;
    let frame = 0;

    const setTucked = (tucked: boolean) => {
      if (tucked) root.setAttribute(FLOATING_CREATE_TUCKED_ATTRIBUTE, '');
      else root.removeAttribute(FLOATING_CREATE_TUCKED_ATTRIBUTE);
    };

    const markInput = () => {
      lastInputAt = performance.now();
    };
    const markKey = (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key)) markInput();
    };

    const evaluate = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      const now = performance.now();
      const ownGesture = now - lastInputAt <= FLOATING_CREATE_GESTURE_WINDOW_MS;
      // Momentum after a fling keeps the viewer's own gesture alive.
      if (ownGesture) lastInputAt = now;
      if (y <= FLOATING_CREATE_TOP_ZONE || !ownGesture) {
        setTucked(tuck.reset(y));
        return;
      }
      setTucked(tuck.update(y));
    };

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(evaluate);
    };

    // Taps are not scrolling: a tap that navigates back to a restored scroll
    // position must not tuck the action away on arrival.
    const options = { passive: true, capture: true } as const;
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('wheel', markInput, options);
    window.addEventListener('touchmove', markInput, options);
    window.addEventListener('keydown', markKey, options);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', markInput, options);
      window.removeEventListener('touchmove', markInput, options);
      window.removeEventListener('keydown', markKey, options);
      setTucked(false);
    };
  }, []);
}
