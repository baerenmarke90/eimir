/**
 * The "Wie geht's?" line under the own name explains the plus on the own ring.
 * After a short hold it sinks into that plus, so the plus is left to speak for
 * itself. Decoration only: it reuses the flight layer and motion roles of the
 * other Wir flights, so reduced motion (zero durations) never starts it.
 */

import {
  ARC_RISE,
  centre,
  flightKeyframes,
  landingScale,
  openFlightLayer,
  pulseRing,
} from './flightKit';

/** The arc leans a little towards the corner it lands in. */
const LEAN = -20;
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
  layer.append(ghost);
  const origin = centre(from);
  ghost.style.left = `${origin.x - ghost.offsetWidth / 2}px`;
  ghost.style.top = `${origin.y - ghost.offsetHeight / 2}px`;

  const end = centre(to);
  const scale = landingScale(ghost.offsetWidth, to.width);
  source.setAttribute('data-flight-source', 'true');

  let cancelled = false;
  const cleanup = () => {
    source.removeAttribute('data-flight-source');
    ghost.remove();
    dispose();
  };

  const travel = ghost.animate(
    flightKeyframes(origin, end, 1, scale, LEAN, ARC_RISE / 2),
    { duration: roles.flight, easing: roles.standard, fill: 'forwards' },
  );
  // It dissolves into the plus over the last part of the way.
  ghost.animate([{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], {
    duration: roles.flight,
    easing: 'linear',
    fill: 'forwards',
  });

  const finished = travel.finished.then(
    async () => {
      if (cancelled) return;
      pulseRing(layer, to, roles, RING_GROWTH);
      // Keep the layer until the ring has faded, then clean up.
      await new Promise((resolve) => setTimeout(resolve, roles.context * 2));
      if (!cancelled) cleanup();
    },
    () => undefined,
  );

  return {
    finished,
    cancel() {
      if (cancelled) return;
      cancelled = true;
      for (const animation of ghost.getAnimations?.() ?? []) animation.cancel();
      cleanup();
    },
  };
}
