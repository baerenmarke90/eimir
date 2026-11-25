/**
 * The motion layer's choreography for the Rubbellos memory world (#2283):
 * the won ticket flying off the roll once it is torn off (with a little tug
 * first when it is torn by the tab, the crank or the button), and the foil
 * crumbs that fall from the finger while the couple scratches.
 *
 * `tearOff` returns `null` where Web Animations are unavailable; the world
 * then removes the ticket at once, as it does with reduced motion, where the
 * flight never runs. The dust spawns nothing with reduced motion. The feed
 * of the next ticket, the crank, the reveal and the bonus are CSS
 * (`memory-worlds.css`, scratch roles). The values were tuned with the
 * Product Owner and are kept unchanged from the accepted prototype.
 */
import { prefersReducedMotion } from './reducedMotion';

/** Timings of the Rubbellos in ms. */
export const SCRATCH_TIMING = Object.freeze({
  /** A ticket torn off by the finger flies away. */
  flight: 1050,
  /** A ticket torn off by a control: the tug, then the flight. */
  autoTear: 1600,
  /** Roll ticks while the fresh ticket slides out of the dispenser. */
  feedTicks: Object.freeze([480, 720, 960, 1200]),
  /** After the reveal: bring the handwritten note into view if needed. */
  winScroll: 1100,
  /** Three equal coins: the extra confirmation after the coin's own tick. */
  bonusHaptic: 420,
});

/** The ticket follows the finger: must match `.memory-scratch-ticket`. */
export const TEAR_FOLLOW = 0.75;
export const TEAR_TILT_DEG = 0.04;

/** Where a torn ticket starts its flight. */
export interface TearPose {
  dir: 1 | -1;
  /** Horizontal offset in px. */
  x: number;
  /** Tilt in degrees. */
  rot: number;
  /** Torn by a control: plays its own tug before the flight. */
  auto: boolean;
}

/** Flight samples (the path is sampled; the keyframes are linear between). */
const FLIGHT_SAMPLES = 10;

/**
 * The keyframes of the flight: sideways and falling with gravity from where
 * the finger let go, fading out in its second half.
 */
export function tearFrames(pose: TearPose, width: number): Keyframe[] {
  const { dir, auto } = pose;
  const frames: Keyframe[] = [];
  let startX = pose.x;
  let startRot = pose.rot;
  let flightFrom = 0;
  if (auto) {
    // A little tug against the pull, then the perforation gives way.
    frames.push(
      { transform: 'translate(0px, 0px) rotate(0deg)', opacity: 1, offset: 0 },
      {
        transform: `translate(${-dir * 6}px, 1px) rotate(${-dir * 0.6}deg)`,
        opacity: 1,
        offset: 0.14,
      },
      {
        transform: `translate(${dir * 44}px, 0px) rotate(${dir * 5}deg)`,
        opacity: 1,
        offset: 0.42,
      },
    );
    startX = dir * 44;
    startRot = dir * 5;
    flightFrom = 0.42;
  }
  const distance = width * 1.25 + 80;
  for (let index = auto ? 1 : 0; index <= FLIGHT_SAMPLES; index += 1) {
    const t = index / FLIGHT_SAMPLES;
    const x = startX + dir * distance * t * (1.2 - 0.2 * t);
    const y = -36 * t + 380 * t * t;
    const rot = startRot + dir * 34 * t;
    frames.push({
      transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rot.toFixed(2)}deg)`,
      opacity: t < 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.45),
      offset: flightFrom + (1 - flightFrom) * t,
    });
  }
  return frames;
}

/** The torn ticket flies off; `null` without Web Animations. */
export function tearOff(
  element: HTMLElement | null | undefined,
  pose: TearPose,
): Animation | null {
  if (!element || typeof element.animate !== 'function') return null;
  return element.animate(tearFrames(pose, element.offsetWidth), {
    duration: pose.auto ? SCRATCH_TIMING.autoTear : SCRATCH_TIMING.flight,
    easing: 'linear',
    fill: 'forwards',
  });
}

/* ---------- Scratch dust ---------- */

/** Spawns foil crumbs at a point of the screen. */
export interface ScratchDustHandle {
  spawn(
    clientX: number,
    clientY: number,
    count: number,
    colors: readonly string[],
  ): void;
}

interface Crumb {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  age: number;
  life: number;
  color: string;
}

const DUST_GRAVITY = 0.0011;
const DUST_MAX = 90;
/** The canvas resolution cap: sharp enough for crumbs, cheap to clear. */
const DUST_MAX_DPR = 2;
/** The canvas box is measured again at most this often while scratching. */
const DUST_RECT_MS = 250;

/**
 * Runs the crumbs on a canvas over the whole ticket: they fall, turn and
 * fade, and the frame loop stops as soon as the last one is gone. Returns
 * the handle and the cleanup.
 */
export function attachScratchDust(canvas: HTMLCanvasElement): {
  handle: ScratchDustHandle;
  detach: () => void;
} {
  const ctx = canvas.getContext('2d');
  const crumbs: Crumb[] = [];
  let frame = 0;
  let last = 0;
  let dpr = 1;
  let rect: DOMRect | null = null;
  let rectAt = 0;
  const size = () => {
    dpr = Math.min(DUST_MAX_DPR, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    rect = null;
  };
  const observer =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(size);
  observer?.observe(canvas);
  const step = (time: number) => {
    if (!ctx) return;
    const dt = Math.min(34, time - last);
    last = time;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    for (let index = crumbs.length - 1; index >= 0; index -= 1) {
      const crumb = crumbs[index];
      crumb.age += dt;
      if (crumb.age >= crumb.life) {
        crumbs.splice(index, 1);
        continue;
      }
      crumb.vy += DUST_GRAVITY * dt;
      crumb.vx *= 0.994;
      crumb.x += crumb.vx * dt;
      crumb.y += crumb.vy * dt;
      crumb.rot += crumb.vr * dt;
      const k = crumb.age / crumb.life;
      ctx.globalAlpha = 1 - k * k * k;
      ctx.fillStyle = crumb.color;
      ctx.save();
      ctx.translate(crumb.x, crumb.y);
      ctx.rotate(crumb.rot);
      ctx.fillRect(
        -crumb.size / 2,
        -crumb.size * 0.35,
        crumb.size,
        crumb.size * 0.7,
      );
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    frame = crumbs.length ? requestAnimationFrame(step) : 0;
  };
  const handle: ScratchDustHandle = {
    spawn(clientX, clientY, count, colors) {
      if (!ctx || colors.length === 0 || prefersReducedMotion()) return;
      const now = performance.now();
      if (!rect || now - rectAt > DUST_RECT_MS) {
        rect = canvas.getBoundingClientRect();
        rectAt = now;
      }
      for (
        let index = 0;
        index < count && crumbs.length < DUST_MAX;
        index += 1
      ) {
        crumbs.push({
          x: clientX - rect.left + (Math.random() - 0.5) * 10,
          y: clientY - rect.top + (Math.random() - 0.5) * 8,
          vx: (Math.random() - 0.5) * 0.14,
          vy: -0.03 - Math.random() * 0.07,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.02,
          size: 1.6 + Math.random() * 2.2,
          age: 0,
          life: 700 + Math.random() * 500,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
      if (!frame) {
        last = now;
        frame = requestAnimationFrame(step);
      }
    },
  };
  return {
    handle,
    detach: () => {
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      crumbs.length = 0;
    },
  };
}
