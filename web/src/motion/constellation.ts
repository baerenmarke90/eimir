/**
 * The motion layer's frame-driven motion for the Sternbild memory world
 * (#2283): the shooting star that flies from a swipe to the star it lands
 * on (a glowing trail that fades behind its head and a little falling
 * dust), the streak that follows the finger while it swipes, and the
 * telescope that turns towards a star on a soft spring with a speed limit.
 *
 * Each frame writes SVG attributes and transforms only; the world owns the
 * elements and draws through the callbacks it passes in. With reduced
 * motion nothing flies: the world lands on the star at once, the telescope
 * jumps to its target and no dust is spawned. The one-shot effects (the
 * flare, the falling dust, the porthole that grows out of the lens) and
 * the ambient loops are CSS (`memory-worlds.css`, stars roles). The values
 * were tuned with the Product Owner in the accepted prototype and are kept
 * unchanged.
 */
import { prefersReducedMotion } from './reducedMotion';

/** Timings of the Sternbild in ms. */
export const STARS_TIMING = Object.freeze({
  /** How long the glowing trail lingers behind the flying head. */
  trail: 340,
  /** … and behind the finger while it swipes. */
  dragTrail: 200,
  /** A traced constellation stays this long before it fades away. */
  traceLinger: 2600,
  /** The constellation line draws on after this delay, over this time
   *  (must match `--memory-stars-line-delay` and `-line-duration`). */
  lineDelay: 300,
  lineDraw: 3000,
  /** A flight lasts 900 ms plus 2.2 ms per sky unit, within these bounds. */
  flightMin: 1100,
  flightMax: 1800,
  flightBase: 900,
  flightPerUnit: 2.2,
  /** A dust mote falls from the head this often, and is gone after this. */
  dustEvery: 42,
  dustLife: 1400,
  /** The porthole shrinks back into the lens (longer than its CSS shrink). */
  viewClose: 640,
  /** The card comes into view after a tap, a landing or the porthole. */
  cardAfterTap: 300,
  cardAfterLanding: 720,
  cardAfterView: 420,
  /** A gesture's trailing click is swallowed for this long. */
  clickReset: 80,
  /** Shooting stars on their own: one every 40 to 80 s, during a shower
   *  every 6 to 14 s. */
  ambientWait: 40000,
  ambientSpread: 40000,
  showerWait: 6000,
  showerSpread: 8000,
});

export interface SkyPoint {
  x: number;
  y: number;
}

export interface TrailSample extends SkyPoint {
  t: number;
}

/** A shooting star's flight: a quadratic curve from `p0` over `c` to `p1`. */
export interface StarFlight {
  p0: SkyPoint;
  c: SkyPoint;
  p1: SkyPoint;
  duration: number;
}

/**
 * The flight from `from`, leaving in direction `dir` (a unit vector), to
 * `to`: it bends towards the swipe's direction the more the two agree.
 */
export function planFlight(
  from: SkyPoint,
  dir: SkyPoint,
  to: SkyPoint,
): StarFlight {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const length = distance || 1;
  const aligned = Math.max(0.15, (dx / length) * dir.x + (dy / length) * dir.y);
  return {
    p0: from,
    c: {
      x: from.x + dir.x * distance * 0.5 * aligned,
      y: from.y + dir.y * distance * 0.5 * aligned,
    },
    p1: { x: to.x, y: to.y },
    duration: Math.min(
      STARS_TIMING.flightMax,
      Math.max(
        STARS_TIMING.flightMin,
        STARS_TIMING.flightBase + distance * STARS_TIMING.flightPerUnit,
      ),
    ),
  };
}

/**
 * Where the flight is after `elapsed` ms: flung fast, it slows down as it
 * reaches its star (an ease-out cubic). `eased` also shrinks the head.
 */
export function flightAt(
  flight: StarFlight,
  elapsed: number,
): { at: SkyPoint; eased: number; done: boolean } {
  const progress = Math.min(1, Math.max(0, elapsed / flight.duration));
  const eased = 1 - (1 - progress) ** 3;
  const u = 1 - eased;
  return {
    at: {
      x:
        u * u * flight.p0.x +
        2 * u * eased * flight.c.x +
        eased ** 2 * flight.p1.x,
      y:
        u * u * flight.p0.y +
        2 * u * eased * flight.c.y +
        eased ** 2 * flight.p1.y,
    },
    eased,
    done: progress >= 1,
  };
}

