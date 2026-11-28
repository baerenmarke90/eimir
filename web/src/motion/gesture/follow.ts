/**
 * Gesture follow building block (Motion Contract 4.6).
 *
 * While the pointer is down, the element follows it 1:1 on one axis, with no
 * easing and no duration: `pointermove` (with its coalesced samples) is
 * applied once per animation frame by writing `transform` directly. On
 * release the gesture commits or cancels, the domain action runs at once
 * (M10), and the element settles from where it is with its release velocity
 * through a sampled spring on the compositor. Grabbing a settling element
 * stops the settle where it is (commit, then cancel) and continues tracking
 * without a jump.
 *
 * The tab pager, sheet dismissal, pull to refresh and list reorder use this
 * block's ownership, rubber-band, commit and velocity rules (#2076);
 * `settleFrom()` is the shared release handoff for owners that keep their
 * own event plumbing (touch events, CSS offsets).
 */
import { haptic } from '../haptics';
import { prefersReducedMotion } from '../reducedMotion';
import { commitAndCancel, run } from '../run';
import { MOTION_CONSTANTS } from '../tokens';
import { sampleSpring, springDuration } from './spring';
import { VelocityTracker } from './velocity';

export type GestureAxis = 'x' | 'y';
export type CommitPreset = keyof typeof MOTION_CONSTANTS.gesture.commit;

export interface CommitThreshold {
  fraction: number;
  minPx: number;
  maxPx: number;
}

export const GESTURE = MOTION_CONSTANTS.gesture;

/** The commit distance for a surface of `size` px. */
export function commitDistance(
  threshold: CommitThreshold | CommitPreset,
  size: number,
): number {
  const { fraction, minPx, maxPx } =
    typeof threshold === 'string' ? GESTURE.commit[threshold] : threshold;
  return Math.min(maxPx, Math.max(minPx, size * fraction));
}

export type Ownership = 'pending' | 'claim' | 'reject';

/**
 * Who owns a gesture after the pointer moved `dx`/`dy` from its start: the
 * tracked axis claims it once the movement passes the slop and dominates the
 * other axis; the other axis passing the slop first rejects it, so vertical
 * page scrolling wins over a horizontal pager on an ambiguous start.
 */
export function resolveOwnership(
  axis: GestureAxis,
  dx: number,
  dy: number,
  slop: number = GESTURE.slopPx,
  dominance: number = GESTURE.axisDominance,
): Ownership {
  const along = Math.abs(axis === 'x' ? dx : dy);
  const across = Math.abs(axis === 'x' ? dy : dx);
  if (along < slop && across < slop) return 'pending';
  if (along >= slop && along > across * dominance) return 'claim';
  if (across >= slop) return 'reject';
  return 'pending';
}

/**
 * Offsets between `min` and `max` follow 1:1; beyond them the element gives
 * way with resistance, up to a maximum extra travel. Never a hard stop.
 */
export function rubberBand(
  offset: number,
  min: number,
  max: number,
  resistance: number = GESTURE.edgeResistance,
  maxTravel: number = GESTURE.edgeMaxTravelPx,
): number {
  if (offset > max)
    return max + Math.min(maxTravel, (offset - max) * resistance);
  if (offset < min)
    return min - Math.min(maxTravel, (min - offset) * resistance);
  return offset;
}

export interface ReleaseInput {
  /** Travel in the commit direction, px (positive toward commit). */
  travel: number;
  /** The furthest travel in the commit direction during the gesture. */
  peak: number;
  /** Release velocity in the commit direction, px/ms. */
  velocity: number;
  /** Commit distance, px. */
  threshold: number;
}

/**
 * Commit when the travel passes the threshold, or a fling passes the fling
 * velocity after a minimum travel. A reversal of more than the reversal slop
 * before release cancels.
 */
export function decideRelease(input: ReleaseInput): 'commit' | 'cancel' {
  if (input.peak - input.travel >= GESTURE.reversalCancelPx) return 'cancel';
  if (input.travel >= input.threshold) return 'commit';
  if (
    input.velocity > GESTURE.flingVelocityPxPerMs &&
    input.travel >= GESTURE.flingMinDistancePx
  )
    return 'commit';
  return 'cancel';
}

/** The side a gesture committed to: +1 toward larger coordinates, -1 toward smaller. */
export type CommitSide = 1 | -1;

