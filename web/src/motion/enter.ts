/**
 * Enter primitive (Motion Contract 4.1).
 *
 * `useEnter(identity, options)` returns the attributes that apply a variant
 * from the CSS catalogue (`motion.css`) to one element, and removes them as
 * soon as the entrance ended on its own clock (M2): its own `animationend`
 * or `animationcancel`, or the deadline computed from its tokens when it
 * started. Because the applying attribute is gone afterwards, a kept tab that
 * is shown again (`display: none` → shown) cannot restart it (M4).
 *
 * - Plays at most once per identity and play scope (M3). The first render of
 *   a remounted element with an identity that already played carries no
 *   attribute, so it shows its final state in the same frame (M5).
 * - An element that is not visible when it would start (hidden kept view,
 *   hidden page, off screen) shows its final state, unless `firstReach` holds
 *   the entrance until it is first on screen (M12).
 * - With reduced motion it shows the final state at once (M9).
 * - A member of a choreography aligns to the shared clock: a late or
 *   remounted member starts part-way through, and one whose slot passed
 *   shows its final state (M15).
 * - Counts against the screen budget's element cap; beyond it, final state.
 *
 * Motion state never decides whether content exists: the element and its
 * content render in every state.
 */
import {
  type CSSProperties,
  type RefCallback,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import './motion.css';
import { type ScreenBudget, screenBudget } from './budget';
import type { Choreography } from './choreography';
import {
  claimPlay,
  hasPlayed,
  markPlayed,
  type PlayScope,
  type SurfaceScope,
} from './playRegistry';
import { prefersReducedMotion } from './reducedMotion';
import { durationMs, motionCount } from './tokens';
import { isVisibleNow, observeVisibility } from './visibility';

export type EnterVariant =
  | 'fade'
  | 'rise'
  | 'surface'
  | 'stage'
  | 'stagger'
  | 'draw'
  | 'media';

export type EnterState = 'pending' | 'playing' | 'played';

/** A few frames past the computed end, so the animation event wins. */
const DEADLINE_SLACK_MS = 50;

/** Default play scope per variant (Motion Contract 4.1, "Replays"). */
export const ENTER_DEFAULT_SCOPE: Record<EnterVariant, PlayScope> = {
  fade: 'session',
  rise: 'session',
  surface: 'surface',
  stage: 'app-start',
  stagger: 'session',
  draw: 'session',
  media: 'session',
};

export interface EnterOptions {
  variant: EnterVariant;
  scope?: PlayScope;
  /** Required for the `surface` scope. */
  surface?: SurfaceScope;
  /** Hold the entrance until the element is first on screen. */
  firstReach?: boolean;
  /** Share one clock with other members (stage, modules). */
  choreography?: Choreography;
  /** The member's start in the choreography, in ms. */
  offset?: number;
  /** Sibling position for `stagger`. */
  index?: number;
  /** Which stagger step to use: siblings (`item`) or modules (`module`). */
  step?: 'item' | 'module';
  /** Override the element's own duration (for the deadline). */
  duration?: number;
  /** Do not play (for example a bulk change). */
  disabled?: boolean;
  budget?: ScreenBudget;
}

export interface EnterBinding<T extends Element> {
  ref: RefCallback<T>;
  props: {
    'data-motion-enter'?: EnterVariant;
    'data-motion-state'?: 'pending';
    style?: CSSProperties;
  };
  state: EnterState;
}

/** The variant's own duration role (Motion Contract 4.1, "Duration"). */
export function enterDuration(variant: EnterVariant): number {
  if (variant === 'media') return durationMs('transition');
  if (variant === 'stage') return durationMs('sequence-beat');
  if (variant === 'draw') return durationMs('connection-draw');
  return durationMs('context');
}

/**
 * The delay of sibling `index` in a stagger: items after the cap arrive
 * together with the last staggered one.
 */
export function staggerDelay(
  index: number,
  step: 'item' | 'module' = 'item',
): number {
  const cap = Math.max(1, motionCount('stagger-max-items'));
  const stepMs = durationMs(
    step === 'module' ? 'stagger-module' : 'stagger-item',
  );
  return Math.min(Math.max(0, index), cap - 1) * stepMs;
}

interface Plan {
  state: EnterState;
  delay: number;
  duration: number;
}

function plan(identity: string, options: EnterOptions, owner: object): Plan {
  const scope = options.scope ?? ENTER_DEFAULT_SCOPE[options.variant];
  const duration = options.duration ?? enterDuration(options.variant);
  const final: Plan = { state: 'played', delay: 0, duration };
  if (options.disabled || prefersReducedMotion() || duration <= 0) return final;
  if (
    hasPlayed(identity, scope, options.surface) &&
    !claimPlay(identity, scope, owner, options.surface)
  )
    return final;
  let delay =
    options.index !== undefined ? staggerDelay(options.index, options.step) : 0;
  if (options.choreography) {
    const timing = options.choreography.timing({
      offset: (options.offset ?? 0) + delay,
      duration,
    });
    if (timing.kind === 'final') return final;
    delay = timing.delay;
  }
  return { state: options.firstReach ? 'pending' : 'playing', delay, duration };
}

export function useEnter<T extends Element = HTMLElement>(
  identity: string,
  options: EnterOptions,
): EnterBinding<T> {
  const owner = useRef<object>({});
  const [initial] = useState(() => plan(identity, options, owner.current));
  const [state, setState] = useState<EnterState>(initial.state);
  const element = useRef<T | null>(null);
  const reservation = useRef(0);
  const scope = options.scope ?? ENTER_DEFAULT_SCOPE[options.variant];
  const budget = options.budget ?? screenBudget();
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const finish = useCallback(() => {
    if (reservation.current > 0) {
      budget.releaseElements(reservation.current);
      reservation.current = 0;
    }
    markPlayed(identity, scope, optionsRef.current.surface);
    setState('played');
  }, [budget, identity, scope]);

  // Decide before the first paint: an element that cannot be seen, or that
  // has no room in the budget, shows its final state instead of a frame at
  // its starting pose.
  useLayoutEffect(() => {
    if (state !== 'playing' && state !== 'pending') return;
    const node = element.current;
    if (!node) return;
    if (
      !claimPlay(identity, scope, owner.current, optionsRef.current.surface)
    ) {
      finish();
      return;
    }
    if (state === 'pending') {
      return observeVisibility(node, (visibility) => {
        if (!visibility.visible) return;
        if (reservation.current === 0 && budget.reserveElements(1) === 0) {
          finish();
          return;
        }
        reservation.current = 1;
        setState('playing');
      });
    }
    const visibility = isVisibleNow(node);
    if (!visibility.visible) {
      finish();
      return;
    }
    if (reservation.current === 0) {
      if (budget.reserveElements(1) === 0) {
        finish();
        return;
      }
      reservation.current = 1;
    }
    // Own clock: the element's own animationend or animationcancel (a kept
    // tab hidden mid-entrance cancels it), or the deadline computed from the
    // tokens when it started, in case no animation event arrives.
    const own = (event: Event) => {
      if (event.target === node) finish();
    };
    node.addEventListener('animationend', own);
    node.addEventListener('animationcancel', own);
    const deadline = setTimeout(
      finish,
      Math.max(0, initial.delay) + initial.duration + DEADLINE_SLACK_MS,
    );
    return () => {
      clearTimeout(deadline);
      node.removeEventListener('animationend', own);
      node.removeEventListener('animationcancel', own);
    };
  }, [budget, finish, identity, initial, scope, state]);

  useLayoutEffect(
    () => () => {
      if (reservation.current > 0) budget.releaseElements(reservation.current);
      reservation.current = 0;
    },
    [budget],
  );

  // A new element for the same identity (a `span` that becomes a `button`)
  // shows its final state in the same frame instead of restarting (M5).
  const lastNode = useRef<T | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const ref = useCallback(
    (node: T | null) => {
      element.current = node;
      if (!node) return;
      const previous = lastNode.current;
      lastNode.current = node;
      if (previous && previous !== node && stateRef.current !== 'played')
        finish();
    },
    [finish],
  );

  if (state === 'played') return { ref, props: {}, state };
  return {
    ref,
    state,
    props: {
      'data-motion-enter': options.variant,
      ...(state === 'pending'
        ? { 'data-motion-state': 'pending' as const }
        : {}),
      style: {
        '--motion-enter-delay': `${Math.round(initial.delay)}ms`,
      } as CSSProperties,
    },
  };
}
