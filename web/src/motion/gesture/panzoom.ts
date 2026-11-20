/**
 * The motion layer's wrapper for `@panzoom/panzoom` (Motion Contract 4.6,
 * #2076).
 *
 * Pinch, pan and wheel zoom follow the finger 1:1: the library writes the
 * `transform` directly on every move, which is Gesture follow tracking.
 * Programmatic steps (the zoom buttons, double-tap, the keyboard and a
 * reset) are instant, the same result as a reduced-motion settle, so photo
 * zoom never waits for an animation. The token roles are still passed, so
 * any later animated call uses `--duration-transition` and
 * `--easing-standard` instead of the library's 200 ms `ease-in-out`.
 */
import { durationMs, easing } from '../tokens';

export function panzoomMotionOptions(): {
  animate: false;
  duration: number;
  easing: string;
} {
  return {
    animate: false,
    duration: durationMs('transition'),
    easing: easing('standard') || 'linear',
  };
}
