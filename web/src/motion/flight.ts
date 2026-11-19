/**
 * Flight primitive (Motion Contract 4.4; moved from `components/flightKit.ts`
 * in #2073, now reading roles through the token adapter and the shared
 * reduced-motion source).
 *
 * Shared pieces of the decorative flights (own send flight, partner arrival,
 * gesture send): arc geometry, the generated motion roles and the top-layer
 * layer the flying elements live in.
 *
 * Flight elements are decoration only: hidden from assistive technology, no
 * pointer events, never blocking. Every duration and easing is read from the
 * generated motion roles, never written here, so reduced motion (which
 * resolves them to zero) never creates a flight.
 */

import './FlightLayer.css';
import { prefersReducedMotion } from './reducedMotion';
import { durationMs, easing } from './tokens';

export interface Point {
  x: number;
  y: number;
}

/** How high an arc rises above the straight line, in pixels. */
export const ARC_RISE = 48;
const PATH_STEPS = 12;

/** A quadratic arc between two points, bulging up and to one side. */
export function arcPoint(
  from: Point,
  to: Point,
  lean: number,
  rise: number,
): (progress: number) => Point {
  const control = {
    x: (from.x + to.x) / 2 + lean,
    y: Math.min(from.y, to.y) - rise,
  };
  return (progress) => ({
    x:
      (1 - progress) ** 2 * from.x +
      2 * (1 - progress) * progress * control.x +
      progress ** 2 * to.x,
    y:
      (1 - progress) ** 2 * from.y +
      2 * (1 - progress) * progress * control.y +
      progress ** 2 * to.y,
  });
}

/** Sampled keyframes along the arc, relative to the starting point. */
export function flightKeyframes(
  from: Point,
  to: Point,
  startScale: number,
  endScale: number,
  lean: number,
  rise: number = ARC_RISE,
  steps: number = PATH_STEPS,
): Keyframe[] {
  const path = arcPoint(from, to, lean, rise);
  const frames: Keyframe[] = [];
  for (let step = 0; step <= steps; step += 1) {
    const progress = step / steps;
    const point = path(progress);
    const scale = startScale + (endScale - startScale) * progress;
    frames.push({
      transform: `translate(${point.x - from.x}px, ${point.y - from.y}px) scale(${scale})`,
    });
  }
  return frames;
}

/** The scale that makes the flying element as wide as its landing slot. */
export function landingScale(ghostWidth: number, slotWidth: number): number {
  return ghostWidth > 0 && slotWidth > 0 ? slotWidth / ghostWidth : 1;
}

export function centre(rect: DOMRect): Point {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export interface MotionRoles {
  /** Ordinary context change; also the lift and the settle beat. */
  context: number;
  /** One item crossing the screen. */
  flight: number;
  /** One expressive beat of a gesture; zero when the role is unavailable. */
  moment: number;
  /** Offset between neighbouring items. */
  stagger: number;
  enter: string;
  standard: string;
}

/** Null when any role is missing or zero (reduced motion resolves to zero). */
export function readMotionRoles(): MotionRoles | null {
  const context = durationMs('context');
  const flight = durationMs('send-flight');
  const moment = durationMs('gesture-moment');
  const feedback = durationMs('feedback');
  const enter = easing('enter');
  const standard = easing('standard');
  if (context <= 0 || flight <= 0 || !enter || !standard) return null;
  return { context, flight, moment, stagger: feedback / 2, enter, standard };
}

export interface FlightLayer {
  layer: HTMLElement;
  roles: MotionRoles;
  /** Remove the layer and everything in it. */
  dispose: () => void;
}

/**
 * Open a decorative layer in the top layer, above any modal sheet. Returns
 * null when a flight is not possible or not wanted (reduced motion, missing
 * roles, no animation or top-layer support): the caller then keeps the calm
 * state change instead.
 */
export function openFlightLayer(): FlightLayer | null {
  if (typeof document === 'undefined') return null;
  if (prefersReducedMotion()) return null;
  const roles = readMotionRoles();
  if (!roles) return null;
  const probe = document.createElement('div');
  if (
    typeof probe.animate !== 'function' ||
    typeof probe.showPopover !== 'function'
  )
    return null;
  const layer = document.createElement('div');
  layer.className = 'wir-checkin-flight-layer';
  layer.setAttribute('popover', 'manual');
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);
  try {
    layer.showPopover();
  } catch {
    layer.remove();
    return null;
  }
  return {
    layer,
    roles,
    dispose: () => {
      try {
        layer.hidePopover();
      } catch {
        // The layer may already be gone.
      }
      layer.remove();
    },
  };
}

/** A ring that grows out of a rectangle and fades, e.g. around a landing. */
export function pulseRing(
  layer: HTMLElement,
  rect: DOMRect,
  roles: MotionRoles,
  growth: number,
): void {
  const ring = document.createElement('div');
  ring.className = 'wir-checkin-flight-ring';
  ring.style.left = `${rect.left}px`;
  ring.style.top = `${rect.top}px`;
  ring.style.width = `${rect.width}px`;
  ring.style.height = `${rect.height}px`;
  layer.append(ring);
  ring
    .animate(
      [
        { opacity: 0.4, transform: 'scale(1)' },
        { opacity: 0, transform: `scale(${growth})` },
      ],
      { duration: roles.context * 2, easing: roles.enter },
    )
    .finished.then(
      () => ring.remove(),
      () => ring.remove(),
    );
}

/** A few dots that scatter from a point, like a small celebration. */
export function scatterDots(
  layer: HTMLElement,
  at: Point,
  roles: MotionRoles,
  count: number,
): void {
  for (let index = 0; index < count; index += 1) {
    const dot = document.createElement('div');
    dot.className = `wir-checkin-flight-dot is-${index % 4}`;
    dot.style.left = `${at.x - 4}px`;
    dot.style.top = `${at.y - 4}px`;
    layer.append(dot);
    const angle = (index / count) * Math.PI * 2 + 0.4;
    const reach = 28 + (index % 3) * 10;
    dot
      .animate(
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
          {
            transform: `translate(${Math.cos(angle) * reach}px, ${Math.sin(angle) * reach}px) scale(0.2)`,
            opacity: 0,
          },
        ],
        { duration: roles.context * 2, easing: roles.standard },
      )
      .finished.then(
        () => dot.remove(),
        () => dot.remove(),
      );
  }
}
