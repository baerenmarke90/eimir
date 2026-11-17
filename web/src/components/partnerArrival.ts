/**
 * The arrival of the partner's shared day on Wir.
 *
 * When the partner's feeling, battery or note is new or changed since this
 * device last saw it, the values arrive in ONE movement: they rise together
 * out of the partner's avatar, stay together for a short reading moment and
 * then fly together into their places on the partner badge, which settles in
 * once. A single battery or note only settles in place.
 *
 * The movement is decoration only: hidden from assistive technology, no
 * pointer events, never blocking, and absent with reduced motion. Every
 * duration and easing comes from the generated motion roles.
 */

import {
  centre,
  landingScale,
  openFlightLayer,
  type Point,
  pulseRing,
  scatterDots,
} from './flightKit';
import type { FlightKind } from './sendFlight';

export interface ArrivalItem {
  kind: FlightKind;
  /** The badge slot the value lands in; its glyph is what travels. */
  slot: () => Element | null;
}

export interface ArrivalHooks {
  /** A value reached its place; reveal the slot now. */
  onLand: (kind: FlightKind) => void;
}

export interface PartnerArrival {
  /** Resolves when the movement is over and every element is gone. */
  done: Promise<void>;
  /** Drop everything at once, e.g. when the screen is left. */
  cancel: () => void;
}

/** Whether the values travel or only settle in place. */
export function arrivalMode(kinds: readonly FlightKind[]): 'travel' | 'settle' {
  return kinds.length === 1 && kinds[0] !== 'vibe' ? 'settle' : 'travel';
}

/** Where each value waits during the reading moment, relative to the avatar. */
export function holdPositions(
  kinds: readonly FlightKind[],
): Record<FlightKind, { x: number; y: number; scale: number }> {
  const positions = {
    vibe: { x: 0, y: -14, scale: 1.7 },
    energy: { x: 0, y: 0, scale: 1.1 },
    note: { x: 0, y: 0, scale: 1.1 },
  };
  const others = kinds.filter((kind) => kind !== 'vibe');
  const below = kinds.includes('vibe');
  others.forEach((kind, index) => {
    const side = others.length === 1 ? 0 : index === 0 ? -1 : 1;
    positions[kind] = below
      ? { x: side * 50, y: others.length === 1 ? 54 : 48, scale: 1.1 }
      : { x: side * 32, y: 0, scale: 1.2 };
  });
  return positions;
}

const SCALE_AT_START = 0.2;

function cloneGlyph(slot: Element): Node | null {
  const glyph =
    slot instanceof SVGSVGElement ? slot : slot.querySelector('svg');
  return glyph ? glyph.cloneNode(true) : null;
}

