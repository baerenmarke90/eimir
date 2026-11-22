/**
 * The "Wie geht's?" line beside the plus on the own ring invites the day's
 * check-in. After a short hold it slides into that plus, so the plus is left to
 * speak for itself. Decoration only: it reuses the flight layer and motion
 * roles of the other Wir flights, so reduced motion (zero durations) never
 * starts it.
 */

import {
  animateFlight,
  centre,
  flightKeyframes,
  landingScale,
  openFlightLayer,
  pulseRing,
} from '../motion/flight';

/** How far the landing ring grows beyond the plus. */
const RING_GROWTH = 1.7;

export interface PromptFlight {
  /** Resolves when the line has landed in the plus. */
  finished: Promise<void>;
  cancel: () => void;
}

/**
 * Fly a copy of the prompt line into the target. Returns null when a flight is
 * not possible or not wanted; the caller then simply retires the line.
 */
export function startPromptFlight(
  source: HTMLElement,
  target: HTMLElement,
): PromptFlight | null {
  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if ((from.width === 0 && from.height === 0) || to.width === 0) return null;
  const opened = openFlightLayer();
  if (!opened) return null;
  const { layer, roles, dispose } = opened;

  const ghost = document.createElement('div');
  ghost.className = 'wir-checkin-flight-ghost is-prompt';
  ghost.textContent = source.textContent?.trim() ?? '';
  // The same pill lifts off, so the hand-over to the flight is not visible.
  ghost.style.minHeight = `${from.height}px`;
  layer.append(ghost);
  const origin = centre(from);
  ghost.style.left = `${origin.x - ghost.offsetWidth / 2}px`;
  ghost.style.top = `${origin.y - ghost.offsetHeight / 2}px`;

  const end = centre(to);
  const scale = landingScale(ghost.offsetWidth, to.width);
  // The whole pill hides while its text flies, not just the text.
  const holder = source.closest<HTMLElement>('.wir-checkin-badge') ?? source;
  holder.setAttribute('data-flight-source', 'true');

  let cancelled = false;
  let landed = false;
  const cleanup = () => {
    holder.removeAttribute('data-flight-source');
    ghost.remove();
    dispose();
  };

  // The plus is right next to the line: a straight slide, without an arc.
  const travel = animateFlight(
    ghost,
    flightKeyframes(origin, end, 1, scale, 0, 0),
    { duration: roles.flight, easing: roles.standard, fill: 'forwards' },
  );
  // It dissolves into the plus over the last part of the way.
  animateFlight(
    ghost,
    [{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }],
    { duration: roles.flight, easing: 'linear', fill: 'forwards' },
  );

  // Landed: the caller retires the line now, while the ring still plays and
  // the pill stays hidden until the layer is cleaned up.
  const finished = (travel?.finished ?? Promise.resolve()).then(
    () => {
      if (cancelled) return;
      // From here on the ring plays out and the timer below cleans up, even
      // when the caller cancels because it has already retired the line.
      landed = true;
      pulseRing(layer, to, roles, RING_GROWTH);
      window.setTimeout(() => {
        if (!cancelled) cleanup();
      }, roles.context * 2);
    },
    () => undefined,
  );

  return {
    finished,
    cancel() {
      if (cancelled || landed) return;
      cancelled = true;
      for (const animation of ghost.getAnimations?.() ?? []) animation.cancel();
      cleanup();
    },
  };
}
