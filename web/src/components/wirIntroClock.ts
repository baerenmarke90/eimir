/**
 * Keeps the Wir opening sequence on one clock.
 *
 * The hero's intro is pure CSS, and a CSS animation starts when its element
 * mounts. During start-up the hero can remount while data settles (the space
 * configuration enables the partner actions, the daily check-in splits the
 * avatar pair into two tap targets), which would replay the sequence from the
 * beginning: the portraits vanish and fade in again. Pinning every intro
 * animation to the moment the intro started lets a late element join the
 * sequence where it currently is, or appear in its final state once the
 * sequence is over.
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
