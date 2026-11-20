/**
 * Sampled spring for the Gesture follow settle (from the gesture test #2071).
 *
 * The spring is integrated once at release and handed to the compositor as a
 * Web Animation with linear keyframes, so the settle keeps running while the
 * main thread renders. It starts with the release velocity, so the element
 * continues from the finger without a visible change of speed.
 */
import { MOTION_CONSTANTS } from '../tokens';

export interface SpringOptions {
  stiffness: number;
  damping: number;
  mass: number;
}

export const SETTLE_SPRING: SpringOptions = MOTION_CONSTANTS.spring;

/** Frame length of the sampled keyframes (60 Hz). */
export const SPRING_FRAME_MS = 1000 / 60;
const STEPS_PER_FRAME = 4;
const MAX_FRAMES = 90;

/**
 * Positions at 60 Hz from `from` to `to`, starting with `velocity` in px/ms.
 * With `clamp` the spring never passes `to` (a dismissed sheet does not
 * bounce back into view).
 */
export function sampleSpring(
  from: number,
  to: number,
  velocity: number,
  options: SpringOptions = SETTLE_SPRING,
  clamp = false,
): number[] {
  const { stiffness, damping, mass } = options;
  const frames = [from];
  let x = from;
  let v = velocity * 1000; // px/s
  const dt = SPRING_FRAME_MS / 1000 / STEPS_PER_FRAME;
  for (let frame = 0; frame < MAX_FRAMES; frame += 1) {
    for (let step = 0; step < STEPS_PER_FRAME; step += 1) {
      const force = -stiffness * (x - to) - damping * v;
      v += (force / mass) * dt;
      x += v * dt;
    }
    if (clamp && from !== to && Math.sign(x - to) !== Math.sign(from - to)) {
      frames.push(to);
      return frames;
    }
    frames.push(x);
    if (Math.abs(x - to) < 0.5 && Math.abs(v) < 20) break;
  }
  frames[frames.length - 1] = to;
  return frames;
}

/** The settle's duration for sampled frames. */
export function springDuration(frames: readonly number[]): number {
  return Math.max(0, frames.length - 1) * SPRING_FRAME_MS;
}
