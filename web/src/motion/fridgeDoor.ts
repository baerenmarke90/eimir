/**
 * The motion layer's choreography for the Kühlschranktür memory world
 * (#2283): the magnet hopping off a note, a magnet (or a taped note) snapping
 * back onto the door, and the note growing into the large card and shrinking
 * back onto the door (a FLIP from the note's box) behind a fading scrim.
 *
 * Every function returns `null` where Web Animations are unavailable; the
 * world then shows the final states, as it does with reduced motion, where
 * none of these run. The fall, tear, pin and plop keyframes of a note swap are
 * CSS (`memory-worlds.css`); their lengths below must match its fridge roles.
 * The curves were tuned on device with the Product Owner and are kept
 * unchanged from the accepted prototype.
 */

/** Timings of the fridge door in ms. */
export const FRIDGE_TIMING = Object.freeze({
  /** The magnet hops off the note that is opened. */
  hop: 420,
  /** The note starts to lift while the magnet is still in the air. */
  openDelay: 150,
  open: 680,
  close: 540,
  scrimIn: 460,
  snap: 320,
  /** Must match `--memory-fridge-fall-duration` and `-fall-stagger`. */
  fall: 780,
  fallStagger: 55,
  /** Must match `--memory-fridge-pin-stagger`, `-plop-offset` and `-plop-duration`. */
  pinStagger: 95,
  plopDelay: 250,
  plop: 380,
});

const EASING = {
  hopUp: 'cubic-bezier(0.2, 0.7, 0.35, 1)',
  hopDown: 'cubic-bezier(0.55, 0, 0.85, 0.4)',
  settle: 'cubic-bezier(0, 0, 0.58, 1)',
  snapIn: 'cubic-bezier(0.6, 0, 0.9, 0.5)',
  snapOut: 'cubic-bezier(0.3, 0.6, 0.4, 1)',
  openTravel: 'cubic-bezier(0.3, 0.05, 0.2, 1)',
  openSettle: 'cubic-bezier(0.4, 0, 0.5, 1)',
  sway: 'cubic-bezier(0.42, 0, 0.58, 1)',
  closeLift: 'cubic-bezier(0.3, 0, 0.4, 1)',
  closeTravel: 'cubic-bezier(0.45, 0, 0.25, 1)',
  fadeIn: 'cubic-bezier(0, 0, 0.58, 1)',
  fadeOut: 'cubic-bezier(0.42, 0, 1, 1)',
} as const;

/** Offset and scale that put the card exactly over the note on the door. */
export interface CardDelta {
  dx: number;
  dy: number;
  s: number;
}

function animate(
  el: Element | null | undefined,
  frames: Keyframe[],
  options: KeyframeAnimationOptions,
): Animation | null {
  if (!el || typeof (el as HTMLElement).animate !== 'function') return null;
  return (el as HTMLElement).animate(frames, options);
}

/** Whether the card flights can run on this element. */
export function canFly(el: Element | null | undefined): boolean {
  return !!el && typeof (el as HTMLElement).animate === 'function';
}

function pose(dx: number, dy: number, scale: number, rot: number) {
  return `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${scale.toFixed(4)}) rotate(${rot.toFixed(2)}deg)`;
}

/** Where the large card has to be so it sits exactly over the note. */
export function cardDelta(slot: Element, card: Element): CardDelta {
  const a = slot.getBoundingClientRect();
  const b = card.getBoundingClientRect();
  return {
    dx: a.left + a.width / 2 - (b.left + b.width / 2),
    dy: a.top + a.height / 2 - (b.top + b.height / 2),
    s: b.width > 0 ? a.width / b.width : 0.3,
  };
}

