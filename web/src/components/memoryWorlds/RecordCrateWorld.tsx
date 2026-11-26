/**
 * Plattenkiste (#2283): a birch-plywood record crate and a turntable. Every
 * memory is a record sleeve that shows only its kind and month. Drag down on
 * the sleeves to tip them forward and dig through the crate; tap the front
 * sleeve to pull it out. The record slides out of its sleeve onto the
 * turntable, the tonearm swings in and the needle drops; the record "plays"
 * the memory: its lines as synced lyrics and its photos on the stand.
 *
 * Gesture: vertical. Dragging down tips the front sleeve forward around its
 * bottom edge, dragging up stands tipped sleeves back up. The crate is the
 * only area with `touch-action: none`; the turntable below scrolls normally,
 * except while a finger is on the record, the tonearm or the lyrics.
 *
 * Playing: the record's progress p (0 = lead-in groove, 1 = run-out groove)
 * is the single state. The tonearm angle, the progress line, the lyric line
 * and the photo on the stand are derived from it; moving the arm by hand,
 * dragging or tapping the lyrics, scratching or the arrow keys change p.
 * - tap the sleeve or the inlay on the stand: liner notes (side A);
 * - drag on the record: scratch it, which also nudges p;
 * - tap the tonearm: lift / lower the needle in place; drag it over the
 *   record to scrub, off the record to stop;
 * - Start/Stop and 33/45 on the plinth front.
 *
 * The flights and the platter motor are in the motion layer
 * (`src/motion/recordCrate.ts`, `src/motion/memory-worlds.css`). The crate
 * is the keyboard and screen reader entry: arrow keys flip, Enter plays,
 * Escape puts back; the turntable's controls are real buttons.
 */
import type { TFunction } from 'i18next';
import {
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { useContainerUnits } from '../../client/containerUnits';
import { useFitText } from '../../client/fitText';
import { resolvedLocale, useTranslation } from '../../i18n';
import { haptic } from '../../motion/haptics';
import {
  type Box,
  centreDelta,
  clamp,
  dropSleeve,
  flipJacketFrom,
  flyInlay,
  flyJacket,
  flyVinyl,
  riseSleeve,
  slipSleeveBack,
  smoothstep,
  spinPlatter,
  tipJacketAway,
  tipJacketIn,
} from '../../motion/recordCrate';
import { subscribeReducedMotion } from '../../motion/reducedMotion';
import { KeepsakeStampMark } from '../DiscoverKeepsakes';
import { MemoryPhoto } from './MemoryPhoto';
import {
  keyHash,
  type MemoryWorldEntry,
  type MemoryWorldProps,
  prefersReducedMotion,
  seasonLabel,
  seasonOf,
} from './model';
import '../../motion/memory-worlds.css';
import './MemoryWorld.css';
import './RecordCrateWorld.css';
import { WorldHead } from './WorldHead';

type Entry = MemoryWorldEntry;

/**
 * The tonearm as one shaded drawing, in arm units (1 unit = 1cqi, origin at
 * the pivot, the arm pointing down the y axis). Every part is a lit cylinder
 * or a bevelled plate, so the arm reads as a real metal object.
 */
const TonearmArt = memo(function TonearmArt() {
  const raw = useId().replace(/:/g, '');
  const id = (name: string) => `ta${raw}${name}`;
  const url = (name: string) => `url(#${id(name)})`;
  const stop = (offset: string, color: string, opacity?: number) => (
    <stop
      offset={offset}
      style={{ stopColor: color, stopOpacity: opacity ?? 1 }}
    />
  );
  return (
    <svg
      className="memory-crate-arm-art"
      viewBox="-10 -12 20 59"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* Polished aluminium cylinder, lit from the upper left. */}
        <linearGradient id={id('alu')} x1="0" y1="0" x2="1" y2="0">
          {stop('0', '#55595c')}
          {stop('0.12', 'var(--memory-crate-alu-mid)')}
          {stop('0.28', 'var(--memory-crate-alu-hi)')}
          {stop('0.36', '#ffffff')}
          {stop('0.46', 'var(--memory-crate-alu)')}
          {/* Polished metal mirrors the dark record and plinth shadow below. */}
          {stop('0.64', '#3e4245')}
          {stop('0.8', 'var(--memory-crate-alu-mid)')}
          {stop('0.92', 'var(--memory-crate-alu)')}
          {stop('1', '#4a4e51')}
        </linearGradient>
        {/* Graphite counterweight cylinder. */}
        <linearGradient id={id('weight')} x1="0" y1="0" x2="1" y2="0">
          {stop('0', '#141416')}
          {stop('0.22', 'var(--memory-crate-graphite)')}
          {stop('0.4', '#5a5a61')}
          {stop('0.5', 'var(--memory-crate-graphite-hi)')}
          {stop('0.78', 'var(--memory-crate-graphite)')}
          {stop('1', '#121214')}
        </linearGradient>
        <radialGradient id={id('face')} cx="0.38" cy="0.32" r="0.75">
          {stop('0', '#6a6a72')}
          {stop('0.55', 'var(--memory-crate-graphite-hi)')}
          {stop('1', '#18181b')}
        </radialGradient>
        {/* Bearing housing: a turned dome. */}
        <radialGradient id={id('dome')} cx="0.36" cy="0.3" r="0.8">
          {stop('0', '#ffffff')}
          {stop('0.25', 'var(--memory-crate-alu-hi)')}
          {stop('0.6', 'var(--memory-crate-alu-mid)')}
          {stop('1', 'var(--memory-crate-alu-deep)')}
        </radialGradient>
        <linearGradient id={id('plate')} x1="0" y1="0" x2="1" y2="1">
          {stop('0', 'var(--memory-crate-alu-hi)')}
          {stop('0.45', 'var(--memory-crate-alu)')}
          {stop('1', 'var(--memory-crate-alu-deep)')}
        </linearGradient>
        <linearGradient id={id('cart')} x1="0" y1="0" x2="1" y2="0">
          {stop('0', '#101012')}
          {stop('0.45', '#3b3b42')}
          {stop('1', '#0d0d0f')}
        </linearGradient>
      </defs>

      {/* Counterweight: a knurled cylinder with its end face towards the back. */}
      <rect
        x="-3.3"
        y="-9.8"
        width="6.6"
        height="5.8"
        rx="1.1"
        fill={url('weight')}
      />
      {[-8.4, -7.1, -5.8].map((y) => (
        <rect
          key={y}
          x="-3.3"
          y={y}
          width="6.6"
          height="0.32"
          fill="#000000"
          opacity="0.35"
        />
      ))}
      <rect
        x="-3.3"
        y="-4.6"
        width="6.6"
        height="0.7"
        rx="0.3"
        fill={url('alu')}
      />
      <ellipse cx="0" cy="-9.8" rx="3.25" ry="1.05" fill={url('face')} />
      <ellipse
        cx="-0.9"
        cy="-10.05"
        rx="1.3"
        ry="0.32"
        fill="#ffffff"
        opacity="0.28"
      />

      {/* Rear stub between weight and bearing. */}
      <rect x="-0.75" y="-4" width="1.5" height="2.4" fill={url('alu')} />

      {/* Gimbal: cross yoke with two bearing screws, then the domed housing. */}
      <rect
        x="-5"
        y="-1.05"
        width="10"
        height="2.1"
        rx="1.05"
        fill={url('alu')}
      />
      <circle cx="-4.4" cy="0" r="0.75" fill={url('dome')} />
      <circle cx="4.4" cy="0" r="0.75" fill={url('dome')} />
      <circle cx="0" cy="0" r="2.6" fill={url('dome')} />
      <circle
        cx="0"
        cy="0"
        r="2.6"
        fill="none"
        stroke="var(--memory-crate-alu-deep)"
        strokeWidth="0.18"
      />
      <circle cx="-0.8" cy="-0.9" r="0.7" fill="#ffffff" opacity="0.55" />

      {/* The arm tube: a thick polished cylinder with a running highlight. */}
      <rect
        x="-1.05"
        y="2.1"
        width="2.1"
        height="31.8"
        rx="1.05"
        fill="#2a2c2e"
        opacity="0.55"
      />
      <rect
        x="-0.95"
        y="2.2"
        width="1.9"
        height="31.6"
        rx="0.95"
        fill={url('alu')}
      />
      <rect
        x="-0.42"
        y="3"
        width="0.26"
        height="30"
        rx="0.13"
        fill="#ffffff"
        opacity="0.75"
      />
      {/* Collar where the headshell is fitted. */}
      <rect
        x="-1.25"
        y="33"
        width="2.5"
        height="2.2"
        rx="0.4"
        fill={url('alu')}
      />
      <rect
        x="-1.25"
        y="33"
        width="2.5"
        height="0.35"
        fill="#ffffff"
        opacity="0.5"
      />

      {/* Offset headshell with cartridge and finger lift. */}
      <g transform="translate(0 35) rotate(22)">
        <path
          d="M-2.3 0 H2.3 L2.6 7.6 Q2.6 8.6 1.6 8.6 H-1.6 Q-2.6 8.6 -2.6 7.6 Z"
          fill={url('plate')}
        />
        <path
          d="M-2.3 0 H2.3 L2.6 7.6"
          fill="none"
          stroke="#ffffff"
          strokeWidth="0.22"
          opacity="0.7"
        />
        <rect
          x="-1.7"
          y="2.6"
          width="3.4"
          height="5"
          rx="0.45"
          fill={url('cart')}
        />
        <rect
          x="-1.7"
          y="2.6"
          width="3.4"
          height="0.5"
          rx="0.25"
          fill="#ffffff"
          opacity="0.18"
        />
        <rect
          x="-0.35"
          y="7.4"
          width="0.7"
          height="0.8"
          rx="0.2"
          fill="#c9a24a"
        />
        <path
          d="M2.4 1 L5.6 0.2 Q6.2 0.1 6.1 0.7 L5.9 1.1 L2.5 1.9 Z"
          fill={url('plate')}
        />
      </g>
    </svg>
  );
});

/* ---------- Crate geometry and gesture constants ---------- */

/** Tipped sleeves kept mounted in front of the front record. */
const AHEAD = 3;
/** Standing sleeves mounted behind the front record. */
const BEHIND = 8;
/** Cheap placeholder sleeves (no photo) that make a big crate look packed. */
const FILLERS = 4;
/** The front sleeve leans back a little; the ones behind lean further. */
const CUR_TILT = 4;
const BACK_TILT = 10;
const FEW_BACK_TILT = 17;
/** A tipped sleeve rests against the front board at this angle. */
const TIP_DEG = -68;
const DRAG_SLOP = 8;
/** One record per this fraction of the crate width of finger travel. */
const FLIP_PER_WIDTH = 0.3;
const RUBBER_MAX = 0.35;
const SPRING_K = 70;
const SPRING_C = 2 * 0.72 * Math.sqrt(SPRING_K);
/** Records per second: a flick never blurs the sleeves. */
const MAX_SPEED = 9;
const MAX_THROW = 6;
const THROW_S = 0.22;
/** How far the pulled sleeve rises out of the crate, as a share of the crate width. */
const LIFT_SHARE = 0.24;

/* ---------- Timelines (ms from the tap) ---------- */

const PULL = {
  rise: 320,
  fly: 820,
  vinylAt: 980,
  vinyl: 950,
  /** The inlay slides out of the sleeve while the record does. */
  inlayAt: 1120,
  inlay: 880,
  spinAt: 1450,
  swingAt: 1600,
  dropAt: 2150,
  land: 2530,
} as const;
const BACK = {
  vinylAt: 340,
  vinyl: 900,
  flyAt: 1180,
  fly: 820,
  drop: 460,
  inlay: 760,
  clack: 2330,
  done: 2480,
} as const;
const SWAP = {
  vinylAt: 260,
  vinyl: 780,
  awayAt: 1000,
  away: 260,
  switchAt: 1260,
  in: 380,
  vinylIn: 250,
  vinylDur: 900,
  inlayBack: 700,
  inlayOut: 820,
  spinAt: 1900,
  swingAt: 2050,
  dropAt: 2600,
  land: 2980,
} as const;
const START = { swingAt: 150, dropAt: 700, land: 1080 } as const;
/** Seeking: the needle lifts, the arm glides, the needle drops again. */
const SEEK = { glideAt: 140, glide: 520, dropAt: 700, land: 1080 } as const;
/** The needle lowers onto the record by hand. */
const LOWER_MS = 380;
/** 33 1/3 rpm. */
const SPIN_MS = 1800;
const SPIN_UP_MS = 1000;
const SPIN_DOWN_MS = 1000;
const SCRATCH_RESUME_MS = 700;
/** One light tick per this much scratching. */
const SCRATCH_TICK_DEG = 30;
const FLIP_MS = 640;
/** The turntable's top is seen at an angle: circles are squashed to this. */
const DECK_TILT = 0.64;
/** Photos crossfade on the stand. */
const ART_FADE_MS = 900;

/* Turntable plane geometry (cqi of the deck, before the squash). */
const PLANE_H = 72;
const SPINDLE_X = 66;
const SPINDLE_Y = 36;
const PIVOT_X = 94;
const PIVOT_Y = 12;
/** After the side ends, the arm returns and the platter stops by itself. */
const AUTO_RETURN_MS = 500;
/** The stylus tip in arm units (see TonearmArt: headshell at 35, offset 22 deg). */
const STYLUS_X = -2.92;
const STYLUS_Y = 42.23;
/** Groove radii on the record (radius 24): lead-in, run-out near the label. */
const R_EDGE = 24.4;
const R_IN = 22.8;
const R_OUT = 10.4;
const ARM_MIN_DEG = -8;
const ARM_TAP_SLOP = 5;
/** Side A: the playing memory plus up to this many from around the same time. */
const TRACKS_OTHERS = 5;
const RATE_45 = 45 / (100 / 3);
/** A side lasts long enough to read everything: 45 to 60 seconds at 33 1/3. */
const SIDE_MIN_MS = 45000;
const SIDE_MAX_MS = 60000;
/** The share of the side the lyrics take; the rest is the run-out of the last line. */
const LYRICS_SPAN = 0.94;
const SEEK_STEP = 0.1;

