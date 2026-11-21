/**
 * Wir on the motion layer (#2074, #2147): the Product Owner's approved pace
 * for the opening, the opening's one clock (hero, check-in, place, quote and
 * the modules in view), its data hold, and the ring breath that follows. Wir passes these decisions to the layer's primitives
 * (Motion Contract 5.2); the motion itself lives in `src/motion/`.
 */
import { type AmbientHandle, ambient } from '../motion/ambient';
import { now } from '../motion/choreography';
import { durationMs, MOTION_CONSTANTS, motionCount } from '../motion/tokens';

/** The opening's identity; it plays once per app start. */
export const WIR_STAGE = 'wir.stage';

/**
 * One beat of the opening is this many shared sequence beats (Product Owner,
 * 2026-11-19: 1.4x was too quick to notice; 2.2x gives a calm arrival). It is
 * the one knob: WirMotion.css reads it as `--wir-intro-pace`, and every slot
 * below counts in this beat.
 */
export const WIR_INTRO_PACE = 2.2;

export function wirIntroBeat(): number {
  return durationMs('sequence-beat') * WIR_INTRO_PACE;
}

/**
 * The opening on one clock (#2147), in beats after the opening starts. The
 * CSS beats in WirMotion.css and WirHeroStage.css are the same numbers; the
 * unit test keeps them in step and inside the opening budget.
 *
 * - portraits with their rings, names and marks: own 0, partner 0.3, 1.6 each;
 * - the heart line: arms 0.7 for 1.0, heart 1.2 for 1.1;
 * - today's check-in under the names: 1.9 for 1.2, once the partner's
 *   portrait has landed, so it never fades inside a fading column (joins late);
 * - the ampersand, the time together and the place: 1.8 for 1.3 (the place
 *   joins late), then a current place's pin wiggles once at 2.6;
 * - the daily quote: 2.2 for 1.3 (joins late);
 * - the modules in view: 2.5 for their header and 2.7 for their body, one
 *   `--duration-stagger-item` apart in reading order, within 1.8 beats.
 */
export const WIR_STAGE_BEATS = Object.freeze({
  portraits: { start: 0, partnerLead: 0.3, length: 1.6 },
  arms: { start: 0.7, length: 1 },
  heart: { start: 1.2, length: 1.1 },
  checkIn: { start: 1.9, length: 1.2 },
  bridge: { start: 1.8, length: 1.3 },
  wiggle: { start: 2.6 },
  quote: { start: 2.2, length: 1.3 },
  modules: { start: 2.5, length: 1.8 },
});

/** The most modules that arrive staggered in the opening (Motion Contract 4.1). */
function moduleStaggerSteps(): number {
  return Math.max(0, motionCount('stagger-max-items') - 1);
}

/**
 * The opening's own clock: the last slot ends with the latest staggered
 * module, or with the pin's wiggle (one gesture moment).
 */
export function wirStageDuration(): number {
  const beat = wirIntroBeat();
  if (beat <= 0) return 0;
  const { modules, wiggle } = WIR_STAGE_BEATS;
  return Math.max(
    beat * (modules.start + modules.length) +
      durationMs('stagger-item') * moduleStaggerSteps(),
    beat * wiggle.start + durationMs('gesture-moment'),
  );
}

/**
 * How long the opening waits, invisibly, for the data its members show (the
 * check-in, the place, the quote, the photos) before it plays anyway
 * (#2147). Not a motion duration: reduced motion keeps it, so late data never
 * moves a layout that is already shown.
 */
export function wirStageHold(): number {
  return MOTION_CONSTANTS.stage.dataHoldMs;
}

/**
 * The module slot `index` in the opening: when it starts after the opening
 * started, and how long it may take (Motion Contract M15).
 */
export function wirModuleSlot(index: number): {
  offset: number;
  length: number;
} {
  const beat = wirIntroBeat();
  const { modules } = WIR_STAGE_BEATS;
  const step = Math.min(Math.max(0, index), moduleStaggerSteps());
  return {
    offset: beat * modules.start + durationMs('stagger-item') * step,
    length: beat * modules.length,
  };
}

/** The stage's wider scope on Wir: the page content (quote and modules). */
export function wirStageScope(root: Element): Element | null {
  return root.closest('.today-content');
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
