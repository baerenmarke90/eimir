/**
 * Replace / Exit primitive (Motion Contract 4.2).
 *
 * Presence (`usePresentationPresence`) and departures (`useDepartingItems`)
 * live in `presence.ts` and `departing.ts`. This module holds the clock
 * variants that act on one element or a measured group:
 *
 * - `crossfade`: the new content fades in over the old (opacity);
 * - `navigate`: forward/back from the inline end, lateral like a pager,
 *   in-place as a crossfade; mirrored in right-to-left layouts;
 * - `value`: a changed number or short label, with a small vertical move;
 * - `disclose`: revealed content arrives with a fade (preference 1); the
 *   one sanctioned size transition stays a CSS transition in its owner;
 * - `reorder` / `collapse-gap`: FLIP with `translate` only;
 * - `scroll-state`: a scroll position mapped to a state with hysteresis;
 * - `appearance`: never a motion (theme changes are a root transition in
 *   `theme.css`; the token adapter re-reads roles on the next call).
 *
 * Every variant ends on its own clock and returns null when it shows the
 * final state at once (reduced motion, missing roles, bulk change).
 */
import { MAX_ANIMATED_ELEMENTS } from './budget';
import { run } from './run';
import { durationMs, easing } from './tokens';

/** The furthest a `navigate` entrance travels (Motion Contract 4.2). */
export const NAVIGATE_TRAVEL_PX = 32;
/** The furthest a `value` change travels. */
export const VALUE_TRAVEL_PX = 8;

export type NavigateDirection =
  | 'forward'
  | 'back'
  | 'next'
  | 'previous'
  | 'in-place';

function isRtl(element: Element): boolean {
  try {
    return getComputedStyle(element).direction === 'rtl';
  } catch {
    return false;
  }
}

export interface CrossfadeOptions {
  /** The opacity the new content starts from (default `0`). */
  from?: number;
}

/** The new content fades in over the old. */
export function crossfade(
  element: Element | null,
  options: CrossfadeOptions = {},
): Animation | null {
  return run(element, [{ opacity: options.from ?? 0 }, { opacity: 1 }], {
    duration: durationMs('transition'),
    easing: easing('standard'),
    channel: 'opacity',
  });
}

export interface NavigateOptions {
  /**
   * How the entrance travels:
   *
   * - `transform` (default): opacity and `translateX` on the element;
   * - `slide`: translation only. Primary pages have a separate content fade
   *   and keep their floating action outside the moving page.
   * - `inset`: only the horizontal offset, as `left` on a positioned
   *   element. This is for the routed page in the app shell: a transform
   *   would make the page the containing block of its fixed controls (the
   *   floating create action, the composer toolbar), which would then travel
   *   with the page and jump when it settles. It is the one sanctioned
   *   offset animation of `navigate` (Motion Contract 4.2, M6). The shell
   *   fades its content separately (`crossfade` with `from`).
   */
  offset?: 'transform' | 'slide' | 'inset';
}

/**
 * The signed horizontal distance a `navigate` entrance starts from: the
 * inline end for forward and next, the inline start for back and previous,
 * mirrored in right-to-left layouts; `0` in place.
 */
export function navigateTravel(
  element: Element,
  direction: NavigateDirection,
): number {
  if (direction === 'in-place') return 0;
  const fromEnd = direction === 'forward' || direction === 'next';
  return (fromEnd ? 1 : -1) * (isRtl(element) ? -1 : 1) * NAVIGATE_TRAVEL_PX;
}

/**
 * Brings `element` (the new content) in for a navigation. Navigation never
 * waits for this (M10).
 */
export function navigate(
  element: Element | null,
  direction: NavigateDirection,
  options: NavigateOptions = {},
): Animation | null {
  if (!element) return null;
  if (direction === 'in-place') return crossfade(element);
  const travel = navigateTravel(element, direction);
  if (options.offset === 'inset')
    return run(element, [{ left: `${travel}px` }, { left: '0px' }], {
      duration: durationMs('transition'),
      easing: easing('standard'),
      channel: 'navigate',
    });
  if (options.offset === 'slide')
    return run(
      element,
      [
        { transform: `translate3d(${travel}px, 0, 0)` },
        { transform: 'translate3d(0px, 0, 0)' },
      ],
      {
        duration: durationMs('transition'),
        easing: easing('standard'),
        channel: 'navigate',
        willChange: 'transform',
      },
    );
  return run(
    element,
    [
      { opacity: 0, transform: `translateX(${travel}px)` },
      { opacity: 1, transform: 'translateX(0)' },
    ],
    {
      duration: durationMs('transition'),
      easing: easing('standard'),
      channel: 'navigate',
      willChange: 'opacity, transform',
    },
  );
}