export interface GestureFollowConfig {
  axis: GestureAxis;
  /**
   * +1 when larger coordinates commit (sheet down), -1 otherwise. `'both'`
   * commits on either side (a card swiped left or right, #2371): the travel
   * is the distance from rest, and the side is where the element is.
   */
  direction: CommitSide | 'both';
  /** The element's size along the axis, for the commit distance. */
  size: () => number;
  threshold: CommitThreshold | CommitPreset;
  /** Offsets that follow 1:1 (beyond, rubber-banding). Default `[min(0, d·∞), …]`. */
  range: () => { min: number; max: number };
  /** Where a committed gesture settles (for example the sheet height). */
  committedOffset: (side: CommitSide) => number;
  /** Decide whether a pointer may start this gesture (nested owners, buttons). */
  canStart?: (event: PointerEvent) => boolean;
  /** Runs at release, before the settle (M10). */
  onCommit?: (side: CommitSide) => void;
  onCancel?: () => void;
  /**
   * The committed settle reached its target (at once with reduced motion);
   * not called when the settle is interrupted by a new grab or `cancel()`.
   */
  onSettled?: (side: CommitSide) => void;
  /** Ownership claimed: the person is dragging (budget, M15). */
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /** Clamp a committed settle so it never bounces back past its target. */
  clampCommit?: boolean;
}

export interface GestureFollow {
  /** The current offset along the axis. */
  readonly offset: number;
  /** Cancels a running gesture and settles to rest at once. */
  cancel(): void;
  /**
   * Commits without a gesture (a visible button, a key): runs `onCommit`
   * and settles from rest to the committed offset, as a release would.
   */
  commit(side?: CommitSide): void;
  dispose(): void;
}

function translate(axis: GestureAxis, offset: number): string {
  return axis === 'x' ? `translateX(${offset}px)` : `translateY(${offset}px)`;
}

function currentOffset(element: HTMLElement, axis: GestureAxis): number {
  const transform = getComputedStyle(element).transform;
  if (
    !transform ||
    transform === 'none' ||
    typeof DOMMatrixReadOnly === 'undefined'
  )
    return 0;
  const matrix = new DOMMatrixReadOnly(transform);
  return axis === 'x' ? matrix.m41 : matrix.m42;
}

/**
 * Binds Gesture follow to `element` (it receives the pointer events and is
 * moved). Returns the controller; `dispose()` removes every listener.
 */