const SMALL_HEART =
  'M12 21C5 15.5 2 12 2 8A5 5 0 0 1 12 6A5 5 0 0 1 22 8C22 12 19 15.5 12 21Z';

type Phase = 'pulling' | 'playing' | 'returning' | 'swapping';

interface Play {
  index: number;
  phase: Phase;
  run: number;
}

/** While a record is playing: what the needle does. */
type Needle = 'play' | 'cued' | 'stopped' | 'starting';

/**
 * Arm states. On the record the angle always comes from p (inline `rotate`);
 * parked angles come from the stylesheet; `hand` follows the finger.
 */
type ArmState =
  | 'rest'
  | 'park'
  | 'swing'
  | 'down'
  | 'track'
  | 'hand'
  | 'cuedup';
const P_ARM: ReadonlySet<ArmState> = new Set<ArmState>([
  'swing',
  'down',
  'track',
  'cuedup',
]);
const LIFTED_ARM: ReadonlySet<ArmState> = new Set<ArmState>([
  'rest',
  'park',
  'swing',
  'hand',
  'cuedup',
]);
const LOWERED_ARM: ReadonlySet<ArmState> = new Set<ArmState>(['down', 'track']);

interface Ramp {
  anim: Animation;
  from: number;
  to: number;
  start: number;
  duration: number;
}

interface Glide {
  from: number;
  to: number;
  start: number;
  duration: number;
}

interface Cue {
  at: number;
  fn: () => void;
}

interface Timeline {
  t0: number;
  cues: Cue[];
}

interface Motion {
  /** Continuous crate position: 2.4 means sleeve 2 is 40 % tipped. */
  pos: number;
  vel: number;
  target: number;
  spring: boolean;
  /** Do not announce the front record when this flip settles. */
  quiet: boolean;
  last: number;
  ramp: Ramp | null;
  timeline: Timeline | null;
  /** Playback progress of the side, 0..1: the single source of truth while playing. */
  p: number;
  glide: Glide | null;
  /** Last run-out tick. */
  runout: number;
  /** Last second written to the display clock. */
  second: number;
}

interface Drag {
  id: number;
  x: number;
  y: number;
  startPos: number;
  active: boolean;
  caught: boolean;
  refused: boolean;
  lastY: number;
  lastT: number;
  vy: number;
  flipPx: number;
}

interface Scratch {
  id: number;
  last: number;
  total: number;
  tick: number;
  base: number;
}

interface ArmDrag {
  id: number;
  x: number;
  y: number;
  active: boolean;
  deg: number;
}

interface Track {
  entry: Entry;
  index: number;
}

/** A memory as a song: its lines over the side, its photos one after another. */
interface Song {
  lines: string[];
  /** Where each line starts, as progress p. */
  starts: number[];
  /** One entry per photo (the photo as its cover); empty: the sleeve face is shown. */
  photos: Entry[];
  sideMs: number;
}

/** The lyric roll's measured layout (px): line centres and how far each line is too wide. */
interface LyricGeom {
  half: number;
  centers: number[];
  over: number[];
}

interface LyricDrag {
  id: number;
  y: number;
  startCentre: number;
  startP: number;
  active: boolean;
  needleWasDown: boolean;
}

interface ArtLayer {
  key: number;
  photo: number;
}

/* ---------- Small maths ---------- */

