/**
 * The motion layer's Web Animations runner (Motion Contract M2, M6, M11).
 *
 * Every layer-owned animation starts here:
 *
 * - it ends on its own clock: the returned Animation's `finished` promise;
 * - one animation per element and channel (for example `opacity`,
 *   `position`): a new one first finishes the older one. With
 *   `interrupt: 'commit'` the older one's current style is kept as the
 *   element's style (commit, then cancel), so the new one can start from where
 *   the element is; the default `'cancel'` drops it and the new one starts
 *   from its own first keyframe;
 * - `will-change` is set only while it runs;
 * - no `fill: forwards` is left behind: the final keyframe must equal the
 *   element's own style, or the caller commits it.
 *
 * A duration of zero (reduced motion resolves every duration role to `0ms`)
 * or a missing `Element.animate` returns null: the caller shows the final
 * state.
 */

export interface RunOptions {
  duration: number;
  easing?: string;
  delay?: number;
  iterations?: number;
  /** One running animation per element and channel. Default `default`. */
  channel?: string;
  /** How an older animation on the same channel is finished. */
  interrupt?: 'cancel' | 'commit';
  /** `backwards` holds the first keyframe during a delay. */
  fill?: 'none' | 'backwards';
  /** Adds `will-change` for these properties while the animation runs. */
  willChange?: string;
  /**
   * Animate a pseudo-element of `element` (for example a decorative ring on
   * `::before`). It counts as its own element for the channel rule.
   */
  pseudoElement?: string;
}

const running = new WeakMap<Element, Map<string, Animation>>();

/** Keeps the animation's current style on the element, then cancels it. */
export function commitAndCancel(animation: Animation): void {
  try {
    animation.commitStyles();
  } catch {
    // An element that left the document cannot take committed styles.
  }
  animation.cancel();
}

/** Stops the running animation on `channel`, keeping its current style. */
export function interruptChannel(element: Element, channel = 'default'): void {
  const current = running.get(element)?.get(channel);
  if (!current) return;
  running.get(element)?.delete(channel);
  commitAndCancel(current);
}

/** The animation that currently runs on `channel`, if any. */
export function runningOn(
  element: Element,
  channel = 'default',
): Animation | undefined {
  return running.get(element)?.get(channel);
}

export function canAnimate(element: Element | null): element is HTMLElement {
  return !!element && typeof (element as HTMLElement).animate === 'function';
}

export function run(
  element: Element | null,
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
  options: RunOptions,
): Animation | null {
  if (!canAnimate(element) || !(options.duration > 0)) return null;
  const channel = options.pseudoElement
    ? `${options.channel ?? 'default'}${options.pseudoElement}`
    : (options.channel ?? 'default');
  const channels = running.get(element) ?? new Map<string, Animation>();
  running.set(element, channels);
  const previous = channels.get(channel);
  if (previous) {
    channels.delete(channel);
    if (options.interrupt === 'commit') commitAndCancel(previous);
    else previous.cancel();
  }

  // will-change on the host does not reach a pseudo-element's own layer.
  const willChange = options.pseudoElement ? undefined : options.willChange;
  const ownsWillChange = !!willChange && !element.style.willChange;
  if (ownsWillChange && willChange) element.style.willChange = willChange;

  const animation = element.animate(keyframes, {
    duration: options.duration,
    easing: options.easing || 'linear',
    delay: options.delay ?? 0,
    iterations: options.iterations ?? 1,
    fill: options.fill ?? 'none',
    ...(options.pseudoElement ? { pseudoElement: options.pseudoElement } : {}),
  });
  channels.set(channel, animation);
  const release = () => {
    if (channels.get(channel) === animation) channels.delete(channel);
    if (ownsWillChange && element.style.willChange === willChange)
      element.style.willChange = '';
  };
  animation.finished.then(release, release);
  return animation;
}