/** The magnet jumps off the door (the note is pulled from under it). */
export function hopMagnet(
  cap: Element | null | undefined,
  shadow: Element | null | undefined,
) {
  const hop = animate(
    cap,
    [
      { transform: 'translate(0, 0) scale(1)', easing: EASING.hopUp },
      {
        transform: 'translate(0, calc(-2.6 * var(--cu))) scale(1.14)',
        offset: 0.42,
        easing: EASING.hopDown,
      },
      {
        transform: 'translate(0, 0) scale(1.08, 0.88)',
        offset: 0.78,
        easing: EASING.settle,
      },
      { transform: 'translate(0, 0) scale(1)' },
    ],
    { duration: FRIDGE_TIMING.hop },
  );
  animate(
    shadow,
    [
      { transform: 'scale(1)', opacity: 1 },
      { transform: 'scale(0.78)', opacity: 0.45, offset: 0.42 },
      { transform: 'scale(1.04)', opacity: 1, offset: 0.78 },
      { transform: 'scale(1)', opacity: 1 },
    ],
    { duration: FRIDGE_TIMING.hop },
  );
  return hop;
}

/**
 * A magnet snaps onto the door (`magnet`), or a taped note or a letter
 * presses flat against it.
 */
export function snapOnto(el: Element | null | undefined, magnet: boolean) {
  return animate(
    el,
    magnet
      ? [
          {
            transform: 'translate(0, calc(-1.2 * var(--cu))) scale(1.1)',
            easing: EASING.snapIn,
          },
          {
            transform: 'translate(0, 0) scale(1.1, 0.86)',
            offset: 0.4,
            easing: EASING.snapOut,
          },
          { transform: 'translate(0, 0) scale(0.96, 1.05)', offset: 0.7 },
          { transform: 'translate(0, 0) scale(1)' },
        ]
      : [
          { transform: 'scale(1.03)', easing: EASING.snapIn },
          {
            transform: 'scale(0.97, 0.95)',
            offset: 0.4,
            easing: EASING.snapOut,
          },
          { transform: 'scale(1)' },
        ],
    { duration: FRIDGE_TIMING.snap },
  );
}

/** The note lifts off the door and grows into the card, with a little sway. */
export function openCard(
  card: Element | null | undefined,
  from: CardDelta,
  rot: number,
) {
  return animate(
    card,
    [
      {
        transform: pose(from.dx, from.dy, from.s, rot),
        opacity: 0,
        easing: EASING.openTravel,
      },
      { opacity: 1, offset: 0.1 },
      {
        transform: pose(0, -6, 1.035, -1.2),
        offset: 0.66,
        easing: EASING.openSettle,
      },
      {
        transform: pose(0, 1.5, 0.993, 0.4),
        offset: 0.85,
        easing: EASING.sway,
      },
      { transform: pose(0, 0, 1, 0), opacity: 1 },
    ],
    {
      duration: FRIDGE_TIMING.open,
      delay: FRIDGE_TIMING.openDelay,
      fill: 'backwards',
    },
  );
}

/** The card lifts once more, then shrinks back onto its place on the door. */
export function closeCard(
  card: Element | null | undefined,
  to: CardDelta,
  rot: number,
) {
  return animate(
    card,
    [
      { transform: pose(0, 0, 1, 0), opacity: 1, easing: EASING.closeLift },
      {
        transform: pose(0, -8, 1.02, 0.8),
        offset: 0.16,
        easing: EASING.closeTravel,
      },
      { opacity: 1, offset: 0.86 },
      { transform: pose(to.dx, to.dy, to.s, rot), opacity: 0 },
    ],
    { duration: FRIDGE_TIMING.close, fill: 'forwards' },
  );
}

/** The scrim behind the card fades in (with the card) or out. */
export function fadeScrim(el: Element | null | undefined, show: boolean) {
  return show
    ? animate(el, [{ opacity: 0 }, { opacity: 1 }], {
        duration: FRIDGE_TIMING.scrimIn,
        delay: FRIDGE_TIMING.openDelay * 0.5,
        easing: EASING.fadeIn,
        fill: 'backwards',
      })
    : animate(el, [{ opacity: 1 }, { opacity: 0 }], {
        duration: FRIDGE_TIMING.close,
        easing: EASING.fadeOut,
        fill: 'forwards',
      });
}