function easeInOutSine(t: number) {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

/** Shortest signed difference of two angles in degrees. */
function angleDelta(a: number, b: number) {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

/** Past either end of the crate the sleeves resist and spring back. */
function rubber(raw: number, max: number) {
  if (raw < 0) return -RUBBER_MAX * (1 - Math.exp(raw / RUBBER_MAX));
  if (raw > max)
    return max + RUBBER_MAX * (1 - Math.exp(-(raw - max) / RUBBER_MAX));
  return raw;
}

/* ---------- Groove geometry: progress <-> tonearm angle ---------- */

/** Distance of the stylus from the spindle for an arm angle (plane units). */
function stylusRadius(deg: number) {
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const x = PIVOT_X + STYLUS_X * cos - STYLUS_Y * sin;
  const y = PIVOT_Y + STYLUS_X * sin + STYLUS_Y * cos;
  return Math.hypot(x - SPINDLE_X, y - SPINDLE_Y);
}

/** The arm angle that puts the stylus on a groove radius (the radius falls as the arm swings in). */
function angleForRadius(radius: number) {
  let lo = -10;
  let hi = 50;
  for (let i = 0; i < 28; i += 1) {
    const mid = (lo + hi) / 2;
    if (stylusRadius(mid) > radius) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const ARM_OUT_DEG = angleForRadius(R_OUT);
const ARM_MAX_DEG = ARM_OUT_DEG + 0.6;

/** Grooves are evenly spaced: progress maps linearly to the groove radius. */
function armDegForP(p: number) {
  return angleForRadius(R_IN - clamp(p, 0, 1) * (R_IN - R_OUT));
}

function pForArmDeg(deg: number) {
  return clamp((R_IN - stylusRadius(deg)) / (R_IN - R_OUT), 0, 1);
}

function onRecord(deg: number) {
  return stylusRadius(deg) <= R_EDGE;
}

function clock(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* ---------- The memory as a song ---------- */

function songFor(entry: Entry, byline: (name: string) => string): Song {
  const verses = (entry.verses ?? [])
    .map((line) => line.trim())
    .filter(Boolean);
  const lines: string[] = [];
  // Heart moments: the verses already are the text.
  if (entry.kind !== 'heart' || verses.length === 0) lines.push(entry.title);
  lines.push(entry.dateLabel);
  lines.push(...verses);
  if (entry.author) lines.push(byline(entry.author));
  const clean = lines.filter((line, i) => line && line !== lines[i - 1]);
  // Longer lines stay longer; every line gets a breath.
  const weights = clean.map((line) => 10 + line.length);
  const total = weights.reduce((sum, w) => sum + w, 0) || 1;
  const starts: number[] = [];
  let at = 0;
  for (const w of weights) {
    starts.push((at / total) * LYRICS_SPAN);
    at += w;
  }
  const photos = (entry.photos ?? []).map((photo) => ({
    ...entry,
    cover: photo,
  }));
  const sideMs = clamp(
    24000 + clean.length * 2600 + photos.length * 1800,
    SIDE_MIN_MS,
    SIDE_MAX_MS,
  );
  return { lines: clean, starts, photos, sideMs };
}

function lineAt(song: Song, p: number) {
  let index = 0;
  for (let i = 0; i < song.starts.length; i += 1) {
    if (song.starts[i] <= p + 1e-9) index = i;
    else break;
  }
  return index;
}

function photoAt(song: Song, p: number) {
  const n = song.photos.length;
  return n === 0 ? 0 : Math.min(n - 1, Math.floor(clamp(p, 0, 1) * n));
}

function poseTransform(y: number, z: number, rot: number) {
  // In crate units (sleeves carry them as --cu-outer, see containerUnits.ts).
  return `translate3d(0, calc(${y.toFixed(3)} * var(--cu-outer)), calc(${z.toFixed(3)} * var(--cu-outer))) rotateX(${rot.toFixed(2)}deg)`;
}

interface Pose {
  transform: string;
  shade: number;
  opacity: number;
}

/**
 * Where a sleeve stands for its distance d from the crate position: d > 0
 * stands behind (peeking out higher up), 0 is the front record, -1 lies tipped
 * against the front board. Between -1 and 0 it follows the finger.
 */
function sleevePose(d: number, few: boolean): Pose {
  if (d >= 0) {
    const near = Math.min(d, 1);
    const step = few ? 3.6 : 3;
    const lift =
      d <= 3
        ? d * step
        : d <= 6
          ? 3 * step + (d - 3)
          : 3 * step + 3 + (d - 6) * 0.5;
    const back = few ? FEW_BACK_TILT : BACK_TILT;
    const rot = CUR_TILT + (back - CUR_TILT) * near + Math.max(0, d - 1) * 0.3;
    return {
      transform: poseTransform(-lift, -d * 1.2, rot),
      shade: Math.min(0.52, d * 0.085),
      opacity: clamp(BEHIND + FILLERS + 1 - d, 0, 1),
    };
  }
  const u = -d;
  if (u <= 1) {
    return {
      transform: poseTransform(0, u * 1.2, CUR_TILT + (TIP_DEG - CUR_TILT) * u),
      shade: u * 0.22,
      opacity: 1,
    };
  }
  const extra = Math.min(1, u - 1);
  return {
    transform: poseTransform(
      extra * 0.5,
      1.2 + (u - 1) * 1.4,
      TIP_DEG - extra * 3,
    ),
    shade: 0.22 + extra * 0.1,
    opacity: clamp(AHEAD + 0.5 - u, 0, 1),
  };
}

function applyPose(el: HTMLElement, pose: Pose) {
  el.style.transform = pose.transform;
  el.style.opacity = pose.opacity >= 1 ? '' : pose.opacity.toFixed(3);
  const shade = el.lastElementChild as HTMLElement | null;
  if (shade) shade.style.opacity = pose.shade.toFixed(3);
}

/** What a sleeve shows: only the kind of record, never its content. */
type CoverKind = 'memory' | 'heart' | 'milestone';
type MemoryTone = 'sand' | 'paper' | 'stone';
const MEMORY_TONES: MemoryTone[] = ['sand', 'paper', 'stone'];

function coverKind(entry: Entry): CoverKind {
  if (entry.kind === 'heart') return 'heart';
  if (entry.kind === 'milestone') return 'milestone';
  return 'memory';
}

function memoryTone(entry: Entry): MemoryTone {
  return MEMORY_TONES[keyHash(entry.key) % MEMORY_TONES.length];
}

const monthFormatters = new Map<string, Intl.DateTimeFormat>();

/** The small printed month in the sleeve's corner, e.g. "Juli 2024". */
function monthLabel(entry: Entry, locale: string) {
  if (Number.isNaN(entry.date.getTime())) return '';
  let format = monthFormatters.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, {
      month: 'long',
      year: 'numeric',
    });
    monthFormatters.set(locale, format);
  }
  return format.format(entry.date);
}

/**
 * The sleeve's accessible name: its kind, title and date (the cover itself
 * shows neither). A picture disc is a surprise: nothing gives it away here.
 */
function sleeveName(entry: Entry, t: TFunction) {
  return t('memoryWorlds.crate.sleeveName', {
    kind: t(`memoryWorlds.crate.kind.${coverKind(entry)}`),
    title: entry.title,
    date: entry.dateLabel,
  });
}

const PICTURE_SALT = '#picture-disc';

/**
 * Some photo memories are picture discs: about one in four, chosen by key (so
 * it stays the same), and at least one as soon as there are three photo memories.
 */
function pictureDiscs(order: Entry[]): Set<string> {
  const candidates = order.filter((entry) => (entry.photos?.length ?? 0) > 0);
  const hash = (entry: Entry) => keyHash(`${entry.key}${PICTURE_SALT}`);
  const picked = new Set(
    candidates
      .filter((entry) => hash(entry) % 4 === 0)
      .map((entry) => entry.key),
  );
  if (picked.size === 0 && candidates.length >= 3) {
    const first = candidates.reduce((a, b) => (hash(a) <= hash(b) ? a : b));
    picked.add(first.key);
  }
  return picked;
}

/**
 * Side A of a record's liner notes: the playing memory and up to five more,
 * same season first, then the closest in time; in diary order.
 */
function sideA(order: Entry[], index: number): Track[] {
  const playing = order[index];
  if (!playing) return [];
  const season = seasonOf(playing.date).key;
  const at = playing.date.getTime();
  const others = order
    .map((entry, i) => ({ entry, index: i }))
    .filter((track) => track.index !== index)
    .map((track) => ({
      ...track,
      same: seasonOf(track.entry.date).key === season ? 0 : 1,
      gap: Math.abs(track.entry.date.getTime() - at),
    }))
    .sort((a, b) => a.same - b.same || a.gap - b.gap)
    .slice(0, TRACKS_OTHERS)
    .map(({ entry, index: i }) => ({ entry, index: i }));
  return [{ entry: playing, index }, ...others].sort(
    (a, b) => a.entry.date.getTime() - b.entry.date.getTime(),
  );
}

/* ---------- Object parts ---------- */

function HeartGlyph({ className }: { className: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 22"
      aria-hidden="true"
      focusable="false"
    >
      <path d={SMALL_HEART} />
    </svg>
  );
}

/** "Erinnerung": a printed polaroid, slightly turned. */
function MemoryGlyph({ className }: { className: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <g transform="rotate(-7 24 24)">
        <rect
          className="memory-crate-memory-frame"
          x="9"
          y="6"
          width="30"
          height="36"
          rx="1.6"
        />
        <rect
          className="memory-crate-memory-window"
          x="12.5"
          y="9.5"
          width="23"
          height="22"
          rx="0.6"
        />
        <circle
          className="memory-crate-memory-sun"
          cx="29.5"
          cy="15.5"
          r="2.8"
        />
        <path
          className="memory-crate-memory-hill"
          d="M12.5 31.5 L20 22 L25 27.5 L28.5 24 L35.5 31.5 Z"
        />
        <path className="memory-crate-memory-line" d="M15 37 H27" />
      </g>
    </svg>
  );
}

/** "Herzmoment": an embossed heart. */
function EmbossedHeart({ className }: { className: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 22"
      aria-hidden="true"
      focusable="false"
    >
      <path className="memory-crate-heart-fill" d={SMALL_HEART} />
      <path
        className="memory-crate-heart-shade"
        d={SMALL_HEART}
        transform="translate(0.35 0.4)"
      />
      <path
        className="memory-crate-heart-emboss"
        d={SMALL_HEART}
        transform="translate(-0.3 -0.35)"
      />
    </svg>
  );
}

/**
 * The printed front of a record sleeve: only its kind and month (memoised:
 * flicking re-renders the crate often).
 */
const SleeveCover = memo(function SleeveCover({
  entry,
  month,
}: {
  entry: Entry;
  month: string;
}) {
  const kind = coverKind(entry);
  return (
    <span
      className="memory-crate-cover"
      data-kind={kind}
      data-tone={kind === 'memory' ? memoryTone(entry) : undefined}
      data-heart-emotion={kind === 'heart' ? entry.emotion : undefined}
    >
      <span className="memory-crate-cover-rings" />
      {kind === 'heart' ? (
        <EmbossedHeart className="memory-crate-cover-glyph" />
      ) : null}
      {kind === 'milestone' ? (
        <KeepsakeStampMark className="memory-crate-cover-glyph" />
      ) : null}
      {kind === 'memory' ? (
        <MemoryGlyph className="memory-crate-cover-glyph" />
      ) : null}
      <span className="memory-crate-cover-date">{month}</span>
      <span className="memory-crate-print" />
    </span>
  );
});

/** The paper label in the middle of the record: the same kind look as the sleeve. */
const RecordLabel = memo(function RecordLabel({ entry }: { entry: Entry }) {
  const kind = coverKind(entry);
  return (
    <span
      className="memory-crate-label"
      data-kind={kind}
      data-tone={kind === 'memory' ? memoryTone(entry) : undefined}
      data-heart-emotion={kind === 'heart' ? entry.emotion : undefined}
    >
      {kind === 'heart' ? (
        <HeartGlyph className="memory-crate-label-heart" />
      ) : null}
      {kind === 'milestone' ? (
        <KeepsakeStampMark className="memory-crate-label-stamp" />
      ) : null}
      {kind === 'memory' ? (
        <MemoryGlyph className="memory-crate-label-glyph" />
      ) : null}
    </span>
  );
});

/** A text fitted into its fixed box: shrinks, then shortens at a word with "…". */
function FitText({
  text,
  minPx,
  boxClass,
  textClass,
}: {
  text: string;
  minPx: number;
  boxClass: string;
  textClass: string;
}) {
  const { boxRef, textRef } = useFitText<HTMLSpanElement, HTMLSpanElement>(
    text,
    minPx,
  );
  return (
    <span ref={boxRef} className={boxClass}>
      <span ref={textRef} className={textClass} />
    </span>
  );
}

/* ---------- The world ---------- */

/** Elements that carry their own crate units (`--cu`). */
const UNIT_SELECTOR =
  '.memory-crate-crate, .memory-crate-deck, .memory-crate-sleeve, .memory-crate-face';

/**
 * Eure Plattenkiste: drag down on the sleeves to dig through the crate, tap
 * the front sleeve to put the record on. The focusable crate is the keyboard
 * and screen-reader fallback (arrow keys flip, Enter plays, Escape puts back);
 * the turntable's controls are real buttons on its plinth.
 */
export function RecordCrateWorld({
  entries,
  loadMemoryImage,
  onOpen,
}: MemoryWorldProps) {
  const { t } = useTranslation();
  const locale = resolvedLocale();
  const rootRef = useRef<HTMLDivElement>(null);
  // Former CSS containers get pixel units (see containerUnits.ts).
  useContainerUnits(rootRef, UNIT_SELECTOR);
  const order = useMemo(() => {
    const lead = entries.find((entry) => entry.isLead) ?? entries[0];
    return lead ? [lead, ...entries.filter((entry) => entry !== lead)] : [];
  }, [entries]);
  const count = order.length;
  const few = count <= 3;

  const [front, setFront] = useState(0);
  /**
   * The record the turntable side is prepared for while nothing plays (the
   * front sleeve, once the crate rests): its sleeve, inlay, label, lyrics and
   * photos are mounted invisibly, so a pull commits no big subtree mid-motion.
   */
  const [stagedIndex, setStagedIndex] = useState(0);
  const [play, setPlayState] = useState<Play | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [needle, setNeedleState] = useState<Needle>('play');
  const [arm, setArmState] = useState<ArmState>('rest');
  const [motor, setMotorState] = useState(false);
  const [outIndex, setOutIndex] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [rpm, setRpmState] = useState<33 | 45>(33);
  const [lineIndex, setLineIndex] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [ended, setEnded] = useState(false);
  const [artLayers, setArtLayers] = useState<ArtLayer[]>([]);

  const playIndex = play?.index ?? -1;
  const stageIndex = play
    ? play.index
    : clamp(stagedIndex, 0, Math.max(0, order.length - 1));
  const playEntry = order[stageIndex] ?? null;
  const stageKey = playEntry?.key ?? null;
  const tracks = useMemo(
    () => (playIndex >= 0 ? sideA(order, playIndex) : []),
    [order, playIndex],
  );
  const song = useMemo(
    () =>
      playEntry
        ? songFor(playEntry, (name) => t('memoryWorlds.crate.byline', { name }))
        : null,
    [playEntry, t],
  );
  const pictureKeys = useMemo(() => pictureDiscs(order), [order]);
  const [glintKey, setGlintKey] = useState(0);

  const rawId = useId();
  const id = `crate${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const hintId = `${id}-hint`;
  const deckHintId = `${id}-deck-hint`;

  const crateRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<HTMLDivElement>(null);
  const deckTopRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLSpanElement>(null);
  const jacketRef = useRef<HTMLDivElement>(null);
  const inlayRef = useRef<HTMLSpanElement>(null);
  const carrierRef = useRef<HTMLSpanElement>(null);
  const discRef = useRef<HTMLSpanElement>(null);
  const armRef = useRef<HTMLSpanElement>(null);
  const armShadowRef = useRef<HTMLSpanElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const rollRef = useRef<HTMLSpanElement>(null);
  const lyricGeom = useRef<LyricGeom | null>(null);
  /** Re-measures the lyric lines (they may have been laid out while hidden). */
  const measureLyricsRef = useRef<(() => void) | null>(null);
  /** The line whose text currently wanders / fills (its inline transforms are live). */
  const wanderRef = useRef(-1);
  const lyricDrag = useRef<LyricDrag | null>(null);
  const lyricClickBlocked = useRef(false);
  /** Window-level release listeners of the finger gestures, by gesture. */
  const releaseWatch = useRef(new Map<string, () => void>());
  const sleeveEls = useRef(new Map<number, HTMLElement>());
  const fillerEls = useRef(new Map<number, HTMLElement>());

  const motion = useRef<Motion>({
    pos: 0,
    vel: 0,
    target: 0,
    spring: false,
    quiet: false,
    last: 0,
    ramp: null,
    timeline: null,
    p: 0,
    glide: null,
    runout: 0,
    second: -1,
  });
  const frame = useRef<number | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const scratchRef = useRef<Scratch | null>(null);
  const armDragRef = useRef<ArmDrag | null>(null);
  const frontRef = useRef(0);
  const playRef = useRef<Play | null>(null);
  const needleRef = useRef<Needle>('play');
  const armStateRef = useRef<ArmState>('rest');
  const motorRef = useRef(false);
  const rpmRef = useRef<33 | 45>(33);
  const flippedRef = useRef(false);
  const flipFromRef = useRef<DOMRect | null>(null);
  const runRef = useRef(0);
  const reduceRef = useRef(prefersReducedMotion());
  const countRef = useRef(count);
  const fewRef = useRef(few);
  const orderRef = useRef(order);
  const tracksRef = useRef(tracks);
  const songRef = useRef<Song | null>(song);
  const lineRef = useRef(0);
  const photoRef = useRef(0);
  const endedRef = useRef(false);
  const artKeyRef = useRef(0);
  const artTimer = useRef<number | null>(null);
  const jacketAnim = useRef<Animation | null>(null);
  const inlayAnim = useRef<Animation | null>(null);
  const vinylAnim = useRef<Animation | null>(null);
  const sleeveAnims = useRef<Animation[]>([]);
  const spinAnim = useRef<Animation | null>(null);
  const stepRef = useRef<(now: number) => void>(() => undefined);
  const loopRef = useRef<(now: number) => void>((now) => stepRef.current(now));

  countRef.current = count;
  fewRef.current = few;
  orderRef.current = order;
  tracksRef.current = tracks;
  songRef.current = song;
  const pictureRef = useRef(pictureKeys);
  pictureRef.current = pictureKeys;

  const setPlay = (next: Play | null) => {
    playRef.current = next;
    setPlayState(next);
  };
  const setNeedle = (next: Needle) => {
    needleRef.current = next;
    setNeedleState(next);
  };
  const setArm = (next: ArmState) => {
    armStateRef.current = next;
    setArmState(next);
  };
  const setMotor = (on: boolean) => {
    motorRef.current = on;
    setMotorState(on);
  };
  const spinRate = () => (rpmRef.current === 45 ? RATE_45 : 1);
  const isPlaying = () => playRef.current?.phase === 'playing';

  const kick = () => {
    if (frame.current !== null) return;
    motion.current.last = performance.now();
    frame.current = window.requestAnimationFrame(loopRef.current);
  };

  /* Writes every mounted sleeve's pose: transform and opacity only. */
  const paint = () => {
    const { pos } = motion.current;
    const isFew = fewRef.current;
    sleeveEls.current.forEach((el, index) => {
      applyPose(el, sleevePose(index - pos, isFew));
    });
    fillerEls.current.forEach((el, index) => {
      applyPose(el, sleevePose(index - pos, isFew));
    });
  };

  /** The tonearm angle: from the finger, from p on the record, or the stylesheet when parked. */
  const paintArm = () => {
    const drag = armDragRef.current;
    const state = armStateRef.current;
    let deg: number | null = null;
    if (drag?.active) deg = drag.deg;
    else if (P_ARM.has(state)) deg = armDegForP(motion.current.p);
    const value = deg === null ? '' : `${deg.toFixed(2)}deg`;
    // On the record the shadow falls a little further round, so it meets the arm at the stylus.
    const shadow =
      deg === null
        ? ''
        : `${(deg + (LOWERED_ARM.has(state) ? 3 : 0)).toFixed(2)}deg`;
    const armEl = armRef.current;
    const shadowEl = armShadowRef.current;
    if (armEl && armEl.style.rotate !== value) armEl.style.rotate = value;
    if (shadowEl && shadowEl.style.rotate !== shadow)
      shadowEl.style.rotate = shadow;
  };

  /**
   * The scroll position of the lyrics as a continuous function of p: each
   * line is centred at the middle of its time, and the roll glides linearly
   * between those points, so it moves exactly with the arm and the progress line.
   */
  const lyricKnots = () => {
    const geom = lyricGeom.current;
    const current = songRef.current;
    if (!geom || !current || geom.centers.length === 0) return null;
    const n = geom.centers.length;
    const ps: number[] = [0];
    const cs: number[] = [geom.centers[0]];
    for (let i = 0; i < n; i += 1) {
      const start = current.starts[i] ?? 0;
      const end = current.starts[i + 1] ?? 1;
      ps.push((start + end) / 2);
      cs.push(geom.centers[i]);
    }
    ps.push(1);
    cs.push(geom.centers[n - 1]);
    return { ps, cs };
  };

  const lyricCentreForP = (p: number) => {
    const knots = lyricKnots();
    if (!knots) return 0;
    const { ps, cs } = knots;
    for (let j = 0; j < ps.length - 1; j += 1) {
      if (p <= ps[j + 1]) {
        const span = ps[j + 1] - ps[j];
        const u = span > 0 ? clamp((p - ps[j]) / span, 0, 1) : 1;
        return cs[j] + (cs[j + 1] - cs[j]) * u;
      }
    }
    return cs[cs.length - 1];
  };

  /**
   * Every frame: the roll glides with p; the current line's text wanders left
   * if it is too wide, and its sung part fills brighter (transforms only).
   */
  const paintLyrics = () => {
    const geom = lyricGeom.current;
    const roll = rollRef.current;
    const current = songRef.current;
    if (!geom || !roll || !current) return;
    const { p } = motion.current;
    const reduce = reduceRef.current;
    const index = lineAt(current, p);
    // Reduced motion: the lines simply swap, one at a time.
    const centre = reduce ? (geom.centers[index] ?? 0) : lyricCentreForP(p);
    roll.style.transform = `translate3d(0, ${(geom.half - centre).toFixed(1)}px, 0)`;
    const start = current.starts[index] ?? 0;
    const end = current.starts[index + 1] ?? 1;
    const v = end > start ? clamp((p - start) / (end - start), 0, 1) : 1;
    const parts = (i: number) => {
      const wander = roll.children[i]?.firstElementChild as
        | HTMLElement
        | null
        | undefined;
      const sung = wander?.lastElementChild as HTMLElement | null | undefined;
      const inner = sung?.firstElementChild as HTMLElement | null | undefined;
      return { wander, sung, inner };
    };
    if (wanderRef.current !== index) {
      // The line before goes back to its stylesheet state (sung or not yet sung).
      const old = parts(wanderRef.current);
      for (const el of [old.wander, old.sung, old.inner])
        if (el) el.style.transform = '';
      wanderRef.current = index;
    }
    const { wander, sung, inner } = parts(index);
    if (wander) {
      const shift = reduce
        ? 0
        : (geom.over[index] ?? 0) * smoothstep(0.12, 0.88, v);
      wander.style.transform = `translate3d(${(-shift).toFixed(1)}px, 0, 0)`;
    }
    if (sung && inner) {
      sung.style.transform = `translate3d(${(-(1 - v) * 100).toFixed(2)}%, 0, 0)`;
      inner.style.transform = `translate3d(${((1 - v) * 100).toFixed(2)}%, 0, 0)`;
    }
  };

  /** The progress line shows exactly p; the clock counts the side. */
  const paintProgress = () => {
    const m = motion.current;
    const fill = progressRef.current;
    if (fill) fill.style.transform = `scaleX(${m.p.toFixed(4)})`;
    const current = songRef.current;
    const el = clockRef.current;
    if (el && current) {
      const second = Math.floor((m.p * current.sideMs) / 1000);
      if (second !== m.second) {
        m.second = second;
        el.textContent = `${clock(m.p * current.sideMs)} / ${clock(current.sideMs)}`;
      }
    }
  };

  /** React only hears about p when the line, the photo or the end changes. */
  const autoReturnTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (autoReturnTimer.current !== null)
        window.clearTimeout(autoReturnTimer.current);
    },
    [],
  );

  const fingerDown = () =>
    Boolean(
      lyricDrag.current?.active ||
        armDragRef.current?.active ||
        scratchRef.current,
    );

  const syncSong = () => {
    const current = songRef.current;
    if (!current) return;
    const { p } = motion.current;
    const line = lineAt(current, p);
    if (line !== lineRef.current) {
      lineRef.current = line;
      setLineIndex(line);
    }
    const photo = photoAt(current, p);
    if (photo !== photoRef.current) {
      photoRef.current = photo;
      setPhotoIndex(photo);
    }
    // With a finger on the lyrics, the arm or the record, the end is only previewed.
    const isEnd = p >= 1 - 1e-6 && !fingerDown();
    if (isEnd !== endedRef.current) {
      endedRef.current = isEnd;
      setEnded(isEnd);
      if (isEnd) {
        setAnnouncement(t('memoryWorlds.crate.sideEnded'));
        if (autoReturnTimer.current !== null)
          window.clearTimeout(autoReturnTimer.current);
        autoReturnTimer.current = window.setTimeout(() => {
          autoReturnTimer.current = null;
          if (
            endedRef.current &&
            !fingerDown() &&
            needleRef.current !== 'stopped'
          )
            stop();
        }, AUTO_RETURN_MS);
      }
    }
  };

  const resetSong = () => {
    const m = motion.current;
    m.p = 0;
    m.glide = null;
    m.second = -1;
    lineRef.current = 0;
    photoRef.current = 0;
    endedRef.current = false;
    setLineIndex(0);
    setPhotoIndex(0);
    setEnded(false);
  };

  /** How fast the platter turns right now (follows spin-up, spin-down and scratching). */
  const platterRate = () => {
    if (reduceRef.current) return motorRef.current ? spinRate() : 0;
    const anim = spinAnim.current;
    if (anim?.playState !== 'running') return 0;
    return anim.playbackRate;
  };

  const announceFront = () => {
    const entry = orderRef.current[frontRef.current];
    if (!entry) return;
    setAnnouncement(
      t('memoryWorlds.crate.front', {
        title: entry.title,
        date: entry.dateLabel,
        position: frontRef.current + 1,
        count: countRef.current,
      }),
    );
  };

  /** A new record is in front: one light tick, like a sleeve edge passing the finger. */
  const syncFront = () => {
    const n = countRef.current;
    if (n === 0) return;
    const next = clamp(Math.round(motion.current.pos), 0, n - 1);
    if (next === frontRef.current) return;
    frontRef.current = next;
    setFront(next);
    haptic('threshold');
  };

  const step = (now: number) => {
    const m = motion.current;
    const dt = Math.min(0.05, Math.max(0, (now - m.last) / 1000));
    m.last = now;
    let settled = false;
    if (m.spring) {
      let left = dt;
      while (left > 1e-6) {
        const h = Math.min(left, 1 / 120);
        const accel = -SPRING_K * (m.pos - m.target) - SPRING_C * m.vel;
        m.vel = clamp(m.vel + accel * h, -MAX_SPEED, MAX_SPEED);
        m.pos += m.vel * h;
        left -= h;
      }
      if (Math.abs(m.pos - m.target) < 0.002 && Math.abs(m.vel) < 0.03) {
        m.pos = m.target;
        m.vel = 0;
        m.spring = false;
        settled = true;
      }
    }
    const ramp = m.ramp;
    if (ramp) {
      const p = clamp((now - ramp.start) / ramp.duration, 0, 1);
      ramp.anim.playbackRate = Math.max(
        0,
        ramp.from + (ramp.to - ramp.from) * easeInOutSine(p),
      );
      if (p >= 1) {
        if (ramp.to === 0) ramp.anim.pause();
        m.ramp = null;
      }
    }
    const timeline = m.timeline;
    if (timeline) {
      const t = now - timeline.t0;
      while (
        timeline.cues.length > 0 &&
        timeline.cues[0].at <= t &&
        m.timeline === timeline
      ) {
        const cue = timeline.cues.shift();
        cue?.fn();
      }
      if (m.timeline === timeline && timeline.cues.length === 0)
        m.timeline = null;
    }
    // The side plays: p advances with the platter while the needle is in the groove.
    const current = songRef.current;
    const tracking = isPlaying() && armStateRef.current === 'track';
    if (m.glide) {
      const g = m.glide;
      const t = clamp((now - g.start) / g.duration, 0, 1);
      if (now >= g.start) m.p = g.from + (g.to - g.from) * easeInOutSine(t);
      if (t >= 1) m.glide = null;
    } else if (tracking && current && !scratchRef.current) {
      const rate = platterRate();
      if (m.p < 1) m.p = Math.min(1, m.p + (dt * 1000 * rate) / current.sideMs);
      else if (rate > 0.3 && now - m.runout >= SPIN_MS / rate) {
        // The run-out groove: one soft tick per turn.
        m.runout = now;
        haptic('threshold');
      }
    }
    if (current && isPlaying()) {
      syncSong();
      paintProgress();
      paintLyrics();
    }
    syncFront();
    paint();
    paintArm();
    if (settled) {
      if (m.quiet) m.quiet = false;
      else announceFront();
    }
    frame.current =
      m.spring || m.ramp || m.timeline || m.glide || tracking
        ? window.requestAnimationFrame(loopRef.current)
        : null;
  };

  useEffect(() => {
    stepRef.current = step;
  });

  // Newly mounted sleeves (the window moves with the front record) get their pose at once.
  useLayoutEffect(() => {
    paint();
    paintArm();
    paintProgress();
    paintLyrics();
  });

  useEffect(
    () =>
      subscribeReducedMotion(() => {
        reduceRef.current = prefersReducedMotion();
      }),
    [],
  );

  /* ---------- Timelines ---------- */

  const runTimeline = (cues: Cue[]) => {
    motion.current.timeline = {
      t0: performance.now(),
      cues: [...cues].sort((a, b) => a.at - b.at),
    };
    kick();
  };

  const cancelAnims = () => {
    jacketAnim.current?.cancel();
    jacketAnim.current = null;
    vinylAnim.current?.cancel();
    vinylAnim.current = null;
    for (const anim of sleeveAnims.current) anim.cancel();
    sleeveAnims.current = [];
  };

  const cancelSpin = () => {
    spinAnim.current?.cancel();
    spinAnim.current = null;
    motion.current.ramp = null;
  };

  // The diary may hand over fewer memories (e.g. after renewing): stay inside the crate.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only the number of memories matters; the helpers read refs.
  useEffect(() => {
    const m = motion.current;
    const max = Math.max(0, count - 1);
    if (m.pos > max || m.target > max) {
      m.pos = Math.min(m.pos, max);
      m.target = Math.min(m.target, max);
      m.vel = 0;
      m.spring = false;
      frontRef.current = clamp(Math.round(m.pos), 0, max);
      setFront(frontRef.current);
    }
    if (playRef.current && playRef.current.index >= count) {
      m.timeline = null;
      cancelAnims();
      cancelSpin();
      playRef.current = null;
      setPlayState(null);
      setOutIndex(null);
      setArm('rest');
      setMotor(false);
    }
  }, [count]);

  useEffect(
    () => () => {
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
      frame.current = null;
      motion.current.timeline = null;
      jacketAnim.current?.cancel();
      vinylAnim.current?.cancel();
      inlayAnim.current?.cancel();
      for (const anim of sleeveAnims.current) anim.cancel();
      spinAnim.current?.cancel();
      if (artTimer.current !== null) window.clearTimeout(artTimer.current);
      for (const stopWatching of releaseWatch.current.values()) stopWatching();
    },
    [],
  );

  /* ---------- Pre-warming the turntable for the first pull ---------- */

  useEffect(() => {
    if (play) return undefined;
    const idle = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    let idleHandle = 0;
    const handle = window.setTimeout(() => {
      if (idle.requestIdleCallback)
        idleHandle = idle.requestIdleCallback(() => setStagedIndex(front), {
          timeout: 2500,
        });
      else setStagedIndex(front);
    }, 900);
    return () => {
      window.clearTimeout(handle);
      if (idleHandle && idle.cancelIdleCallback)
        idle.cancelIdleCallback(idleHandle);
    };
  }, [front, play]);

  // Pre-warm only while the turntable is idle (nothing playing or flying),
  // once per staged record. Measured on the Pixel: warming during a pull or
  // put-back cost 50+ ms frames, and its 16 ms "layer" animations on the
  // jacket, inlay and record overrode the running flight for a moment (the
  // visible glitch). Those warm-up animations are gone.
  const warmedKey = useRef<string | null>(null);
  useEffect(() => {
    if (count === 0 || play || stageKey === null) return undefined;
    if (warmedKey.current === stageKey) return undefined;
    let cancelled = false;
    const idle = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    const warm = () => {
      if (cancelled || playRef.current) return;
      warmedKey.current = stageKey;
      // Decode the staged photos now (off the main thread), not when first shown.
      deckRef.current?.querySelectorAll('img').forEach((img) => {
        if (img.complete) void img.decode?.().catch(() => undefined);
        else
          img.addEventListener(
            'load',
            () => void img.decode?.().catch(() => undefined),
            { once: true },
          );
      });
      void document.fonts?.load('600 16px Literata').catch(() => undefined);
      void document.fonts?.load('700 20px Caveat').catch(() => undefined);
    };
    let idleHandle = 0;
    const timer = window.setTimeout(() => {
      if (idle.requestIdleCallback)
        idleHandle = idle.requestIdleCallback(warm, { timeout: 3000 });
      else warm();
    }, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (idleHandle && idle.cancelIdleCallback)
        idle.cancelIdleCallback(idleHandle);
    };
  }, [stageKey, count, play]);

  /* ---------- Photos on the stand: one after another, crossfading ---------- */

  const lit = play?.phase === 'playing';
  useEffect(() => {
    if (stageKey === null) {
      setArtLayers([]);
      return;
    }
    artKeyRef.current += 1;
    const layer = { key: artKeyRef.current, photo: photoIndex };
    if (reduceRef.current) {
      setArtLayers([layer]);
      return;
    }
    setArtLayers((layers) => [...layers.slice(-1), layer]);
    if (artTimer.current !== null) window.clearTimeout(artTimer.current);
    artTimer.current = window.setTimeout(() => {
      artTimer.current = null;
      setArtLayers((layers) => layers.slice(-1));
    }, ART_FADE_MS + 60);
  }, [stageKey, photoIndex]);

  /* ---------- Lyrics: the current line in the middle, smooth upward roll ---------- */

  // Where every line sits in the roll, and how far each is wider than the display.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the geometry only changes with the song; paintLyrics reads refs.
  useLayoutEffect(() => {
    const roll = rollRef.current;
    const viewport = roll?.parentElement;
    if (!roll || !viewport || !song) {
      lyricGeom.current = null;
      return undefined;
    }
    const measure = () => {
      if (viewport.clientHeight === 0) return;
      const lines = Array.from(roll.children) as HTMLElement[];
      lyricGeom.current = {
        half: viewport.clientHeight / 2,
        centers: lines.map((line) => line.offsetTop + line.offsetHeight / 2),
        over: lines.map((line) => {
          const text = line.firstElementChild as HTMLElement | null;
          return Math.max(0, (text?.offsetWidth ?? 0) - line.clientWidth + 8);
        }),
      };
      wanderRef.current = -1;
      paintLyrics();
    };
    measureLyricsRef.current = measure;
    measure();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measure);
    observer?.observe(viewport);
    void document.fonts?.ready.then(measure);
    return () => observer?.disconnect();
  }, [song]);

  /* ---------- Flipping ---------- */

  const startSpring = (target: number, velocity: number) => {
    const m = motion.current;
    m.target = target;
    m.vel = clamp(velocity, -MAX_SPEED, MAX_SPEED);
    m.spring = true;
    kick();
  };

  const flipTo = (target: number, quiet = false) => {
    const n = countRef.current;
    if (n === 0) return;
    const next = clamp(target, 0, n - 1);
    const m = motion.current;
    m.quiet = quiet;
    if (reduceRef.current) {
      m.pos = next;
      m.target = next;
      m.vel = 0;
      m.spring = false;
      m.quiet = false;
      syncFront();
      paint();
      if (!quiet) announceFront();
      return;
    }
    startSpring(next, m.vel);
  };

  const flipBy = (delta: number) => {
    const m = motion.current;
    const base = m.spring ? m.target : Math.round(m.pos);
    const next = base + delta;
    if (next < 0 || next > countRef.current - 1) {
      haptic('refuse');
      if (base !== clamp(next, 0, countRef.current - 1)) flipTo(next);
      return;
    }
    flipTo(next);
  };

  /* ---------- Geometry for the flights ---------- */

  /** Brings the turntable into view below the crate: only ever scrolls down. */
  const bringIntoView = () => {
    const crate = crateRef.current;
    const deck = deckRef.current;
    if (!crate || !deck) return;
    const deckRect = deck.getBoundingClientRect();
    if (deckRect.bottom <= window.innerHeight - 8) return;
    const crateRect = crate.getBoundingClientRect();
    const bothFit = deckRect.bottom - crateRect.top + 96 <= window.innerHeight;
    const target = bothFit ? crate : deck;
    if (target.getBoundingClientRect().top <= 96) return;
    target.scrollIntoView({
      behavior: reduceRef.current ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  /** The stand's sleeve box, from the layout alone (immune to running animations). */
  const jacketRest = (): Box | null => {
    const top = deckTopRef.current;
    if (!top) return null;
    const r = top.getBoundingClientRect();
    const w = r.width;
    return {
      left: r.left + 0.025 * w,
      top: r.top + 0.016 * w,
      width: 0.34 * w,
      height: 0.34 * w,
    };
  };

  /** The record's box on the platter (seen squashed). */
  const slotRest = (): Box | null => {
    const top = deckTopRef.current;
    if (!top) return null;
    const r = top.getBoundingClientRect();
    const w = r.width;
    return {
      left: r.left + 0.42 * w,
      top: r.top + 0.12 * w * DECK_TILT,
      width: 0.48 * w,
      height: 0.48 * w * DECK_TILT,
    };
  };

  const liftPx = () => (crateRef.current?.offsetWidth ?? 360) * LIFT_SHARE;

  /** The front sleeve's box once it has risen out of the crate. */
  const liftedBox = (index: number): Box | null => {
    const sleeve = sleeveEls.current.get(index);
    if (!sleeve) return null;
    const r = sleeve.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top - liftPx(),
      width: r.width,
      height: r.height,
    };
  };

  const animateVinyl = (back: boolean, delay: number, duration: number) => {
    const jacket = jacketRest();
    const slot = slotRest();
    vinylAnim.current?.cancel();
    vinylAnim.current = null;
    if (!jacket || !slot) return;
    vinylAnim.current = flyVinyl(carrierRef.current, jacket, slot, DECK_TILT, {
      back,
      delay,
      duration,
    });
  };

  /** The inlay's box on the stand, in front of the sleeve (from the layout alone). */
  const inlayRest = (): Box | null => {
    const top = deckTopRef.current;
    if (!top) return null;
    const r = top.getBoundingClientRect();
    const w = r.width;
    return {
      left: r.left + 0.046 * w,
      top: r.top + 0.036 * w,
      width: 0.32 * w,
      height: 0.32 * w,
    };
  };

  const cancelInlay = () => {
    inlayAnim.current?.cancel();
    inlayAnim.current = null;
  };

  /** The inlay comes out of the sleeve onto the stand, or (`back`) goes back in. */
  const animateInlay = (back: boolean, delay: number, duration: number) => {
    const jacket = jacketRest();
    const box = inlayRest();
    cancelInlay();
    if (!jacket || !box) return;
    inlayAnim.current = flyInlay(inlayRef.current, jacket, box, {
      back,
      delay,
      duration,
    });
  };

  // Once the record plays, the inlay's resting state comes from the stylesheet again.
  const phaseNow = play?.phase ?? null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the phase or the run changes; cancelInlay reads refs.
  useLayoutEffect(() => {
    if (phaseNow === 'playing') cancelInlay();
  }, [phaseNow, play?.run]);

  /* ---------- The platter motor ---------- */

  const makeSpin = () => {
    const anim = spinPlatter(discRef.current, SPIN_MS);
    if (anim) spinAnim.current = anim;
    return anim;
  };

  /** Speeds the platter up or down to a rate (1 = 33 1/3 rpm, 0 = stopped), always eased. */
  const spinTo = (rate: number, duration: number) => {
    if (reduceRef.current) return;
    let anim = spinAnim.current;
    if (!anim) {
      if (rate === 0) return;
      anim = makeSpin();
      if (!anim) return;
      anim.playbackRate = 0.01;
    }
    let from = anim.playState === 'paused' ? 0 : anim.playbackRate;
    if (rate > 0 && anim.playState !== 'running') {
      from = 0.01;
      anim.playbackRate = from;
      anim.play();
    }
    motion.current.ramp = {
      anim,
      from,
      to: rate,
      start: performance.now(),
      duration,
    };
    kick();
  };

  const playingText = (entry: Entry) =>
    entry.author
      ? t('memoryWorlds.crate.playingBy', {
          title: entry.title,
          date: entry.dateLabel,
          name: entry.author,
        })
      : t('memoryWorlds.crate.playing', {
          title: entry.title,
          date: entry.dateLabel,
        });

  const announcePlaying = (index: number) => {
    const entry = orderRef.current[index];
    if (entry) setAnnouncement(playingText(entry));
  };

  /** The needle touches the record: p starts running again. */
  const land = (announce = true) => {
    haptic('commit');
    setNeedle('play');
    setArm('track');
    if (announce) announcePlaying(playRef.current?.index ?? -1);
    kick();
  };

  const resetTurntable = () => {
    setNeedle('play');
    armDragRef.current = null;
    scratchRef.current = null;
  };

  const setFlipNow = (next: boolean) => {
    flipFromRef.current = null;
    flippedRef.current = next;
    setFlipped(next);
  };

  /* ---------- Pull: one continuous timeline, ~2.5 s ---------- */

  const pull = (index: number) => {
    if (playRef.current || countRef.current === 0) return;
    const m = motion.current;
    m.spring = false;
    m.vel = 0;
    m.pos = index;
    m.target = index;
    syncFront();
    paint();
    resetTurntable();
    resetSong();
    setFlipNow(false);
    cancelAnims();
    cancelInlay();
    setStagedIndex(index);
    deckRef.current?.querySelectorAll('img').forEach((img) => {
      if (img.complete) void img.decode?.().catch(() => undefined);
    });
    runRef.current += 1;
    const run = runRef.current;
    if (reduceRef.current) {
      setOutIndex(index);
      setPlay({ index, phase: 'playing', run });
      setMotor(true);
      land();
      bringIntoView();
      return;
    }
    haptic('press');
    setPlay({ index, phase: 'pulling', run });
    setArm('rest');
    const sleeve = sleeveEls.current.get(index);
    const lifted = liftedBox(index);
    const jacket = jacketRest();
    const lift = liftPx();
    // Rising out of the crate and gathering speed: the flight carries the motion on.
    const rise = riseSleeve(sleeve, lift, PULL.rise);
    if (rise) sleeveAnims.current.push(rise);
    if (lifted && jacket) {
      jacketAnim.current = flyJacket(jacketRef.current, lifted, jacket, {
        delay: PULL.rise,
        duration: PULL.fly,
      });
    }
    animateVinyl(false, PULL.vinylAt, PULL.vinyl);
    animateInlay(false, PULL.inlayAt, PULL.inlay);
    bringIntoView();
    runTimeline([
      { at: PULL.rise, fn: () => setOutIndex(index) },
      {
        at: PULL.spinAt,
        fn: () => {
          setMotor(true);
          spinTo(spinRate(), SPIN_UP_MS);
        },
      },
      {
        at: PULL.vinylAt + PULL.vinyl * 0.62,
        fn: () => {
          const entry = orderRef.current[index];
          if (entry && pictureRef.current.has(entry.key)) {
            // A picture disc catches the light as it comes out.
            setGlintKey((key) => key + 1);
            haptic('success');
            setAnnouncement(t('memoryWorlds.crate.pictureDisc'));
          }
        },
      },
      { at: PULL.swingAt, fn: () => setArm('swing') },
      { at: PULL.dropAt, fn: () => setArm('down') },
      {
        at: PULL.land,
        fn: () => {
          cancelAnims();
          setPlay({ index, phase: 'playing', run });
          land();
        },
      },
    ]);
  };

  /* ---------- Put back: the same timeline in reverse, ~2.5 s ---------- */

  const finishReturn = () => {
    motion.current.timeline = null;
    cancelAnims();
    cancelInlay();
    resetSong();
    cancelSpin();
    setPlay(null);
    setArm('rest');
    setAnnouncement(t('memoryWorlds.crate.returned'));
  };

  const putBack = () => {
    const current = playRef.current;
    if (current?.phase !== 'playing') return;
    if (deckRef.current?.contains(document.activeElement)) {
      crateRef.current?.focus({ preventScroll: true });
    }
    setFlip(false);
    resetTurntable();
    motion.current.glide = null;
    if (reduceRef.current) {
      setOutIndex(null);
      setMotor(false);
      haptic('threshold');
      finishReturn();
      return;
    }
    const { index, run } = current;
    setPlay({ index, phase: 'returning', run });
    setArm('park');
    setMotor(false);
    spinTo(0, SPIN_DOWN_MS * 0.8);
    cancelAnims();
    animateVinyl(true, BACK.vinylAt, BACK.vinyl);
    animateInlay(true, 0, BACK.inlay);
    // The crate may have been browsed meanwhile: it turns back to the record's slot
    // (close by: flipping; far away: at once) before the sleeve flies back.
    const m = motion.current;
    const away = Math.abs(m.pos - index);
    if (away > 0.001) {
      if (away <= 4) flipTo(index, true);
      else {
        m.spring = false;
        m.vel = 0;
        m.pos = index;
        m.target = index;
        syncFront();
        paint();
      }
    }
    // The flight is measured when it starts, with the crate in place.
    const flyBack = () => {
      const lifted = liftedBox(index);
      const jacket = jacketRest();
      if (lifted && jacket) {
        jacketAnim.current = flyJacket(jacketRef.current, lifted, jacket, {
          duration: BACK.fly,
          back: true,
        });
      }
      // Hidden until the flight arrives, then it drops in with a soft overshoot (the clack).
      const drop = dropSleeve(
        sleeveEls.current.get(index),
        liftPx(),
        BACK.fly,
        BACK.drop,
      );
      if (drop) sleeveAnims.current.push(drop);
      setOutIndex(null);
    };
    runTimeline([
      { at: BACK.flyAt, fn: flyBack },
      { at: BACK.clack, fn: () => haptic('threshold') },
      { at: BACK.done, fn: finishReturn },
    ]);
  };

  /* ---------- Swap to another record, ~3 s ---------- */

  const swapTo = (index: number) => {
    const current = playRef.current;
    if (current?.phase !== 'playing') return;
    if (index === current.index || index < 0 || index >= countRef.current) {
      setFlip(false);
      return;
    }
    haptic('press');
    setFlip(false);
    resetTurntable();
    motion.current.glide = null;
    const { run } = current;
    const oldIndex = current.index;
    if (reduceRef.current) {
      flipTo(index, true);
      setOutIndex(index);
      resetSong();
      setPlay({ index, phase: 'playing', run });
      land();
      return;
    }
    setPlay({ index: oldIndex, phase: 'swapping', run });
    setArm('park');
    setMotor(false);
    spinTo(0, SWAP.vinylAt + 360);
    cancelAnims();
    animateVinyl(true, SWAP.vinylAt, SWAP.vinyl);
    animateInlay(true, 0, SWAP.inlayBack);
    jacketAnim.current = tipJacketAway(
      jacketRef.current,
      SWAP.awayAt,
      SWAP.away,
    );
    const switchOver = () => {
      // The old sleeve slips back into the crate; the crate turns to the new one.
      cancelAnims();
      const slip = slipSleeveBack(
        sleeveEls.current.get(oldIndex),
        liftPx() * 0.5,
      );
      if (slip) sleeveAnims.current.push(slip);
      setOutIndex(index);
      flipTo(index, true);
      resetSong();
      setPlay({ index, phase: 'swapping', run });
      setAnnouncement(
        t('memoryWorlds.crate.upNext', {
          title: orderRef.current[index]?.title ?? '',
        }),
      );
      jacketAnim.current = tipJacketIn(jacketRef.current, SWAP.in);
      animateVinyl(false, SWAP.vinylIn, SWAP.vinylDur);
      animateInlay(false, SWAP.in, SWAP.inlayOut);
    };
    runTimeline([
      { at: SWAP.switchAt, fn: switchOver },
      {
        at: SWAP.spinAt,
        fn: () => {
          setMotor(true);
          spinTo(spinRate(), SPIN_UP_MS);
        },
      },
      {
        at: SWAP.switchAt + SWAP.vinylIn + SWAP.vinylDur * 0.62,
        fn: () => {
          const entry = orderRef.current[index];
          if (entry && pictureRef.current.has(entry.key)) {
            setGlintKey((key) => key + 1);
            haptic('success');
            setAnnouncement(t('memoryWorlds.crate.pictureDisc'));
          }
        },
      },
      { at: SWAP.swingAt, fn: () => setArm('swing') },
      { at: SWAP.dropAt, fn: () => setArm('down') },
      {
        at: SWAP.land,
        fn: () => {
          cancelAnims();
          setPlay({ index, phase: 'playing', run });
          land();
        },
      },
    ]);
  };

  const nextTrack = () => {
    const current = playRef.current;
    const list = tracksRef.current;
    if (!current || list.length < 2) return;
    const at = list.findIndex((track) => track.index === current.index);
    swapTo(list[(at + 1) % list.length].index);
  };

  /* ---------- Start / stop, needle up and down, seeking ---------- */

  const stop = () => {
    if (!isPlaying()) return;
    motion.current.timeline = null;
    motion.current.glide = null;
    setArm('park');
    setNeedle('stopped');
    setMotor(false);
    spinTo(0, SPIN_DOWN_MS);
    setAnnouncement(t('memoryWorlds.crate.stopped'));
  };

  const start = () => {
    if (!isPlaying()) return;
    if (endedRef.current) {
      // A finished side starts again from the lead-in groove.
      resetSong();
    }
    setNeedle('starting');
    setMotor(true);
    spinTo(spinRate(), SPIN_UP_MS);
    if (reduceRef.current) {
      land();
      return;
    }
    setArm('park');
    runTimeline([
      { at: START.swingAt, fn: () => setArm('swing') },
      { at: START.dropAt, fn: () => setArm('down') },
      { at: START.land, fn: () => land() },
    ]);
  };

  /** Lifts the needle off the record in place: the platter keeps turning, p stops. */
  const cueLift = () => {
    if (!isPlaying()) return;
    motion.current.timeline = null;
    setArm('cuedup');
    setNeedle('cued');
    setAnnouncement(t('memoryWorlds.crate.cued'));
  };

  /** Lowers the needle where p is (motor on if it was off). */
  const lowerHere = () => {
    if (!isPlaying()) return;
    setArm('down');
    setNeedle('starting');
    if (!motorRef.current) {
      setMotor(true);
      spinTo(spinRate(), SPIN_UP_MS);
    }
    if (reduceRef.current) {
      land(false);
      return;
    }
    runTimeline([{ at: LOWER_MS, fn: () => land(false) }]);
  };

  const toggleCue = () => {
    const state = needleRef.current;
    if (state === 'stopped') start();
    else if (state === 'cued') lowerHere();
    else cueLift();
  };

  /**
   * Seeks to a point of the side (a lyric line, the arrow keys): the needle
   * lifts, the arm glides there and the needle drops again.
   */
  const seekTo = (target: number) => {
    if (!isPlaying()) return;
    const m = motion.current;
    const to = clamp(target, 0, 1);
    if (reduceRef.current) {
      m.p = to;
      m.glide = null;
      syncSong();
      paintProgress();
      paintArm();
      paintLyrics();
      return;
    }
    const now = performance.now();
    const needleDown =
      needleRef.current === 'play' || needleRef.current === 'starting';
    if (!needleDown || armStateRef.current === 'park') {
      // Needle up or arm parked: only the position moves (the arm follows if it is over the record).
      m.glide = { from: m.p, to, start: now, duration: SEEK.glide };
      kick();
      return;
    }
    setArm('cuedup');
    setNeedle('starting');
    m.glide = {
      from: m.p,
      to,
      start: now + SEEK.glideAt,
      duration: SEEK.glide,
    };
    runTimeline([
      { at: SEEK.dropAt, fn: () => setArm('down') },
      { at: SEEK.land, fn: () => land(false) },
    ]);
  };

  const onStartStop = () => {
    const current = playRef.current;
    if (!current) {
      // Start with nothing on the platter: the front record goes on.
      pull(frontRef.current);
      return;
    }
    if (current.phase !== 'playing') return;
    haptic('press');
    if (needleRef.current === 'stopped') start();
    else stop();
  };

  const setSpeed = (next: 33 | 45) => {
    if (rpmRef.current === next) return;
    rpmRef.current = next;
    setRpmState(next);
    haptic('threshold');
    if (motorRef.current && isPlaying()) spinTo(spinRate(), 700);
    setAnnouncement(t('memoryWorlds.crate.speedChanged', { rpm: next }));
  };

  const onDeckKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!isPlaying()) return;
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowUp';
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowDown';
    if (!forward && !backward) return;
    event.preventDefault();
    seekTo(motion.current.p + (forward ? SEEK_STEP : -SEEK_STEP));
  };

  /* ---------- Liner notes ---------- */

  const setFlip = (next: boolean) => {
    if (flippedRef.current === next) return;
    const jacket = jacketRef.current;
    flipFromRef.current =
      jacket && !reduceRef.current ? jacket.getBoundingClientRect() : null;
    flippedRef.current = next;
    setFlipped(next);
    if (next) {
      haptic('press');
      setAnnouncement(
        t('memoryWorlds.crate.linerNotes', { count: tracksRef.current.length }),
      );
    }
  };

  // Picked up to read, or set back on the stand: the sleeve's box moves, a FLIP animates it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the FLIP runs after each flip of the sleeve.
  useLayoutEffect(() => {
    const from = flipFromRef.current;
    flipFromRef.current = null;
    const jacket = jacketRef.current;
    if (!from || !jacket) return;
    const to = jacket.getBoundingClientRect();
    if (to.width === 0) return;
    jacketAnim.current?.cancel();
    const { dx, dy, s } = centreDelta(from, to);
    jacketAnim.current = flipJacketFrom(jacket, dx, dy, s, FLIP_MS);
  }, [flipped]);

  const onJacketClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (!isPlaying()) return;
    if (
      event.target instanceof Element &&
      event.target.closest('[data-crate-track]')
    )
      return;
    setFlip(!flippedRef.current);
  };

  /* ---------- Scratching the record ---------- */

  const planePoint = (event: ReactPointerEvent<HTMLElement>) => {
    const plane = planeRef.current;
    if (!plane) return { x: 0, y: 0 };
    const r = plane.getBoundingClientRect();
    return {
      x: ((event.clientX - r.left) / r.width) * 100,
      y: ((event.clientY - r.top) / r.height) * PLANE_H,
    };
  };

  const discAngle = (event: ReactPointerEvent<HTMLElement>) => {
    const { x, y } = planePoint(event);
    return (Math.atan2(y - SPINDLE_Y, x - SPINDLE_X) * 180) / Math.PI;
  };

  /**
   * A safety net for every finger gesture: whatever happens to the element
   * that holds the pointer, the release on the window always ends it.
   */
  const watchRelease = (
    name: string,
    id: number,
    done: (cancelled: boolean) => void,
  ) => {
    releaseWatch.current.get(name)?.();
    const stopWatching = () => {
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
      releaseWatch.current.delete(name);
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== id) return;
      stopWatching();
      done(false);
    };
    const onCancel = (event: PointerEvent) => {
      if (event.pointerId !== id) return;
      stopWatching();
      done(true);
    };
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onCancel, true);
    releaseWatch.current.set(name, stopWatching);
  };

  const onDiscPointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!isPlaying()) return;
    if (scratchRef.current && scratchRef.current.id !== event.pointerId)
      finishScratch(scratchRef.current.id);
    if (scratchRef.current) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    let anim = spinAnim.current;
    if (!anim) {
      // Reduced motion: no motor, but the record still turns by hand.
      anim = makeSpin();
      if (!anim) return;
    }
    const m = motion.current;
    if (m.ramp?.anim === anim) m.ramp = null;
    anim.pause();
    const base = (Number(anim.currentTime) || 0) + SPIN_MS * 1000;
    anim.currentTime = base;
    scratchRef.current = {
      id: event.pointerId,
      last: discAngle(event),
      total: 0,
      tick: 0,
      base,
    };
    watchRelease('scratch', event.pointerId, () =>
      finishScratch(event.pointerId),
    );
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The pointer may already be gone (e.g. a cancelled touch).
    }
  };

  const onDiscPointerMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const scratch = scratchRef.current;
    const anim = spinAnim.current;
    if (!scratch || scratch.id !== event.pointerId || !anim) return;
    const angle = discAngle(event);
    const delta = angleDelta(angle, scratch.last);
    scratch.last = angle;
    scratch.total += delta;
    scratch.tick += Math.abs(delta);
    anim.currentTime = scratch.base + (scratch.total / 360) * SPIN_MS;
    // With the needle in the groove, turning the record moves the music with it.
    const current = songRef.current;
    if (current && armStateRef.current === 'track') {
      const m = motion.current;
      m.p = clamp(m.p + ((delta / 360) * SPIN_MS) / current.sideMs, 0, 1);
      syncSong();
      paintProgress();
      paintArm();
      paintLyrics();
    }
    if (scratch.tick >= SCRATCH_TICK_DEG) {
      scratch.tick -= SCRATCH_TICK_DEG;
      haptic('threshold');
    }
  };

  const finishScratch = (id: number) => {
    const scratch = scratchRef.current;
    if (!scratch || scratch.id !== id) return;
    scratchRef.current = null;
    releaseWatch.current.get('scratch')?.();
    // Let go: the platter takes the record back up to speed if the motor runs.
    if (motorRef.current && isPlaying()) spinTo(spinRate(), SCRATCH_RESUME_MS);
    syncSong();
  };

  const endScratch = (event: ReactPointerEvent<HTMLSpanElement>) =>
    finishScratch(event.pointerId);

  /* ---------- Dragging the lyrics: scrubbing like the tonearm ---------- */

  const onLyricsPointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
    // Buttons and links of the end card keep working as taps.
    if (event.target instanceof Element && event.target.closest('a, button'))
      return;
    measureLyricsRef.current?.();
    if (!isPlaying() || !lyricGeom.current) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // A drag whose release never arrived must not block this one.
    if (lyricDrag.current) finishLyrics(lyricDrag.current.id, true);
    watchRelease('lyrics', event.pointerId, (cancelled) =>
      finishLyrics(event.pointerId, cancelled),
    );
    lyricDrag.current = {
      id: event.pointerId,
      y: event.clientY,
      startCentre: lyricCentreForP(motion.current.p),
      startP: motion.current.p,
      active: false,
      needleWasDown: false,
    };
  };

  const onLyricsPointerMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const drag = lyricDrag.current;
    if (!drag || drag.id !== event.pointerId) return;
    const dy = event.clientY - drag.y;
    if (!drag.active) {
      if (Math.abs(dy) < DRAG_SLOP / 2) return;
      drag.active = true;
      lyricClickBlocked.current = true;
      const m = motion.current;
      m.timeline = null;
      m.glide = null;
      // While the finger holds the lyrics, the needle is lifted: the music waits.
      const state = needleRef.current;
      drag.needleWasDown = state === 'play' || state === 'starting';
      if (drag.needleWasDown) {
        setArm('cuedup');
        setNeedle('cued');
      }
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The pointer may already be gone (e.g. a cancelled touch).
      }
    }
    // Proportional: the whole side is the height of all lines (at least two
    // display heights), so every pixel of finger travel moves p evenly.
    const geom = lyricGeom.current;
    const span = geom
      ? Math.max(
          (geom.centers[geom.centers.length - 1] ?? 0) - (geom.centers[0] ?? 0),
          geom.half * 4,
          120,
        )
      : 240;
    motion.current.p = clamp(drag.startP - dy / span, 0, 1);
    syncSong();
    paintProgress();
    paintLyrics();
    kick();
  };

  const finishLyrics = (id: number, cancelled: boolean) => {
    const drag = lyricDrag.current;
    if (!drag || drag.id !== id) return;
    lyricDrag.current = null;
    releaseWatch.current.get('lyrics')?.();
    if (!drag.active) return;
    window.setTimeout(() => {
      lyricClickBlocked.current = false;
    }, 80);
    // Let go: only now may the side end (if the finger left it at the end).
    syncSong();
    // Left at the very end: the side is over, the arm returns (no needle drop).
    if (motion.current.p >= 1 - 1e-6) {
      stop();
      return;
    }
    // Otherwise the needle drops where the lyrics were left and the music plays on.
    if (drag.needleWasDown && needleRef.current === 'cued') lowerHere();
    void cancelled;
  };

  const endLyricsDrag = (
    event: ReactPointerEvent<HTMLSpanElement>,
    cancelled: boolean,
  ) => finishLyrics(event.pointerId, cancelled);

  /* ---------- Moving the tonearm by hand: scrubbing ---------- */

  const armAngle = (event: ReactPointerEvent<HTMLElement>) => {
    const { x, y } = planePoint(event);
    const deg = (Math.atan2(-(x - PIVOT_X), y - PIVOT_Y) * 180) / Math.PI;
    return clamp(deg, ARM_MIN_DEG, ARM_MAX_DEG);
  };

  const onArmPointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!isPlaying()) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.stopPropagation();
    if (armDragRef.current) finishArm(armDragRef.current.id, true);
    armDragRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      active: false,
      deg: 0,
    };
    watchRelease('arm', event.pointerId, (cancelled) =>
      finishArm(event.pointerId, cancelled),
    );
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The pointer may already be gone (e.g. a cancelled touch).
    }
  };

  const onArmPointerMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const drag = armDragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    if (!drag.active) {
      if (
        Math.hypot(event.clientX - drag.x, event.clientY - drag.y) <
        ARM_TAP_SLOP
      )
        return;
      drag.active = true;
      motion.current.timeline = null;
      motion.current.glide = null;
      setArm('hand');
      haptic('threshold');
    }
    drag.deg = armAngle(event);
    // Over the record the needle scrubs: p follows the arm live.
    if (onRecord(drag.deg)) {
      motion.current.p = pForArmDeg(drag.deg);
      syncSong();
      paintProgress();
    }
    kick();
  };

  const endArmDrag = (
    event: ReactPointerEvent<HTMLSpanElement>,
    cancelled: boolean,
  ) => finishArm(event.pointerId, cancelled);

  const finishArm = (id: number, cancelled: boolean) => {
    const drag = armDragRef.current;
    if (!drag || drag.id !== id) return;
    armDragRef.current = null;
    releaseWatch.current.get('arm')?.();
    if (!drag.active) {
      if (!cancelled) toggleCue();
      return;
    }
    if (cancelled || !onRecord(drag.deg)) {
      // Off the record: it spins down and stops; p stays where it was.
      stop();
      return;
    }
    motion.current.p = pForArmDeg(drag.deg);
    // Let go: only now may the side end.
    syncSong();
    lowerHere();
  };

  /* ---------- Gesture: drag down to tip the sleeves forward ---------- */

  const onCratePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (dragRef.current) return;
    const m = motion.current;
    // Touching the crate catches records that are still falling fast.
    const caught = m.spring && Math.abs(m.vel) > 0.4;
    if (caught) {
      m.spring = false;
      m.vel = 0;
    }
    const width = event.currentTarget.offsetWidth || 360;
    dragRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startPos: m.pos,
      active: false,
      caught,
      refused: false,
      lastY: event.clientY,
      lastT: event.timeStamp,
      vy: 0,
      flipPx: Math.max(60, width * FLIP_PER_WIDTH),
    };
  };

  const onCratePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.active) {
      if (Math.abs(dy) < DRAG_SLOP || Math.abs(dy) < Math.abs(dx)) {
        // A sideways swipe is not a flip.
        if (Math.abs(dx) > DRAG_SLOP * 3) dragRef.current = null;
        return;
      }
      if (playRef.current && playRef.current.phase !== 'playing') {
        // A record is on its way in or out: the crate waits for it.
        dragRef.current = null;
        return;
      }
      drag.active = true;
      // Take over from a settling spring exactly where the sleeves are now,
      // keeping the slop so the sleeves do not jump under the finger.
      const m0 = motion.current;
      m0.spring = false;
      m0.vel = 0;
      drag.startPos = m0.pos - dy / drag.flipPx;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The pointer may already be gone (e.g. a cancelled touch).
      }
    }
    const n = countRef.current;
    const raw = drag.startPos + (event.clientY - drag.y) / drag.flipPx;
    const m = motion.current;
    if (!drag.refused && (raw < -0.15 || raw > n - 1 + 0.15)) {
      drag.refused = true;
      haptic('refuse');
    }
    m.pos = reduceRef.current
      ? clamp(Math.round(raw), 0, n - 1)
      : rubber(raw, n - 1);
    const elapsed = event.timeStamp - drag.lastT;
    if (elapsed > 0)
      drag.vy = 0.6 * drag.vy + (0.4 * (event.clientY - drag.lastY)) / elapsed;
    drag.lastY = event.clientY;
    drag.lastT = event.timeStamp;
    kick();
  };

  /**
   * Tapping a sleeve: one behind comes to the front; the front one goes on the
   * turntable (with a record playing, it takes that record's place).
   */
  const onTap = (target: EventTarget | null) => {
    const current = playRef.current;
    if (current && current.phase !== 'playing') return;
    const sleeve =
      target instanceof Element
        ? target.closest<HTMLElement>('[data-crate-index]')
        : null;
    if (!sleeve) return;
    const index = Number(sleeve.dataset.crateIndex);
    if (!Number.isFinite(index)) return;
    if (index !== frontRef.current) {
      flipTo(index);
      return;
    }
    if (!current) pull(index);
    else if (index !== current.index) swapTo(index);
  };

  const endDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    cancelled: boolean,
  ) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    dragRef.current = null;
    const m = motion.current;
    const n = countRef.current;
    if (!drag.active) {
      if (drag.caught || cancelled) flipTo(Math.round(m.pos));
      else onTap(event.target);
      // Never leave a sleeve hanging half-tipped.
      const busy =
        playRef.current !== null && playRef.current.phase !== 'playing';
      if (!m.spring && !busy && m.pos !== Math.round(m.pos))
        flipTo(Math.round(m.pos));
      return;
    }
    const recent = event.timeStamp - drag.lastT < 90;
    const velocity =
      cancelled || !recent || reduceRef.current
        ? 0
        : clamp((drag.vy * 1000) / drag.flipPx, -MAX_SPEED, MAX_SPEED);
    const from = Math.round(drag.startPos);
    const thrown = Math.round(m.pos + velocity * THROW_S);
    const target = clamp(
      clamp(thrown, from - MAX_THROW, from + MAX_THROW),
      0,
      n - 1,
    );
    if (reduceRef.current) {
      flipTo(target);
      return;
    }
    startSpring(target, velocity);
  };

  const onCrateKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const current = playRef.current;
    const busy = current !== null && current.phase !== 'playing';
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowLeft':
      case 'PageDown':
      case 'PageUp':
      case 'Home':
      case 'End': {
        if (busy) break;
        const n = countRef.current;
        if (event.key === 'Home') flipTo(0);
        else if (event.key === 'End') flipTo(n - 1);
        else if (event.key === 'PageDown') flipBy(5);
        else if (event.key === 'PageUp') flipBy(-5);
        else
          flipBy(
            event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1,
          );
        break;
      }
      case 'Enter':
      case ' ':
        if (event.repeat) break;
        if (busy) break;
        if (!current) pull(frontRef.current);
        else if (frontRef.current !== current.index) swapTo(frontRef.current);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const onRootKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || !isPlaying()) return;
    event.preventDefault();
    // Escape first puts the liner notes down, then the record back.
    if (flippedRef.current) setFlip(false);
    else putBack();
  };

  if (count === 0) return null;

  /* ---------- Render ---------- */

  const first = Math.max(0, front - AHEAD);
  const last = Math.min(count - 1, front + BEHIND);
  const mounted: number[] = [];
  for (let index = first; index <= last; index += 1) mounted.push(index);
  const fillers: number[] = [];
  for (
    let index = last + 1;
    index <= Math.min(count - 1, last + FILLERS);
    index += 1
  )
    fillers.push(index);

  const reduce = reduceRef.current;
  const phase = play?.phase ?? null;
  const paused =
    lit && (needle === 'cued' || needle === 'stopped' || arm === 'hand');
  const armShown = reduce && arm === 'track' ? 'down' : arm;
  const fill = few ? 'few' : count > 24 ? 'packed' : 'some';
  const seasonText = playEntry ? seasonLabel(playEntry.date, t) : '';
  const running = lit && needle !== 'stopped';
  const artOn = lit && !flipped;
  const isPicture = playEntry ? pictureKeys.has(playEntry.key) : false;
  // The record shows the same photo as the inlay, crossfading with it.
  const discLayers = artLayers.length > 0 ? artLayers : [{ key: 0, photo: 0 }];
  const photoLayers =
    song && song.photos.length > 0
      ? discLayers.map((layer, i) => (
          <span
            key={layer.key}
            className="memory-crate-photo-layer"
            data-fresh={
              i === discLayers.length - 1 && discLayers.length > 1
                ? 'true'
                : undefined
            }
          >
            <MemoryPhoto
              entry={song.photos[Math.min(layer.photo, song.photos.length - 1)]}
              loadMemoryImage={loadMemoryImage}
            />
          </span>
        ))
      : null;
  let inlayKind: 'photo' | 'heart' | 'milestone' | 'words' | null = null;
  if (playEntry && song) {
    if (song.photos.length > 0) inlayKind = 'photo';
    else if (playEntry.kind === 'heart') inlayKind = 'heart';
    else if (playEntry.kind === 'milestone') inlayKind = 'milestone';
    else inlayKind = 'words';
  }
  const sliceMs = song
    ? song.sideMs / Math.max(1, song.photos.length) / (rpm === 45 ? RATE_45 : 1)
    : 0;
  const currentLine =
    song && lit && !ended ? (song.lines[lineIndex] ?? '') : '';

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Escape anywhere in the world puts the liner notes or the record back; the controls inside are real buttons.
    <div ref={rootRef} className="memory-crate-world" onKeyDown={onRootKeyDown}>
      <WorldHead heading={t('memoryWorlds.crate.heading')} />

      {/* biome-ignore lint/a11y/useSemanticElements: the crate is one focusable widget (arrow keys flip, Enter plays), not a form fieldset. */}
      <div
        ref={crateRef}
        className="memory-crate-crate"
        role="group"
        aria-roledescription={t('memoryWorlds.crate.roleDescription')}
        aria-label={t('memoryWorlds.crate.label', { count })}
        aria-describedby={hintId}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the crate is the keyboard entry of the world.
        tabIndex={0}
        data-fill={fill}
        data-out={play ? 'true' : undefined}
        data-primary-tab-swipe-block
        onPointerDown={onCratePointerDown}
        onPointerMove={onCratePointerMove}
        onPointerUp={(event) => endDrag(event, false)}
        onPointerCancel={(event) => endDrag(event, true)}
        onKeyDown={onCrateKeyDown}
        onContextMenu={(event) => event.preventDefault()}
        onDragStart={(event) => event.preventDefault()}
      >
        <span className="memory-crate-floor-shadow" aria-hidden="true" />
        <span className="memory-crate-rim" aria-hidden="true" />
        <span className="memory-crate-stage">
          {fillers.map((index) => {
            const entry = order[index];
            return (
              <span
                key={`f${entry.key}`}
                className="memory-crate-filler"
                aria-hidden="true"
                data-kind={coverKind(entry)}
                data-tone={
                  coverKind(entry) === 'memory' ? memoryTone(entry) : undefined
                }
                data-heart-emotion={
                  entry.kind === 'heart' ? entry.emotion : undefined
                }
                style={{ zIndex: 1 }}
                ref={(el) => {
                  if (el) fillerEls.current.set(index, el);
                  else fillerEls.current.delete(index);
                }}
              >
                <span className="memory-crate-shade" />
              </span>
            );
          })}
          {mounted.map((index) => {
            const entry = order[index];
            return (
              <span
                key={entry.key}
                className="memory-crate-sleeve"
                data-crate-index={index}
                data-out={outIndex === index ? 'true' : undefined}
                role="img"
                aria-label={sleeveName(entry, t)}
                style={{ zIndex: 2 + count - index }}
                ref={(el) => {
                  if (el) sleeveEls.current.set(index, el);
                  else sleeveEls.current.delete(index);
                }}
              >
                <SleeveCover entry={entry} month={monthLabel(entry, locale)} />
                <span className="memory-crate-shade" />
              </span>
            );
          })}
        </span>
        <span className="memory-crate-walls" aria-hidden="true" />
        <span className="memory-crate-board" aria-hidden="true">
          <span className="memory-crate-board-edge" />
          <span className="memory-crate-handle" />
          <span className="memory-crate-board-light" />
        </span>
      </div>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: the arrow keys seek while a deck control (Start, 33/45) has focus. */}
      <div
        ref={deckRef}
        className="memory-crate-deck"
        data-arm={armShown}
        data-lifted={LIFTED_ARM.has(armShown) ? 'true' : undefined}
        data-phase={phase ?? 'idle'}
        data-motor={motor ? 'on' : undefined}
        data-paused={paused ? 'true' : undefined}
        data-flipped={flipped && lit ? 'true' : undefined}
        data-art={artOn ? 'on' : undefined}
        onKeyDown={onDeckKeyDown}
      >
        <div ref={deckTopRef} className="memory-crate-deck-top">
          <span
            ref={planeRef}
            className="memory-crate-plane"
            aria-hidden="true"
          >
            <span className="memory-crate-plinth" />
            <span className="memory-crate-platter-side" />
            <span className="memory-crate-platter">
              <span className="memory-crate-mat" />
            </span>
            <span className="memory-crate-slot">
              <span
                ref={carrierRef}
                className="memory-crate-carrier"
                data-shown={play ? 'true' : undefined}
                data-scratchable={lit ? 'true' : undefined}
                data-primary-tab-swipe-block
                onPointerDown={onDiscPointerDown}
                onPointerMove={onDiscPointerMove}
                onPointerUp={endScratch}
                onPointerCancel={endScratch}
                onLostPointerCapture={(event) => {
                  // Only the element's own capture: a child giving up its implicit
                  // touch capture bubbles up here too and is not a release.
                  if (event.target === event.currentTarget) endScratch(event);
                }}
              >
                <span
                  ref={discRef}
                  className="memory-crate-vinyl"
                  data-picture={isPicture ? 'true' : undefined}
                >
                  {isPicture && song ? (
                    <span className="memory-crate-picture">{photoLayers}</span>
                  ) : null}
                  <span className="memory-crate-grooves" />
                  {isPicture ? (
                    <span className="memory-crate-picture-gloss" />
                  ) : null}
                  {isPicture ? (
                    <span className="memory-crate-picture-ring" />
                  ) : null}
                  {!isPicture && playEntry && song && song.photos.length > 0 ? (
                    <span className="memory-crate-label" data-kind="photo">
                      {photoLayers}
                    </span>
                  ) : null}
                  {!isPicture &&
                  playEntry &&
                  song &&
                  song.photos.length === 0 ? (
                    <RecordLabel entry={playEntry} />
                  ) : null}
                </span>
                <span className="memory-crate-sheen" />
                {isPicture && glintKey > 0 ? (
                  <span key={glintKey} className="memory-crate-glint" />
                ) : null}
              </span>
            </span>
            <span className="memory-crate-spindle" />
            <span className="memory-crate-arm-rest">
              <span className="memory-crate-arm-clip" />
            </span>
            <span className="memory-crate-cue">
              <span className="memory-crate-cue-handle" />
              {/* biome-ignore lint/a11y/noStaticElementInteractions: a pointer shortcut; the Start/Stop button offers the same for keyboards. */}
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: see above. */}
              <span
                className="memory-crate-cue-hit"
                data-active={lit ? 'true' : undefined}
                data-primary-tab-swipe-block
                onClick={() => {
                  if (isPlaying()) toggleCue();
                }}
              />
            </span>
            <span className="memory-crate-pivot">
              <span className="memory-crate-pivot-cap" />
            </span>
            <span ref={armShadowRef} className="memory-crate-arm-shadow">
              <span className="memory-crate-arm-shadow-weight" />
              <span className="memory-crate-arm-shadow-tube" />
              <span className="memory-crate-arm-shadow-head" />
            </span>
            <span ref={armRef} className="memory-crate-arm">
              <span className="memory-crate-arm-lift">
                <TonearmArt />
                <span
                  className="memory-crate-arm-hit"
                  data-active={lit ? 'true' : undefined}
                  data-primary-tab-swipe-block
                  onPointerDown={onArmPointerDown}
                  onPointerMove={onArmPointerMove}
                  onPointerUp={(event) => endArmDrag(event, false)}
                  onPointerCancel={(event) => endArmDrag(event, true)}
                  onLostPointerCapture={(event) => {
                    if (event.target === event.currentTarget)
                      endArmDrag(event, false);
                  }}
                />
              </span>
            </span>
          </span>
          <span className="memory-crate-stand" aria-hidden="true" />
          {/* biome-ignore lint/a11y/noStaticElementInteractions: a pointer shortcut; the "read the sleeve" button offers the same. */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: see above. */}
          <div
            ref={jacketRef}
            className="memory-crate-jacket"
            data-shown={play ? 'true' : undefined}
            data-interactive={lit ? 'true' : undefined}
            onClick={onJacketClick}
          >
            <div className="memory-crate-jacket-lean">
              <div className="memory-crate-jacket-flip">
                <div
                  className="memory-crate-face"
                  data-side="front"
                  aria-hidden="true"
                >
                  {playEntry ? (
                    <SleeveCover
                      entry={playEntry}
                      month={monthLabel(playEntry, locale)}
                    />
                  ) : null}
                </div>
                {/* biome-ignore lint/a11y/useSemanticElements: the sleeve's back is a named group of track buttons, not a form fieldset. */}
                <div
                  className="memory-crate-face"
                  data-side="back"
                  role="group"
                  aria-label={t('memoryWorlds.crate.sleeveBack')}
                  aria-hidden={flipped && lit ? undefined : true}
                >
                  {playEntry && play ? (
                    <>
                      <div className="memory-crate-notes-head">
                        <span className="memory-crate-notes-side">
                          {t('memoryWorlds.crate.sideA')}
                        </span>
                        <span className="memory-crate-notes-season">
                          {seasonText}
                        </span>
                      </div>
                      <ol className="memory-crate-tracks">
                        {tracks.map((track, n) => {
                          const current = track.index === play.index;
                          return (
                            <li key={track.entry.key}>
                              <button
                                type="button"
                                className="memory-crate-track"
                                data-crate-track
                                data-current={current ? 'true' : undefined}
                                aria-current={current ? 'true' : undefined}
                                tabIndex={flipped && lit ? 0 : -1}
                                onClick={() => swapTo(track.index)}
                              >
                                <span className="memory-crate-track-no">
                                  {t('memoryWorlds.crate.trackNumber', {
                                    number: n + 1,
                                  })}
                                </span>
                                <span className="memory-crate-track-title">
                                  {track.entry.title}
                                </span>
                                {current ? (
                                  <span
                                    className="memory-crate-track-eq"
                                    aria-hidden="true"
                                  >
                                    <span />
                                    <span />
                                    <span />
                                  </span>
                                ) : (
                                  <time
                                    className="memory-crate-track-date"
                                    dateTime={track.entry.dateTime}
                                  >
                                    {track.entry.dateLabel}
                                  </time>
                                )}
                                {current ? (
                                  <span className="sr-only">
                                    {t('memoryWorlds.crate.trackPlaying')}
                                  </span>
                                ) : null}
                              </button>
                            </li>
                          );
                        })}
                      </ol>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
          {/* The inlay: it comes out of the sleeve with the record and shows the memory. */}
          <span
            ref={inlayRef}
            className="memory-crate-art"
            data-kind={inlayKind ?? undefined}
            data-heart-emotion={
              inlayKind === 'heart' ? playEntry?.emotion : undefined
            }
            data-shown={artOn ? 'true' : undefined}
            aria-hidden="true"
            onClick={onJacketClick}
          >
            {playEntry && song && inlayKind === 'photo' ? (
              <>
                <span className="memory-crate-art-window">
                  {artLayers.map((layer, i) => (
                    <span
                      key={layer.key}
                      className="memory-crate-art-layer"
                      data-fresh={
                        i === artLayers.length - 1 && artLayers.length > 1
                          ? 'true'
                          : undefined
                      }
                    >
                      <span
                        className="memory-crate-art-zoom"
                        data-dir={layer.photo % 2 === 0 ? 'in' : 'out'}
                        style={{
                          animationDuration: `${Math.round(sliceMs * 1.15)}ms`,
                        }}
                      >
                        <MemoryPhoto
                          entry={
                            song.photos[
                              Math.min(layer.photo, song.photos.length - 1)
                            ]
                          }
                          loadMemoryImage={loadMemoryImage}
                        />
                      </span>
                    </span>
                  ))}
                </span>
                <FitText
                  key={`strip-${playEntry.key}`}
                  text={playEntry.title}
                  minPx={10}
                  boxClass="memory-crate-art-strip"
                  textClass="memory-crate-art-strip-text"
                />
              </>
            ) : null}
            {playEntry && inlayKind === 'heart' ? (
              <span className="memory-crate-note">
                <FitText
                  key={`note-${playEntry.key}`}
                  text={playEntry.title}
                  minPx={16}
                  boxClass="memory-crate-note-box"
                  textClass="memory-crate-note-text"
                />
                {playEntry.author ? (
                  <span className="memory-crate-note-from">
                    – {playEntry.author}
                  </span>
                ) : null}
              </span>
            ) : null}
            {playEntry && inlayKind === 'milestone' ? (
              <span className="memory-crate-cert">
                <KeepsakeStampMark className="memory-crate-cert-stamp" />
                <FitText
                  key={`cert-${playEntry.key}`}
                  text={playEntry.title}
                  minPx={12}
                  boxClass="memory-crate-cert-box"
                  textClass="memory-crate-cert-title"
                />
                <span className="memory-crate-cert-date">
                  {playEntry.dateLabel}
                </span>
              </span>
            ) : null}
            {playEntry && inlayKind === 'words' ? (
              <span className="memory-crate-card">
                <span className="memory-crate-card-date">
                  {playEntry.dateLabel}
                </span>
                <FitText
                  key={`card-${playEntry.key}`}
                  text={playEntry.title}
                  minPx={12}
                  boxClass="memory-crate-card-box"
                  textClass="memory-crate-card-title"
                />
                <span className="memory-crate-card-rule" />
              </span>
            ) : null}
          </span>
          {lit ? (
            <div className="memory-crate-reveal">
              <button
                type="button"
                className="memory-crate-quiet"
                aria-pressed={flipped}
                onClick={() => setFlip(!flippedRef.current)}
              >
                {t('memoryWorlds.crate.readSleeve')}
              </button>
              {tracks.length > 1 ? (
                <button
                  type="button"
                  className="memory-crate-quiet"
                  onClick={nextTrack}
                >
                  {t('memoryWorlds.crate.nextRecord')}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="memory-crate-panel">
          <div
            className="memory-crate-sign"
            data-lit={lit ? 'true' : undefined}
            data-paused={paused ? 'true' : undefined}
            data-ended={lit && ended ? 'true' : undefined}
          >
            <span className="memory-crate-progress" aria-hidden="true">
              <span ref={progressRef} className="memory-crate-progress-fill" />
            </span>
            <span className="memory-crate-lamp" aria-hidden="true">
              <span className="memory-crate-lamp-glow" />
            </span>
            {playEntry && song ? (
              <span
                className="memory-crate-sign-body"
                data-primary-tab-swipe-block
                onPointerDown={onLyricsPointerDown}
                onPointerMove={onLyricsPointerMove}
                onPointerUp={(event) => endLyricsDrag(event, false)}
                onPointerCancel={(event) => endLyricsDrag(event, true)}
                onLostPointerCapture={(event) => {
                  // A text line releasing its implicit touch capture (when the
                  // display takes the pointer) bubbles here: not a release.
                  if (event.target === event.currentTarget)
                    endLyricsDrag(event, false);
                }}
              >
                <span className="memory-crate-sign-head">
                  <span className="memory-crate-sign-kicker">
                    {!lit
                      ? ''
                      : ended
                        ? t('memoryWorlds.crate.sideA')
                        : paused
                          ? t('memoryWorlds.crate.paused')
                          : t('memoryWorlds.crate.nowPlaying')}
                  </span>
                  <span
                    ref={clockRef}
                    className="memory-crate-sign-clock"
                    aria-hidden="true"
                  />
                </span>
                <span
                  className="memory-crate-endcard"
                  data-shown={lit && ended ? 'true' : undefined}
                  aria-hidden={lit && ended ? undefined : true}
                >
                  <strong className="memory-crate-endcard-title">
                    {t('memoryWorlds.crate.endTitle')}
                  </strong>
                  <span className="memory-crate-endcard-actions">
                    <Link
                      className="memory-crate-end-action"
                      to={playEntry.path}
                      tabIndex={lit && ended ? undefined : -1}
                      aria-label={t('memoryWorlds.crate.continueReadingLabel', {
                        title: playEntry.title,
                      })}
                      onClick={(event) =>
                        onOpen(event, playEntry.path, playEntry.key)
                      }
                    >
                      {t('memoryWorlds.crate.continueReading')}
                    </Link>
                    {tracks.length > 1 ? (
                      <button
                        type="button"
                        className="memory-crate-end-action"
                        data-tone="next"
                        tabIndex={lit && ended ? undefined : -1}
                        onClick={nextTrack}
                      >
                        {t('memoryWorlds.crate.nextRecord')}
                      </button>
                    ) : null}
                  </span>
                </span>
                <span className="memory-crate-lyrics" aria-hidden="true">
                  <span ref={rollRef} className="memory-crate-lyrics-roll">
                    {song.lines.map((line, i) => (
                      // biome-ignore lint/a11y/noStaticElementInteractions: a pointer shortcut to seek; the arrow keys offer the same.
                      // biome-ignore lint/a11y/useKeyWithClickEvents: see above.
                      <span
                        // biome-ignore lint/suspicious/noArrayIndexKey: lines repeat; their order is the song.
                        key={`${i}-${line}`}
                        className="memory-crate-line"
                        data-state={
                          i === lineIndex
                            ? 'current'
                            : i < lineIndex
                              ? 'past'
                              : 'next'
                        }
                        onClick={() => {
                          if (!lyricClickBlocked.current)
                            seekTo((song.starts[i] ?? 0) + 1e-4);
                        }}
                      >
                        <span className="memory-crate-line-wander">
                          <span className="memory-crate-line-text">{line}</span>
                          <span className="memory-crate-line-sung">
                            <span className="memory-crate-line-sung-inner">
                              <span className="memory-crate-line-text">
                                {line}
                              </span>
                            </span>
                          </span>
                        </span>
                      </span>
                    ))}
                  </span>
                </span>
              </span>
            ) : null}
          </div>

          <div className="memory-crate-controls">
            <button
              type="button"
              className="memory-crate-start"
              aria-pressed={running}
              aria-describedby={deckHintId}
              aria-label={
                !play
                  ? t('memoryWorlds.crate.startFront')
                  : running
                    ? t('memoryWorlds.crate.stop')
                    : t('memoryWorlds.crate.start')
              }
              onClick={onStartStop}
            >
              <span className="memory-crate-start-well" aria-hidden="true">
                <span className="memory-crate-start-ring" />
                <span className="memory-crate-start-face" />
              </span>
              <span className="memory-crate-caption" aria-hidden="true">
                {t('memoryWorlds.crate.startStopCaption')}
              </span>
            </button>
            {/* biome-ignore lint/a11y/useSemanticElements: two speed keys on the plinth, not a form fieldset. */}
            <div
              className="memory-crate-speed"
              role="group"
              aria-label={t('memoryWorlds.crate.speed')}
            >
              {([33, 45] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className="memory-crate-speed-key"
                  aria-pressed={rpm === value}
                  aria-label={t('memoryWorlds.crate.rpm', { rpm: value })}
                  onClick={() => setSpeed(value)}
                >
                  <span aria-hidden="true">{value}</span>
                </button>
              ))}
              <span className="memory-crate-caption" aria-hidden="true">
                {t('memoryWorlds.crate.rpmCaption')}
              </span>
            </div>
          </div>

          <div className="memory-crate-plates">
            {lit && playEntry ? (
              <>
                <Link
                  className="memory-crate-plate"
                  to={playEntry.path}
                  aria-label={t('memoryWorlds.crate.openInDiaryLabel', {
                    title: playEntry.title,
                  })}
                  onClick={(event) =>
                    onOpen(event, playEntry.path, playEntry.key)
                  }
                >
                  {t('memoryWorlds.crate.openInDiary')}
                  <svg
                    className="memory-crate-plate-arrow"
                    viewBox="0 0 16 12"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="M1 6h12M9 2l4 4-4 4" />
                  </svg>
                </Link>
                <button
                  type="button"
                  className="memory-crate-plate"
                  data-tone="light"
                  onClick={putBack}
                >
                  {t('memoryWorlds.crate.backToCrate')}
                </button>
              </>
            ) : null}
          </div>
        </div>
        <span className="memory-crate-feet" aria-hidden="true" />
      </div>

      <span id={hintId} className="sr-only">
        {t('memoryWorlds.crate.crateHint')}
      </span>
      <span id={deckHintId} className="sr-only">
        {t('memoryWorlds.crate.deckHint')}
      </span>
      <ul className="sr-only" aria-label={t('memoryWorlds.crate.allRecords')}>
        {order.map((entry) => (
          <li key={entry.key}>
            <Link
              to={entry.path}
              onClick={(event) => onOpen(event, entry.path, entry.key)}
            >
              {t('memoryWorlds.crate.recordListItem', {
                title: entry.title,
                date: entry.dateLabel,
              })}
            </Link>
          </li>
        ))}
      </ul>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <p className="sr-only" aria-live="polite">
        {currentLine}
      </p>
    </div>
  );
}
