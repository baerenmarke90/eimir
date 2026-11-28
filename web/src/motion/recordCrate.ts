/**
 * The motion layer's choreography for the Plattenkiste memory world (#2283):
 * the flights of a record between the crate and the turntable, and the
 * platter motor.
 *
 * Pulling, putting back and swapping a record are each one continuous
 * timeline: the moving parts are Web Animations sampled along smooth paths
 * with overlapping delays; the world's own frame loop runs the cues (arm,
 * motor, needle landing) and eases the platter's playback rate. Every
 * function returns `null` where Web Animations are unavailable; the world
 * then shows the final states (as it does with reduced motion, where none of
 * these run). The curves were tuned on device with the Product Owner and are
 * kept unchanged from the accepted prototype.
 */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Samples per path: dense enough for smooth curves with linear segments. */
const PATH_STEPS = 18;

const EASING = {
  /** The sleeve rises out of the crate and gathers speed. */
  rise: 'cubic-bezier(0.42, 0, 0.72, 0.62)',
  /** The sleeve flies onto the stand and settles with a hint of overshoot. */
  flyOut: 'cubic-bezier(0.22, 0.5, 0.28, 1.03)',
  flyBack: 'cubic-bezier(0.22, 0.5, 0.28, 1)',
  /** The sleeve drops back into the crate (the clack). */
  drop: 'cubic-bezier(0.3, 0.45, 0.5, 1.32)',
  /** The old sleeve slips back when another record takes its place. */
  slipBack: 'cubic-bezier(0.3, 0.45, 0.5, 1.25)',
  vinylOut: 'cubic-bezier(0.42, 0.05, 0.25, 1)',
  inlayOut: 'cubic-bezier(0.35, 0.05, 0.25, 1)',
  /** Records and inlays going back into their sleeve. */
  intoSleeve: 'cubic-bezier(0.4, 0, 0.6, 1)',
  tipAway: 'cubic-bezier(0.5, 0, 0.75, 0.6)',
  tipIn: 'cubic-bezier(0.25, 1.2, 0.5, 1)',
  /** The sleeve picked up to read its liner notes, or set back. */
  flip: 'cubic-bezier(0.3, 1.15, 0.45, 1)',
} as const;

/** The old sleeve slipping back into the crate during a swap, in ms. */
const SLIP_BACK_MS = 420;

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Offset and scale that move `to`'s centre onto `from`'s. */
export function centreDelta(from: Box, to: Box) {
  return {
    dx: from.left + from.width / 2 - (to.left + to.width / 2),
    dy: from.top + from.height / 2 - (to.top + to.height / 2),
    s: from.width / Math.max(1, to.width),
  };
}

function quad(a: number, b: number, c: number, t: number) {
  const u = 1 - t;
  return u * u * a + 2 * u * t * b + t * t * c;
}

