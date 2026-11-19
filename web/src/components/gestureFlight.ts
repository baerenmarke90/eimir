/**
 * The flight of a sent gesture (Thinking of You, kiss, check-in).
 *
 * After a gesture was tapped in the quick-action sheet, its symbol lifts out of
 * the sheet and waits until the server confirmed it. Then the sheet closes and
 * the symbol flies to the partner avatar and lands in a way that matches the
 * gesture: a heart that beats twice with ripples, two hearts that meet in a
 * kiss and bloom, or a calm question mark with one slow breath of the avatar.
 * If the send failed, the symbol returns to its place and the sheet stays.
 *
 * Decoration only: hidden from assistive technology, no pointer events, never
 * blocking, absent with reduced motion. Every duration and easing is read from
 * the generated motion roles.
 */

import {
  centre,
  flightKeyframes,
  openFlightLayer,
  type Point,
  pulseRing,
  scatterDots,
} from '../motion/flight';
import './GestureFlight.css';

export type GestureKind = 'THINKING' | 'KISS' | 'CHECK_IN';

export interface GestureFlight {
  /**
   * The send finished. Fly to the partner and land when it succeeded, return
   * to the sheet when it failed. Resolves when every element is gone.
   */
  settle: (succeeded: boolean) => Promise<void>;
  /** Drop everything at once. */
  cancel: () => void;
}

const LIFT_SCALE = 1.35;
const HEART_SCALE = 1.25;
/** How far the big heart grows over the avatar at each of its two beats. */
const BEAT_SCALES = [2.6, 2.1, 2.8, 2.3] as const;
const BEAT_OFFSETS = [0.2, 0.34, 0.54, 0.7] as const;
const KISS_SCALE = 1.9;
const KISS_GAP = 18;
const CHECK_IN_OFFSET: Point = { x: 40, y: -40 };

function ghostFor(
  kind: GestureKind,
  source: Element,
  layer: HTMLElement,
  at: Point,
): HTMLElement | null {
  const element = document.createElement('div');
  element.className = `wir-checkin-flight-ghost is-gesture is-${kind.toLowerCase().replace('_', '-')}`;
  element.setAttribute('aria-hidden', 'true');
  const glyph = source.querySelector('svg');
  if (glyph) element.append(glyph.cloneNode(true));
  else if (source.textContent?.trim())
    element.textContent = source.textContent.trim();
  else return null;
  layer.append(element);
  element.style.left = `${at.x - element.offsetWidth / 2}px`;
  element.style.top = `${at.y - element.offsetHeight / 2}px`;
  return element;
}

function translateTo(from: Point, to: Point, scale: number): string {
  return `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(${scale})`;
}

async function finished(animation: Animation): Promise<void> {
  await animation.finished.catch(() => undefined);
}

