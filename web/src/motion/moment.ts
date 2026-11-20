/**
 * Moment primitive (Motion Contract 4.7).
 *
 * A rare, approved, multi-beat emotional choreography. `startMoment()` decides
 * whether a Moment may play now; the owner then plays its beats with `run()`
 * from the returned delay and calls `end()` when they finished on their own
 * clock.
 *
 * - Plays once per item: a received gesture or message is keyed by an opaque
 *   in-memory value and never plays again after it was seen.
 * - Counts as the screen's one emphasized motion (M15); never two at once.
 * - Never during a gesture or typing; never for an item that is not visible.
 * - With reduced motion it does not play: the owner shows the static
 *   composition with the same content.
 * - One `moment` haptic on the first beat, only when it plays (4.10).
 *
 * Content is readable from the first beat and after the Moment (M13); a null
 * result never hides it.
 */
import { type ScreenBudget, screenBudget } from './budget';
import { haptic } from './haptics';
import { prefersReducedMotion } from './reducedMotion';
import { durationMs } from './tokens';

export interface MomentTicket {
  /** Start the first beat after this delay. */
  delay: number;
  /** The Moment's whole duration (`--duration-gesture-sequence`). */
  duration: number;
  /** The beats ended or were cancelled. */
  end(): void;
}

export interface MomentRequest {
  /** False when the item is not visible (page, kept view, off screen). */
  visible?: boolean;
  /** Play the first-beat haptic; the owner leaves it off for a Moment shown in its final state. */
  haptic?: boolean;
  budget?: ScreenBudget;
  duration?: number;
}

const seenKeys = new Map<string, Set<string>>();
const seenItems = new Map<string, WeakSet<object>>();

function wasSeen(identity: string, item: object | string): boolean {
  return typeof item === 'string'
    ? (seenKeys.get(identity)?.has(item) ?? false)
    : (seenItems.get(identity)?.has(item) ?? false);
}

function markSeen(identity: string, item: object | string): void {
  if (typeof item === 'string') {
    const keys = seenKeys.get(identity) ?? new Set<string>();
    keys.add(item);
    seenKeys.set(identity, keys);
  } else {
    const items = seenItems.get(identity) ?? new WeakSet<object>();
    items.add(item);
    seenItems.set(identity, items);
  }
}

/**
 * `identity` names the Moment (`wir.important-day`); `item` is the opaque
 * key of the occasion or received item (an object, or an in-memory string
 * that never contains content).
 */
export function startMoment(
  identity: string,
  item: object | string,
  request: MomentRequest = {},
): MomentTicket | null {
  if (wasSeen(identity, item)) return null;
  // Seen even when it shows its final state: it never plays later.
  markSeen(identity, item);
  const duration = request.duration ?? durationMs('gesture-sequence');
  if (request.visible === false || prefersReducedMotion() || duration <= 0)
    return null;
  const ticket = (request.budget ?? screenBudget()).requestEmphasis(duration);
  if (!ticket) return null;
  if (request.haptic) {
    if (ticket.delay > 0) setTimeout(() => haptic('moment'), ticket.delay);
    else haptic('moment');
  }
  return { delay: ticket.delay, duration, end: ticket.release };
}

/** Test support. */
export function resetMomentsForTests(): void {
  seenKeys.clear();
  seenItems.clear();
}
