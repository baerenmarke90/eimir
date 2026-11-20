/**
 * Enter `stage`: a staged opening of several beats on one element tree
 * (Motion Contract 4.1, M2, M3, M4, M5, M12, M15).
 *
 * The stage root carries `data-motion-stage="playing"` while the opening
 * runs. Its members are animated by descendant rules that name the
 * catalogue's `eimir-motion-stage-*` keyframes (`motion.css`); the feature
 * passes its beats as CSS options (delays and durations from token roles).
 *
 * - Plays at most once per app start (`app-start` scope). The first time the
 *   root is considered decides: it plays only when it is visible (page, kept
 *   view, on screen) and `canStart` agrees. Otherwise it is recorded as
 *   played and every later mount shows the final state.
 * - All members share the choreography clock of the identity: a member or a
 *   whole subtree that remounts mid-opening (a `span` that becomes a
 *   `button`) is pinned to the same start time, so it continues from the
 *   same point instead of starting over (M5, M15).
 * - Ends on its own clock: the deadline computed from the tokens when it
 *   started (M2), never at a later render. The attribute is removed then, so
 *   a kept tab that is shown again cannot restart the CSS animations (M4).
 * - A root that is hidden while the opening runs (kept view, page) ends the
 *   opening at once; showing it again shows the final state (M12).
 * - With reduced motion (all durations `0ms`) it never plays (M9).
 *
 * `stageFinished(identity)` resolves when the opening ended or was skipped;
 * ambient motion and a Moment start only after it (M15).
 */
import { type RefObject, useLayoutEffect, useRef } from 'react';
import './motion.css';
import { alignCssAnimations, choreography, now } from './choreography';
import { hasPlayed, markPlayed } from './playRegistry';
import { prefersReducedMotion } from './reducedMotion';
import { isVisibleNow, observeVisibility } from './visibility';

export const STAGE_ANIMATION_PREFIX = 'eimir-motion-stage-';
export const STAGE_ATTRIBUTE = 'data-motion-stage';

export interface StageOptions {
  /** The whole opening's length in ms, computed from token roles. */
  duration: number;
  /** An extra condition for the first consideration. */
  canStart?: (root: Element) => boolean;
  /**
   * The keyframe prefix of this stage's members, pinned to its clock.
   * Default `eimir-motion-stage-`. A stage that contains another stage (the
   * root-tab entrance around the Wir opening) uses its own prefix, so it never
   * re-pins the inner stage's members.
   */
  animationPrefix?: string;
}

interface StageRecord {
  ended: boolean;
  finished: Promise<void>;
  resolve: () => void;
}

const records = new Map<string, StageRecord>();

function record(identity: string): StageRecord {
  let found = records.get(identity);
  if (!found) {
    let resolve: () => void = () => {};
    const finished = new Promise<void>((done) => {
      resolve = done;
    });
    found = { ended: false, finished, resolve };
    records.set(identity, found);
  }
  return found;
}

function end(identity: string): void {
  const found = record(identity);
  if (found.ended) return;
  found.ended = true;
  found.resolve();
}

/** Resolves once the opening of `identity` ended or was skipped. */
export function stageFinished(identity: string): Promise<void> {
  return record(identity).finished;
}

/** True while the opening of `identity` is under way. */
export function stagePlaying(identity: string, duration: number): boolean {
  const clock = choreography(identity, 'app-start');
  const found = records.get(identity);
  return (
    clock.startTime !== null &&
    !found?.ended &&
    now() - clock.startTime < duration
  );
}

function consider(identity: string, root: Element, options: StageOptions) {
  if (hasPlayed(identity, 'app-start')) return;
  markPlayed(identity, 'app-start');
  const canPlay =
    options.duration > 0 &&
    !prefersReducedMotion() &&
    isVisibleNow(root).visible &&
    (options.canStart?.(root) ?? true);
  if (canPlay) choreography(identity, 'app-start').start(now());
  else end(identity);
}

export function useStage<T extends HTMLElement>(
  identity: string,
  options: StageOptions,
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Runs after every render: members that mounted late join the clock.
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const { duration, animationPrefix = STAGE_ANIMATION_PREFIX } =
      optionsRef.current;
    consider(identity, root, optionsRef.current);
    const clock = choreography(identity, 'app-start');
    const start = clock.startTime;
    if (start === null || !stagePlaying(identity, duration)) {
      root.removeAttribute(STAGE_ATTRIBUTE);
      if (start !== null) end(identity);
      return;
    }
    root.setAttribute(STAGE_ATTRIBUTE, 'playing');
    alignCssAnimations(root, start, animationPrefix);
    const finish = () => {
      root.removeAttribute(STAGE_ATTRIBUTE);
      end(identity);
    };
    const deadline = setTimeout(finish, start + duration - now());
    const stopWatching = observeVisibility(
      root,
      (state) => {
        if (!state.visible) finish();
      },
      { onScreen: false },
    );
    return () => {
      clearTimeout(deadline);
      stopWatching();
    };
  });

  return ref;
}

/** Test support. */
export function resetStagesForTests(): void {
  records.clear();
}
