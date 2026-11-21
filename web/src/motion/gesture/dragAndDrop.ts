/**
 * The motion layer's wrapper for `@dnd-kit` (Motion Contract 4.6, #2076).
 *
 * `@dnd-kit` owns pointer, touch and keyboard dragging of the photo
 * arrangement; the dragged tile follows the finger 1:1 and the library
 * animates the sibling shift and the drop. This wrapper gives those
 * animations the layer's token roles instead of the library defaults
 * (250 ms `ease`, 300 ms for sorting) and turns them off with reduced
 * motion, so the drop is instant there. Feature code passes these options
 * and never reads the reduced-motion query itself (M9).
 */
import { haptic } from '../haptics';
import { prefersReducedMotion } from '../reducedMotion';
import { durationMs, easing } from '../tokens';

export interface DragTiming {
  duration: number;
  easing: string;
}

/** Settle timing for a moved item; `null` means instant. */
export function dragSettleTiming(): DragTiming | null {
  const duration = durationMs('transition');
  const curve = easing('standard');
  if (prefersReducedMotion() || duration <= 0 || !curve) return null;
  return { duration, easing: curve };
}

/** Options for `useSortable({ transition })`: the siblings' shift. */
export function sortableTransition(): DragTiming | null {
  return dragSettleTiming();
}

/** Options for `Feedback.configure()`: the drop and the keyboard move. */
export function dragFeedbackMotion(): {
  dropAnimation: DragTiming | null;
  keyboardTransition: DragTiming | null;
} {
  const timing = dragSettleTiming();
  return { dropAnimation: timing, keyboardTransition: timing };
}

/** A drag that changed the order was committed (one haptic, 4.10). */
export function dragCommitted(moved: boolean): void {
  if (moved) haptic('commit');
}
