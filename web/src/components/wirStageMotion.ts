/**
 * Wir on the motion layer (#2074): the Product Owner's approved pace for the
 * opening, the opening's own clock, the module batch after it, and the ring
 * breath that follows. Wir passes these decisions to the layer's primitives
 * (Motion Contract 5.2); the motion itself lives in `src/motion/`.
 */
import { type AmbientHandle, ambient } from '../motion/ambient';
import { now } from '../motion/choreography';
import { durationMs, motionCount } from '../motion/tokens';

/** The opening's identity; it plays once per app start. */
export const WIR_STAGE = 'wir.stage';

/**
 * One beat of the opening is this many shared sequence beats (Product Owner,
 * 2026-11-19: 1.4x was too quick to notice; 2.2x gives a calm 2.7 s
 * arrival). It is the one knob: WirMotion.css reads it as `--wir-intro-pace`.
 */
export const WIR_INTRO_PACE = 2.2;

export function wirIntroBeat(): number {
  return durationMs('sequence-beat') * WIR_INTRO_PACE;
}

/**
 * The opening's own clock, from the same beats as WirMotion.css: the
 * distance value lands at 4.2 + 2 beats; the pin's wiggle starts at
 * 4.6 beats and lasts one gesture moment.
 */
export function wirStageDuration(): number {
  const beat = wirIntroBeat();
  if (beat <= 0) return 0;
  return Math.max(beat * 6.2, beat * 4.6 + durationMs('gesture-moment'));
}

/**
 * Modules already in view arrive after the portraits and the heart line
 * have landed (2.75 beats), within one batch window (2.5 beats); later
 * modules arrive on their own.
 */
export function wirModuleBatch(): { start: number; window: number } {
  const beat = wirIntroBeat();
  return { start: beat * 2.75, window: beat * 2.5 };
}

/** The first time the opening is considered, Wir must be at its top. */
export function wirStageCanStart(root: Element): boolean {
  if (root.closest('[data-primary-tab-peek]')) return false;
  return typeof window === 'undefined' || window.scrollY === 0;
}

const AVATAR_COLUMNS = '.today-hero .partner-avatar-stack > *';
const breaths = new WeakMap<Element, AmbientHandle | 'rested'>();
let breathStartedAt: number | null = null;

/**
 * The rings around the two portraits breathe very slowly, one after the
 * other: Ambient `breath` on the decorative `::before` ring, opacity only
 * (M7), for `--motion-ambient-repeat` cycles (M8), paused while Wir is
 * hidden. Called after every render once the opening (and an important-day
 * Moment) ended: a portrait column that remounted joins the breath where it
 * is instead of starting over.
 */
export function breatheRings(stage: Element | null): void {
  if (!stage) return;
  const cycle = durationMs('connection-travel-far');
  const lead = durationMs('connection-beat');
  if (cycle <= 0) return;
  breathStartedAt ??= now();
  const columns = stage.querySelectorAll(AVATAR_COLUMNS);
  columns.forEach((column, index) => {
    if (breaths.has(column)) return;
    const offset = lead + (index * cycle) / 2;
    const end = offset + cycle * motionCount('ambient-repeat');
    const elapsed = now() - (breathStartedAt ?? now());
    if (elapsed >= end) {
      breaths.set(column, 'rested');
      return;
    }
    breaths.set(
      column,
      ambient(column, {
        kind: 'breath',
        duration: 'connection-travel-far',
        pseudoElement: '::before',
        delay: offset - elapsed,
      }),
    );
  });
}

/**
 * A Moment that starts while the rings already breathe brings them to rest
 * (M15: one emphasized motion at a time); they stay still afterwards.
 */
export function holdRingBreath(stage: Element | null): void {
  stage?.querySelectorAll(AVATAR_COLUMNS).forEach((column) => {
    const handle = breaths.get(column);
    if (!handle || handle === 'rested') return;
    handle.stop();
    breaths.set(column, 'rested');
  });
}

/** Test support. */
export function resetWirStageMotionForTests(): void {
  breathStartedAt = null;
}