function cubic(a: number, b: number, c: number, d: number, t: number) {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

/** Samples a smooth path into keyframes; the animation's easing runs along it. */
function sampled(steps: number, at: (t: number) => Keyframe): Keyframe[] {
  const frames: Keyframe[] = [];
  for (let i = 0; i <= steps; i += 1)
    frames.push({ ...at(i / steps), offset: i / steps });
  return frames;
}

function animate(
  el: Element | null | undefined,
  frames: Keyframe[],
  options: KeyframeAnimationOptions,
): Animation | null {
  if (!el || typeof (el as HTMLElement).animate !== 'function') return null;
  return (el as HTMLElement).animate(frames, options);
}

/** The pulled sleeve rises out of the crate, then hands over to its flight. */
export function riseSleeve(
  el: Element | null | undefined,
  lift: number,
  duration: number,
) {
  return animate(
    el,
    [
      { translate: '0 0', opacity: 1 },
      { translate: `0 ${-lift}px`, opacity: 1, offset: 0.999 },
      { translate: `0 ${-lift}px`, opacity: 0 },
    ],
    { duration, easing: EASING.rise, fill: 'forwards' },
  );
}

/** Hidden until the flight arrives, then the sleeve drops in with a soft overshoot. */
export function dropSleeve(
  el: Element | null | undefined,
  lift: number,
  delay: number,
  duration: number,
) {
  return animate(
    el,
    [
      { translate: `0 ${-lift}px`, opacity: 0 },
      { translate: `0 ${-lift}px`, opacity: 1, offset: 0.001 },
      { translate: '0 0', opacity: 1 },
    ],
    { delay, duration, easing: EASING.drop, fill: 'both' },
  );
}

/** The sleeve of the previous record slips back into its slot. */
export function slipSleeveBack(el: Element | null | undefined, lift: number) {
  return animate(
    el,
    [
      { translate: `0 ${-lift}px`, opacity: 0 },
      { translate: '0 0', opacity: 1 },
    ],
    { duration: SLIP_BACK_MS, easing: EASING.slipBack, fill: 'backwards' },
  );
}

/**
 * The sleeve's flight between the crate (just risen out) and the stand: one
 * smooth arc that first carries on upwards, then settles onto the stand.
 */
function jacketFlight(from: Box, to: Box): Keyframe[] {
  const { dx, dy, s } = centreDelta(from, to);
  const up = Math.min(48, 18 + Math.abs(dy) * 0.12);
  const frames = sampled(PATH_STEPS, (t) => {
    const x = quad(dx, dx * 0.55, 0, t);
    const y = quad(dy, dy - up * 2.2, 0, t);
    const scale = s + (1 - s) * smoothstep(0, 0.85, t);
    const rot = 3 * (1 - t) - 6 * Math.sin(Math.PI * t);
    return {
      transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(4)})`,
      opacity: 1,
    };
  });
  // Invisible exactly until the hand-over from the crate sleeve (a hard step, no blink).
  frames[0].offset = 0.002;
  frames.unshift({ transform: frames[0].transform, opacity: 0, offset: 0 });
  return frames;
}

/** Flies the sleeve from the crate onto the stand, or (`back`) the reverse. */
export function flyJacket(
  el: Element | null | undefined,
  from: Box,
  to: Box,
  {
    delay = 0,
    duration,
    back = false,
  }: { delay?: number; duration: number; back?: boolean },
) {
  return animate(el, jacketFlight(from, to), {
    delay,
    duration,
    easing: back ? EASING.flyBack : EASING.flyOut,
    fill: 'both',
    direction: back ? 'reverse' : 'normal',
  });
}

/**
 * The record slides sideways out of its sleeve, arcs over the platter and
 * lays down on it while it lands (the deck's squash undone while upright).
 */
export function flyVinyl(
  el: Element | null | undefined,
  jacket: Box,
  slot: Box,
  tilt: number,
  { delay, duration, back }: { delay: number; duration: number; back: boolean },
) {
  const { dx, dy } = centreDelta(jacket, slot);
  const s = (0.9 * jacket.width) / Math.max(1, slot.width);
  const frames = sampled(PATH_STEPS + 6, (t) => {
    const x = cubic(dx, dx + jacket.width * 0.95, slot.width * 0.05, 0, t);
    const y = cubic(dy, dy, -slot.width * 0.32, 0, t);
    const flat = smoothstep(0.38, 1, t);
    const sx = s + (1 - s) * smoothstep(0.3, 0.95, t);
    const upright = sx / tilt;
    const sy = upright + (1 - upright) * flat;
    return {
      transform: `translate(${x.toFixed(2)}px, ${(y / tilt).toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`,
      opacity: t < 0.04 ? t / 0.04 : 1,
    };
  });
  return animate(el, frames, {
    delay,
    duration,
    easing: back ? EASING.intoSleeve : EASING.vinylOut,
    fill: 'both',
    direction: back ? 'reverse' : 'normal',
  });
}

/**
 * The inlay slides up out of the sleeve (behind it), then comes forward and
 * down onto the stand in front of it; reversed, it goes back in.
 */
export function flyInlay(
  el: Element | null | undefined,
  jacket: Box,
  box: Box,
  { delay, duration, back }: { delay: number; duration: number; back: boolean },
) {
  const { dx, dy } = centreDelta(jacket, box);
  const h = box.height;
  const frames = sampled(PATH_STEPS, (t) => {
    const x = cubic(dx, dx, dx * 0.2, 0, t);
    const y = cubic(dy, dy - 1.25 * h, -0.45 * h, 0, t);
    const rot = -3 * (1 - t) + 5 * Math.sin(Math.PI * t) * (1 - t);
    const scale = 0.94 + 0.06 * smoothstep(0.4, 1, t);
    return {
      transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(4)})`,
      opacity: 1,
      // Behind the sleeve while it rises out of it, in front once it comes down.
      zIndex: t <= 0.5 ? 1 : 3,
    };
  });
  frames[0].offset = 0.002;
  frames.unshift({ ...frames[0], opacity: 0, offset: 0 });
  return animate(el, frames, {
    delay,
    duration,
    easing: back ? EASING.intoSleeve : EASING.inlayOut,
    fill: 'both',
    direction: back ? 'reverse' : 'normal',
  });
}

/** During a swap the sleeve on the stand tips away... */
export function tipJacketAway(
  el: Element | null | undefined,
  delay: number,
  duration: number,
) {
  return animate(
    el,
    [
      { transform: 'translateY(0) rotate(0deg)', opacity: 1 },
      { transform: 'translateY(-26%) rotate(-5deg)', opacity: 0 },
    ],
    { delay, duration, easing: EASING.tipAway, fill: 'both' },
  );
}

/** ...and the next record's sleeve tips in. */
export function tipJacketIn(el: Element | null | undefined, duration: number) {
  return animate(
    el,
    [
      { transform: 'translateY(-26%) rotate(-5deg)', opacity: 0 },
      { transform: 'translateY(0) rotate(0deg)', opacity: 1 },
    ],
    { duration, easing: EASING.tipIn, fill: 'both' },
  );
}

/** Picked up to read, or set back on the stand: a FLIP from the old box. */
export function flipJacketFrom(
  el: Element | null | undefined,
  dx: number,
  dy: number,
  scale: number,
  duration: number,
) {
  return animate(
    el,
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
      { transform: 'translate(0px, 0px) scale(1)' },
    ],
    { duration, easing: EASING.flip },
  );
}

/**
 * The platter's rotation. It runs while a record is on the turntable; the
 * world eases its playback rate for spin-up, spin-down and scratching and
 * cancels it when the record goes back.
 */
export function spinPlatter(el: Element | null | undefined, periodMs: number) {
  return animate(
    el,
    [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
    {
      duration: periodMs,
      iterations: Number.POSITIVE_INFINITY,
    },
  );
}