/** The flying head shrinks to 55 % of its size on the way. */
export function headScale(eased: number): number {
  return 1 - 0.45 * eased;
}

/** The trail samples still glowing at `now`. */
export function trimTrail(
  samples: readonly TrailSample[],
  now: number,
  keep: number,
): TrailSample[] {
  return samples.filter((sample) => now - sample.t <= keep);
}

/** The telescope's motion: a soft spring towards `target` (degrees). */
export interface ScopeMotion {
  deg: number;
  vel: number;
  target: number;
  /** How far along the tube the field of view lies (sky units). */
  reach: number;
  reachTarget: number;
  /** The speed limit in degrees per frame. */
  maxStep: number;
}

/**
 * One frame of the telescope: it follows its target a little behind, with
 * a speed limit, and its field of view slides along the tube. With reduced
 * motion it is at its target at once.
 */
export function stepScope(motion: ScopeMotion): void {
  if (prefersReducedMotion()) {
    settleScope(motion);
    return;
  }
  motion.reach += (motion.reachTarget - motion.reach) * 0.15;
  const diff = motion.target - motion.deg;
  motion.vel = (motion.vel + diff * 0.07) * 0.8;
  motion.vel = Math.min(motion.maxStep, Math.max(-motion.maxStep, motion.vel));
  motion.deg += motion.vel;
}

/** Puts the telescope at its target. */
export function settleScope(motion: ScopeMotion): void {
  motion.deg = motion.target;
  motion.vel = 0;
  motion.reach = motion.reachTarget;
}

/** Whether the telescope has come to rest on its target. */
export function scopeSettled(motion: ScopeMotion): boolean {
  return (
    Math.abs(motion.target - motion.deg) < 0.35 &&
    Math.abs(motion.reachTarget - motion.reach) < 1 &&
    Math.abs(motion.vel) < 0.06
  );
}

/** A frame loop: `step` runs every frame for as long as it returns `true`. */
export interface FrameLoop {
  start(): void;
  stop(): void;
}

export function frameLoop(step: (now: number) => boolean): FrameLoop {
  let handle = 0;
  const run = (now: number) => {
    handle = 0;
    if (step(now)) handle = window.requestAnimationFrame(run);
  };
  return {
    start() {
      if (!handle) handle = window.requestAnimationFrame(run);
    },
    stop() {
      if (handle) window.cancelAnimationFrame(handle);
      handle = 0;
    },
  };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * A dust mote that falls from the shooting star's head at `at` (its fall is
 * the `memory-stars-dust` CSS animation). Returns the mote; the caller
 * removes it after `STARS_TIMING.dustLife`.
 */
export function dropDust(
  group: SVGGElement,
  at: SkyPoint,
): SVGCircleElement | null {
  if (prefersReducedMotion()) return null;
  const mote = document.createElementNS(SVG_NS, 'circle');
  mote.setAttribute('cx', (at.x + (Math.random() * 3 - 1.5)).toFixed(1));
  mote.setAttribute('cy', (at.y + (Math.random() * 3 - 1.5)).toFixed(1));
  mote.setAttribute('r', (0.45 + Math.random() * 0.8).toFixed(2));
  mote.setAttribute('class', 'memory-stars-dust');
  mote.style.setProperty(
    '--memory-stars-dx',
    `${(Math.random() * 8 - 4).toFixed(1)}px`,
  );
  mote.style.setProperty(
    '--memory-stars-dy',
    `${(7 + Math.random() * 12).toFixed(1)}px`,
  );
  group.appendChild(mote);
  return mote;
}

/** The wait before the next shooting star crosses the sky on its own. */
export function ambientWait(shower: boolean): number {
  return shower
    ? STARS_TIMING.showerWait + Math.random() * STARS_TIMING.showerSpread
    : STARS_TIMING.ambientWait + Math.random() * STARS_TIMING.ambientSpread;
}
