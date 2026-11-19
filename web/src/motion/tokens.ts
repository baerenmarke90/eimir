/**
 * The motion layer's token adapter (Motion Contract M1).
 *
 * Durations, easings, stagger steps and repeat counts come from the generated
 * roles in `design/product-roles.css`. This is the only place in TypeScript
 * that parses them: no feature reads `getComputedStyle` for a motion role, and
 * there is no literal fallback. A missing role reads as `0` ms (or an empty
 * easing), which every primitive treats as "show the final state".
 *
 * Values are re-read when the root element's attributes (theme, app design,
 * token set, inline overrides) or the reduced-motion preference change.
 * Static values that never follow reduced motion (gesture thresholds, the
 * settle spring) come from `tokens.generated.ts`.
 */
import { prefersReducedMotion } from './reducedMotion';

export { MOTION_CONSTANTS } from './tokens.generated';

export type DurationRole =
  | 'feedback'
  | 'transition'
  | 'context'
  | 'map-camera'
  | 'map-stack'
  | 'controls-return'
  | 'sequence-beat'
  | 'send-flight'
  | 'gesture-moment'
  | 'gesture-sequence'
  | 'connection-draw'
  | 'connection-beat'
  | 'connection-travel'
  | 'connection-travel-far'
  | 'story-slide'
  | 'story-ken-burns'
  | 'stagger-item'
  | 'stagger-module';

export type EasingRole =
  | 'standard'
  | 'enter'
  | 'exit'
  | 'playback'
  | 'travel'
  | 'settle';

export type CountRole = 'ambient-repeat' | 'stagger-max-items';

const COUNT_PROPERTIES: Record<CountRole, string> = {
  'ambient-repeat': '--motion-ambient-repeat',
  'stagger-max-items': '--motion-stagger-max-items',
};

let cache: { signature: string; values: Map<string, string> } | null = null;

/**
 * Cheap identity of everything that can change the computed roles without a
 * style recalculation: the root element's attributes and the preference.
 */
function signature(root: HTMLElement): string {
  let text = prefersReducedMotion() ? 'reduce|' : 'motion|';
  for (const attribute of Array.from(root.attributes))
    text += `${attribute.name}=${attribute.value}|`;
  return text;
}

function readRole(property: string): string {
  if (typeof document === 'undefined') return '';
  const root = document.documentElement;
  const current = signature(root);
  if (cache?.signature !== current)
    cache = { signature: current, values: new Map() };
  const known = cache.values.get(property);
  if (known !== undefined) return known;
  const raw = getComputedStyle(root).getPropertyValue(property).trim();
  cache.values.set(property, raw);
  return raw;
}

/** Re-read every role on the next call (a stylesheet swap, a test). */
export function invalidateMotionTokens(): void {
  cache = null;
}

/** Parses `120ms`, `0.4s` or `.4s`; anything else is `0`. */
export function parseDuration(raw: string): number {
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value < 0) return 0;
  if (raw.endsWith('ms')) return value;
  if (raw.endsWith('s')) return value * 1000;
  return 0;
}

/** The duration role in milliseconds; `0` with reduced motion or if missing. */
export function durationMs(role: DurationRole): number {
  return parseDuration(readRole(`--duration-${role}`));
}

/** The easing role as a CSS easing string; empty when missing. */
export function easing(role: EasingRole): string {
  return readRole(`--easing-${role}`);
}

/** A count role (repeat count, stagger cap); `0` when missing. */
export function motionCount(role: CountRole): number {
  const value = Number.parseFloat(readRole(COUNT_PROPERTIES[role]));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
