/**
 * Ambient primitive (Motion Contract 4.5, M4, M7, M8).
 *
 * Quiet, finite life on an otherwise still surface:
 *
 * - runs `--motion-ambient-repeat` cycles (or `iterations`), then rests in
 *   its neutral pose (the keyframes start and end there);
 * - starts only after `after` (the surface's entrance or choreography) ended;
 * - pauses while the page or its kept view is hidden or it is off screen, and
 *   continues where it paused instead of starting over;
 * - absent with reduced motion, and stops when the preference turns on.
 *
 * Variants are keyframe sets: `breath` animates opacity, or the scale of a
 * soft halo layer (never a thin stroke, M7); `sway` a small rotate; `drift`
 * a small translate; `twinkle` opacity.
 */
import { prefersReducedMotion, subscribeReducedMotion } from './reducedMotion';
import { run } from './run';
import { type DurationRole, durationMs, easing, motionCount } from './tokens';
import { observeVisibility } from './visibility';

export type AmbientKind = 'breath' | 'sway' | 'drift' | 'twinkle';

export const AMBIENT_KEYFRAMES: Record<AmbientKind, Keyframe[]> = {
  breath: [{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }],
  sway: [
    { rotate: '0deg' },
    { rotate: '-2deg' },
    { rotate: '2deg' },
    { rotate: '0deg' },
  ],
  drift: [{ translate: '0 0' }, { translate: '0 -3px' }, { translate: '0 0' }],
  twinkle: [{ opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }],
};

export interface AmbientOptions {
  kind: AmbientKind;
  /** Custom keyframes that start and end in the neutral pose. */
  keyframes?: Keyframe[];
  /** Cycle duration role; default `connection-travel`. */
  duration?: DurationRole;
  /** Cycles; default `--motion-ambient-repeat`. Must be finite. */
  iterations?: number;
  /** Start only after this settles (an entrance's own finished signal). */
  after?: Promise<unknown>;
  /** Track on-screen visibility; default true. */
  onScreen?: boolean;
  /**
   * Milliseconds before the first cycle, once `after` settled. Negative
   * values join a breath that is already under way (a remounted member).
   */
  delay?: number;
  /** Animate a decorative pseudo-element of `element` (`::before`). */
  pseudoElement?: string;
}

export interface AmbientHandle {
  /** Resolves when the ambient motion rested or was stopped. */
  finished: Promise<void>;
  stop(): void;
}

export function ambient(
  element: Element | null,
  options: AmbientOptions,
): AmbientHandle {
  let resolveFinished: () => void = () => {};
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });
  const cleanups: Array<() => void> = [];
  let animation: Animation | null = null;
  let stopped = false;
  let visible = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    animation?.cancel();
    animation = null;
    for (const cleanup of cleanups.splice(0)) cleanup();
    resolveFinished();
  };

  const iterations = options.iterations ?? motionCount('ambient-repeat');
  const cycle = durationMs(options.duration ?? 'connection-travel');
  if (
    !element ||
    prefersReducedMotion() ||
    !Number.isFinite(iterations) ||
    iterations <= 0 ||
    cycle <= 0
  ) {
    stop();
    return { finished, stop };
  }

  const begin = () => {
    if (stopped) return;
    animation = run(
      element,
      options.keyframes ?? AMBIENT_KEYFRAMES[options.kind],
      {
        duration: cycle,
        easing: easing('travel'),
        iterations,
        delay: options.delay ?? 0,
        fill: 'none',
        channel: 'ambient',
        pseudoElement: options.pseudoElement,
      },
    );
    if (!animation) {
      stop();
      return;
    }
    if (!visible) animation.pause();
    animation.finished.then(stop, stop);
    cleanups.push(
      observeVisibility(
        element,
        (state) => {
          visible = state.visible;
          if (!animation) return;
          if (state.visible && animation.playState === 'paused')
            animation.play();
          else if (!state.visible && animation.playState === 'running')
            animation.pause();
        },
        { onScreen: options.onScreen ?? true },
      ),
    );
  };

  cleanups.push(
    subscribeReducedMotion(() => {
      if (prefersReducedMotion()) stop();
    }),
  );
  visible = true;
  if (options.after) options.after.then(begin, begin);
  else begin();
  return { finished, stop };
}
