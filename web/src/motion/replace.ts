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

/** The new content fades in over the old. */
export function crossfade(element: Element | null): Animation | null {
  return run(element, [{ opacity: 0 }, { opacity: 1 }], {
    duration: durationMs('transition'),
    easing: easing('standard'),
    channel: 'opacity',
  });
}

/**
 * Brings `element` (the new content) in for a navigation. Navigation never
 * waits for this (M10).
 */
export function navigate(
  element: Element | null,
  direction: NavigateDirection,
): Animation | null {
  if (!element) return null;
  if (direction === 'in-place') return crossfade(element);
  const fromEnd = direction === 'forward' || direction === 'next';
  const sign = (fromEnd ? 1 : -1) * (isRtl(element) ? -1 : 1);
  return run(
    element,
    [
      { opacity: 0, transform: `translateX(${sign * NAVIGATE_TRAVEL_PX}px)` },
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

/** Measures every `[data-motion-key]` element under `container`. */
export function captureLayout(container: Element | null): LayoutSnapshot {
  const rects: LayoutSnapshot = new Map();
  for (const node of container?.querySelectorAll<HTMLElement>(
    '[data-motion-key]',
  ) ?? [])
    rects.set(node.dataset.motionKey ?? '', node.getBoundingClientRect());
  return rects;
}

/**
 * FLIP: moves each keyed element from its measured old place to its new one
 * with `translate`. More than `MAX_ANIMATED_ELEMENTS` moving elements is a
 * bulk change and moves at once.
 */
export function reorder(
  container: Element | null,
  before: LayoutSnapshot,
): Animation[] {
  const duration = durationMs('transition');
  const settle = easing('standard');
  if (!container || duration <= 0 || !settle) return [];
  const moves: Array<{ node: HTMLElement; dx: number; dy: number }> = [];
  for (const node of container.querySelectorAll<HTMLElement>(
    '[data-motion-key]',
  )) {
    const old = before.get(node.dataset.motionKey ?? '');
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
