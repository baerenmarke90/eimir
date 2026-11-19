/**
 * Keeps the Wir heart line on one clock.
 *
 * The hero can remount as the daily check-in and partner actions arrive.
 * Align the replacement CSS animations so the bridge keeps drawing from the
 * same point and settles once. The general mechanism is the motion layer's
 * choreography clock (Motion Contract M15); Wir moves onto it in #2074.
 */
import { alignCssAnimations } from '../motion/choreography';

const WIR_INTRO_ANIMATION_PREFIX = 'wir-intro-';

export function alignWirIntroAnimations(
  root: Element | null,
  startedAt: number | null,
): void {
  alignCssAnimations(root, startedAt, WIR_INTRO_ANIMATION_PREFIX);
}
