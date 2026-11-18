/**
 * Keeps the Wir heart line on one clock.
 *
 * The hero can remount as the daily check-in and partner actions arrive.
 * Align the replacement CSS animations so the bridge keeps drawing from the
 * same point and settles once.
 */
const WIR_INTRO_ANIMATION_PREFIX = 'wir-intro-';

export function alignWirIntroAnimations(
  root: Element | null,
  startedAt: number | null,
): void {
  if (!root || startedAt === null || typeof root.getAnimations !== 'function') {
    return;
  }
  for (const animation of root.getAnimations({ subtree: true })) {
    const name = (animation as Partial<CSSAnimation>).animationName;
    if (
      typeof name === 'string' &&
      name.startsWith(WIR_INTRO_ANIMATION_PREFIX) &&
      animation.startTime !== startedAt
    ) {
      // Document timeline time shares its origin with performance.now().
      animation.startTime = startedAt;
    }
  }
}
