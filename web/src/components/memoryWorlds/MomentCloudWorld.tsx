/**
 * Momentwolke (#2283): every memory floats as a bubble in a honeycomb cloud
 * seen through a fisheye lens: large in the middle, tiny at the rim. The
 * cloud follows the finger, glides on with momentum and settles magnetically
 * on the nearest bubble; a tap grows a bubble into a card, a long press makes
 * the whole cloud playful (bubbles can be flung and bounce back).
 *
 * Performance (Android WebView): one requestAnimationFrame loop owns all
 * motion and writes transform/opacity only. Bubbles live in a fixed pool of
 * DOM nodes that are reassigned to memories (with hysteresis and an LRU
 * cache, so a memory coming back keeps its loaded photo); the loop only scans
 * the spatial buckets around the camera, so per-frame cost follows the
 * visible bubbles, not the size of the diary. React renders only when a pool
 * slot changes its memory (as a transition) or the centre memory changes.
 *
 * Gesture: the stage is the only area with `touch-action: none`; it is a
 * registered gesture owner (Motion Contract 4.6). The springs of the camera,
 * the centre pop and the card morph run in the frame loop and write
 * transforms directly; the glow drift, the centre pill, the playful jiggle
 * and the card's clip are timing roles and keyframes of the motion layer
 * (`src/motion/memory-worlds.css`). With reduced motion every settle is
 * instant, the card opens and closes at once and the playful mode is off.
 *
 * The focusable stage is the keyboard and screen-reader entry: the arrow keys
 * move to the neighbouring bubble, Enter opens the centre one as a dialog
 * (Escape closes it and focus returns to the stage), and a plain list links
 * every memory of the cloud.
 */
import {
  type CSSProperties,
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  startTransition,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useContainerUnits } from '../../client/containerUnits';
import { useTranslation } from '../../i18n';
import { haptic } from '../../motion/haptics';
import { subscribeReducedMotion } from '../../motion/reducedMotion';
import { observeVisibility } from '../../motion/visibility';
import { KeepsakeStampMark } from '../DiscoverKeepsakes';
import { MemoryPhoto } from './MemoryPhoto';
import {
  keyHash,
  type LoadMemoryImage,
  type MemoryWorldEntry,
  type MemoryWorldProps,
  type OpenMemoryWorldItem,
  prefersReducedMotion,
} from './model';
import '../../motion/memory-worlds.css';
import './MemoryWorld.css';
import './MomentCloudWorld.css';

type Entry = MemoryWorldEntry;

/* ---------- Geometry of the fisheye ---------- */

const HEX_ROW = Math.sqrt(3) / 2;
/** Both tables are sampled every half cell of world distance (u). */
const TABLE_STEP = 0.5;
/** Display distance from the stage centre, in units of the stage size U. */
const RHO_TABLE = [0, 0.172, 0.31, 0.39, 0.436, 0.468, 0.488, 0.5];
/** Bubble diameter, in units of U: 42 % in the middle, dots at the rim. */
const DIA_TABLE = [0.42, 0.285, 0.148, 0.092, 0.062, 0.042, 0.025, 0.011];
/** The rim stays a little inside the stage edge. */
const FIELD_INSET = 0.96;
/** The oval field stretches at most this far along the longer stage side. */
const MAX_STRETCH = 1.4;
/** A memory enters the visible set inside MOUNT_U and leaves beyond UNMOUNT_U. */
const MOUNT_U = 3.2;
const UNMOUNT_U = 3.55;
/** Only buckets within this world radius of the camera are scanned. */
const SCAN_U = UNMOUNT_U + 0.3;
const BUCKET_SIZE = 1;
const BUCKET_OFFSET = 4096;
const MAX_VISIBLE = 40;
/** Pool of bubble nodes: the extra nodes keep recently seen memories loaded. */
const POOL_SIZE = 48;

/* ---------- Gesture and physics tuning (tuned on device) ---------- */

const DRAG_SLOP = 4;
const CARD_DRAG_SLOP = 8;
const LONG_PRESS_MS = 500;
const VELOCITY_WINDOW_MS = 90;
/** Magnetic settle: a slightly underdamped spring onto the chosen bubble. */
const SETTLE_OMEGA = 3.6;
const SETTLE_ZETA = 0.78;
/** How far a release projects the cloud (s); matches the spring's decay. */
const PROJECTION_S = 1 / (SETTLE_OMEGA * SETTLE_ZETA);
const MAX_SPEED = 16; // cells per second
/** A moving cloud counts as caught (tap does not open) above this speed. */
const CATCH_SPEED = 0.6;
/** Release momentum beyond the projected bubble (cells per second). */
const EXCESS_FREE = 1.5;
const EXCESS_KEEP = 0.15;
const EXCESS_MAX = 4;
const RUBBER_DIM = 0.9; // cells
const RUBBER_C = 0.55;
const POP_K = 260;
const POP_ZETA = 0.4;
const POP_KICK = 1.2;
/** Card morph springs. */
const OPEN_OMEGA = 8.5;
const OPEN_ZETA = 0.74;
const CLOSE_OMEGA = 11;
const CLOSE_ZETA = 0.95;
const CARD_DRAG_OMEGA = 14;
const CARD_DRAG_ZETA = 0.82;
const CARD_RADIUS = 28;
const SWIPE_CLOSE_PX = 110;
const SWIPE_CLOSE_SPEED = 700; // px per second
/** Playful mode. */
const FLING_SPEED = 380; // px per second
const MAX_FLING = 2600;
const FLIGHT_MS = 1500;
const FLIGHT_FRICTION = 0.9; // per second
const HOME_K = 90;
const HOME_ZETA = 0.42;
const WALL_BOUNCE = 0.72;
const COLLIDE_BOUNCE = 0.6;
const COLLIDE_SOFTNESS = 0.6;
/** Device tilt parallax. */
const TILT_MAX = 12;
const TILT_GAIN = 0.45; // px per degree
const TILT_RECENTRE = 0.004; // per event
const GLOW_DELAY_MS = 160;
const GLOW_RETRIES = 8;
const GLOW_RETRY_MS = 400;
/** The playful jiggle varies per bubble (see the motion layer's roles). */
const JIGGLE_PHASES = 300;
const JIGGLE_SPREADS = 90;

const HEART_PATH =
  'M12 21C5 15.5 2 12 2 8A5 5 0 0 1 12 6A5 5 0 0 1 22 8C22 12 19 15.5 12 21Z';
const QUOTE_PATH =
  'M6 7h4.5v4.4c0 3.2-1.6 5.4-4.4 6.6l-.9-1.5c1.5-.8 2.4-2.1 2.5-3.7H6zM13.5 7H18v4.4c0 3.2-1.6 5.4-4.4 6.6l-.9-1.5c1.5-.8 2.4-2.1 2.5-3.7h-1.7z';

/** Former CSS containers that get pixel units (see containerUnits.ts). */
const BUBBLE_UNITS = '.memory-cloud-bubble-body';
const CARD_UNITS = '.memory-cloud-card-media';

/* ---------- Small helpers ---------- */

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smooth(value: number) {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
}

/**
 * Catmull-Rom through a table sampled every TABLE_STEP. `odd` mirrors the
 * table through zero (distance: linear at the centre), otherwise it is
 * mirrored evenly (size: a smooth peak at the centre).
 */
function lut(table: number[], u: number, odd = false) {
  const last = table.length - 1;
  const f = u / TABLE_STEP;
  if (f >= last) return table[last];
  const i = Math.floor(f);
  const x = f - i;
  const a = i === 0 ? (odd ? -table[1] : table[1]) : table[i - 1];
  const b = table[i];
  const c = table[i + 1];
  const d = table[Math.min(last, i + 2)];
  return Math.max(
    0,
    0.5 *
      (2 * b +
        (-a + c) * x +
        (2 * a - 5 * b + 4 * c - d) * x * x +
        (-a + 3 * b - 3 * c + d) * x * x * x),
  );
}

/** Opacity of a bubble by its world distance from the centre. */
function fadeAt(u: number) {
  if (u < 1.4) return 1;
  if (u < 2.9) return 1 - 0.6 * smooth((u - 1.4) / 1.5);
  if (u < MOUNT_U) return 0.4 * (1 - (u - 2.9) / (MOUNT_U - 2.9));
  return 0;
}

function rubber(x: number) {
  return (1 - 1 / ((x * RUBBER_C) / RUBBER_DIM + 1)) * RUBBER_DIM;
}

function rubberInverse(y: number) {
  const capped = Math.min(y, RUBBER_DIM * 0.95);
  return (RUBBER_DIM / RUBBER_C) * (1 / (1 - capped / RUBBER_DIM) - 1);
}

/**
 * World positions of a hexagonal spiral: the centre, then ring after ring,
 * starting on the right and walking clockwise, so a few memories form a
 * calm little cluster and later diary pages simply extend the outer rings.
 */
export function hexSpiral(n: number): [number, number][] {
  const steps: [number, number][] = [
    [-1, 1],
    [-1, 0],
    [0, -1],
    [1, -1],
    [1, 0],
    [0, 1],
  ];
  const out: [number, number][] = n > 0 ? [[0, 0]] : [];
  for (let ring = 1; out.length < n; ring += 1) {
    let q = ring;
    let r = 0;
    for (let side = 0; side < 6 && out.length < n; side += 1) {
      for (let k = 0; k < ring && out.length < n; k += 1) {
        out.push([q + r / 2, r * HEX_ROW]);
        q += steps[side][0];
        r += steps[side][1];
      }
    }
  }
  return out;
}

function bucketKey(bx: number, by: number) {
  return (bx + BUCKET_OFFSET) * (BUCKET_OFFSET * 2) + (by + BUCKET_OFFSET);
}

