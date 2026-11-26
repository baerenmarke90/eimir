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
 * - Data hold (#2147): with `hold`, an opening whose root is visible first
 *   waits, invisibly (`data-motion-stage="waiting"`), while members still
 *   load their data (`useStageHold`), for at most `hold` ms. It then plays
 *   once with whatever is there. The hold is a wait for data, not motion, so
 *   it also applies with reduced motion: late data then never moves a layout
 *   that is already shown.
 * - All members share the choreography clock of the identity: a member or a
 *   whole subtree that mounts or remounts mid-opening (a `span` that becomes
 *   a `button`) is pinned to the same start time, so it continues from the
 *   same point instead of starting over (M5, M15). A member marked with
 *   `data-motion-join` carries late data instead: if it mounts after its slot
 *   began, it plays in what is left of the opening (at least
 *   `--duration-transition`, ending with the opening) or else shows its final
 *   state. Nothing a stage plays ends after the stage.
 * - `scope` widens the stage to an ancestor (Wir: the page content, so the
 *   quote and the modules below the hero share its clock). The scope carries
 *   the same state in `data-motion-stage-scope`.
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
import {
  createContext,
  type RefObject,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import './motion.css';
import { choreography, now } from './choreography';
import { hasPlayed, markPlayed } from './playRegistry';
import { prefersReducedMotion } from './reducedMotion';
import { durationMs } from './tokens';
import { isVisibleNow, observeVisibility } from './visibility';

export const STAGE_ANIMATION_PREFIX = 'eimir-motion-stage-';
export const STAGE_ATTRIBUTE = 'data-motion-stage';
/** The stage state on the wider `scope` element. */
export const STAGE_SCOPE_ATTRIBUTE = 'data-motion-stage-scope';
/** Marks a member that carries late data and may join a running stage. */
export const STAGE_JOIN_ATTRIBUTE = 'data-motion-join';

export type StagePhase = 'idle' | 'waiting' | 'playing' | 'ended';

/**
 * The identity of the stage a subtree belongs to, so a shared component (a
 * portrait) can hold the opening for its data without knowing the feature.
 */
export const StageContext = createContext<string | null>(null);

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
  /** The longest wait, in ms, for members that still load (`useStageHold`). */
  hold?: number;
  /** An ancestor that belongs to the stage too (it shares the clock). */
  scope?: (root: Element) => Element | null;
}

interface StageRecord {
  phase: StagePhase;
  finished: Promise<void>;
  resolve: () => void;
  root: Element | null;
  options: StageOptions | null;
  holdTimer: ReturnType<typeof setTimeout> | null;
  /** Detaches the running opening's deadline and observers. */
  detach: (() => void) | null;
  /** Late members already placed on the clock. */
  placed: WeakSet<Animation>;
  /** The pending placement of late members, at most one per frame. */
  placeFrame: number | null;
}

const records = new Map<string, StageRecord>();
const holds = new Map<string, Set<object>>();
const listeners = new Map<string, Set<() => void>>();

function record(identity: string): StageRecord {
  let found = records.get(identity);
  if (!found) {
    let resolve: () => void = () => {};
    const finished = new Promise<void>((done) => {
      resolve = done;
    });
    found = {
      phase: 'idle',
      finished,
      resolve,
      root: null,
      options: null,
      holdTimer: null,
      detach: null,
      placed: new WeakSet(),
      placeFrame: null,
    };
    records.set(identity, found);
  }
  return found;
}

/** Listeners for a phase change of any stage. */
const anyPhase = new Set<() => void>();

function notify(identity: string): void {
  for (const listener of listeners.get(identity) ?? []) listener();
  for (const listener of [...anyPhase]) listener();
}

/** Resolves the first time `ready()` holds, checked on every phase change. */
function whenStages(ready: () => boolean): Promise<void> {
  if (ready()) return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if (!ready()) return;
      anyPhase.delete(check);
      resolve();
    };
    anyPhase.add(check);
  });
}

function setPhase(identity: string, phase: StagePhase): void {
  const found = record(identity);
  if (found.phase === phase) return;
  found.phase = phase;
  notify(identity);
}

function scopeOf(found: StageRecord): Element | null {
  const root = found.root;
  if (!root) return null;
  return found.options?.scope?.(root) ?? root;
}

function paint(found: StageRecord, state: 'waiting' | 'playing' | null): void {
  const root = found.root;
  if (!root) return;
  const scope = scopeOf(found);
  if (state) root.setAttribute(STAGE_ATTRIBUTE, state);
  else root.removeAttribute(STAGE_ATTRIBUTE);
  if (scope && scope !== root) {
    if (state) scope.setAttribute(STAGE_SCOPE_ATTRIBUTE, state);
    else scope.removeAttribute(STAGE_SCOPE_ATTRIBUTE);
  }
}