export function startPartnerArrival(
  input: {
    avatar: Element;
    badge: Element | null;
    items: ArrivalItem[];
  },
  hooks: ArrivalHooks,
): PartnerArrival | null {
  const { avatar, badge, items } = input;
  if (items.length === 0 || !badge) return null;
  const opened = openFlightLayer();
  if (!opened) return null;
  const { layer, roles, dispose: disposeLayer } = opened;
  const kinds = items.map((item) => item.kind);
  const mode = arrivalMode(kinds);
  let cancelled = false;

  const avatarRect = avatar.getBoundingClientRect();
  const avatarCentre = centre(avatarRect);
  const pulseBadge = (strength: number) => {
    badge.animate(
      [
        { transform: 'scale(0.85)' },
        { transform: `scale(${strength})`, offset: 0.45 },
        { transform: 'scale(0.96)', offset: 0.75 },
        { transform: 'scale(1)' },
      ],
      { duration: roles.context * 2, easing: roles.standard },
    );
  };
  const celebrate = () => {
    const rect = badge.getBoundingClientRect();
    pulseRing(layer, rect, roles, 1.9);
    scatterDots(layer, centre(rect), roles, 10);
  };

  if (mode === 'settle') {
    // One battery or one note: it settles in its place without travelling.
    const [item] = items;
    const slot = item.slot();
    const finish = () => {
      if (cancelled) return;
      disposeLayer();
    };
    if (!slot) {
      disposeLayer();
      return null;
    }
    pulseBadge(1.14);
    const motion =
      item.kind === 'energy'
        ? slot.animate(
            [
              { clipPath: 'inset(0 100% 0 0)', opacity: 0 },
              { clipPath: 'inset(0 0 0 0)', opacity: 1 },
            ],
            { duration: roles.context * 1.5, easing: roles.standard },
          )
        : slot.animate(
            [
              { transform: 'scale(0) rotate(-20deg)' },
              { transform: 'scale(1.35) rotate(10deg)', offset: 0.5 },
              { transform: 'scale(0.95) rotate(-6deg)', offset: 0.75 },
              { transform: 'scale(1) rotate(0)' },
            ],
            { duration: roles.context * 2, easing: roles.standard },
          );
    pulseRing(layer, slot.getBoundingClientRect(), roles, 2.2);
    return {
      done: motion.finished.then(finish, finish),
      cancel() {
        cancelled = true;
        motion.cancel();
        disposeLayer();
      },
    };
  }

  const halo = document.createElement('div');
  halo.className = 'wir-checkin-flight-ring is-halo';
  halo.style.left = `${avatarRect.left}px`;
  halo.style.top = `${avatarRect.top}px`;
  halo.style.width = `${avatarRect.width}px`;
  halo.style.height = `${avatarRect.height}px`;
  layer.append(halo);
  halo
    .animate(
      [
        { opacity: 0.35, transform: 'scale(0.9)' },
        { opacity: 0, transform: 'scale(1.55)' },
      ],
      { duration: roles.moment || roles.context * 3, easing: roles.enter },
    )
    .finished.then(
      () => halo.remove(),
      () => halo.remove(),
    );
  avatar.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.07)', offset: 0.35 },
      { transform: 'scale(1)' },
    ],
    { duration: roles.context * 2, easing: roles.standard },
  );

  const hold = holdPositions(kinds);
  // Rise together, stay together for a beat, then fly together.
  const total = roles.context + roles.context + roles.flight;
  const riseEnd = roles.context / total;
  const holdEnd = (roles.context * 2) / total;
  let landedCount = 0;

  const flights = items.flatMap((item, index) => {
    const slot = item.slot();
    const glyph = slot ? cloneGlyph(slot) : null;
    if (!slot || !glyph) return [];
    const element = document.createElement('div');
    element.className = `wir-checkin-flight-ghost is-arrival is-${item.kind}`;
    element.setAttribute('aria-hidden', 'true');
    element.append(glyph);
    layer.append(element);
    element.style.left = `${avatarCentre.x - element.offsetWidth / 2}px`;
    element.style.top = `${avatarCentre.y - element.offsetHeight / 2}px`;
    const slotRect = slot.getBoundingClientRect();
    const end: Point = centre(slotRect);
    const place = hold[item.kind];
    const waiting = `translate(${place.x}px, ${place.y}px) scale(${place.scale})`;
    const landing = landingScale(element.offsetWidth, slotRect.width);
    const dx = end.x - avatarCentre.x;
    const dy = end.y - avatarCentre.y;
    const animation = element.animate(
      [
        {
          transform: `translate(0px, 0px) scale(${SCALE_AT_START})`,
          opacity: 0,
          easing: roles.enter,
        },
        { transform: waiting, opacity: 1, offset: riseEnd },
        {
          transform: waiting,
          opacity: 1,
          offset: holdEnd,
          easing: roles.standard,
        },
        {
          transform: `translate(${dx}px, ${dy}px) scale(${landing})`,
          opacity: 1,
        },
      ],
      { duration: total, delay: index * roles.stagger, fill: 'forwards' },
    );
    return [
      animation.finished.then(
        () => {
          if (cancelled) return;
          element.remove();
          hooks.onLand(item.kind);
          landedCount += 1;
          if (landedCount === 1) pulseBadge(1.22);
          if (landedCount === items.length) celebrate();
        },
        () => element.remove(),
      ),
    ];
  });

  if (flights.length === 0) {
    disposeLayer();
    return null;
  }
  const done = Promise.all(flights).then(() => {
    if (!cancelled) disposeLayer();
  });
  return {
    done,
    cancel() {
      if (cancelled) return;
      cancelled = true;
      for (const ghost of layer.querySelectorAll('.wir-checkin-flight-ghost'))
        for (const animation of ghost.getAnimations?.() ?? [])
          animation.cancel();
      disposeLayer();
    },
  };
}
