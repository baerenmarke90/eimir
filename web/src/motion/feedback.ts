/**
 * Feedback primitive (Motion Contract 4.3).
 *
 * A direct response to the person's action or a confirmed result. A second
 * action interrupts and restarts the beat (M11). With reduced motion there is
 * no scale or travel; the state change itself stays visible through the
 * owner's styles and the confirmed result appears at once.
 *
 * `press` and `toggle` are CSS state transitions owned by the component
 * (`--control-pressed-scale`, token roles); `feedback()` covers the beats.
 */
import { type HapticKind, haptic } from './haptics';
import { run } from './run';
import { durationMs, easing } from './tokens';

export type FeedbackKind = 'success' | 'affection' | 'refuse';

/** The furthest a `refuse` nudge travels. */
export const REFUSE_NUDGE_PX = 4;

const HAPTIC: Record<FeedbackKind, HapticKind> = {
  success: 'success',
  affection: 'affection',
  refuse: 'refuse',
};

export interface FeedbackOptions {
  /** Also play the haptic of this kind (Motion Contract 4.10). */
  haptic?: boolean;
}

export function feedback(
  element: Element | null,
  kind: FeedbackKind,
  options: FeedbackOptions = {},
): Animation | null {
  if (options.haptic) haptic(HAPTIC[kind]);
  if (kind === 'success')
    return run(
      element,
      [
        { opacity: 0.6, transform: 'scale(0.96)' },
        { opacity: 1, transform: 'scale(1)' },
      ],
      {
        duration: durationMs('transition'),
        easing: easing('standard'),
        channel: 'feedback',
      },
    );
  if (kind === 'affection')
    return run(
      element,
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.12)', offset: 0.4 },
        { transform: 'scale(1)' },
      ],
      {
        duration: durationMs('context'),
        easing: easing('standard'),
        channel: 'feedback',
      },
    );
  return run(
    element,
    [
      { transform: 'translateX(0)' },
      { transform: `translateX(${-REFUSE_NUDGE_PX}px)`, offset: 0.25 },
      { transform: `translateX(${REFUSE_NUDGE_PX}px)`, offset: 0.75 },
      { transform: 'translateX(0)' },
    ],
    {
      duration: durationMs('context'),
      easing: easing('standard'),
      channel: 'feedback',
    },
  );
}