function end(identity: string): void {
  const found = record(identity);
  if (found.holdTimer !== null) clearTimeout(found.holdTimer);
  found.holdTimer = null;
  found.detach?.();
  found.detach = null;
  paint(found, null);
  if (found.phase === 'ended') return;
  setPhase(identity, 'ended');
  found.resolve();
}

/** Resolves once the opening of `identity` ended or was skipped. */
export function stageFinished(identity: string): Promise<void> {
  return record(identity).finished;
}

/**
 * Resolves once no opening waits for data or plays. Background work (building
 * a neighbouring tab) waits for it, so it never competes with an opening.
 */
/**
 * Resolves once an opening has begun (or was skipped) and none waits for its
 * data any more: the shown page has its data, and network reads for another
 * page no longer delay it.
 */
export function stagesReleased(): Promise<void> {
  return whenStages(() => {
    const phases = [...records.values()].map((found) => found.phase);
    return (
      phases.some((phase) => phase === 'playing' || phase === 'ended') &&
      !phases.includes('waiting')
    );
  });
}

export async function stagesSettled(): Promise<void> {
  for (;;) {
    const open = [...records.values()].filter(
      (found) => found.phase === 'waiting' || found.phase === 'playing',
    );
    if (!open.length) return;
    await Promise.all(open.map((found) => found.finished));
  }
}

/** The opening's phase: not yet considered, waiting for data, playing, ended. */
export function stagePhase(identity: string): StagePhase {
  return records.get(identity)?.phase ?? 'idle';
}

/** The opening's start time (document timeline), once it plays. */
export function stageStartTime(identity: string): number | null {
  if (stagePhase(identity) === 'idle') return null;
  return choreography(identity, 'app-start').startTime;
}

/** The running opening's own length in ms (0 before it plays). */
export function stageDuration(identity: string): number {
  return records.get(identity)?.options?.duration ?? 0;
}

/** Calls `listener` whenever the phase of `identity` changes. */
export function subscribeStage(
  identity: string,
  listener: () => void,
): () => void {
  let set = listeners.get(identity);
  if (!set) {
    set = new Set();
    listeners.set(identity, set);
  }
  set.add(listener);
  return () => set.delete(listener);
}

/** The phase of `identity`, re-rendering when it changes. */
export function useStagePhase(identity: string): StagePhase {
  return useSyncExternalStore(
    (listener) => subscribeStage(identity, listener),
    () => stagePhase(identity),
    () => 'idle',
  );
}

/** True while the opening of `identity` is under way. */
export function stagePlaying(identity: string, duration: number): boolean {
  const clock = choreography(identity, 'app-start');
  return (
    clock.startTime !== null &&
    stagePhase(identity) === 'playing' &&
    now() - clock.startTime < duration
  );
}

/**
 * Places the stage animations under the scope on the clock: a member that
 * mounted before its slot, or one that remounted, is pinned to the start
 * time (M5, M15); a late `data-motion-join` member plays in the time that is
 * left, or shows its final state when too little is left.
 */
function placeMembers(found: StageRecord, start: number): void {
  const scope = scopeOf(found);
  const options = found.options;
  if (!scope || !options || typeof scope.getAnimations !== 'function') return;
  const prefix = options.animationPrefix ?? STAGE_ANIMATION_PREFIX;
  const stageEnd = start + options.duration;
  const minimum = durationMs('transition');
  const at = now();
  for (const animation of scope.getAnimations({ subtree: true })) {
    const name = (animation as Partial<CSSAnimation>).animationName;
    if (typeof name !== 'string' || !name.startsWith(prefix)) continue;
    if (found.placed.has(animation)) continue;
    found.placed.add(animation);
    const effect = animation.effect as KeyframeEffect | null;
    const target = effect?.target;
    const timing = effect?.getTiming();
    const delay = Number(timing?.delay ?? 0);
    const length = Number(timing?.duration);
    const joins = Boolean(target?.closest(`[${STAGE_JOIN_ATTRIBUTE}]`));
    if (!joins || !Number.isFinite(length) || at <= start + delay) {
      animation.startTime = start;
      continue;
    }
    const left = stageEnd - at;
    if (left < minimum || !effect) {
      animation.finish();
      continue;
    }
    effect.updateTiming({ delay: 0, duration: Math.min(length, left) });
    animation.startTime = at;
  }
}

/** Starts the opening (or skips it) and attaches its own clock. */
function play(identity: string): void {
  const found = record(identity);
  if (found.holdTimer !== null) clearTimeout(found.holdTimer);
  found.holdTimer = null;
  const root = found.root;
  const options = found.options;
  if (!root || !options) {
    end(identity);
    return;
  }
  const canPlay =
    options.duration > 0 &&
    !prefersReducedMotion() &&
    isVisibleNow(root).visible &&
    (options.canStart?.(root) ?? true);
  if (!canPlay) {
    end(identity);
    return;
  }
  const start = choreography(identity, 'app-start').start(now());
  setPhase(identity, 'playing');
  attach(identity, start);
}

