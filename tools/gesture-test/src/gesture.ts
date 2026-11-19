/*
 * Gesture rules shared by every variant, taken from ShortTaskSheet.tsx and
 * useNavigationMotion.ts on main (915e97ec8), plus the fling rule the
 * Motion Contract (4.6) adds for sheets.
 */

export const SLOP_PX = 4;
export const REVERSAL_CANCEL_PX = 24;
export const FLING_VELOCITY_PX_PER_MS = 0.5;
export const FLING_MIN_PX = 32;
export const EDGE_RESISTANCE = 0.25;
export const EDGE_MAX_TRAVEL_PX = 48;
/** One spring for both implementations: critically damped, mass 1. */
export const SPRING = { stiffness: 380, damping: 39, mass: 1 };

export function dismissThreshold(height: number): number {
  return Math.min(180, Math.max(120, height * 0.22));
}

/** Upward travel past the resting place gives way like rubber. */
export function rubberBand(offset: number): number {
  if (offset >= 0) return offset;
  return -Math.min(EDGE_MAX_TRAVEL_PX, -offset * EDGE_RESISTANCE);
}

export function shouldDismiss(input: {
  offset: number;
  peak: number;
  velocity: number;
  height: number;
}): boolean {
  if (input.peak - input.offset >= REVERSAL_CANCEL_PX) return false;
  if (input.offset >= dismissThreshold(input.height)) return true;
  return input.velocity > FLING_VELOCITY_PX_PER_MS && input.offset >= FLING_MIN_PX;
}

const VELOCITY_WINDOW_MS = 100;

/**
 * Release velocity in px/ms over the last ~100 ms of movement: measured
 * from the newest sample to the first sample at least 100 ms older (or the
 * oldest one), skipping a stale press origin in a hold-then-flick, as
 * Motion's pan session does. The first naive version (first sample inside
 * the window, origin included) underestimated flicks by about half.
 */
export class VelocityTracker {
  private samples: { t: number; y: number }[] = [];

  add(t: number, y: number) {
    this.samples.push({ t, y });
    if (this.samples.length > 32) this.samples.shift();
  }

  velocity(): number {
    const samples = this.samples;
    if (samples.length < 2) return 0;
    const last = samples[samples.length - 1];
    let index = samples.length - 1;
    while (index > 0 && last.t - samples[index].t <= VELOCITY_WINDOW_MS)
      index -= 1;
    if (
      index === 0 &&
      samples.length > 2 &&
      last.t - samples[0].t > VELOCITY_WINDOW_MS * 2
    )
      index = 1;
    const from = samples[index];
    if (last.t - from.t <= 0) return 0;
    return (last.y - from.y) / (last.t - from.t);
  }

  reset() {
    this.samples = [];
  }
}
