/*
 * Sampled spring for the WAAPI variant: the spring is integrated once on
 * release and handed to the compositor as linear keyframes, so the settle
 * keeps running while the main thread is busy.
 */

export interface SpringOptions {
  stiffness: number;
  damping: number;
  mass: number;
}

const FRAME_S = 1 / 60;
const STEPS_PER_FRAME = 4;
const MAX_FRAMES = 90;

/**
 * Positions at 60 Hz from `from` to `to`, starting with `velocity` (px/s).
 * When `clamp` is set the spring never passes `to` (a dismissed sheet does
 * not bounce back into view).
 */
export function sampleSpring(
  from: number,
  to: number,
  velocity: number,
  { stiffness, damping, mass }: SpringOptions,
  clamp = false,
): number[] {
  const frames = [from];
  let x = from;
  let v = velocity;
  const dt = FRAME_S / STEPS_PER_FRAME;
  for (let frame = 0; frame < MAX_FRAMES; frame += 1) {
    for (let step = 0; step < STEPS_PER_FRAME; step += 1) {
      const force = -stiffness * (x - to) - damping * v;
      v += (force / mass) * dt;
      x += v * dt;
    }
    if (clamp && Math.sign(x - to) !== Math.sign(from - to)) {
      frames.push(to);
      return frames;
    }
    frames.push(x);
    if (Math.abs(x - to) < 0.5 && Math.abs(v) < 20) break;
  }
  frames[frames.length - 1] = to;
  return frames;
}

export const SPRING_FRAME_MS = FRAME_S * 1000;