function shortText(text: string, max: number) {
  const clean = text.replace(/\s+/gu, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/* ---------- Ambient colours sampled from a photo ---------- */

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function glowColour(r: number, g: number, b: number) {
  const [h, s, l] = rgbToHsl(r, g, b);
  const sat = Math.min(0.9, Math.max(0.35, s * 1.35 + 0.05));
  const light = Math.min(0.62, Math.max(0.42, l));
  return `hsl(${h.toFixed(0)} ${(sat * 100).toFixed(0)}% ${(light * 100).toFixed(0)}%)`;
}

/** Average colours of the top and bottom half of a loaded image. */
function sampleColours(img: HTMLImageElement): [string, string] | null {
  try {
    const size = 6;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(img, 0, 0, size, size);
    const data = context.getImageData(0, 0, size, size).data;
    const sums = [0, 0, 0, 0, 0, 0];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const offset = (y * size + x) * 4;
        const half = y < size / 2 ? 0 : 3;
        sums[half] += data[offset];
        sums[half + 1] += data[offset + 1];
        sums[half + 2] += data[offset + 2];
      }
    }
    const count = (size * size) / 2;
    return [
      glowColour(sums[0] / count, sums[1] / count, sums[2] / count),
      glowColour(sums[3] / count, sums[4] / count, sums[5] / count),
    ];
  } catch {
    // A tainted or undecodable image: the kind colour stays.
    return null;
  }
}

/* ---------- Simulation state (lives outside React) ---------- */

interface SlotNode {
  el: HTMLElement;
  transform: string;
  opacity: string;
  z: string;
  shown: boolean;
}

interface CardAnim {
  key: string;
  index: number;
  el: HTMLElement;
  shadow: HTMLElement;
  scrim: HTMLElement;
  fadeOut: HTMLElement[];
  fadeIn: HTMLElement[];
  stageLeft: number;
  stageTop: number;
  L: number;
  T: number;
  w: number;
  h: number;
  p: number;
  pv: number;
  target: 0 | 1;
  dragY: number;
  dragV: number;
  dragging: boolean;
  onClosed: () => void;
}

interface Sim {
  n: number;
  keys: string[];
  indexOfKey: Map<string, number>;
  wx: Float64Array;
  wy: Float64Array;
  buckets: Map<number, number[]>;
  bound: number;
  W: number;
  H: number;
  U: number;
  base: number;
  ax: number;
  ay: number;
  kx: number;
  ky: number;
  camX: number;
  camY: number;
  velX: number;
  velY: number;
  mode: 'idle' | 'drag' | 'settle';
  target: number;
  centre: number;
  pop: Float64Array;
  popV: Float64Array;
  popping: Set<number>;
  ox: Float64Array;
  oy: Float64Array;
  ovx: Float64Array;
  ovy: Float64Array;
  flyUntil: Float64Array;
  held: number;
  moving: Set<number>;
  su: Float64Array;
  sx: Float64Array;
  sy: Float64Array;
  sr: Float64Array;
  /** Memories (indices) currently shown in the cloud. */
  visible: Set<number>;
  /** Pool: memory index per slot, whether it is in use, and its last use. */
  slotEntry: Int32Array;
  slotActive: Uint8Array;
  slotUsed: Float64Array;
  slotOf: Map<number, number>;
  /** Memory key each slot's DOM currently shows (set by React after render). */
  slotRendered: (string | null)[];
  slotNodes: (SlotNode | null)[];
  hidden: number;
  wiggle: boolean;
  reduced: boolean;
  inView: boolean;
  tiltX: number;
  tiltY: number;
  tiltTX: number;
  tiltTY: number;
  cloudTransform: string;
  glowTransform: string;
  /** Camera of the last layout; layout is skipped while nothing changed. */
  laidX: number;
  laidY: number;
  layoutDirty: boolean;
  stageEl: HTMLElement | null;
  cloudEl: HTMLElement | null;
  glowTiltEl: HTMLElement | null;
  card: CardAnim | null;
  raf: number;
  last: number;
  onSlots: ((keys: (string | null)[]) => void) | null;
  centreListeners: Set<(key: string) => void>;
  settledListeners: Set<(index: number) => void>;
}

function createSim(): Sim {
  return {
    n: 0,
    keys: [],
    indexOfKey: new Map(),
    wx: new Float64Array(0),
    wy: new Float64Array(0),
    buckets: new Map(),
    bound: 0,
    W: 0,
    H: 0,
    U: 0,
    base: 0,
    ax: 1,
    ay: 1,
    kx: 1,
    ky: 1,
    camX: 0,
    camY: 0,
    velX: 0,
    velY: 0,
    mode: 'idle',
    target: 0,
    centre: -1,
    pop: new Float64Array(0),
    popV: new Float64Array(0),
    popping: new Set(),
    ox: new Float64Array(0),
    oy: new Float64Array(0),
    ovx: new Float64Array(0),
    ovy: new Float64Array(0),
    flyUntil: new Float64Array(0),
    held: -1,
    moving: new Set(),
    su: new Float64Array(0),
    sx: new Float64Array(0),
    sy: new Float64Array(0),
    sr: new Float64Array(0),
    visible: new Set(),
    slotEntry: new Int32Array(POOL_SIZE).fill(-1),
    slotActive: new Uint8Array(POOL_SIZE),
    slotUsed: new Float64Array(POOL_SIZE).fill(Number.NEGATIVE_INFINITY),
    slotOf: new Map(),
    slotRendered: new Array<string | null>(POOL_SIZE).fill(null),
    slotNodes: new Array<SlotNode | null>(POOL_SIZE).fill(null),
    hidden: -1,
    wiggle: false,
    reduced: false,
    inView: true,
    tiltX: 0,
    tiltY: 0,
    tiltTX: 0,
    tiltTY: 0,
    cloudTransform: '',
    glowTransform: '',
    laidX: Number.NaN,
    laidY: Number.NaN,
    layoutDirty: true,
    stageEl: null,
    cloudEl: null,
    glowTiltEl: null,
    card: null,
    raf: 0,
    last: -1,
    onSlots: null,
    centreListeners: new Set(),
    settledListeners: new Set(),
  };
}

/**
 * (Re)build the cloud for the given memories. More diary pages arrive while
 * the cloud is shown, so the camera stays on the same memory and pool slots
 * keep their memories; new (older) memories extend the outer rings.
 */
function rebuildSim(sim: Sim, entries: Entry[]) {
  const previousKeys = sim.keys;
  const centreKey = sim.centre >= 0 ? previousKeys[sim.centre] : undefined;
  const targetKey =
    sim.mode === 'settle' ? previousKeys[sim.target] : undefined;
  const offX = sim.centre >= 0 ? sim.camX - sim.wx[sim.centre] : 0;
  const offY = sim.centre >= 0 ? sim.camY - sim.wy[sim.centre] : 0;
  const slotKeys = Array.from(sim.slotEntry, (index) =>
    index >= 0 ? previousKeys[index] : undefined,
  );
  const hiddenKey = sim.hidden >= 0 ? previousKeys[sim.hidden] : undefined;

  const n = entries.length;
  const cells = hexSpiral(n);
  sim.n = n;
  sim.keys = entries.map((entry) => entry.key);
  sim.indexOfKey = new Map(sim.keys.map((key, index) => [key, index]));
  sim.wx = new Float64Array(n);
  sim.wy = new Float64Array(n);
  sim.buckets = new Map();
  let bound = 0;
  cells.forEach(([x, y], index) => {
    sim.wx[index] = x;
    sim.wy[index] = y;
    bound = Math.max(bound, Math.hypot(x, y));
    const key = bucketKey(
      Math.floor(x / BUCKET_SIZE),
      Math.floor(y / BUCKET_SIZE),
    );
    const list = sim.buckets.get(key);
    if (list) list.push(index);
    else sim.buckets.set(key, [index]);
  });
  sim.bound = bound;
  sim.pop = new Float64Array(n);
  sim.popV = new Float64Array(n);
  sim.ox = new Float64Array(n);
  sim.oy = new Float64Array(n);
  sim.ovx = new Float64Array(n);
  sim.ovy = new Float64Array(n);
  sim.flyUntil = new Float64Array(n);
  sim.su = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  sim.sx = new Float64Array(n);
  sim.sy = new Float64Array(n);
  sim.sr = new Float64Array(n);
  sim.popping.clear();
  sim.moving.clear();
  sim.held = -1;

  const centre =
    centreKey !== undefined ? sim.indexOfKey.get(centreKey) : undefined;
  if (centre !== undefined) {
    sim.camX = sim.wx[centre] + offX;
    sim.camY = sim.wy[centre] + offY;
    sim.centre = centre;
  } else {
    sim.camX = 0;
    sim.camY = 0;
    sim.velX = 0;
    sim.velY = 0;
    sim.mode = 'idle';
    sim.centre = -1;
  }
  const target =
    targetKey !== undefined ? sim.indexOfKey.get(targetKey) : undefined;
  if (sim.mode === 'settle') {
    if (target !== undefined) sim.target = target;
    else sim.mode = 'idle';
  }
  if (sim.mode === 'drag') sim.mode = 'idle';
  sim.target = Math.min(sim.target, Math.max(0, n - 1));
  sim.hidden =
    hiddenKey !== undefined ? (sim.indexOfKey.get(hiddenKey) ?? -1) : -1;
  if (sim.card) {
    const index = sim.indexOfKey.get(sim.card.key);
    if (index !== undefined) sim.card.index = index;
  }

  sim.slotOf = new Map();
  sim.visible = new Set();
  slotKeys.forEach((key, slot) => {
    const index = key !== undefined ? sim.indexOfKey.get(key) : undefined;
    if (index === undefined) {
      sim.slotEntry[slot] = -1;
      sim.slotActive[slot] = 0;
      return;
    }
    sim.slotEntry[slot] = index;
    sim.slotOf.set(index, slot);
    if (sim.slotActive[slot]) sim.visible.add(index);
  });
  sim.layoutDirty = true;
}