/** (Re)attaches the running opening to the current root. */
function attach(identity: string, start: number): void {
  const found = record(identity);
  const root = found.root;
  const options = found.options;
  found.detach?.();
  found.detach = null;
  if (!root || !options) return;
  if (now() - start >= options.duration) {
    end(identity);
    return;
  }
  paint(found, 'playing');
  placeMembers(found, start);
  const deadline = setTimeout(
    () => end(identity),
    start + options.duration - now(),
  );
  const stopWatching = observeVisibility(
    root,
    (state) => {
      // A root that was replaced (a remount) no longer speaks for the stage.
      if (!state.visible && found.root === root && root.isConnected)
        end(identity);
    },
    { onScreen: false },
  );
  // Members that mount with late data (a value, a photo, a quote) join the
  // clock in the same frame, without a render of the stage's own component.
  const scope = scopeOf(found);
  const mutations =
    scope && typeof MutationObserver !== 'undefined'
      ? new MutationObserver(() => schedulePlacement(found, start))
      : null;
  if (scope)
    mutations?.observe(scope, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  found.detach = () => {
    clearTimeout(deadline);
    stopWatching();
    mutations?.disconnect();
    cancelPlacement(found);
  };
}

function holdsPending(identity: string): boolean {
  return (holds.get(identity)?.size ?? 0) > 0;
}

/** Releases a waiting opening once its last hold is gone. */
function checkHold(identity: string): void {
  if (stagePhase(identity) !== 'waiting') return;
  // Members that register in the same commit (later siblings) count too.
  queueMicrotask(() => {
    if (stagePhase(identity) === 'waiting' && !holdsPending(identity))
      play(identity);
  });
}

/** The first consideration: wait for data, or play (or skip) at once. */
function arm(identity: string): void {
  const found = record(identity);
  const root = found.root;
  const options = found.options;
  if (!root || !options) return;
  if (hasPlayed(identity, 'app-start')) {
    end(identity);
    return;
  }
  markPlayed(identity, 'app-start');
  const hold = options.hold ?? 0;
  const mayWait =
    hold > 0 &&
    isVisibleNow(root).visible &&
    (options.canStart?.(root) ?? true);
  if (!mayWait) {
    play(identity);
    return;
  }
  setPhase(identity, 'waiting');
  paint(found, 'waiting');
  found.holdTimer = setTimeout(() => play(identity), hold);
  checkHold(identity);
}

/**
 * Keeps the opening of `identity` waiting while `pending` (a member still
 * loads the data it shows). Has no effect once the opening started, or for an
 * opening that has no `hold`.
 */
export function useStageHold(identity: string, pending: boolean): void {
  useLayoutEffect(() => {
    if (!pending) return;
    const token = {};
    let set = holds.get(identity);
    if (!set) {
      set = new Set();
      holds.set(identity, set);
    }
    set.add(token);
    return () => {
      set.delete(token);
      checkHold(identity);
    };
  }, [identity, pending]);
}

/**
 * Places late members once per frame, in the frame's animation callbacks
 * (before its style, layout and paint, so a member never paints off the
 * clock). Several renders and mutations of one frame need one placement:
 * each `getAnimations({ subtree: true })` recalculates style for the scope.
 */
function schedulePlacement(found: StageRecord, start: number): void {
  if (found.placeFrame !== null || typeof requestAnimationFrame !== 'function')
    return;
  found.placeFrame = requestAnimationFrame(() => {
    found.placeFrame = null;
    if (found.phase === 'playing') placeMembers(found, start);
  });
}

function cancelPlacement(found: StageRecord): void {
  if (found.placeFrame === null) return;
  cancelAnimationFrame(found.placeFrame);
  found.placeFrame = null;
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
    const found = record(identity);
    const rootChanged = found.root !== root;
    found.root = root;
    found.options = optionsRef.current;
    switch (found.phase) {
      case 'idle':
        arm(identity);
        return;
      case 'waiting':
        paint(found, 'waiting');
        return;
      case 'playing': {
        const start = choreography(identity, 'app-start').startTime;
        if (
          start === null ||
          !stagePlaying(identity, optionsRef.current.duration)
        ) {
          end(identity);
          return;
        }
        if (rootChanged || !found.detach) attach(identity, start);
        else {
          paint(found, 'playing');
          schedulePlacement(found, start);
        }
        return;
      }
      default:
        paint(found, null);
    }
  });

  return ref;
}

/** Test support. */
export function resetStagesForTests(): void {
  for (const found of records.values()) {
    if (found.holdTimer !== null) clearTimeout(found.holdTimer);
    found.detach?.();
  }
  records.clear();
  holds.clear();
  listeners.clear();
  anyPhase.clear();
}
