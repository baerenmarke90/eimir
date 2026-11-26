import type { RefObject } from 'react';
import { useStage } from '../motion/stage';
import { durationMs, motionCount } from '../motion/tokens';

/**
 * The keyframe prefix of the root-tab entrance (`motion.css`). It differs
 * from the stage prefix, so the entrance around Wir never re-pins the Wir
 * opening's own members.
 */
export const ROOT_TAB_INTRO_PREFIX = 'eimir-motion-root-';

/**
 * The entrance's whole length: each module rises with Enter `module`, and
 * the modules after the first start one stagger step apart, up to the
 * stagger cap (Motion Contract 4.1).
 */
export function rootTabIntroDuration(): number {
  const steps = Math.max(0, motionCount('stagger-max-items') - 1);
  return durationMs('module-enter') + durationMs('stagger-item') * steps;
}

const REVEALED_WITHOUT_CHOICE =
  '[data-primary-tab-peek], [data-primary-tab-prewarm]';

function shownByChoice(root: Element): boolean {
  return !root.closest(REVEALED_WITHOUT_CHOICE);
}

/**
 * The short opening rise of a root tab (Wir, Momente, Planen, Mehr): an Enter
 * `stage` on the motion layer, once per tab and app start.
 *
 * The returned ref goes on the tab's page root. While the entrance runs the
 * root carries `data-motion-stage="playing"`; the layer removes it on the
 * entrance's own deadline, or at once when the kept tab is hidden, so a
 * return to the tab never replays it (M3, M4). With reduced motion the
 * durations are `0ms` and it never plays (M9).
 *
 * A tab that a swipe reveals, or that is prepared in the background, is shown
 * complete: content never rises while the finger drags the page, and the
 * entrance never plays unseen (M12). A tab built hidden ahead (a neighbour)
 * enters when it is first chosen, like a tab built on its first visit.
 */
export function useRootTabIntro<T extends HTMLElement>(
  tab: string,
): RefObject<T | null> {
  return useStage<T>(`root-tab:${tab}`, {
    duration: rootTabIntroDuration(),
    animationPrefix: ROOT_TAB_INTRO_PREFIX,
    canStart: shownByChoice,
    deferWhileHidden: true,
  });
}
