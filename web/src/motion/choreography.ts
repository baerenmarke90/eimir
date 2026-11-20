/**
 * Choreography clock (Motion Contract M15).
 *
 * Motions that belong together share one start time. A choreography is
 * registered by identity, so a member that mounts late or mounts again (a
 * `span` that becomes a `button`, a Suspense fallback that resolves) finds the
 * same clock and aligns to it instead of starting over. A member whose slot
 * already passed shows its final state. This generalizes `wirIntroClock.ts`.
 *
 * Times are document-timeline milliseconds, which share their origin with
 * `performance.now()` and with `Animation.startTime`.
 */
import type { PlayScope, SurfaceScope } from './playRegistry';

export interface MemberSlot {
  /** Milliseconds after the choreography start at which the member starts. */
  offset: number;
  /** The member's own duration. */
  duration: number;
}

export type MemberTiming =
  /** Play with this delay (negative: start part-way through, aligned). */
  | { kind: 'play'; delay: number }
  /** The slot passed: show the final state. */
  | { kind: 'final' };

export function now(): number {
  if (typeof document !== 'undefined') {
    const time = document.timeline?.currentTime;
    if (typeof time === 'number') return time;
  }
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export class Choreography {
  private started: number | null = null;
  private endsAt = 0;

  constructor(readonly identity: string) {}

  /** The shared start time; set by the first member that starts. */
  get startTime(): number | null {
    return this.started;
  }

  /** Starts the clock (once); later calls keep the first start time. */
  start(at: number = now()): number {
    this.started ??= at;
    return this.started;
  }

  /** The member's timing against the shared clock. */
  timing(slot: MemberSlot, at: number = now()): MemberTiming {
    const start = this.start(at);
    this.endsAt = Math.max(this.endsAt, start + slot.offset + slot.duration);
    const elapsed = at - start;
    if (elapsed >= slot.offset + slot.duration) return { kind: 'final' };
    return { kind: 'play', delay: slot.offset - elapsed };
  }

  /** True once every member that asked for a slot has ended (M15 ambient). */
  finished(at: number = now()): boolean {
    return this.started !== null && at >= this.endsAt;
  }

  /** Milliseconds until the last known member ends. */
  remaining(at: number = now()): number {
    return this.started === null ? 0 : Math.max(0, this.endsAt - at);
  }
}

const appStart = new Map<string, Choreography>();
const session = new Map<string, Choreography>();
const surfaces = new WeakMap<SurfaceScope, Map<string, Choreography>>();

/** The choreography registered under `identity` in `scope`. */
export function choreography(
  identity: string,
  scope: PlayScope = 'session',
  surface?: SurfaceScope,
): Choreography {
  let registry: Map<string, Choreography>;
  if (scope === 'app-start') registry = appStart;
  else if (scope === 'session') registry = session;
  else {
    // Without its SurfaceScope a surface choreography is not shared.
    if (!surface) return new Choreography(identity);
    registry = surfaces.get(surface) ?? new Map();
    surfaces.set(surface, registry);
  }
  let found = registry.get(identity);
  if (!found) {
    found = new Choreography(identity);
    registry.set(identity, found);
  }
  return found;
}

/**
 * Pins the CSS animations under `root` whose name starts with `namePrefix` to
 * `startTime`, so replacement elements continue from the same point.
 * Transitions and other animations keep their own clock.
 */
export function alignCssAnimations(
  root: Element | null,
  startTime: number | null,
  namePrefix: string,
): void {
  if (!root || startTime === null || typeof root.getAnimations !== 'function')
    return;
  for (const animation of root.getAnimations({ subtree: true })) {
    const name = (animation as Partial<CSSAnimation>).animationName;
    if (
      typeof name === 'string' &&
      name.startsWith(namePrefix) &&
      animation.startTime !== startTime
    )
      animation.startTime = startTime;
  }
}

/** Test support. */
export function resetChoreographiesForTests(): void {
  appStart.clear();
  session.clear();
}