function measure(sim: Sim) {
  const stage = sim.stageEl;
  if (!stage) return;
  const W = stage.clientWidth;
  const H = stage.clientHeight;
  if (W === 0 || H === 0) return;
  sim.W = W;
  sim.H = H;
  sim.U = Math.min(W, H * 0.8);
  sim.base = DIA_TABLE[0] * sim.U;
  sim.ax = Math.min(W / sim.U, MAX_STRETCH) * FIELD_INSET;
  sim.ay = Math.min(H / sim.U, MAX_STRETCH) * FIELD_INSET;
  const slope = lut(RHO_TABLE, 0.02, true) / 0.02;
  sim.kx = slope * sim.U * sim.ax;
  sim.ky = slope * sim.U * sim.ay;
  sim.layoutDirty = true;
  stage.style.setProperty('--memory-cloud-base', `${sim.base.toFixed(2)}px`);
}

function kick(sim: Sim) {
  if (sim.raf) return;
  sim.raf = window.requestAnimationFrame((now) => frame(sim, now));
}

/** Nearest memory to a world point; scans outward through the buckets. */
function nearestCell(sim: Sim, x: number, y: number) {
  const bx = Math.floor(x / BUCKET_SIZE);
  const by = Math.floor(y / BUCKET_SIZE);
  let best = -1;
  let bestD = Number.POSITIVE_INFINITY;
  for (let reach = 1; reach <= 4; reach += 1) {
    for (let ix = bx - reach; ix <= bx + reach; ix += 1) {
      for (let iy = by - reach; iy <= by + reach; iy += 1) {
        const list = sim.buckets.get(bucketKey(ix, iy));
        if (!list) continue;
        for (const i of list) {
          const d = (sim.wx[i] - x) ** 2 + (sim.wy[i] - y) ** 2;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
    }
    // Anything outside the scanned square is at least `reach` away.
    if (best >= 0 && Math.sqrt(bestD) <= reach * BUCKET_SIZE) return best;
  }
  if (best >= 0) return best;
  for (let i = 0; i < sim.n; i += 1) {
    const d = (sim.wx[i] - x) ** 2 + (sim.wy[i] - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return Math.max(0, best);
}

function notifySettled(sim: Sim, index: number) {
  for (const listener of sim.settledListeners) listener(index);
}

function snapTo(sim: Sim, index: number) {
  sim.camX = sim.wx[index];
  sim.camY = sim.wy[index];
  sim.velX = 0;
  sim.velY = 0;
  sim.mode = 'idle';
  sim.target = index;
  // The centre moves at once, so a key pressed before the next frame
  // already acts on the new centre memory.
  layout(sim, performance.now());
  writeBubbles(sim);
  kick(sim);
  notifySettled(sim, index);
}

function settleTo(sim: Sim, index: number) {
  if (sim.reduced) {
    snapTo(sim, index);
    return;
  }
  sim.mode = 'settle';
  sim.target = index;
  kick(sim);
}

/** Release of the cloud: project the momentum and settle on a bubble there. */
function release(sim: Sim, vx: number, vy: number) {
  if (sim.reduced) {
    snapTo(sim, nearestCell(sim, sim.camX, sim.camY));
    return;
  }
  const speed = Math.hypot(vx, vy);
  const k = speed > MAX_SPEED ? MAX_SPEED / speed : 1;
  sim.velX = vx * k;
  sim.velY = vy * k;
  const target = nearestCell(
    sim,
    sim.camX + sim.velX * PROJECTION_S,
    sim.camY + sim.velY * PROJECTION_S,
  );
  // Momentum that would carry the cloud past its last bubble is mostly
  // absorbed, so the edge answers with a soft rubber-band overshoot.
  const fitX = (sim.wx[target] - sim.camX) / PROJECTION_S;
  const fitY = (sim.wy[target] - sim.camY) / PROJECTION_S;
  const excessX = sim.velX - fitX;
  const excessY = sim.velY - fitY;
  const excess = Math.hypot(excessX, excessY);
  if (excess > EXCESS_FREE) {
    const kept =
      Math.min(EXCESS_FREE + (excess - EXCESS_FREE) * EXCESS_KEEP, EXCESS_MAX) /
      excess;
    sim.velX = fitX + excessX * kept;
    sim.velY = fitY + excessY * kept;
  }
  settleTo(sim, target);
}

/** The unbounded camera position that the rubber band maps onto the current one. */
function rawCamera(sim: Sim): [number, number] {
  const r = Math.hypot(sim.camX, sim.camY);
  if (r <= sim.bound || r === 0) return [sim.camX, sim.camY];
  const k = (sim.bound + rubberInverse(r - sim.bound)) / r;
  return [sim.camX * k, sim.camY * k];
}

function computeSlot(sim: Sim, i: number) {
  const dx = sim.wx[i] - sim.camX;
  const dy = sim.wy[i] - sim.camY;
  const u = Math.hypot(dx, dy);
  sim.su[i] = u;
  const rho = lut(RHO_TABLE, u, true) * sim.U;
  const k = u > 1e-6 ? rho / u : 0;
  sim.sx[i] = sim.W / 2 + dx * k * sim.ax;
  sim.sy[i] = sim.H / 2 + dy * k * sim.ay;
  sim.sr[i] = lut(DIA_TABLE, u) * sim.U * 0.5 * (1 + sim.pop[i]);
}

/** Give every visible memory a pool slot; reuse the slot that still holds it. */
function assignSlots(sim: Sim, list: number[], now: number) {
  const next = new Set(list);
  for (let slot = 0; slot < POOL_SIZE; slot += 1) {
    if (sim.slotActive[slot] && !next.has(sim.slotEntry[slot])) {
      sim.slotActive[slot] = 0;
      sim.slotUsed[slot] = now;
    }
  }
  let dirty = false;
  for (const i of list) {
    let slot = sim.slotOf.get(i);
    if (slot === undefined) {
      let free = -1;
      for (let candidate = 0; candidate < POOL_SIZE; candidate += 1) {
        if (sim.slotActive[candidate]) continue;
        if (free < 0 || sim.slotUsed[candidate] < sim.slotUsed[free])
          free = candidate;
      }
      if (free < 0) continue;
      const old = sim.slotEntry[free];
      if (old >= 0) sim.slotOf.delete(old);
      sim.slotEntry[free] = i;
      sim.slotOf.set(i, free);
      slot = free;
      dirty = true;
    }
    sim.slotActive[slot] = 1;
    sim.slotUsed[slot] = now;
  }
  sim.visible = next;
  if (dirty && sim.onSlots) {
    const keys = Array.from(sim.slotEntry, (index) =>
      index >= 0 ? sim.keys[index] : null,
    );
    sim.onSlots(keys);
  }
}

/** Distances, culling, centre detection and slot positions near the camera. */
function layout(sim: Sim, now: number) {
  sim.laidX = sim.camX;
  sim.laidY = sim.camY;
  sim.layoutDirty = false;
  let best = -1;
  let bestU = Number.POSITIVE_INFINITY;
  const candidates: number[] = [];
  const bx0 = Math.floor((sim.camX - SCAN_U) / BUCKET_SIZE);
  const bx1 = Math.floor((sim.camX + SCAN_U) / BUCKET_SIZE);
  const by0 = Math.floor((sim.camY - SCAN_U) / BUCKET_SIZE);
  const by1 = Math.floor((sim.camY + SCAN_U) / BUCKET_SIZE);
  for (let bx = bx0; bx <= bx1; bx += 1) {
    for (let by = by0; by <= by1; by += 1) {
      const list = sim.buckets.get(bucketKey(bx, by));
      if (!list) continue;
      for (const i of list) {
        const u = Math.hypot(sim.wx[i] - sim.camX, sim.wy[i] - sim.camY);
        if (u < bestU) {
          bestU = u;
          best = i;
        }
        if (u < (sim.visible.has(i) ? UNMOUNT_U : MOUNT_U)) candidates.push(i);
      }
    }
  }
  if (candidates.length > MAX_VISIBLE) {
    for (const i of candidates)
      sim.su[i] = Math.hypot(sim.wx[i] - sim.camX, sim.wy[i] - sim.camY);
    candidates.sort((a, b) => sim.su[a] - sim.su[b]);
    candidates.length = MAX_VISIBLE;
  }
  if (sim.hidden >= 0 && !candidates.includes(sim.hidden))
    candidates.push(sim.hidden);
  for (const i of sim.moving) if (!candidates.includes(i)) candidates.push(i);

  let changed = candidates.length !== sim.visible.size;
  if (!changed) {
    for (const i of candidates) {
      if (!sim.visible.has(i)) {
        changed = true;
        break;
      }
    }
  }
  if (changed) assignSlots(sim, candidates, now);
  for (const i of sim.visible) computeSlot(sim, i);

  if (best < 0 && sim.n > 0) best = nearestCell(sim, sim.camX, sim.camY);
  if (best >= 0 && best !== sim.centre) {
    const previous = sim.centre;
    sim.centre = best;
    if (previous >= 0) {
      haptic('threshold');
      if (!sim.reduced) {
        sim.popV[best] += POP_KICK;
        sim.popping.add(best);
      }
    }
    const key = sim.keys[best];
    for (const listener of sim.centreListeners) listener(key);
  }
}

function writeSlot(sim: Sim, slot: number) {
  const node = sim.slotNodes[slot];
  if (!node) return;
  const i = sim.slotEntry[slot];
  const show =
    sim.base > 0 &&
    sim.slotActive[slot] === 1 &&
    i >= 0 &&
    i < sim.n &&
    i !== sim.hidden &&
    sim.slotRendered[slot] === sim.keys[i];
  if (!show) {
    if (node.shown) {
      node.el.style.visibility = 'hidden';
      node.shown = false;
    }
    return;
  }
  const half = sim.base / 2;
  const x = sim.sx[i] + sim.ox[i] - half;
  const y = sim.sy[i] + sim.oy[i] - half;
  const scale = (sim.sr[i] * 2) / sim.base;
  const transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
  if (transform !== node.transform) {
    node.el.style.transform = transform;
    node.transform = transform;
  }
  const opacity = fadeAt(sim.su[i]).toFixed(2);
  if (opacity !== node.opacity) {
    node.el.style.opacity = opacity;
    node.opacity = opacity;
  }
  const z =
    i === sim.held || sim.moving.has(i) ? '3' : i === sim.centre ? '2' : '';
  if (z !== node.z) {
    node.el.style.zIndex = z;
    node.z = z;
  }
  if (!node.shown) {
    node.el.style.visibility = '';
    node.shown = true;
  }
}

function writeBubbles(sim: Sim) {
  for (let slot = 0; slot < POOL_SIZE; slot += 1) writeSlot(sim, slot);
}

function writeLayers(sim: Sim) {
  const cloud = `translate3d(${sim.tiltX.toFixed(1)}px, ${sim.tiltY.toFixed(1)}px, 0)`;
  if (sim.cloudEl && cloud !== sim.cloudTransform) {
    sim.cloudEl.style.transform = cloud;
    sim.cloudTransform = cloud;
  }
  const glow = `translate3d(${(-0.6 * sim.tiltX).toFixed(1)}px, ${(-0.6 * sim.tiltY).toFixed(1)}px, 0)`;
  if (sim.glowTiltEl && glow !== sim.glowTransform) {
    sim.glowTiltEl.style.transform = glow;
    sim.glowTransform = glow;
  }
}

function collide(sim: Sim, i: number, j: number) {
  const xi = sim.sx[i] + sim.ox[i];
  const yi = sim.sy[i] + sim.oy[i];
  const xj = sim.sx[j] + sim.ox[j];
  const yj = sim.sy[j] + sim.oy[j];
  const dx = xj - xi;
  const dy = yj - yi;
  const dist = Math.hypot(dx, dy);
  const min = sim.sr[i] + sim.sr[j] + 3;
  if (dist >= min || dist < 0.001) return;
  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = (min - dist) * COLLIDE_SOFTNESS;
  const mi = i === sim.held ? 1e6 : Math.max(40, sim.sr[i] ** 2);
  const mj = j === sim.held ? 1e6 : Math.max(40, sim.sr[j] ** 2);
  const wi = mj / (mi + mj);
  const wj = mi / (mi + mj);
  if (i !== sim.held) {
    sim.ox[i] -= nx * overlap * wi;
    sim.oy[i] -= ny * overlap * wi;
  }
  if (j !== sim.held) {
    sim.ox[j] += nx * overlap * wj;
    sim.oy[j] += ny * overlap * wj;
  }
  const approach =
    (sim.ovx[i] - sim.ovx[j]) * nx + (sim.ovy[i] - sim.ovy[j]) * ny;
  if (approach > 0) {
    const impulse = ((1 + COLLIDE_BOUNCE) * approach) / (1 / mi + 1 / mj);
    sim.ovx[i] -= (impulse / mi) * nx;
    sim.ovy[i] -= (impulse / mi) * ny;
    sim.ovx[j] += (impulse / mj) * nx;
    sim.ovy[j] += (impulse / mj) * ny;
  }
  sim.moving.add(j);
}

/** Playful mode: flung and pushed bubbles, springing back into their slots. */
function physics(sim: Sim, dt: number, now: number) {
  if (sim.moving.size === 0) return false;
  const damping = 2 * HOME_ZETA * Math.sqrt(HOME_K);
  let flying = false;
  for (const i of sim.moving) {
    if (i === sim.held) continue;
    if (sim.flyUntil[i] > now) {
      flying = true;
      const friction = Math.exp(-FLIGHT_FRICTION * dt);
      sim.ovx[i] *= friction;
      sim.ovy[i] *= friction;
      if (Math.hypot(sim.ovx[i], sim.ovy[i]) < 60) sim.flyUntil[i] = 0;
    } else {
      sim.ovx[i] += (-HOME_K * sim.ox[i] - damping * sim.ovx[i]) * dt;
      sim.ovy[i] += (-HOME_K * sim.oy[i] - damping * sim.ovy[i]) * dt;
    }
    sim.ox[i] += sim.ovx[i] * dt;
    sim.oy[i] += sim.ovy[i] * dt;
    if (sim.flyUntil[i] > now) {
      const r = sim.sr[i];
      const x = sim.sx[i] + sim.ox[i];
      const y = sim.sy[i] + sim.oy[i];
      if (x < r) {
        sim.ox[i] += r - x;
        sim.ovx[i] = Math.abs(sim.ovx[i]) * WALL_BOUNCE;
      } else if (x > sim.W - r) {
        sim.ox[i] -= x - (sim.W - r);
        sim.ovx[i] = -Math.abs(sim.ovx[i]) * WALL_BOUNCE;
      }
      if (y < r) {
        sim.oy[i] += r - y;
        sim.ovy[i] = Math.abs(sim.ovy[i]) * WALL_BOUNCE;
      } else if (y > sim.H - r) {
        sim.oy[i] -= y - (sim.H - r);
        sim.ovy[i] = -Math.abs(sim.ovy[i]) * WALL_BOUNCE;
      }
    }
  }
  if (sim.wiggle || flying) {
    const movers = [...sim.moving];
    const moverSet = new Set(movers);
    for (const i of movers) {
      for (const j of sim.visible) {
        if (j === i || j === sim.hidden) continue;
        if (j < i && moverSet.has(j)) continue;
        collide(sim, i, j);
      }
    }
  }
  for (const i of [...sim.moving]) {
    if (i === sim.held || sim.flyUntil[i] > now) continue;
    if (
      Math.abs(sim.ox[i]) < 0.3 &&
      Math.abs(sim.oy[i]) < 0.3 &&
      Math.abs(sim.ovx[i]) < 4 &&
      Math.abs(sim.ovy[i]) < 4
    ) {
      sim.ox[i] = 0;
      sim.oy[i] = 0;
      sim.ovx[i] = 0;
      sim.ovy[i] = 0;
      sim.moving.delete(i);
    }
  }
  return true;
}

function writeCard(sim: Sim) {
  const card = sim.card;
  if (!card) return;
  const i = card.index;
  const r = Math.max(1, sim.sr[i]);
  const bx = card.stageLeft + sim.tiltX + sim.sx[i] + sim.ox[i] - r;
  const by = card.stageTop + sim.tiltY + sim.sy[i] + sim.oy[i] - r;
  const bs = (2 * r) / card.w;
  const p = card.p;
  let x = bx + (card.L - bx) * p;
  let y = by + (card.T - by) * p;
  let s = bs + (1 - bs) * p;
  const drag = card.dragY;
  const dragScale = 1 - Math.min(Math.max(drag, 0), 400) / 1800;
  x += (card.w * s * (1 - dragScale)) / 2;
  y += drag;
  s *= dragScale;
  const transform = `translate3d(${(x - card.L).toFixed(1)}px, ${(y - card.T).toFixed(1)}px, 0) scale(${s.toFixed(4)})`;
  card.el.style.transform = transform;
  card.shadow.style.transform = transform;
  card.shadow.style.opacity = clamp01((p - 0.35) / 0.65).toFixed(3);
  card.scrim.style.opacity = (clamp01(p) * (1 - clamp01(drag / 500))).toFixed(
    3,
  );
  const out = (1 - clamp01((p - 0.08) * 2.6)).toFixed(2);
  for (const el of card.fadeOut) el.style.opacity = out;
  const into = clamp01((p - 0.4) * 2.2).toFixed(2);
  for (const el of card.fadeIn) el.style.opacity = into;
}

function finishCard(sim: Sim) {
  const card = sim.card;
  if (!card) return;
  sim.card = null;
  sim.hidden = -1;
  // Show the bubble in the same frame the card lands in it.
  writeBubbles(sim);
  sim.layoutDirty = true;
  kick(sim);
  card.onClosed();
}

function frame(sim: Sim, now: number) {
  sim.raf = 0;
  const dt =
    sim.last < 0 || now - sim.last > 100
      ? 1 / 60
      : Math.min(0.034, Math.max(0.0005, (now - sim.last) / 1000));
  sim.last = now;
  let busy = false;
  const steps = Math.max(1, Math.ceil(dt * 120));
  const h = dt / steps;
  const card = sim.card;
  for (let step = 0; step < steps; step += 1) {
    if (sim.mode === 'settle') {
      const tx = sim.wx[sim.target];
      const ty = sim.wy[sim.target];
      const k = SETTLE_OMEGA * SETTLE_OMEGA;
      const c = 2 * SETTLE_ZETA * SETTLE_OMEGA;
      sim.velX += (-k * (sim.camX - tx) - c * sim.velX) * h;
      sim.velY += (-k * (sim.camY - ty) - c * sim.velY) * h;
      sim.camX += sim.velX * h;
      sim.camY += sim.velY * h;
    }
    if (sim.popping.size > 0) {
      const c = 2 * POP_ZETA * Math.sqrt(POP_K);
      for (const i of sim.popping) {
        sim.popV[i] += (-POP_K * sim.pop[i] - c * sim.popV[i]) * h;
        sim.pop[i] += sim.popV[i] * h;
      }
    }
    if (card) {
      const omega = card.target === 1 ? OPEN_OMEGA : CLOSE_OMEGA;
      const zeta = card.target === 1 ? OPEN_ZETA : CLOSE_ZETA;
      card.pv +=
        (-omega * omega * (card.p - card.target) - 2 * zeta * omega * card.pv) *
        h;
      card.p += card.pv * h;
      if (!card.dragging) {
        card.dragV +=
          (-CARD_DRAG_OMEGA * CARD_DRAG_OMEGA * card.dragY -
            2 * CARD_DRAG_ZETA * CARD_DRAG_OMEGA * card.dragV) *
          h;
        card.dragY += card.dragV * h;
      }
    }
  }
  if (sim.mode === 'settle') {
    const tx = sim.wx[sim.target];
    const ty = sim.wy[sim.target];
    if (
      Math.hypot(sim.camX - tx, sim.camY - ty) < 0.0015 &&
      Math.hypot(sim.velX, sim.velY) < 0.02
    ) {
      sim.camX = tx;
      sim.camY = ty;
      sim.velX = 0;
      sim.velY = 0;
      sim.mode = 'idle';
      notifySettled(sim, sim.target);
    } else busy = true;
  }
  const popsActive = sim.popping.size > 0;
  for (const i of [...sim.popping]) {
    if (Math.abs(sim.pop[i]) < 0.0005 && Math.abs(sim.popV[i]) < 0.005) {
      sim.pop[i] = 0;
      sim.popV[i] = 0;
      sim.popping.delete(i);
    } else busy = true;
  }
  if (!sim.reduced) {
    const follow = 1 - Math.exp(-dt * 5);
    sim.tiltX += (sim.tiltTX - sim.tiltX) * follow;
    sim.tiltY += (sim.tiltTY - sim.tiltY) * follow;
    if (
      Math.abs(sim.tiltTX - sim.tiltX) > 0.05 ||
      Math.abs(sim.tiltTY - sim.tiltY) > 0.05
    )
      busy = true;
  }
  // The bubbles are laid out and written only when something moved them;
  // tilt and card frames over a resting cloud touch two or three layers.
  const needsLayout =
    sim.layoutDirty ||
    popsActive ||
    sim.moving.size > 0 ||
    sim.camX !== sim.laidX ||
    sim.camY !== sim.laidY;
  if (needsLayout) {
    layout(sim, now);
    if (physics(sim, dt, now)) busy = true;
    writeBubbles(sim);
  }
  writeLayers(sim);
  if (card && sim.card === card) {
    writeCard(sim);
    const resting =
      Math.abs(card.p - card.target) < 0.0005 &&
      Math.abs(card.pv) < 0.002 &&
      (card.dragging || Math.abs(card.dragY) < 0.3);
    if (card.target === 0 && card.p < 0.004) finishCard(sim);
    else if (!resting) busy = true;
  }
  if (busy) kick(sim);
  else sim.last = -1;
}

/* ---------- Pointer bookkeeping ---------- */

interface Sample {
  t: number;
  x: number;
  y: number;
}

function velocityOf(samples: Sample[], now: number) {
  const last = samples[samples.length - 1];
  if (!last || now - last.t > 60) return { x: 0, y: 0 };
  const first =
    samples.find((sample) => sample.t >= now - VELOCITY_WINDOW_MS) ?? last;
  const span = (last.t - first.t) / 1000;
  if (span < 0.01) return { x: 0, y: 0 };
  return { x: (last.x - first.x) / span, y: (last.y - first.y) / span };
}

function pushSample(samples: Sample[], sample: Sample) {
  samples.push(sample);
  while (samples.length > 2 && sample.t - samples[0].t > VELOCITY_WINDOW_MS * 2)
    samples.shift();
}

interface Gesture {
  id: number;
  x0: number;
  y0: number;
  mode: 'pending' | 'pan' | 'bubble';
  hit: number;
  caught: boolean;
  longPressed: boolean;
  rawX0: number;
  rawY0: number;
  ox0: number;
  oy0: number;
  samples: Sample[];
}

/* ---------- Faces (shared by bubble and card) ---------- */

function Face({
  entry,
  loadMemoryImage,
  large = false,
}: {
  entry: Entry;
  loadMemoryImage: LoadMemoryImage;
  large?: boolean;
}) {
  switch (entry.kind) {
    case 'photo':
      return (
        <div className="memory-cloud-face" data-face="photo">
          <MemoryPhoto entry={entry} loadMemoryImage={loadMemoryImage} />
        </div>
      );
    case 'heart':
      return (
        <div
          className="memory-cloud-face"
          data-face="heart"
          data-heart-emotion={entry.emotion}
        >
          <span className="memory-cloud-face-text">
            <svg
              className="memory-cloud-face-heart"
              viewBox="0 0 24 22"
              aria-hidden="true"
              focusable="false"
            >
              <path d={HEART_PATH} />
            </svg>
            <q>{shortText(entry.title, 64)}</q>
          </span>
          {large ? (
            <svg
              className="memory-cloud-face-glyph"
              viewBox="0 0 24 22"
              aria-hidden="true"
              focusable="false"
            >
              <path d={HEART_PATH} />
            </svg>
          ) : null}
        </div>
      );
    case 'milestone':
      return (
        <div className="memory-cloud-face" data-face="milestone">
          <KeepsakeStampMark className="memory-cloud-face-stamp" />
          <strong className="memory-cloud-face-text">
            {shortText(entry.title, 48)}
          </strong>
        </div>
      );
    case 'words':
      return (
        <div className="memory-cloud-face" data-face="words">
          <span className="memory-cloud-face-text">
            {shortText(entry.title, 70)}
          </span>
          {large ? (
            <svg
              className="memory-cloud-face-glyph"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path d={QUOTE_PATH} />
            </svg>
          ) : null}
        </div>
      );
  }
}

type SimRef = { current: Sim | null };

/** One pooled bubble node; its content changes only when the slot gets a new memory. */
const BubbleSlot = memo(
  function BubbleSlot({
    slot,
    entry,
    loadMemoryImage,
    simRef,
  }: {
    slot: number;
    entry: Entry | null;
    loadMemoryImage: LoadMemoryImage;
    simRef: SimRef;
  }) {
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
      const sim = simRef.current;
      const el = ref.current;
      if (!sim || !el) return;
      const node: SlotNode = {
        el,
        transform: '',
        opacity: '',
        z: '',
        shown: false,
      };
      el.style.visibility = 'hidden';
      sim.slotNodes[slot] = node;
      return () => {
        if (sim.slotNodes[slot] === node) sim.slotNodes[slot] = null;
      };
    }, [simRef, slot]);
    const key = entry?.key ?? null;
    useLayoutEffect(() => {
      const sim = simRef.current;
      if (!sim) return;
      sim.slotRendered[slot] = key;
      writeSlot(sim, slot);
    }, [simRef, slot, key]);
    const hash = entry ? keyHash(entry.key) : slot * 97;
    // Per-bubble variation of the playful jiggle as fractions of the
    // motion layer's jiggle roles.
    const style = {
      '--memory-cloud-jiggle-phase': (
        (hash % JIGGLE_PHASES) /
        JIGGLE_PHASES
      ).toFixed(3),
      '--memory-cloud-jiggle-spread': (
        (hash % JIGGLE_SPREADS) /
        JIGGLE_SPREADS
      ).toFixed(3),
    } as CSSProperties;
    return (
      <div
        ref={ref}
        className="memory-cloud-bubble"
        data-kind={entry?.kind}
        style={style}
        aria-hidden="true"
      >
        {entry ? (
          <div className="memory-cloud-bubble-body">
            <Face entry={entry} loadMemoryImage={loadMemoryImage} />
            <span className="memory-cloud-gloss" />
          </div>
        ) : null}
      </div>
    );
  },
  (previous, next) =>
    previous.slot === next.slot &&
    previous.simRef === next.simRef &&
    previous.loadMemoryImage === next.loadMemoryImage &&
    previous.entry?.key === next.entry?.key &&
    previous.entry?.title === next.entry?.title &&
    previous.entry?.cover?.id === next.entry?.cover?.id,
);

/** The fixed pool of bubble nodes; re-renders only when a slot changes its memory. */
const BubblePool = memo(function BubblePool({
  simRef,
  ordered,
  loadMemoryImage,
}: {
  simRef: SimRef;
  ordered: Entry[];
  loadMemoryImage: LoadMemoryImage;
}) {
  const [slots, setSlots] = useState<(string | null)[]>(() =>
    new Array<string | null>(POOL_SIZE).fill(null),
  );
  useLayoutEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    let first = true;
    sim.onSlots = (keys) => {
      // The first assignment renders synchronously (before paint); later
      // swaps at the rim are low priority, so they never block a frame.
      if (first) {
        first = false;
        setSlots(keys);
      } else startTransition(() => setSlots(keys));
    };
    return () => {
      sim.onSlots = null;
    };
  }, [simRef]);
  const byKey = useMemo(
    () => new Map(ordered.map((entry) => [entry.key, entry])),
    [ordered],
  );
  return (
    <>
      {slots.map((key, slot) => (
        <BubbleSlot
          // biome-ignore lint/suspicious/noArrayIndexKey: the pool slot is the node's identity; its memory changes.
          key={slot}
          slot={slot}
          entry={key ? (byKey.get(key) ?? null) : null}
          loadMemoryImage={loadMemoryImage}
          simRef={simRef}
        />
      ))}
    </>
  );
});