/** A changed number or label; `up` when the value grew. */
export function valueChange(
  element: Element | null,
  direction: 'up' | 'down' | 'none' = 'none',
): Animation | null {
  const travel =
    direction === 'none'
      ? 0
      : direction === 'up'
        ? VALUE_TRAVEL_PX
        : -VALUE_TRAVEL_PX;
  return run(
    element,
    [
      { opacity: 0, transform: `translateY(${travel}px)` },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    {
      duration: durationMs('feedback'),
      easing: easing('standard'),
      channel: 'value',
    },
  );
}

/** Revealed content of an expand: fades in; content below moves at once. */
export function disclose(element: Element | null): Animation | null {
  return run(element, [{ opacity: 0 }, { opacity: 1 }], {
    duration: durationMs('context'),
    easing: easing('enter'),
    channel: 'opacity',
  });
}

export type LayoutSnapshot = Map<string, DOMRect>;

/**
 * The data attribute that names a keyed element, as its `dataset` property
 * (default `motionKey`, that is `data-motion-key`). An owner with its own
 * stable item attribute (for example `sortableItemId`) passes that instead.
 */
export type LayoutKey = string;

function keyedNodes(container: Element | null, key: LayoutKey): HTMLElement[] {
  const attribute = key.replace(
    /[A-Z]/g,
    (letter) => `-${letter.toLowerCase()}`,
  );
  return Array.from(
    container?.querySelectorAll<HTMLElement>(`[data-${attribute}]`) ?? [],
  );
}

/** Measures every keyed element under `container`. */
export function captureLayout(
  container: Element | null,
  key: LayoutKey = 'motionKey',
): LayoutSnapshot {
  const rects: LayoutSnapshot = new Map();
  for (const node of keyedNodes(container, key))
    rects.set(node.dataset[key] ?? '', node.getBoundingClientRect());
  return rects;
}

export interface ReorderOptions {
  /** The keyed attribute, as in `captureLayout`. */
  key?: LayoutKey;
  /** An element that is still under the finger and moves on its own. */
  skip?: Element | null;
}

/**
 * FLIP: moves each keyed element from its measured old place to its new one
 * with `translate`. More than `MAX_ANIMATED_ELEMENTS` moving elements is a
 * bulk change and moves at once.
 */
export function reorder(
  container: Element | null,
  before: LayoutSnapshot,
  options: ReorderOptions = {},
): Animation[] {
  const duration = durationMs('transition');
  const settle = easing('standard');
  const key = options.key ?? 'motionKey';
  if (!container || duration <= 0 || !settle) return [];
  const moves: Array<{ node: HTMLElement; dx: number; dy: number }> = [];
  for (const node of keyedNodes(container, key)) {
    if (node === options.skip) continue;
    const old = before.get(node.dataset[key] ?? '');
    if (!old) continue;
    const now = node.getBoundingClientRect();
    const dx = old.left - now.left;
    const dy = old.top - now.top;
    if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) moves.push({ node, dx, dy });
  }
  if (moves.length > MAX_ANIMATED_ELEMENTS) return [];
  const animations: Animation[] = [];
  for (const { node, dx, dy } of moves) {
    const animation = run(
      node,
      [
        { transform: `translate(${dx}px, ${dy}px)` },
        { transform: 'translate(0, 0)' },
      ],
      { duration, easing: settle, channel: 'position', interrupt: 'commit' },
    );
    if (animation) animations.push(animation);
  }
  return animations;
}

/**
 * Scroll-linked state with hysteresis (`scroll-state`): the state turns on
 * after `on` px of travel in one direction and off after `off` px back.
 * There is no per-pixel scroll-linked transform; the owner transitions the
 * state change with a token role.
 */
export class ScrollState {
  private active = false;
  private anchor: number | null = null;

  constructor(
    private readonly on: number,
    private readonly off: number,
  ) {}

  get value(): boolean {
    return this.active;
  }

  /**
   * Starts over at `position` with the state off (or `active`), for example
   * near the top of a page or after a scroll the person did not make.
   */
  reset(position: number | null = null, active = false): boolean {
    this.active = active;
    this.anchor = position;
    return this.active;
  }

  /** Feeds the scroll position; returns the state. */
  update(position: number): boolean {
    if (this.anchor === null) {
      this.anchor = position;
      return this.active;
    }
    const travel = position - this.anchor;
    if (!this.active) {
      if (travel >= this.on) {
        this.active = true;
        this.anchor = position;
      } else if (travel < 0) this.anchor = position;
    } else if (-travel >= this.off) {
      this.active = false;
      this.anchor = position;
    } else if (travel > 0) this.anchor = position;
    return this.active;
  }
}