export function attachGestureFollow(
  element: HTMLElement,
  config: GestureFollowConfig,
): GestureFollow {
  const tracker = new VelocityTracker();
  let pointer: number | null = null;
  let startX = 0;
  let startY = 0;
  let base = 0;
  let offset = 0;
  let peak = 0;
  let ownership: Ownership = 'pending';
  let frame = 0;
  let settle: Animation | null = null;
  let beyond = false;

  const place = (value: number) => {
    element.style.transform = translate(config.axis, value);
  };

  /** The side an offset commits to; fixed unless the gesture is two-sided. */
  const sideOf = (value: number): CommitSide =>
    config.direction === 'both' ? (value < 0 ? -1 : 1) : config.direction;
  const travelOf = (value: number) => value * sideOf(value);

  const flush = () => {
    frame = 0;
    place(offset);
  };

  const schedule = () => {
    if (frame) return;
    if (typeof requestAnimationFrame === 'function')
      frame = requestAnimationFrame(flush);
    else flush();
  };

  const stopSettle = () => {
    if (!settle) return;
    // Interruption: keep the settle's current position, then stop it.
    commitAndCancel(settle);
    settle = null;
  };

  const endDrag = () => {
    if (ownership === 'claim') config.onDragEnd?.();
  };

  const settleTo = (
    target: number,
    velocity: number,
    clamp: boolean,
    committed?: CommitSide,
  ) => {
    const from = offset;
    offset = target;
    if (prefersReducedMotion() || Math.abs(from - target) < 0.5) {
      place(target);
      if (committed) config.onSettled?.(committed);
      return;
    }
    const frames = sampleSpring(from, target, velocity, undefined, clamp);
    place(target);
    settle = run(
      element,
      frames.map((value) => ({ transform: translate(config.axis, value) })),
      {
        duration: springDuration(frames),
        easing: 'linear',
        channel: 'gesture',
        willChange: 'transform',
      },
    );
    const running = settle;
    if (!running) {
      // Without a running settle (no Web Animations) the target is final.
      if (committed) config.onSettled?.(committed);
      return;
    }
    running.finished.then(
      () => {
        if (settle !== running) return;
        settle = null;
        if (committed) config.onSettled?.(committed);
      },
      () => {},
    );
  };

  const down = (event: PointerEvent) => {
    if (pointer !== null) return;
    if (event.button !== undefined && event.button > 0) return;
    if (config.canStart && !config.canStart(event)) return;
    const settling = settle !== null;
    stopSettle();
    pointer = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    base = settling ? currentOffset(element, config.axis) : offset;
    offset = base;
    if (settling) place(base);
    peak = travelOf(base);
    beyond = travelOf(base) >= commitDistance(config.threshold, config.size());
    // Grabbing a settling element continues the gesture it belongs to.
    ownership = settling ? 'claim' : 'pending';
    if (settling) config.onDragStart?.();
    tracker.reset();
    tracker.add(
      event.timeStamp,
      config.axis === 'x' ? event.clientX : event.clientY,
    );
  };

  const move = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (ownership === 'pending') {
      ownership = resolveOwnership(config.axis, dx, dy);
      if (ownership === 'reject') {
        pointer = null;
        return;
      }
      if (ownership !== 'claim') return;
      try {
        element.setPointerCapture?.(event.pointerId);
      } catch {
        // A synthetic or already released pointer cannot be captured.
      }
      config.onDragStart?.();
    }
    tracker.addEvent(event, config.axis);
    const { min, max } = config.range();
    offset = rubberBand(base + (config.axis === 'x' ? dx : dy), min, max);
    const travel = travelOf(offset);
    peak = Math.max(peak, travel);
    const past = travel >= commitDistance(config.threshold, config.size());
    if (past !== beyond) {
      beyond = past;
      haptic('threshold');
    }
    schedule();
  };

  const up = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return;
    pointer = null;
    if (frame && typeof cancelAnimationFrame === 'function')
      cancelAnimationFrame(frame);
    frame = 0;
    if (ownership !== 'claim') return;
    endDrag();
    ownership = 'pending';
    const cancelled = event.type === 'pointercancel';
    const side = sideOf(offset);
    // The release is the last sample: its time and position (Motion
    // Contract 4.6; #2073 velocity tuning).
    const finger = cancelled
      ? 0
      : tracker.velocity({
          t: event.timeStamp,
          p: config.axis === 'x' ? event.clientX : event.clientY,
        }) * side;
    // Past the edge the element moved slower than the finger.
    const { min, max } = config.range();
    const velocity =
      offset > max || offset < min ? finger * GESTURE.edgeResistance : finger;
    const decision = cancelled
      ? 'cancel'
      : decideRelease({
          travel: travelOf(offset),
          peak,
          velocity,
          threshold: commitDistance(config.threshold, config.size()),
        });
    if (decision === 'commit') {
      haptic('commit');
      config.onCommit?.(side);
      settleTo(
        config.committedOffset(side),
        velocity * side,
        config.clampCommit ?? true,
        side,
      );
    } else {
      config.onCancel?.();
      if (cancelled) {
        offset = 0;
        place(0);
      } else settleTo(0, velocity * side, false);
    }
  };

  const hide = () => {
    if (document.visibilityState === 'hidden') controller.cancel();
  };

  element.addEventListener('pointerdown', down);
  element.addEventListener('pointermove', move);
  element.addEventListener('pointerup', up);
  element.addEventListener('pointercancel', up);
  document.addEventListener('visibilitychange', hide);

  const controller: GestureFollow = {
    get offset() {
      return offset;
    },
    cancel() {
      const owned = ownership === 'claim';
      pointer = null;
      if (frame && typeof cancelAnimationFrame === 'function')
        cancelAnimationFrame(frame);
      frame = 0;
      stopSettle();
      if (owned) {
        endDrag();
        config.onCancel?.();
      }
      ownership = 'pending';
      offset = 0;
      place(0);
    },
    commit(requested) {
      if (pointer !== null) return;
      stopSettle();
      const side =
        requested ?? (config.direction === 'both' ? 1 : config.direction);
      haptic('commit');
      config.onCommit?.(side);
      settleTo(
        config.committedOffset(side),
        0,
        config.clampCommit ?? true,
        side,
      );
    },
    dispose() {
      if (frame && typeof cancelAnimationFrame === 'function')
        cancelAnimationFrame(frame);
      settle?.cancel();
      settle = null;
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', up);
      document.removeEventListener('visibilitychange', hide);
    },
  };
  return controller;
}