/** The frosted pill with the centre memory; it listens to the loop itself. */
function CentrePill({
  simRef,
  ordered,
  kicker,
  wiggle,
}: {
  simRef: SimRef;
  ordered: Entry[];
  kicker: string;
  wiggle: boolean;
}) {
  const { t } = useTranslation();
  const [centreKey, setCentreKey] = useState<string | null>(null);
  useLayoutEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    const listener = (key: string) => setCentreKey(key);
    sim.centreListeners.add(listener);
    return () => {
      sim.centreListeners.delete(listener);
    };
  }, [simRef]);
  const entry = ordered.find((item) => item.key === centreKey) ?? ordered[0];
  if (!entry) return null;
  return (
    <div className="memory-cloud-pill" aria-hidden="true">
      <div
        key={wiggle ? 'wiggle' : entry.key}
        className="memory-cloud-pill-inner"
      >
        {wiggle ? (
          <>
            <span className="memory-cloud-pill-title">
              {t('memoryWorlds.cloud.playTitle')}
            </span>
            <span className="memory-cloud-pill-date">
              {t('memoryWorlds.cloud.playHint')}
            </span>
          </>
        ) : (
          <>
            <span className="memory-cloud-pill-title">
              {shortText(entry.title, 60)}
            </span>
            <span className="memory-cloud-pill-date">
              {entry.isLead && kicker ? `${kicker} · ` : ''}
              {entry.dateLabel}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/** Polite announcement of the memory the cloud came to rest on. */
function CentreAnnouncer({
  simRef,
  ordered,
}: {
  simRef: SimRef;
  ordered: Entry[];
}) {
  const { t } = useTranslation();
  const [settledKey, setSettledKey] = useState<string | null>(null);
  useLayoutEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    const listener = (index: number) => setSettledKey(sim.keys[index] ?? null);
    sim.settledListeners.add(listener);
    return () => {
      sim.settledListeners.delete(listener);
    };
  }, [simRef]);
  const entry = settledKey
    ? ordered.find((item) => item.key === settledKey)
    : undefined;
  return (
    <p className="sr-only" aria-live="polite">
      {entry
        ? t('memoryWorlds.cloud.centre', {
            title: entry.title,
            date: entry.dateLabel,
          })
        : ''}
    </p>
  );
}

/* ---------- The card a bubble grows into ---------- */

interface CardSpec {
  key: string;
  w: number;
  L: number;
}

function circleClip(w: number, h: number) {
  return `inset(0px 0px ${Math.max(0, h - w).toFixed(1)}px 0px round ${(w / 2).toFixed(1)}px)`;
}

function MomentCard({
  simRef,
  spec,
  entry,
  kicker,
  loadMemoryImage,
  onOpen,
  onClosed,
}: {
  simRef: SimRef;
  spec: CardSpec;
  entry: Entry;
  kicker: string;
  loadMemoryImage: LoadMemoryImage;
  onOpen: OpenMemoryWorldItem;
  onClosed: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  // The card lives in a portal: its media gets its own pixel units.
  useContainerUnits(modalRef, CARD_UNITS);
  const cardRef = useRef<HTMLElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{
    id: number;
    x0: number;
    y0: number;
    captured: boolean;
    samples: Sample[];
  } | null>(null);
  const suppressClick = useRef(false);
  const suppressTimer = useRef<number | undefined>(undefined);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  // The card is created once per opening; spec and entry stay fixed for it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per card; the simulation is read through its ref.
  useLayoutEffect(() => {
    const sim = simRef.current;
    const el = cardRef.current;
    const shadow = shadowRef.current;
    const scrim = scrimRef.current;
    const stage = sim?.stageEl;
    const index = sim?.indexOfKey.get(spec.key);
    if (!sim || !el || !shadow || !scrim || !stage || index === undefined)
      return;
    // Layout is read once here (and once at closing), never per frame.
    const h = el.offsetHeight;
    const stageRect = stage.getBoundingClientRect();
    const T = Math.max(12, Math.round((window.innerHeight - h) / 2));
    el.style.top = `${T}px`;
    shadow.style.top = `${T}px`;
    shadow.style.height = `${h}px`;
    const anim: CardAnim = {
      key: spec.key,
      index,
      el,
      shadow,
      scrim,
      fadeOut: [
        ...el.querySelectorAll<HTMLElement>(
          '.memory-cloud-face-text, .memory-cloud-card-media .memory-cloud-gloss',
        ),
      ],
      fadeIn: [...el.querySelectorAll<HTMLElement>('.memory-cloud-face-glyph')],
      stageLeft: stageRect.left,
      stageTop: stageRect.top,
      L: spec.L,
      T,
      w: spec.w,
      h,
      p: 0,
      pv: 0,
      target: 1,
      dragY: 0,
      dragV: 0,
      dragging: false,
      onClosed: () => onClosedRef.current(),
    };
    sim.card = anim;
    sim.hidden = index;
    sim.layoutDirty = true;
    const end = `inset(0px 0px 0px 0px round ${CARD_RADIUS}px)`;
    if (sim.reduced) {
      anim.p = 1;
      el.style.clipPath = end;
    } else {
      // The clip opens from the bubble's circle with the motion layer's
      // clip role (`data-clip`); the first write must not transition.
      el.dataset.clip = 'still';
      el.style.clipPath = circleClip(spec.w, h);
      void el.offsetWidth;
      el.dataset.clip = 'opening';
      el.style.clipPath = end;
    }
    layout(sim, performance.now());
    writeBubbles(sim);
    writeCard(sim);
    kick(sim);
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      window.clearTimeout(suppressTimer.current);
      if (sim.card === anim) {
        sim.card = null;
        sim.hidden = -1;
        sim.layoutDirty = true;
        kick(sim);
      }
    };
  }, []);

  const close = useCallback(() => {
    const sim = simRef.current;
    const card = sim?.card;
    if (!sim || !card || card.target === 0) return;
    card.target = 0;
    card.dragging = false;
    if (sim.reduced) {
      card.p = 0;
      finishCard(sim);
      return;
    }
    const rect = sim.stageEl?.getBoundingClientRect();
    if (rect) {
      card.stageLeft = rect.left;
      card.stageTop = rect.top;
    }
    card.el.dataset.clip = 'closing';
    card.el.style.clipPath = circleClip(card.w, card.h);
    kick(sim);
  }, [simRef]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusables = [
      ...(cardRef.current?.querySelectorAll<HTMLElement>('a[href], button') ??
        []),
    ];
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (drag.current || (event.pointerType === 'mouse' && event.button !== 0))
      return;
    drag.current = {
      id: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      captured: false,
      samples: [{ t: performance.now(), x: 0, y: 0 }],
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const g = drag.current;
    const sim = simRef.current;
    const card = sim?.card;
    if (!g || g.id !== event.pointerId || !sim || !card || card.target === 0)
      return;
    const dx = event.clientX - g.x0;
    const dy = event.clientY - g.y0;
    if (!g.captured) {
      if (dy > CARD_DRAG_SLOP && dy > Math.abs(dx)) {
        g.captured = true;
        card.dragging = true;
        card.dragV = 0;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Capture is a nicety; the drag still works while over the card.
        }
      } else if (Math.abs(dx) > 14 || dy < -14) {
        drag.current = null;
        return;
      } else return;
    }
    card.dragY = dy > 0 ? dy : -rubber(-dy / 200) * 200;
    pushSample(g.samples, { t: performance.now(), x: 0, y: card.dragY });
    kick(sim);
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLElement>) => {
    const g = drag.current;
    if (!g || g.id !== event.pointerId) return;
    drag.current = null;
    const sim = simRef.current;
    const card = sim?.card;
    if (!g.captured || !sim || !card) return;
    suppressClick.current = true;
    window.clearTimeout(suppressTimer.current);
    suppressTimer.current = window.setTimeout(() => {
      suppressClick.current = false;
    }, 80);
    const velocity = velocityOf(g.samples, performance.now());
    card.dragging = false;
    card.dragV = velocity.y;
    if (
      event.type !== 'pointercancel' &&
      (card.dragY > SWIPE_CLOSE_PX || velocity.y > SWIPE_CLOSE_SPEED)
    )
      close();
    else kick(sim);
  };

  const onClickCapture = (event: ReactMouseEvent<HTMLElement>) => {
    if (!suppressClick.current) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const cardStyle: CSSProperties = { left: spec.L, width: spec.w };

  return createPortal(
    <div
      ref={modalRef}
      className="memory-cloud-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
    >
      {/* A pointer shortcut outside the card; the close button and Escape offer the same. */}
      <div
        ref={scrimRef}
        className="memory-cloud-scrim"
        onClick={close}
        aria-hidden="true"
      />
      <div
        ref={shadowRef}
        className="memory-cloud-card-shadow"
        style={cardStyle}
        aria-hidden="true"
      />
      <article
        ref={cardRef}
        className="memory-cloud-card"
        data-kind={entry.kind}
        style={cardStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={onClickCapture}
      >
        <div className="memory-cloud-card-media">
          <Face entry={entry} loadMemoryImage={loadMemoryImage} large />
          <span className="memory-cloud-gloss" aria-hidden="true" />
          <span className="memory-cloud-grabber" aria-hidden="true" />
          <button
            ref={closeRef}
            type="button"
            className="memory-cloud-close"
            onClick={close}
            aria-label={t('memoryWorlds.cloud.backToCloud')}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="memory-cloud-card-body">
          {entry.isLead && kicker ? (
            <span className="memory-cloud-card-kicker">{kicker}</span>
          ) : null}
          <h3
            id={titleId}
            className="memory-cloud-card-title"
            data-kind={entry.kind}
          >
            {entry.kind === 'heart' ? <q>{entry.title}</q> : entry.title}
          </h3>
          <p className="memory-cloud-card-meta">
            <time dateTime={entry.dateTime}>{entry.dateLabel}</time>
            {entry.author ? <span> · {entry.author}</span> : null}
          </p>
          <Link
            className="memory-cloud-card-open"
            to={entry.path}
            onClick={(event) => onOpen(event, entry.path, entry.key)}
          >
            {t('memoryWorlds.cloud.openInDiary')}
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </article>
    </div>,
    document.body,
  );
}

/* ---------- Ambient glow ---------- */

interface GlowState {
  layers: [HTMLDivElement | null, HTMLDivElement | null];
  active: number;
  key: string;
  timer: number | undefined;
  retries: Map<string, number>;
  cache: Map<string, [string, string] | null>;
}

/** Photo colours are sampled only while the cloud rests (never during a drag). */
function glowColoursFor(
  glow: GlowState,
  sim: Sim,
  entry: Entry,
  index: number,
  retry: () => void,
): [string, string] | null {
  if (entry.kind !== 'photo' || entry.cover?.isSensitive !== false) return null;
  if (glow.cache.has(entry.key)) return glow.cache.get(entry.key) ?? null;
  const slot = sim.slotOf.get(index);
  const node = slot !== undefined ? sim.slotNodes[slot] : null;
  const img =
    node?.el.querySelector<HTMLImageElement>('img.story-media-preview') ?? null;
  if (img?.complete && img.naturalWidth > 0) {
    const colours = sampleColours(img);
    glow.cache.set(entry.key, colours);
    return colours;
  }
  const tries = glow.retries.get(entry.key) ?? 0;
  if (tries < GLOW_RETRIES) {
    glow.retries.set(entry.key, tries + 1);
    if (img) img.addEventListener('load', retry, { once: true });
    else window.setTimeout(retry, GLOW_RETRY_MS);
  }
  return null;
}

function showGlow(glow: GlowState, sim: Sim, entries: Entry[], index: number) {
  const entry = entries[index];
  if (!entry) return;
  const colours = glowColoursFor(glow, sim, entry, index, () => {
    if (sim.centre === index && sim.mode === 'idle')
      showGlow(glow, sim, entries, index);
  });
  const key = `${entry.key}|${colours ? colours.join(',') : entry.kind}`;
  if (key === glow.key) return;
  glow.key = key;
  const next = 1 - glow.active;
  const incoming = glow.layers[next];
  const outgoing = glow.layers[glow.active];
  if (!incoming) return;
  incoming.dataset.kind = entry.kind;
  if (entry.emotion) incoming.dataset.heartEmotion = entry.emotion;
  else delete incoming.dataset.heartEmotion;
  if (colours) {
    incoming.style.setProperty('--memory-cloud-glow-a', colours[0]);
    incoming.style.setProperty('--memory-cloud-glow-b', colours[1]);
  } else {
    incoming.style.removeProperty('--memory-cloud-glow-a');
    incoming.style.removeProperty('--memory-cloud-glow-b');
  }
  incoming.dataset.on = 'true';
  if (outgoing) delete outgoing.dataset.on;
  glow.active = next;
}

/* ---------- The world ---------- */

/**
 * Eure Momentwolke: drag the cloud, tap a bubble to grow it into a card,
 * long-press to play. The focusable stage is the keyboard and screen-reader
 * fallback (arrow keys wander, Enter opens the centre memory).
 */
export function MomentCloudWorld(props: MemoryWorldProps) {
  // The cloud mounts with its first memory, so its stage, observers and
  // pixel units are set up once against real elements.
  return props.entries.length === 0 ? null : <MomentCloud {...props} />;
}

function MomentCloud({
  entries,
  kicker,
  loadMemoryImage,
  onOpen,
}: MemoryWorldProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  // Former CSS containers get pixel units (see containerUnits.ts).
  useContainerUnits(rootRef, BUBBLE_UNITS);
  const hintId = useId();
  /** Lead first, then newest first, so neighbours are close in time. */
  const ordered = useMemo(() => {
    const lead = entries.filter((entry) => entry.isLead);
    const rest = entries
      .filter((entry) => !entry.isLead)
      .sort((a, b) => b.date.getTime() - a.date.getTime());
    return [...lead, ...rest];
  }, [entries]);

  const [wiggle, setWiggle] = useState(false);
  const [card, setCard] = useState<CardSpec | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const cloudRef = useRef<HTMLDivElement>(null);
  const glowTiltRef = useRef<HTMLDivElement>(null);
  const glowARef = useRef<HTMLDivElement>(null);
  const glowBRef = useRef<HTMLDivElement>(null);
  const orderedRef = useRef(ordered);
  orderedRef.current = ordered;
  const glow = useRef<GlowState>({
    layers: [null, null],
    active: 0,
    key: '',
    timer: undefined,
    retries: new Map(),
    cache: new Map(),
  });
  const gesture = useRef<Gesture | null>(null);
  const longPressTimer = useRef<number | undefined>(undefined);
  const built = useRef(false);

  const simRef = useRef<Sim | null>(null);
  if (!simRef.current) simRef.current = createSim();

  // Build the cloud for these memories (and extend it as pages arrive).
  useLayoutEffect(() => {
    const sim = simRef.current;
    const stage = stageRef.current;
    if (!sim || !stage || ordered.length === 0) return;
    sim.stageEl = stage;
    sim.cloudEl = cloudRef.current;
    sim.glowTiltEl = glowTiltRef.current;
    sim.reduced = prefersReducedMotion();
    rebuildSim(sim, ordered);
    if (!built.current) {
      built.current = true;
      measure(sim);
    }
    layout(sim, performance.now());
    writeBubbles(sim);
    writeLayers(sim);
    kick(sim);
  }, [ordered]);

  // Measure on resize (the only place the stage size is read) and glow
  // after the cloud came to rest.
  useEffect(() => {
    const sim = simRef.current;
    const stage = stageRef.current;
    if (!sim || !stage) return;
    const state = glow.current;
    state.layers = [glowARef.current, glowBRef.current];
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            measure(sim);
            kick(sim);
          });
    observer?.observe(stage);
    const scheduleGlow = (index: number) => {
      window.clearTimeout(state.timer);
      state.timer = window.setTimeout(() => {
        if (sim.mode === 'idle' && sim.centre === index)
          showGlow(state, sim, orderedRef.current, index);
      }, GLOW_DELAY_MS);
    };
    sim.settledListeners.add(scheduleGlow);
    scheduleGlow(Math.max(0, sim.centre));
    return () => {
      observer?.disconnect();
      sim.settledListeners.delete(scheduleGlow);
      window.clearTimeout(state.timer);
      if (sim.raf) window.cancelAnimationFrame(sim.raf);
      sim.raf = 0;
      sim.last = -1;
    };
  }, []);

  // Reduced motion can change while the page is open (the app's one source).
  useEffect(
    () =>
      subscribeReducedMotion(() => {
        const sim = simRef.current;
        if (!sim) return;
        sim.reduced = prefersReducedMotion();
        if (sim.reduced) {
          sim.tiltTX = 0;
          sim.tiltTY = 0;
          sim.tiltX = 0;
          sim.tiltY = 0;
          sim.wiggle = false;
          setWiggle(false);
          kick(sim);
        }
      }),
    [],
  );

  // The glow drift and the tilt run only while the stage is seen: the page
  // is visible, its kept view is shown and it is on screen (M8).
  useEffect(() => {
    const stage = stageRef.current;
    const sim = simRef.current;
    if (!stage || !sim) return;
    return observeVisibility(stage, (state) => {
      sim.inView = state.visible;
      stage.dataset.ambient = state.visible ? 'on' : 'paused';
    });
  }, []);

  // Tilt parallax, only where the orientation sensor needs no permission
  // prompt.
  useEffect(() => {
    const sim = simRef.current;
    if (!sim || typeof window.DeviceOrientationEvent === 'undefined') return;
    const needsPermission =
      typeof (
        window.DeviceOrientationEvent as unknown as {
          requestPermission?: unknown;
        }
      ).requestPermission === 'function';
    if (needsPermission) return;
    let base: { beta: number; gamma: number } | null = null;
    const onTilt = (event: DeviceOrientationEvent) => {
      if (
        !sim.inView ||
        sim.reduced ||
        event.beta === null ||
        event.gamma === null
      )
        return;
      if (!base) base = { beta: event.beta, gamma: event.gamma };
      base.beta += (event.beta - base.beta) * TILT_RECENTRE;
      base.gamma += (event.gamma - base.gamma) * TILT_RECENTRE;
      const tx = Math.max(
        -TILT_MAX,
        Math.min(TILT_MAX, (event.gamma - base.gamma) * TILT_GAIN),
      );
      const ty = Math.max(
        -TILT_MAX,
        Math.min(TILT_MAX, (event.beta - base.beta) * TILT_GAIN),
      );
      if (Math.abs(tx - sim.tiltTX) < 0.25 && Math.abs(ty - sim.tiltTY) < 0.25)
        return;
      sim.tiltTX = tx;
      sim.tiltTY = ty;
      kick(sim);
    };
    window.addEventListener('deviceorientation', onTilt);
    return () => window.removeEventListener('deviceorientation', onTilt);
  }, []);

  // A tap outside the stage also ends the playful mode.
  useEffect(() => {
    if (!wiggle) return;
    const onDown = (event: PointerEvent) => {
      if (stageRef.current?.contains(event.target as Node)) return;
      const sim = simRef.current;
      if (sim) sim.wiggle = false;
      setWiggle(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [wiggle]);

  useEffect(() => () => window.clearTimeout(longPressTimer.current), []);

  const endWiggle = () => {
    const sim = simRef.current;
    if (sim) sim.wiggle = false;
    setWiggle(false);
  };

  const openCard = (index: number) => {
    const sim = simRef.current;
    const key = sim?.keys[index];
    if (!sim || key === undefined || sim.card || card) return;
    haptic('moment');
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const w = Math.round(
      Math.min(vw - 32, 400, Math.max(220, window.innerHeight - 300)),
    );
    setCard({ key, w, L: Math.round((vw - w) / 2) });
    if (index !== sim.centre) settleTo(sim, index);
  };

  /** The card landed back in its bubble: focus returns to the cloud. */
  const closedCard = useCallback(() => {
    setCard(null);
    stageRef.current?.focus({ preventScroll: true });
  }, []);

  const hitTest = (sim: Sim, x: number, y: number) => {
    let best = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const i of sim.visible) {
      if (sim.su[i] >= MOUNT_U) continue;
      const r = sim.sr[i];
      const d = Math.hypot(
        x - (sim.sx[i] + sim.ox[i]),
        y - (sim.sy[i] + sim.oy[i]),
      );
      if (d > r + 6) continue;
      const score = d / Math.max(r, 1);
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const sim = simRef.current;
    const stage = stageRef.current;
    if (!sim || !stage || gesture.current || sim.card) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const rect = stage.getBoundingClientRect();
    const hit = hitTest(
      sim,
      event.clientX - rect.left - sim.tiltX,
      event.clientY - rect.top - sim.tiltY,
    );
    const caught =
      sim.mode === 'settle' && Math.hypot(sim.velX, sim.velY) > CATCH_SPEED;
    if (caught) {
      sim.mode = 'idle';
      sim.velX = 0;
      sim.velY = 0;
    }
    gesture.current = {
      id: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      mode: 'pending',
      hit,
      caught,
      longPressed: false,
      rawX0: 0,
      rawY0: 0,
      ox0: 0,
      oy0: 0,
      samples: [],
    };
    window.clearTimeout(longPressTimer.current);
    if (!sim.reduced && !sim.wiggle) {
      longPressTimer.current = window.setTimeout(() => {
        const g = gesture.current;
        if (g?.mode !== 'pending') return;
        g.longPressed = true;
        sim.wiggle = true;
        setWiggle(true);
        haptic('press');
        if (sim.mode !== 'settle') settleTo(sim, Math.max(0, sim.centre));
      }, LONG_PRESS_MS);
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const sim = simRef.current;
    const g = gesture.current;
    if (!sim || !g || g.id !== event.pointerId) return;
    const dx = event.clientX - g.x0;
    const dy = event.clientY - g.y0;
    const now = performance.now();
    if (g.mode === 'pending') {
      if (Math.hypot(dx, dy) < DRAG_SLOP) return;
      window.clearTimeout(longPressTimer.current);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Without capture the drag still follows while over the stage.
      }
      if (sim.wiggle && g.hit >= 0 && g.hit < sim.n && !sim.reduced) {
        g.mode = 'bubble';
        sim.held = g.hit;
        sim.flyUntil[g.hit] = 0;
        sim.ovx[g.hit] = 0;
        sim.ovy[g.hit] = 0;
        g.ox0 = sim.ox[g.hit];
        g.oy0 = sim.oy[g.hit];
        sim.moving.add(g.hit);
      } else {
        // Rebase on where the cloud is now, so a still-settling cloud is
        // picked up without a jump and then follows the finger 1:1.
        const [rawX, rawY] = rawCamera(sim);
        g.rawX0 = rawX + dx / sim.kx;
        g.rawY0 = rawY + dy / sim.ky;
        g.mode = 'pan';
        sim.mode = 'drag';
        sim.velX = 0;
        sim.velY = 0;
      }
    }
    if (g.mode === 'pan') {
      const rawX = g.rawX0 - dx / sim.kx;
      const rawY = g.rawY0 - dy / sim.ky;
      const r = Math.hypot(rawX, rawY);
      if (r > sim.bound && r > 0) {
        const k = (sim.bound + rubber(r - sim.bound)) / r;
        sim.camX = rawX * k;
        sim.camY = rawY * k;
      } else {
        sim.camX = rawX;
        sim.camY = rawY;
      }
      pushSample(g.samples, { t: now, x: sim.camX, y: sim.camY });
      kick(sim);
    } else if (g.mode === 'bubble') {
      const i = sim.held;
      if (i < 0) return;
      sim.ox[i] = g.ox0 + dx;
      sim.oy[i] = g.oy0 + dy;
      pushSample(g.samples, { t: now, x: sim.ox[i], y: sim.oy[i] });
      const velocity = velocityOf(g.samples, now);
      sim.ovx[i] = velocity.x;
      sim.ovy[i] = velocity.y;
      kick(sim);
    }
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const sim = simRef.current;
    const g = gesture.current;
    if (!sim || !g || g.id !== event.pointerId) return;
    gesture.current = null;
    window.clearTimeout(longPressTimer.current);
    const cancelled = event.type === 'pointercancel';
    const now = performance.now();
    if (g.mode === 'pending') {
      if (g.longPressed) return;
      if (sim.wiggle) {
        endWiggle();
        return;
      }
      if (g.caught || cancelled) {
        release(sim, 0, 0);
        return;
      }
      if (g.hit < 0 || g.hit >= sim.n) return;
      if (g.hit !== sim.centre && sim.sr[g.hit] * 2 < 0.2 * sim.U)
        settleTo(sim, g.hit);
      else openCard(g.hit);
      return;
    }
    if (g.mode === 'pan') {
      const velocity = cancelled ? { x: 0, y: 0 } : velocityOf(g.samples, now);
      release(sim, velocity.x, velocity.y);
      return;
    }
    const i = sim.held;
    sim.held = -1;
    if (i < 0) return;
    const velocity = cancelled ? { x: 0, y: 0 } : velocityOf(g.samples, now);
    const speed = Math.hypot(velocity.x, velocity.y);
    if (speed > FLING_SPEED) {
      const k = speed > MAX_FLING ? MAX_FLING / speed : 1;
      sim.ovx[i] = velocity.x * k;
      sim.ovy[i] = velocity.y * k;
      sim.flyUntil[i] = now + FLIGHT_MS;
      haptic('commit');
    } else {
      sim.ovx[i] = velocity.x * 0.3;
      sim.ovy[i] = velocity.y * 0.3;
      sim.flyUntil[i] = 0;
    }
    sim.moving.add(i);
    kick(sim);
  };

  const neighbour = (sim: Sim, from: number, dirX: number, dirY: number) => {
    let best = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    const bx = Math.floor(sim.wx[from] / BUCKET_SIZE);
    const by = Math.floor(sim.wy[from] / BUCKET_SIZE);
    for (let ix = bx - 3; ix <= bx + 3; ix += 1) {
      for (let iy = by - 3; iy <= by + 3; iy += 1) {
        const list = sim.buckets.get(bucketKey(ix, iy));
        if (!list) continue;
        for (const j of list) {
          const vx = sim.wx[j] - sim.wx[from];
          const vy = sim.wy[j] - sim.wy[from];
          const d = Math.hypot(vx, vy);
          if (d < 0.01 || d > 2.1) continue;
          const cos = (vx * dirX + vy * dirY) / d;
          if (cos < 0.45) continue;
          const score = d * (1.6 - cos);
          if (score < bestScore) {
            bestScore = score;
            best = j;
          }
        }
      }
    }
    return best;
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const sim = simRef.current;
    if (!sim || sim.card || sim.n === 0 || event.target !== event.currentTarget)
      return;
    const directions: Record<string, [number, number]> = {
      ArrowRight: [1, 0],
      ArrowLeft: [-1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const from = sim.mode === 'settle' ? sim.target : Math.max(0, sim.centre);
    const direction = directions[event.key];
    if (direction) {
      event.preventDefault();
      const next = neighbour(sim, from, direction[0], direction[1]);
      if (next >= 0) settleTo(sim, next);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (sim.wiggle) endWiggle();
      openCard(from);
      return;
    }
    if (event.key === 'Escape' && sim.wiggle) {
      event.preventDefault();
      endWiggle();
    }
  };

  /** Screen-reader list of every memory; rendered only when the diary grows. */
  const memoryList = useMemo(
    () => (
      <ul className="sr-only" aria-label={t('memoryWorlds.cloud.allMemories')}>
        {ordered.map((entry) => (
          <li key={entry.key}>
            <Link
              to={entry.path}
              tabIndex={-1}
              onClick={(event) => onOpen(event, entry.path, entry.key)}
            >
              {t('memoryWorlds.cloud.memoryListItem', {
                title: entry.title,
                date: entry.dateLabel,
              })}
            </Link>
          </li>
        ))}
      </ul>
    ),
    [ordered, onOpen, t],
  );

  const cardEntry = card
    ? ordered.find((entry) => entry.key === card.key)
    : undefined;

  return (
    <div ref={rootRef} className="memory-cloud-world">
      <div className="memory-world-head">
        <h2>{t('memoryWorlds.cloud.heading')}</h2>
      </div>

      {/* biome-ignore lint/a11y/useSemanticElements: the cloud is one focusable widget (arrow keys wander, Enter opens), not a form fieldset. */}
      <div
        ref={stageRef}
        className="memory-cloud-stage"
        role="group"
        aria-roledescription={t('memoryWorlds.cloud.roleDescription')}
        aria-label={t('memoryWorlds.cloud.label', { count: ordered.length })}
        aria-describedby={hintId}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the cloud is the keyboard entry of the world.
        tabIndex={0}
        data-primary-tab-swipe-block
        data-wiggle={wiggle ? 'true' : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div
          ref={glowTiltRef}
          className="memory-cloud-glow-tilt"
          aria-hidden="true"
        >
          <div className="memory-cloud-glow-drift">
            <div ref={glowARef} className="memory-cloud-glow" />
            <div ref={glowBRef} className="memory-cloud-glow" />
          </div>
        </div>
        <div className="memory-cloud-sheen" aria-hidden="true" />
        <div ref={cloudRef} className="memory-cloud-cloud" aria-hidden="true">
          <BubblePool
            simRef={simRef}
            ordered={ordered}
            loadMemoryImage={loadMemoryImage}
          />
        </div>
        <div className="memory-cloud-vignette" aria-hidden="true" />
        <CentrePill
          simRef={simRef}
          ordered={ordered}
          kicker={kicker}
          wiggle={wiggle}
        />
        <div className="memory-cloud-rim" aria-hidden="true" />
      </div>

      <p id={hintId} className="sr-only">
        {t('memoryWorlds.cloud.hint')}
      </p>
      <CentreAnnouncer simRef={simRef} ordered={ordered} />
      {memoryList}

      {card && cardEntry ? (
        <MomentCard
          key={card.key}
          simRef={simRef}
          spec={card}
          entry={cardEntry}
          kicker={kicker}
          loadMemoryImage={loadMemoryImage}
          onOpen={onOpen}
          onClosed={closedCard}
        />
      ) : null}
    </div>
  );
}
