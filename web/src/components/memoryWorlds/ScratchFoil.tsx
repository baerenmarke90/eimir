/**
 * The scratch foil of the Rubbellos (#2283): a metallic layer on a canvas
 * that the finger scratches away. The gold heart and the silver bonus coins
 * are painted once (brushed metal, glitter, a glint, the printed "Rubbeln"
 * stamp on the heart, an embossed heart on each coin) at the device pixel
 * ratio (capped at 2), and keep what was already scratched when the layout
 * changes size.
 *
 * Pointer input (Motion Contract 4.6, M14: a drawn stroke that moves
 * nothing): native listeners collect the points of a move and draw them once
 * per animation frame with `destination-out`; no React state changes while
 * scratching. The scratched share is sampled at most every `MEASURE_MS`
 * and at the end of a stroke; past the threshold the foil reports the
 * reveal. Scratching belongs to the foil alone: its pointer events never
 * reach the ticket's tear gesture. The foil is decorative (`aria-hidden`);
 * the world's "Freirubbeln" button reveals the same memory without it.
 */
import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react';
import { haptic } from '../../motion/haptics';
import type { ScratchDustHandle } from '../../motion/scratchCard';
import {
  COIN_SAMPLE_GRID,
  clearedShare,
  HEART_CURVES,
  HEART_SAMPLE_GRID,
  HEART_START,
  isRevealed,
  sampleOffsets,
  seeded,
} from './scratchTicket';

/* ---------- Tuning ---------- */

/** The revealed share is sampled at most this often while scratching. */
const MEASURE_MS = 300;
/** Scratch path length between two light haptic ticks, and their spacing. */
const SCRATCH_TICK_PX = 40;
const SCRATCH_TICK_MIN_MS = 70;
/** Brush radius in CSS px, for the heart and the 64 px coins alike. */
const BRUSH_RADIUS = 15;
/** Movement before the scratch canvas captures the pointer. */
const SCRATCH_START_PX = 4;
/** Canvas resolution cap: sharp enough for foil, cheap to sample. */
const MAX_DPR = 2;

export type FoilShape = 'heart' | 'coin';
export type FoilMetal = 'gold' | 'silver';

/**
 * The foils' metals. They are artwork painted on a canvas (which cannot read
 * the stylesheet's roles) and look the same in Light and Dark.
 */
const METALS: Record<
  FoilMetal,
  {
    stops: string[];
    light: string;
    dark: string;
    ink: string;
    soft: string;
    dust: string[];
  }
> = {
  gold: {
    stops: [
      '#a8741f',
      '#f6dc86',
      '#c99a3b',
      '#fff3c4',
      '#b5822a',
      '#ecc865',
      '#9c6a1c',
    ],
    light: '255, 250, 225',
    dark: '82, 52, 8',
    ink: 'rgba(78, 46, 6, 0.74)',
    soft: 'rgba(110, 70, 12, 0.2)',
    dust: ['#d9ae4c', '#f4dc8c', '#b3852f', '#efe1b4', '#a8741f'],
  },
  silver: {
    stops: [
      '#7e868d',
      '#e9edf0',
      '#a3abb2',
      '#fbfdff',
      '#8b939a',
      '#d6dbdf',
      '#737b82',
    ],
    light: '255, 255, 255',
    dark: '34, 42, 52',
    ink: 'rgba(40, 46, 54, 0.66)',
    soft: 'rgba(44, 52, 60, 0.2)',
    dust: ['#b9c0c6', '#e9edf0', '#8e969d', '#d3d8dc'],
  },
};

function shapePath(shape: FoilShape, w: number, h: number) {
  const path = new Path2D();
  if (shape === 'coin') {
    path.arc(w / 2, h / 2, Math.min(w, h) / 2 - 0.5, 0, Math.PI * 2);
    return path;
  }
  path.moveTo(HEART_START[0] * w, HEART_START[1] * h);
  for (const c of HEART_CURVES)
    path.bezierCurveTo(
      c[0] * w,
      c[1] * h,
      c[2] * w,
      c[3] * h,
      c[4] * w,
      c[5] * h,
    );
  path.closePath();
  return path;
}

function drawTwinkle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.quadraticCurveTo(x, y, x + size, y);
  ctx.quadraticCurveTo(x, y, x, y + size);
  ctx.quadraticCurveTo(x, y, x - size, y);
  ctx.quadraticCurveTo(x, y, x, y - size);
  ctx.fill();
}

/** The printed stamp on the gold heart (its two localized lines). */
export interface FoilStamp {
  word: string;
  sub: string;
}