export function startGestureFlight(input: {
  kind: GestureKind;
  /** The symbol in the sheet that lifts off. */
  source: Element;
  /** The partner avatar the gesture flies to. */
  target: Element;
  /** The own avatar; the second heart of a kiss starts here. */
  own: Element | null;
}): GestureFlight | null {
  const { kind, source, target, own } = input;
  const opened = openFlightLayer();
  if (!opened) return null;
  const { layer, roles, dispose } = opened;
  const sourceRect = source.getBoundingClientRect();
  if (sourceRect.width === 0 && sourceRect.height === 0) {
    dispose();
    return null;
  }
  const origin = centre(sourceRect);
  const found = ghostFor(kind, source, layer, origin);
  if (!found) {
    dispose();
    return null;
  }
  const ghost: HTMLElement = found;
  source.setAttribute('data-flight-source', 'true');
  const extras: HTMLElement[] = [];
  // Deferred ripples belong to this flight and end with it, so none can fire
  // after the flight was cleaned up (or its document went away).
  const timers: number[] = [];
  const later = (callback: () => void, delay: number) => {
    timers.push(window.setTimeout(callback, delay));
  };
  let cancelled = false;

  const lift = ghost.animate(
    [{ transform: 'scale(1)' }, { transform: `scale(${LIFT_SCALE})` }],
    {
      duration: roles.context,
      easing: roles.enter,
      fill: 'forwards',
    },
  );
  const lifted = finished(lift);

  const cleanup = () => {
    for (const timer of timers) window.clearTimeout(timer);
    timers.length = 0;
    source.removeAttribute('data-flight-source');
    ghost.remove();
    for (const extra of extras) extra.remove();
    dispose();
  };

  const targetRect = () => target.getBoundingClientRect();
  const hop = (scale: number, duration: number) =>
    target.animate(
      [
        { transform: 'scale(1)' },
        { transform: `scale(${scale})`, offset: 0.35 },
        { transform: 'scale(1)' },
      ],
      { duration, easing: roles.standard },
    );
  const moment = roles.moment || roles.context * 3;

  async function returnHome(): Promise<void> {
    await finished(
      ghost.animate(
        [{ transform: `scale(${LIFT_SCALE})` }, { transform: 'scale(1)' }],
        { duration: roles.context, easing: roles.standard, fill: 'forwards' },
      ),
    );
  }

  /** Thinking of you: the heart beats twice over the avatar, with ripples. */
  async function landThinking(heart: Point, to: Point): Promise<void> {
    const rect = targetRect();
    hop(1.06, roles.context * 2.5);
    later(
      () => !cancelled && pulseRing(layer, rect, roles, 2.4),
      moment * 0.13,
    );
    later(() => !cancelled && pulseRing(layer, rect, roles, 2), moment * 0.62);
    const keyframes: Keyframe[] = [
      { transform: translateTo(heart, to, HEART_SCALE), opacity: 1 },
      ...BEAT_SCALES.map((scale, index) => ({
        transform: translateTo(heart, to, scale),
        offset: BEAT_OFFSETS[index],
        opacity: 1,
      })),
      { transform: translateTo(heart, to, 0.9), opacity: 0 },
    ];
    await finished(
      ghost.animate(keyframes, {
        duration: moment + roles.context / 2,
        fill: 'forwards',
      }),
    );
  }

  /** Kiss: two hearts meet above the avatar, squeeze, then bloom. */
  async function landKiss(from: Point, to: Point): Promise<void> {
    const meet: Point = { x: to.x, y: to.y - 14 };
    const left: Point = { x: meet.x - KISS_GAP, y: meet.y };
    const right: Point = { x: meet.x + KISS_GAP, y: meet.y };
    const ownCentre = own ? centre(own.getBoundingClientRect()) : null;
    const second = ownCentre && ghostFor(kind, source, layer, ownCentre);
    if (second) extras.push(second);
    const ownStart = ownCentre ?? { x: from.x - 90, y: from.y };
    const flights = [
      finished(
        ghost.animate(
          flightKeyframes(from, left, LIFT_SCALE, HEART_SCALE, -40, 60),
          {
            duration: roles.flight,
            easing: roles.standard,
            fill: 'forwards',
          },
        ),
      ),
    ];
    if (second) {
      second.style.opacity = '0';
      second.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: roles.stagger * 2,
        fill: 'forwards',
      });
      flights.push(
        finished(
          second.animate(
            flightKeyframes(ownStart, right, 0.5, HEART_SCALE, 30, 40),
            {
              duration: roles.flight,
              delay: roles.stagger,
              easing: roles.standard,
              fill: 'forwards',
            },
          ),
        ),
      );
    }
    await Promise.all(flights);
    if (cancelled) return;
    hop(0.94, roles.context * 2);
    const hugs = [
      finished(
        ghost.animate(
          [
            { transform: translateTo(from, left, HEART_SCALE) },
            {
              transform: translateTo(
                from,
                { x: meet.x + 3, y: meet.y },
                KISS_SCALE,
              ),
            },
          ],
          { duration: roles.context, easing: roles.standard, fill: 'forwards' },
        ),
      ),
    ];
    if (second && ownCentre)
      hugs.push(
        finished(
          second.animate(
            [
              { transform: translateTo(ownStart, right, HEART_SCALE) },
              {
                transform: translateTo(
                  ownStart,
                  { x: meet.x - 3, y: meet.y },
                  KISS_SCALE,
                ),
              },
            ],
            {
              duration: roles.context,
              easing: roles.standard,
              fill: 'forwards',
            },
          ),
        ),
      );
    await Promise.all(hugs);
    if (cancelled) return;
    const bloom = document.createElement('div');
    bloom.className = 'wir-checkin-flight-bloom';
    const rect = targetRect();
    const size = rect.width * 1.7;
    bloom.style.left = `${to.x - size / 2}px`;
    bloom.style.top = `${to.y - size / 2}px`;
    bloom.style.width = `${size}px`;
    bloom.style.height = `${size}px`;
    layer.append(bloom);
    extras.push(bloom);
    bloom
      .animate(
        [
          { opacity: 0.7, transform: 'scale(0.3)' },
          { opacity: 0, transform: 'scale(1.5)' },
        ],
        { duration: moment * 0.72, easing: roles.enter },
      )
      .finished.catch(() => undefined);
    scatterDots(layer, to, roles, 10);
    await Promise.all(
      [ghost, second].flatMap((element) =>
        element
          ? [
              finished(
                element.animate([{ opacity: 1 }, { opacity: 0 }], {
                  duration: roles.context,
                  easing: roles.standard,
                  fill: 'forwards',
                }),
              ),
            ]
          : [],
      ),
    );
  }

  /** Check-in: calm. A question mark floats over, the avatar takes one breath. */
  async function landCheckIn(from: Point, to: Point): Promise<void> {
    const rest: Point = {
      x: to.x + CHECK_IN_OFFSET.x,
      y: to.y + CHECK_IN_OFFSET.y,
    };
    await finished(
      ghost.animate(flightKeyframes(from, rest, LIFT_SCALE, 1, 10, 30), {
        duration: moment,
        easing: roles.standard,
        fill: 'forwards',
      }),
    );
    if (cancelled) return;
    target.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.05)', offset: 0.5 },
        { transform: 'scale(1)' },
      ],
      { duration: moment + roles.context * 2, easing: roles.standard },
    );
    pulseRing(layer, targetRect(), roles, 1.5);
    await finished(
      ghost.animate(
        [
          { transform: translateTo(from, rest, 1) },
          { transform: translateTo(from, rest, 1.12), offset: 0.4 },
          { transform: translateTo(from, rest, 1) },
        ],
        { duration: moment, easing: roles.standard, fill: 'forwards' },
      ),
    );
    await finished(
      ghost.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: roles.context,
        fill: 'forwards',
      }),
    );
  }

  return {
    async settle(succeeded) {
      await lifted;
      if (cancelled) return;
      if (!succeeded) {
        await returnHome();
        if (!cancelled) cleanup();
        return;
      }
      const to = centre(targetRect());
      if (kind === 'THINKING') {
        await finished(
          ghost.animate(
            flightKeyframes(origin, to, LIFT_SCALE, HEART_SCALE, 40, 70),
            {
              duration: roles.flight,
              easing: roles.standard,
              fill: 'forwards',
            },
          ),
        );
        if (!cancelled) await landThinking(origin, to);
      } else if (kind === 'KISS') await landKiss(origin, to);
      else await landCheckIn(origin, to);
      if (!cancelled) cleanup();
    },
    cancel() {
      if (cancelled) return;
      cancelled = true;
      for (const element of [ghost, ...extras])
        for (const animation of element.getAnimations?.() ?? [])
          animation.cancel();
      cleanup();
    },
  };
}