function drawStamp(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  ink: string,
  family: string,
  stamp: FoilStamp,
) {
  const r = Math.min(w, h) * 0.2;
  ctx.save();
  ctx.translate(w * 0.5, h * 0.43);
  ctx.rotate(-0.14);
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.arc(0, 0, r - 4.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = r * 0.44;
  ctx.font = `700 ${size.toFixed(1)}px ${family}`;
  const width = ctx.measureText(stamp.word).width;
  if (width > r * 1.5) {
    size *= (r * 1.5) / width;
    ctx.font = `700 ${size.toFixed(1)}px ${family}`;
  }
  ctx.fillText(stamp.word, 0, r * 0.02);
  ctx.font = `600 ${(r * 0.24).toFixed(1)}px ${family}`;
  ctx.fillText(stamp.sub, 0, r * 0.5);
  // A tiny heart above the word and two little stars beside the ring.
  const heart = shapePath('heart', r * 0.34, r * 0.3);
  ctx.save();
  ctx.translate(-r * 0.17, -r * 0.66);
  ctx.fill(heart);
  ctx.restore();
  drawTwinkle(ctx, -r - 9, 0, 4.5);
  drawTwinkle(ctx, r + 9, 0, 4.5);
  ctx.restore();
}

function paintFoil(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  shape: FoilShape,
  metal: FoilMetal,
  seed: number,
  family: string,
  stamp: FoilStamp | undefined,
) {
  const palette = METALS[metal];
  const rand = seeded(seed);
  const path = shapePath(shape, w, h);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, w, h);
  ctx.clip(path);
  const base = ctx.createLinearGradient(0, 0, w, h);
  palette.stops.forEach((color, index, all) => {
    base.addColorStop(index / (all.length - 1), color);
  });
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  // Brushed metal: fine diagonal strokes, some light, some dark.
  ctx.lineWidth = 0.6;
  const strokes = Math.round((w + h) * 0.9);
  for (let index = 0; index < strokes; index += 1) {
    const from = rand() * (w + h) - h * 0.6;
    const light = rand() > 0.45;
    ctx.strokeStyle = light
      ? `rgba(${palette.light}, ${(0.07 + rand() * 0.12).toFixed(3)})`
      : `rgba(${palette.dark}, ${(0.04 + rand() * 0.08).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(from, 0);
    ctx.lineTo(from + h * 0.6, h);
    ctx.stroke();
  }
  // A soft glint, as if a lamp shone on the foil.
  const glint = ctx.createRadialGradient(
    w * 0.28,
    h * 0.22,
    0,
    w * 0.28,
    h * 0.22,
    Math.max(w, h) * 0.6,
  );
  glint.addColorStop(0, `rgba(${palette.light}, 0.5)`);
  glint.addColorStop(1, `rgba(${palette.light}, 0)`);
  ctx.fillStyle = glint;
  ctx.fillRect(0, 0, w, h);
  // Sparkly glitter grain.
  const grains = Math.round((w * h) / 24);
  for (let index = 0; index < grains; index += 1) {
    const light = rand() > 0.32;
    ctx.fillStyle = light
      ? `rgba(${palette.light}, ${(0.3 + rand() * 0.55).toFixed(3)})`
      : `rgba(${palette.dark}, ${(0.14 + rand() * 0.16).toFixed(3)})`;
    const size = rand() > 0.92 ? 1.6 : 0.8;
    ctx.fillRect(rand() * w, rand() * h, size, size);
  }
  ctx.fillStyle = `rgba(${palette.light}, 0.85)`;
  const twinkles = shape === 'heart' ? 12 : 2;
  for (let index = 0; index < twinkles; index += 1)
    drawTwinkle(ctx, rand() * w, rand() * h, 1.5 + rand() * 2.5);
  if (shape === 'heart') {
    // A printed lattice of little hearts, left free around the stamp.
    ctx.fillStyle = palette.soft;
    const step = 24;
    const small = shapePath('heart', 8, 7);
    for (let row = 0; row * step < h + step; row += 1) {
      for (let col = 0; col * step < w + step; col += 1) {
        const x = col * step + (row % 2 ? step / 2 : 0) - 4;
        const y = row * step - 4;
        const dx = x - w * 0.5;
        const dy = y - h * 0.43;
        if (dx * dx + dy * dy < (Math.min(w, h) * 0.3) ** 2) continue;
        ctx.save();
        ctx.translate(x, y);
        ctx.fill(small);
        ctx.restore();
      }
    }
    if (stamp) drawStamp(ctx, w, h, palette.ink, family, stamp);
  } else {
    // An embossed ring with a little heart: a lucky coin.
    const r = Math.min(w, h) / 2;
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r * 0.74, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = palette.ink;
    const heart = shapePath('heart', r * 0.62, r * 0.56);
    ctx.save();
    ctx.translate(w / 2 - r * 0.31, h / 2 - r * 0.27);
    ctx.fill(heart);
    ctx.restore();
  }
  // Bevelled edge: a dark rim and a light inner line.
  ctx.lineWidth = shape === 'heart' ? 5 : 3.5;
  ctx.strokeStyle = `rgba(${palette.dark}, 0.45)`;
  ctx.stroke(path);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(0.955, 0.955);
  ctx.translate(-w / 2, -h / 2);
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = `rgba(${palette.light}, 0.65)`;
  ctx.stroke(path);
  ctx.restore();
  ctx.restore();
}

/** A soft round brush with a grainy edge, so scratched edges look rough. */
let brushSprite: HTMLCanvasElement | null = null;
function brush() {
  if (brushSprite) return brushSprite;
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const image = ctx.createImageData(size, size);
    const half = size / 2;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const d = Math.hypot(x + 0.5 - half, y + 0.5 - half) / half;
        let alpha = 0;
        if (d < 0.6) alpha = 1;
        else if (d < 1) {
          const t = 1 - (d - 0.6) / 0.4;
          alpha = t * t * (3 - 2 * t) * (0.5 + 0.5 * Math.random());
        }
        image.data[(y * size + x) * 4 + 3] = Math.round(alpha * 255);
      }
    }
    ctx.putImageData(image, 0, 0);
  }
  brushSprite = canvas;
  return canvas;
}

export interface ScratchFoilProps {
  className: string;
  shape: FoilShape;
  metal: FoilMetal;
  threshold: number;
  revealed: boolean;
  seed: number;
  dust: RefObject<ScratchDustHandle | null>;
  /** The printed stamp (the heart only). */
  stamp?: FoilStamp;
  onFirstScratch?: () => void;
  onReveal: () => void;
}

export function ScratchFoil(props: ScratchFoilProps) {
  const { className, shape, metal, seed, revealed } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  useLayoutEffect(() => {
    live.current = props;
  });
  const stampWord = props.stamp?.word;
  const stampSub = props.stamp?.sub;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !ctx) return;
    const stamp =
      stampWord !== undefined && stampSub !== undefined
        ? { word: stampWord, sub: stampSub }
        : undefined;
    const grid = shape === 'heart' ? HEART_SAMPLE_GRID : COIN_SAMPLE_GRID;
    let cssW = 0;
    let cssH = 0;
    let dpr = 1;
    let samples: ArrayLike<number> = new Int32Array(0);
    let scratched = false;
    let done = false;
    let pointerId: number | null = null;
    let captured = false;
    let rect: DOMRect | null = null;
    let start = { x: 0, y: 0 };
    let last: { x: number; y: number } | null = null;
    const pending: { x: number; y: number }[] = [];
    let frame = 0;
    let travel = 0;
    let lastTick = 0;
    let lastMeasure = 0;

    const paint = () => {
      const family = getComputedStyle(canvas).fontFamily || 'serif';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintFoil(ctx, cssW, cssH, shape, metal, seed, family, stamp);
    };

    const computeSamples = () => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const path = shapePath(shape, canvas.width, canvas.height);
      samples = sampleOffsets(canvas.width, canvas.height, grid, (x, y) =>
        ctx.isPointInPath(path, x, y),
      );
      ctx.restore();
    };

    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const nextDpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      if (!w || !h || (w === cssW && h === cssH && nextDpr === dpr)) return;
      // Keep what was already scratched when the layout changes size.
      let snapshot: HTMLCanvasElement | null = null;
      if (scratched && canvas.width > 1 && canvas.height > 1) {
        snapshot = document.createElement('canvas');
        snapshot.width = canvas.width;
        snapshot.height = canvas.height;
        snapshot.getContext('2d')?.drawImage(canvas, 0, 0);
      }
      cssW = w;
      cssH = h;
      dpr = nextDpr;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      if (snapshot) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(snapshot, 0, 0, canvas.width, canvas.height);
      } else {
        paint();
      }
      computeSamples();
    };

    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(canvas);
    resize();
    // The display face may still be loading: repaint the printed stamp once
    // it is there.
    document.fonts
      ?.load(`700 20px ${getComputedStyle(canvas).fontFamily || 'serif'}`)
      .then(() => {
        if (!scratched && !done && cssW) paint();
      })
      .catch(() => undefined);

    const measure = () => {
      lastMeasure = performance.now();
      if (done || live.current.revealed || samples.length === 0) return;
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if (isRevealed(clearedShare(data, samples), live.current.threshold)) {
        done = true;
        live.current.onReveal();
      }
    };

    const stampAt = (x: number, y: number, sprite: HTMLCanvasElement) => {
      const r = BRUSH_RADIUS * (0.9 + Math.random() * 0.22);
      const jx = (Math.random() - 0.5) * 3;
      const jy = (Math.random() - 0.5) * 3;
      ctx.drawImage(sprite, x + jx - r, y + jy - r, r * 2, r * 2);
    };

    const draw = () => {
      frame = 0;
      if (pending.length === 0) return;
      const sprite = brush();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'destination-out';
      let moved = 0;
      for (const point of pending) {
        if (!last) {
          stampAt(point.x, point.y, sprite);
          last = point;
          continue;
        }
        const distance = Math.hypot(point.x - last.x, point.y - last.y);
        const steps = Math.max(1, Math.ceil(distance / (BRUSH_RADIUS * 0.35)));
        for (let k = 1; k <= steps; k += 1) {
          const t = k / steps;
          stampAt(
            last.x + (point.x - last.x) * t,
            last.y + (point.y - last.y) * t,
            sprite,
          );
        }
        moved += distance;
        last = point;
      }
      pending.length = 0;
      ctx.globalCompositeOperation = 'source-over';
      if (moved > 0 && last && rect) {
        const scaleX = rect.width / cssW;
        const scaleY = rect.height / cssH;
        live.current.dust.current?.spawn(
          rect.left + last.x * scaleX,
          rect.top + last.y * scaleY,
          Math.min(4, Math.ceil(moved / 10)),
          METALS[metal].dust,
        );
      }
      travel += moved;
      const now = performance.now();
      if (travel >= SCRATCH_TICK_PX) {
        travel %= SCRATCH_TICK_PX;
        if (now - lastTick >= SCRATCH_TICK_MIN_MS) {
          lastTick = now;
          haptic('threshold');
        }
      }
      if (now - lastMeasure >= MEASURE_MS) measure();
    };

    const local = (event: PointerEvent) => {
      const box = rect ?? canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - box.left) * cssW) / box.width,
        y: ((event.clientY - box.top) * cssH) / box.height,
      };
    };

    const down = (event: PointerEvent) => {
      // Scratching belongs to the foil alone: the ticket's tear never sees it.
      event.stopPropagation();
      if (done || live.current.revealed || pointerId !== null) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      pointerId = event.pointerId;
      captured = false;
      rect = canvas.getBoundingClientRect();
      start = local(event);
      last = null;
      if (event.pointerType === 'mouse') event.preventDefault();
      if (shape === 'coin') {
        // A small target: hold on to the finger right away.
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch {
          // The pointer may already be gone.
        }
      }
    };

    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      event.stopPropagation();
      if (!captured) {
        const point = local(event);
        if (Math.hypot(point.x - start.x, point.y - start.y) < SCRATCH_START_PX)
          return;
        captured = true;
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch {
          // The pointer may already be gone; scratching works without capture.
        }
        pending.push(start);
        if (!scratched) {
          scratched = true;
          live.current.onFirstScratch?.();
        }
      }
      const list =
        typeof event.getCoalescedEvents === 'function'
          ? event.getCoalescedEvents()
          : [];
      for (const item of list.length ? list : [event])
        pending.push(local(item));
      if (!frame) frame = requestAnimationFrame(draw);
    };

    const end = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      event.stopPropagation();
      pointerId = null;
      if (frame) cancelAnimationFrame(frame);
      draw();
      if (canvas.hasPointerCapture(event.pointerId))
        canvas.releasePointerCapture(event.pointerId);
      if (captured) measure();
      captured = false;
      last = null;
      rect = null;
    };

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('lostpointercapture', end);
    return () => {
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', end);
      canvas.removeEventListener('pointercancel', end);
      canvas.removeEventListener('lostpointercapture', end);
    };
  }, [shape, metal, seed, stampWord, stampSub]);

  return (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a canvas without a tabindex is not focusable; the foil is decorative and the world's button reveals the memory.
    <canvas
      ref={ref}
      className={className}
      data-active={revealed ? undefined : 'true'}
      data-gone={revealed ? 'true' : undefined}
      data-primary-tab-swipe-block
      aria-hidden="true"
    />
  );
}
