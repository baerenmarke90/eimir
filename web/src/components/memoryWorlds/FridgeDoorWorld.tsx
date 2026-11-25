/**
 * Kühlschranktür (#2283): the couple's fridge door as a collage. Photo prints
 * hang under round magnets, heart moments are sticky notes in their feeling's
 * colour under a heart magnet, milestones are printed cards under a gold
 * star, words memories little ruled cards under washi tape. Tapping a note
 * takes it off: the magnet hops off and the note grows into a large card that
 * opens the memory in the diary. Notes and the letter magnets ("WIR ♥ UNS")
 * can be moved around the door; the notepad magnet hangs up the next notes
 * when there are more memories than fit on the door. The notes do not sway
 * (Product Owner decision in the prototype review).
 *
 * Gesture (Motion Contract 4.6): the door keeps `touch-action: pan-y`, so a
 * quick vertical swipe still scrolls the page. A note or letter follows the
 * finger once it moves sideways first or rests briefly before moving
 * (decided on the first touchmove, which is cancelled only then); only then
 * is the pointer captured. Moved places live in memory only and are reset
 * when new notes are hung up.
 *
 * Keyboard and screen readers: every note is a button (Enter or Space opens
 * it as a dialog, Escape closes it and focus returns to the note), the arrow
 * keys move the focused note (Shift for larger steps), a live region
 * announces moves and new notes, and a plain list links every memory of the
 * door. With reduced motion nothing flies, falls or is pinned: every change
 * shows its final state at once.
 *
 * Flights: `src/motion/fridgeDoor.ts`; keyframes and timing roles:
 * `src/motion/memory-worlds.css`.
 */
import type { TFunction } from 'i18next';
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
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
import { useFitText } from '../../client/fitText';
import { useTranslation } from '../../i18n';
import {
  canFly,
  cardDelta,
  closeCard,
  FRIDGE_TIMING,
  fadeScrim,
  hopMagnet,
  openCard,
  snapOnto,
} from '../../motion/fridgeDoor';
import { haptic } from '../../motion/haptics';
import { subscribeReducedMotion } from '../../motion/reducedMotion';
import { isVisibleNow } from '../../motion/visibility';
import { KeepsakeStampMark } from '../DiscoverKeepsakes';
import { MemoryPhoto } from './MemoryPhoto';
import {
  keyHash,
  type LoadMemoryImage,
  type MemoryWorldEntry,
  type MemoryWorldProps,
  prefersReducedMotion,
} from './model';
import '../../motion/memory-worlds.css';
import './MemoryWorld.css';
import './FridgeDoorWorld.css';

type Entry = MemoryWorldEntry;

/* ---------- Tuning ---------- */

/** Notes on the door at once: few and large enough to read on a phone. */
export const FRIDGE_BATCH = 6;
/** Finger travel before a note follows the finger, in px. */
const DRAG_SLOP = 6;
/** Touch: resting this long before moving picks a note up even vertically. */
const HOLD_MS = 170;
/** Touch: movement needed before deciding between scrolling and dragging. */
const DECIDE_PX = 3;
const CLICK_SUPPRESS_MS = 80;
/** Drag tilt: degrees per px/ms of horizontal speed, and the limit. */
const TILT_PER_SPEED = 7;
const MAX_TILT = 9;
/** A moved note keeps its centre inside this share of the door. */
export const FRIDGE_DRAG_BOUNDS = Object.freeze({
  minX: 0.1,
  maxX: 0.9,
  minY: 0.09,
  maxY: 0.94,
});
/** Keyboard moves, as a share of the door (Shift: the larger step). */
export const FRIDGE_KEY_STEP = 0.04;
const KEY_STEP_LARGE = 0.12;
/** Notes never shrink below this, in px (handwriting gets hard to read). */
const HAND_MIN_PX = 15.2;
const PRINT_MIN_PX = 11;

/* ---------- Door geometry (fractions of the door) ---------- */

const AREA_X0 = 0.05;
const AREA_X1 = 0.88;
const AREA_Y0 = 0.045;
const AREA_Y1 = 0.79;

const HEART_PATH =
  'M12 21C5 15.5 2 12 2 8A5 5 0 0 1 12 6A5 5 0 0 1 22 8C22 12 19 15.5 12 21Z';
const HEART_SHADE_PATH =
  'M4 13C7 16.5 9.5 18.6 12 20.6C14.5 18.6 17 16.5 20 13C17 15.4 14.6 16.8 12 17.6C9.4 16.8 7 15.4 4 13Z';

/** The elements that get their own pixel unit (`--cu`). */
const UNIT_SELECTOR = '.memory-fridge-door-wrap';

type Phase = 'idle' | 'falling' | 'pinning';

interface Point {
  x: number;
  y: number;
}

interface Spot extends Point {
  rot: number;
  rank: number;
  fallDx: number;
  fallRot: number;
}

interface OpenState {
  key: string;
  run: number;
  closing: boolean;
}

interface Gesture {
  pointerId: number;
  pointerType: string;
  x0: number;
  y0: number;
  t0: number;
  active: boolean;
  /** Touch only: the first touchmove decided for dragging (mouse and pen: always). */
  claimed: boolean;
  /** Touch only: the first touchmove handed the gesture to page scrolling. */
  scroll: boolean;
  dragId: string;
  el: HTMLElement;
  tiltEl: HTMLElement | null;
  base: Point;
  w: number;
  h: number;
  dx: number;
  dy: number;
  minDx: number;
  maxDx: number;
  minDy: number;
  maxDy: number;
  lastX: number;
  lastT: number;
  vx: number;
  tilt: number;
}

/* ---------- Small helpers ---------- */

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pct(fraction: number) {
  return `${(fraction * 100).toFixed(3)}%`;
}

/** Deterministic pseudo-random numbers (mulberry32). */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gridFor(count: number) {
  if (count <= 1) return { cols: 1, rows: 1, scale: 2.2 };
  if (count === 2) return { cols: 2, rows: 1, scale: 1.8 };
  if (count <= 4) return { cols: 2, rows: 2, scale: 1.65 };
  return { cols: 2, rows: 3, scale: 1.45 };
}

/**
 * A loose collage: one slot per note in a grid, slots shuffled so the kinds
 * mix, every note nudged and tilted a little. Same keys, same door.
 */
export function layoutDoor(entries: readonly Entry[]): {
  spots: Spot[];
  scale: number;
} {
  const grid = gridFor(entries.length);
  const rand = seeded(keyHash(entries.map((entry) => entry.key).join('|')));
  const slots: { c: number; r: number }[] = [];
  for (let r = 0; r < grid.rows; r += 1)
    for (let c = 0; c < grid.cols; c += 1) slots.push({ c, r });
  for (let i = slots.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const colW = (AREA_X1 - AREA_X0) / grid.cols;
  const rowH = (AREA_Y1 - AREA_Y0) / grid.rows;
  const spots = entries.map((entry, index): Spot => {
    const { c, r } = slots[index];
    const hash = keyHash(entry.key);
    const stagger =
      grid.cols > 1 ? (c % 2 === 1 ? rowH * 0.07 : -rowH * 0.02) : 0;
    return {
      x: AREA_X0 + colW * (c + 0.5) + (rand() - 0.5) * colW * 0.16,
      y: AREA_Y0 + rowH * (r + 0.5) + stagger + (rand() - 0.5) * rowH * 0.14,
      rot: (hash % 1300) / 100 - 6.5,
      rank: 0,
      fallDx: ((hash >>> 4) % 25) - 12,
      fallRot: ((hash >>> 9) % 61) - 30,
    };
  });
  spots
    .map((_, index) => index)
    .sort((a, b) => spots[a].y - spots[b].y || spots[a].x - spots[b].x)
    .forEach((index, rank) => {
      spots[index].rank = rank;
    });
  return { spots, scale: grid.scale };
}

const MAGNET_COLORS = [
  'coral',
  'sun',
  'sky',
  'mint',
  'lilac',
  'tangerine',
] as const;

function magnetColor(entry: Entry) {
  return MAGNET_COLORS[(keyHash(entry.key) >>> 3) % MAGNET_COLORS.length];
}

/** The accessible name of a note on the door. */
function itemLabel(entry: Entry, t: TFunction) {
  const values = { title: entry.title, date: entry.dateLabel };
  switch (entry.kind) {
    case 'photo':
      return t('memoryWorlds.fridge.item.photo', values);
    case 'heart':
      return entry.author
        ? t('memoryWorlds.fridge.item.heartBy', {
            ...values,
            name: entry.author,
          })
        : t('memoryWorlds.fridge.item.heart', values);
    case 'milestone':
      return t('memoryWorlds.fridge.item.milestone', values);
    case 'words':
      return t('memoryWorlds.fridge.item.words', values);
  }
}

type Direction = 'left' | 'right' | 'up' | 'down';

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

/** A keyboard move of a note, kept inside the door. */
export function movedBy(
  from: Point,
  direction: Direction,
  step: number,
): Point {
  const dx = direction === 'left' ? -step : direction === 'right' ? step : 0;
  const dy = direction === 'up' ? -step : direction === 'down' ? step : 0;
  return {
    x: clamp(from.x + dx, FRIDGE_DRAG_BOUNDS.minX, FRIDGE_DRAG_BOUNDS.maxX),
    y: clamp(from.y + dy, FRIDGE_DRAG_BOUNDS.minY, FRIDGE_DRAG_BOUNDS.maxY),
  };
}

/* ---------- Letter magnets ---------- */

type Glyph = 'W' | 'I' | 'R' | 'heart' | 'U' | 'N' | 'S';

interface LetterMagnet extends Point {
  id: string;
  glyph: Glyph;
  color: string;
  rot: number;
}

/** "WIR ♥ UNS" along the bottom of the door, a little crooked. */
const LETTERS: readonly LetterMagnet[] = [
  { id: 'w', glyph: 'W', color: 'coral', x: 0.345, y: 0.902, rot: -5 },
  { id: 'i', glyph: 'I', color: 'sun', x: 0.42, y: 0.894, rot: 3 },
  { id: 'r', glyph: 'R', color: 'sky', x: 0.483, y: 0.904, rot: -2 },
  { id: 'heart', glyph: 'heart', color: 'pink', x: 0.582, y: 0.897, rot: 7 },
  { id: 'u', glyph: 'U', color: 'mint', x: 0.683, y: 0.902, rot: -4 },
  { id: 'n', glyph: 'N', color: 'lilac', x: 0.756, y: 0.894, rot: 4 },
  { id: 's', glyph: 'S', color: 'tangerine', x: 0.83, y: 0.905, rot: -6 },
];
/** Without the notepad the letters move left to the middle of the door. */
const LETTER_SHIFT_NO_PAD = -0.12;

const LETTER_PATHS: Record<
  Exclude<Glyph, 'heart'>,
  { w: number; d: string }
> = {
  W: { w: 30, d: 'M4 5L9 25L15 12L21 25L26 5' },
  I: { w: 12, d: 'M6 5V25' },
  R: { w: 24, d: 'M6 25V5H12.5A5.5 5.5 0 0 1 12.5 16H6M12 16L18.5 25' },
  U: { w: 24, d: 'M5.5 5V16.5A6.5 8 0 0 0 18.5 16.5V5' },
  N: { w: 24, d: 'M5.5 25V5L18.5 25V5' },
  S: {
    w: 24,
    d: 'M18 8C16.5 5.6 14.5 5 12 5C8.5 5 6 7 6 10C6 13.5 9 14.3 12 15C15 15.7 18 16.8 18 20C18 23.2 15.3 25 12 25C9 25 7 24 5.5 21.5',
  },
};
const LETTER_HEART =
  'M12 25.5C6.2 21 3 17.2 3 12.6A4.9 4.9 0 0 1 12 9.9A4.9 4.9 0 0 1 21 12.6C21 17.2 17.8 21 12 25.5Z';

function LetterShape({ glyph }: { glyph: Glyph }) {
  if (glyph === 'heart') {
    return (
      <svg
        className="memory-fridge-letter-svg"
        viewBox="0 0 24 30"
        aria-hidden="true"
        focusable="false"
      >
        <path
          className="memory-fridge-letter-drop-fill"
          d={LETTER_HEART}
          transform="translate(0.8 1.4)"
        />
        <path className="memory-fridge-letter-fill" d={LETTER_HEART} />
        <ellipse
          className="memory-fridge-letter-gleam-fill"
          cx="8.4"
          cy="13"
          rx="2.3"
          ry="1.3"
          transform="rotate(-38 8.4 13)"
        />
      </svg>
    );
  }
  const { w, d } = LETTER_PATHS[glyph];
  return (
    <svg
      className="memory-fridge-letter-svg"
      viewBox={`0 0 ${w} 30`}
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="memory-fridge-letter-drop"
        d={d}
        transform="translate(0.8 1.4)"
      />
      <path className="memory-fridge-letter-body" d={d} />
      <path
        className="memory-fridge-letter-gleam"
        d={d}
        transform="translate(-0.7 -0.9)"
      />
    </svg>
  );
}

/* ---------- Notes on the door ---------- */

/**
 * A note whose text is fitted to the paper, so nothing is ever cut off: the
 * text first shrinks, and only a text that still does not fit is shortened
 * at a word with "…" (`client/fitText`). The full words stay in the diary.
 */
function FittedPaper({
  kind,
  emotion,
  text,
  minPx,
  textClass,
  quote,
  children,
}: {
  kind: 'heart' | 'milestone' | 'words';
  emotion?: string;
  text: string;
  minPx: number;
  textClass: string;
  quote?: boolean;
  children?: ReactNode;
}) {
  const { boxRef, textRef } = useFitText<HTMLSpanElement, HTMLElement>(
    text,
    minPx,
  );
  return (
    <span
      ref={boxRef}
      className="memory-fridge-paper"
      data-kind={kind}
      data-heart-emotion={emotion}
    >
      {children}
      {/* The text is written by the fitting, outside React. */}
      {quote ? (
        <q ref={textRef as RefObject<HTMLQuoteElement>} className={textClass} />
      ) : (
        <span ref={textRef} className={textClass} />
      )}
    </span>
  );
}

function DoorPaper({
  entry,
  loadMemoryImage,
}: {
  entry: Entry;
  loadMemoryImage: LoadMemoryImage;
}) {
  switch (entry.kind) {
    case 'photo':
      return (
        <span className="memory-fridge-paper" data-kind="photo">
          <MemoryPhoto entry={entry} loadMemoryImage={loadMemoryImage} />
          <span className="memory-fridge-gloss" />
        </span>
      );
    case 'heart':
      return (
        <FittedPaper
          kind="heart"
          emotion={entry.emotion}
          text={entry.title}
          minPx={HAND_MIN_PX}
          textClass="memory-fridge-hand"
          quote
        />
      );
    case 'milestone':
      return (
        <FittedPaper
          kind="milestone"
          text={entry.title}
          minPx={PRINT_MIN_PX}
          textClass="memory-fridge-print-title"
        >
          <KeepsakeStampMark className="memory-fridge-stamp" />
        </FittedPaper>
      );
    case 'words':
      return (
        <FittedPaper
          kind="words"
          text={entry.title}
          minPx={HAND_MIN_PX}
          textClass="memory-fridge-hand"
        />
      );
  }
}

/** What holds the note: a round magnet, a heart magnet, a gold star or washi tape. */
function Holder({ entry }: { entry: Entry }) {
  switch (entry.kind) {
    case 'words':
      return (
        <span
          className="memory-fridge-holder memory-fridge-tape"
          aria-hidden="true"
        />
      );
    case 'milestone':
      return (
        <span
          className="memory-fridge-holder memory-fridge-magnet"
          data-shape="star"
          aria-hidden="true"
        >
          <span className="memory-fridge-magnet-shadow" />
          <span className="memory-fridge-magnet-cap" />
        </span>
      );
    case 'heart':
      return (
        <span
          className="memory-fridge-holder memory-fridge-magnet"
          data-shape="heart"
          aria-hidden="true"
        >
          <span className="memory-fridge-magnet-shadow">
            <svg viewBox="0 0 24 22" aria-hidden="true" focusable="false">
              <path className="memory-fridge-heart-drop" d={HEART_PATH} />
            </svg>
          </span>
          <span className="memory-fridge-magnet-cap">
            <svg viewBox="0 0 24 22" aria-hidden="true" focusable="false">
              <path className="memory-fridge-heart-body" d={HEART_PATH} />
              <path
                className="memory-fridge-heart-shade"
                d={HEART_SHADE_PATH}
              />
              <ellipse
                className="memory-fridge-heart-gleam"
                cx="7.2"
                cy="8.4"
                rx="2.4"
                ry="1.4"
                transform="rotate(-35 7.2 8.4)"
              />
            </svg>
          </span>
        </span>
      );
    case 'photo':
      return (
        <span
          className="memory-fridge-holder memory-fridge-magnet"
          data-shape="round"
          data-color={magnetColor(entry)}
          aria-hidden="true"
        >
          <span className="memory-fridge-magnet-shadow" />
          <span className="memory-fridge-magnet-cap" />
        </span>
      );
  }
}

/* ---------- The large card ---------- */

function CardFace({
  entry,
  loadMemoryImage,
  kicker,
  titleId,
  pressed,
}: {
  entry: Entry;
  loadMemoryImage: LoadMemoryImage;
  kicker: string;
  titleId: string;
  pressed: boolean;
}) {
  const kickerLine = kicker ? (
    <p className="memory-fridge-card-kicker">{kicker}</p>
  ) : null;
  const meta = (
    <p className="memory-fridge-card-meta">
      <time dateTime={entry.dateTime}>{entry.dateLabel}</time>
      {entry.author && entry.kind !== 'heart' ? ` · ${entry.author}` : null}
    </p>
  );
  switch (entry.kind) {
    case 'photo':
      return (
        <>
          <span className="memory-fridge-card-photo">
            <MemoryPhoto entry={entry} loadMemoryImage={loadMemoryImage} />
            <span className="memory-fridge-gloss" aria-hidden="true" />
          </span>
          <div className="memory-fridge-card-caption">
            {kickerLine}
            <h3 id={titleId} className="memory-fridge-card-hand">
              {entry.title}
            </h3>
            {meta}
          </div>
        </>
      );
    case 'heart':
      return (
        <div className="memory-fridge-card-body">
          {kickerLine}
          <h3 id={titleId} className="memory-fridge-card-quote">
            <q>{entry.title}</q>
          </h3>
          {entry.author ? (
            <p className="memory-fridge-card-from">{entry.author}</p>
          ) : null}
          {meta}
        </div>
      );
    case 'milestone':
      return (
        <div className="memory-fridge-card-body">
          {kickerLine}
          <KeepsakeStampMark
            className="memory-fridge-card-stamp"
            pressed={pressed}
          />
          <h3 id={titleId} className="memory-fridge-card-title">
            {entry.title}
          </h3>
          {meta}
        </div>
      );
    case 'words':
      return (
        <div className="memory-fridge-card-body">
          {kickerLine}
          <h3 id={titleId} className="memory-fridge-card-hand">
            {entry.title}
          </h3>
          {meta}
        </div>
      );
  }
}

/* ---------- The world ---------- */

/**
 * Eure Kühlschranktür: up to six memories at once on the door, the lead
 * first. Every note is a button; the notepad magnet hangs up the next notes.
 */
export function FridgeDoorWorld({
  entries,
  kicker,
  loadMemoryImage,
  onOpen,
}: MemoryWorldProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  // The door's geometry gets pixel units (see client/containerUnits.ts).
  useContainerUnits(rootRef, UNIT_SELECTOR);
  const order = useMemo(() => {
    const lead = entries.find((entry) => entry.isLead) ?? entries[0];
    return lead ? [lead, ...entries.filter((entry) => entry !== lead)] : [];
  }, [entries]);
  const count = order.length;
  const hasEntries = count > 0;

  const [start, setStart] = useState(0);
  const [phase, setPhaseState] = useState<Phase>(() =>
    prefersReducedMotion() ? 'idle' : 'pinning',
  );
  const [moved, setMoved] = useState<Record<string, Point>>({});
  const [raised, setRaised] = useState<Record<string, number>>({});
  const [open, setOpenState] = useState<OpenState | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const rawId = useId();
  const id = `fridge${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const hintId = `${id}-hint`;
  const titleId = `${id}-title`;

  const doorRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dragEls = useRef(new Map<string, HTMLElement>());
  const defaultsRef = useRef(new Map<string, Point>());
  const rotsRef = useRef(new Map<string, number>());
  const movedRef = useRef(moved);
  const gestureRef = useRef<Gesture | null>(null);
  const frameRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const suppressTimerRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);
  const reduceRef = useRef(prefersReducedMotion());
  const openRef = useRef<OpenState | null>(null);
  const phaseRef = useRef<Phase>(phase);
  const runRef = useRef(0);
  const zRef = useRef(100);
  const cardAnimRef = useRef<Animation | null>(null);
  const scrimAnimRef = useRef<Animation | null>(null);

  movedRef.current = moved;

  const safeStart = count > 0 ? start % count : 0;
  const shown = Math.min(FRIDGE_BATCH, count);
  const visible = useMemo(
    () =>
      Array.from(
        { length: shown },
        (_, index) => order[(safeStart + index) % count],
      ),
    [order, safeStart, shown, count],
  );
  const layout = useMemo(() => layoutDoor(visible), [visible]);
  const hasPad = count > FRIDGE_BATCH;
  const letterShift = hasPad ? 0 : LETTER_SHIFT_NO_PAD;

  // Resting places of everything that can be moved, for the drag maths.
  const defaults = new Map<string, Point>();
  const rots = new Map<string, number>();
  visible.forEach((entry, index) => {
    defaults.set(`i:${entry.key}`, layout.spots[index]);
    rots.set(entry.key, layout.spots[index].rot);
  });
  for (const letter of LETTERS)
    defaults.set(`l:${letter.id}`, { x: letter.x + letterShift, y: letter.y });
  defaultsRef.current = defaults;
  rotsRef.current = rots;

  const setPhase = (next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };

  const setOpen = (next: OpenState | null) => {
    openRef.current = next;
    setOpenState(next);
  };

  const later = (fn: () => void, ms: number) => {
    const handle = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((h) => h !== handle);
      fn();
    }, ms);
    timersRef.current.push(handle);
  };

  const suppressClick = () => {
    suppressClickRef.current = true;
    if (suppressTimerRef.current !== null)
      window.clearTimeout(suppressTimerRef.current);
    suppressTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      suppressTimerRef.current = null;
    }, CLICK_SUPPRESS_MS);
  };

  // When the door appears, the notes are pinned up one after another; a
  // door that is not seen shows its notes at once (M12).
  useEffect(() => {
    if (phaseRef.current !== 'pinning') return;
    const door = doorRef.current;
    if (door && !isVisibleNow(door).visible) {
      phaseRef.current = 'idle';
      setPhaseState('idle');
      return;
    }
    const handle = window.setTimeout(
      () => {
        if (phaseRef.current !== 'pinning') return;
        phaseRef.current = 'idle';
        setPhaseState('idle');
      },
      (FRIDGE_BATCH - 1) * FRIDGE_TIMING.pinStagger +
        FRIDGE_TIMING.plopDelay +
        FRIDGE_TIMING.plop +
        120,
    );
    return () => window.clearTimeout(handle);
  }, []);

  const positionOf = (dragId: string): Point =>
    movedRef.current[dragId] ??
    defaultsRef.current.get(dragId) ?? { x: 0.5, y: 0.5 };

  // Reduced motion can change while the page is open (the app's one source).
  useEffect(
    () =>
      subscribeReducedMotion(() => {
        reduceRef.current = prefersReducedMotion();
      }),
    [],
  );

  useEffect(
    () => () => {
      for (const handle of timersRef.current) window.clearTimeout(handle);
      timersRef.current = [];
      if (suppressTimerRef.current !== null)
        window.clearTimeout(suppressTimerRef.current);
      if (frameRef.current !== null)
        window.cancelAnimationFrame(frameRef.current);
      cardAnimRef.current?.cancel();
      scrimAnimRef.current?.cancel();
    },
    [],
  );

  // The diary may hand over other memories: close a card that left the door.
  useEffect(() => {
    const current = openRef.current;
    if (current && !visible.some((entry) => entry.key === current.key)) {
      openRef.current = null;
      setOpenState(null);
    }
  }, [visible]);

  /* ---------- Little physical feedback ---------- */

  /** The magnet (or the taped note, or a letter) snaps onto the door. */
  const snap = (slot: HTMLElement) => {
    if (reduceRef.current) return;
    const cap = slot.querySelector<HTMLElement>('.memory-fridge-magnet-cap');
    snapOnto(cap ?? slot.querySelector('.memory-fridge-rot'), !!cap);
  };

  /** Raises a note or letter above everything else on the door. */
  const raise = (dragId: string) => {
    zRef.current += 1;
    const z = zRef.current;
    setRaised((previous) => ({ ...previous, [dragId]: z }));
  };

  /* ---------- Opening a note ---------- */

  const openItem = (key: string) => {
    if (openRef.current || phaseRef.current !== 'idle') return;
    const slot = dragEls.current.get(`i:${key}`);
    haptic('press');
    if (slot && !reduceRef.current)
      hopMagnet(
        slot.querySelector('.memory-fridge-magnet-cap'),
        slot.querySelector('.memory-fridge-magnet-shadow'),
      );
    runRef.current += 1;
    setOpen({ key, run: runRef.current, closing: false });
  };

  const openRun = open && !open.closing ? open.run : null;

  // Once per opening: focus the close button and fly the card in.
  useLayoutEffect(() => {
    const current = openRef.current;
    if (openRun === null || !current) return;
    closeRef.current?.focus({ preventScroll: true });
    const card = cardRef.current;
    const slot = dragEls.current.get(`i:${current.key}`);
    if (reduceRef.current || !card || !slot || !canFly(card)) return;
    const rot = rotsRef.current.get(current.key) ?? 0;
    cardAnimRef.current = openCard(card, cardDelta(slot, card), rot);
    scrimAnimRef.current = fadeScrim(scrimRef.current, true);
  }, [openRun]);

  const finishClose = (run: number) => {
    const current = openRef.current;
    if (!current || current.run !== run) return;
    cardAnimRef.current = null;
    scrimAnimRef.current = null;
    setOpen(null);
    const slot = dragEls.current.get(`i:${current.key}`);
    if (slot) {
      snap(slot);
      slot
        .querySelector<HTMLElement>('.memory-fridge-item')
        ?.focus({ preventScroll: true });
    }
    // The magnet clicks back onto the note.
    haptic('threshold');
  };

  const close = () => {
    const current = openRef.current;
    if (!current || current.closing) return;
    setOpen({ ...current, closing: true });
    const card = cardRef.current;
    const slot = dragEls.current.get(`i:${current.key}`);
    cardAnimRef.current?.cancel();
    scrimAnimRef.current?.cancel();
    if (reduceRef.current || !card || !slot || !canFly(card)) {
      finishClose(current.run);
      return;
    }
    const rot = rotsRef.current.get(current.key) ?? 0;
    const anim = closeCard(card, cardDelta(slot, card), rot);
    cardAnimRef.current = anim;
    scrimAnimRef.current = fadeScrim(scrimRef.current, false);
    if (anim) anim.onfinish = () => finishClose(current.run);
    else finishClose(current.run);
  };

  const onStageKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
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

  /* ---------- Moving a note with the keyboard ---------- */

  const onItemKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    entry: Entry,
  ) => {
    const direction = KEY_DIRECTIONS[event.key];
    if (!direction || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    if (openRef.current || phaseRef.current !== 'idle') return;
    const dragId = `i:${entry.key}`;
    const from = positionOf(dragId);
    const next = movedBy(
      from,
      direction,
      event.shiftKey ? KEY_STEP_LARGE : FRIDGE_KEY_STEP,
    );
    if (next.x === from.x && next.y === from.y) {
      setAnnouncement(t('memoryWorlds.fridge.edge', { title: entry.title }));
      return;
    }
    setMoved((previous) => ({ ...previous, [dragId]: next }));
    raise(dragId);
    const slot = dragEls.current.get(dragId);
    if (slot) snap(slot);
    haptic('threshold');
    setAnnouncement(
      t(`memoryWorlds.fridge.moved.${direction}`, { title: entry.title }),
    );
  };

  /* ---------- New notes from the notepad ---------- */

  const resetNotes = () => {
    const keepLetters = <T,>(record: Record<string, T>) =>
      Object.fromEntries(
        Object.entries(record).filter(([key]) => key.startsWith('l:')),
      ) as Record<string, T>;
    setMoved(keepLetters);
    setRaised(keepLetters);
  };

  const swap = () => {
    if (openRef.current || phaseRef.current !== 'idle' || count <= FRIDGE_BATCH)
      return;
    const nextStart = (safeStart + FRIDGE_BATCH) % count;
    const nextShown = Math.min(FRIDGE_BATCH, count);
    const done = t('memoryWorlds.fridge.swapped', { count: nextShown });
    // The top sheet tears off the pad.
    haptic('commit');
    if (reduceRef.current) {
      setStart(nextStart);
      resetNotes();
      setAnnouncement(done);
      return;
    }
    setPhase('falling');
    later(
      () => {
        setStart(nextStart);
        resetNotes();
        setPhase('pinning');
        for (let rank = 0; rank < nextShown; rank += 1) {
          // Each magnet lands with a light click.
          later(
            () => haptic('threshold'),
            rank * FRIDGE_TIMING.pinStagger +
              FRIDGE_TIMING.plopDelay +
              FRIDGE_TIMING.plop * 0.6,
          );
        }
        later(
          () => {
            setPhase('idle');
            setAnnouncement(done);
          },
          (nextShown - 1) * FRIDGE_TIMING.pinStagger +
            FRIDGE_TIMING.plopDelay +
            FRIDGE_TIMING.plop +
            60,
        );
      },
      (shown - 1) * FRIDGE_TIMING.fallStagger + FRIDGE_TIMING.fall + 80,
    );
  };

  /* ---------- Dragging notes and letters ---------- */

  const frame = () => {
    frameRef.current = null;
    const g = gestureRef.current;
    if (!g?.active) return;
    g.vx *= 0.86;
    const target = reduceRef.current
      ? 0
      : clamp(g.vx * TILT_PER_SPEED, -MAX_TILT, MAX_TILT);
    g.tilt += (target - g.tilt) * 0.22;
    g.el.style.translate = `${g.dx.toFixed(1)}px ${g.dy.toFixed(1)}px`;
    if (g.tiltEl) g.tiltEl.style.rotate = `${g.tilt.toFixed(2)}deg`;
    if (Math.abs(g.tilt) > 0.05 || Math.abs(g.vx) > 0.01)
      frameRef.current = window.requestAnimationFrame(frame);
  };

  const kickFrame = () => {
    if (frameRef.current === null)
      frameRef.current = window.requestAnimationFrame(frame);
  };

  const activateDrag = (
    g: Gesture,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const door = doorRef.current;
    if (!door) {
      gestureRef.current = null;
      return;
    }
    const rect = door.getBoundingClientRect();
    g.w = rect.width || 1;
    g.h = rect.height || 1;
    const pos = positionOf(g.dragId);
    g.base = { x: pos.x * g.w, y: pos.y * g.h };
    g.minDx = FRIDGE_DRAG_BOUNDS.minX * g.w - g.base.x;
    g.maxDx = FRIDGE_DRAG_BOUNDS.maxX * g.w - g.base.x;
    g.minDy = FRIDGE_DRAG_BOUNDS.minY * g.h - g.base.y;
    g.maxDy = FRIDGE_DRAG_BOUNDS.maxY * g.h - g.base.y;
    g.active = true;
    g.lastX = event.clientX;
    g.lastT = event.timeStamp;
    try {
      door.setPointerCapture(event.pointerId);
    } catch {
      // The pointer may already be gone (e.g. a cancelled touch).
    }
    g.el.setAttribute('data-dragging', 'true');
    raise(g.dragId);
    // The magnet lets go of the door.
    haptic('threshold');
  };

  const onDoorPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (gestureRef.current || openRef.current || phaseRef.current !== 'idle')
      return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest('.memory-fridge-pad')) return;
    const dragEl = target.closest<HTMLElement>('[data-fridge-drag]');
    if (!dragEl) return;
    gestureRef.current = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      x0: event.clientX,
      y0: event.clientY,
      t0: performance.now(),
      active: false,
      claimed: event.pointerType !== 'touch',
      scroll: false,
      dragId: dragEl.dataset.fridgeDrag ?? '',
      el: dragEl,
      tiltEl: dragEl.querySelector<HTMLElement>('.memory-fridge-tilt'),
      base: { x: 0, y: 0 },
      w: 1,
      h: 1,
      dx: 0,
      dy: 0,
      minDx: 0,
      maxDx: 0,
      minDy: 0,
      maxDy: 0,
      lastX: event.clientX,
      lastT: event.timeStamp,
      vx: 0,
      tilt: 0,
    };
  };

  const onDoorPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || g.pointerId !== event.pointerId) return;
    const dx = event.clientX - g.x0;
    const dy = event.clientY - g.y0;
    if (!g.active) {
      if (g.scroll || !g.claimed || Math.hypot(dx, dy) < DRAG_SLOP) return;
      activateDrag(g, event);
      if (!g.active) return;
    }
    g.dx = clamp(dx, g.minDx, g.maxDx);
    g.dy = clamp(dy, g.minDy, g.maxDy);
    const elapsed = event.timeStamp - g.lastT;
    if (elapsed > 0)
      g.vx = 0.6 * g.vx + (0.4 * (event.clientX - g.lastX)) / elapsed;
    g.lastX = event.clientX;
    g.lastT = event.timeStamp;
    kickFrame();
  };

  const endGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || g.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    if (!g.active) return;
    suppressClick();
    if (frameRef.current !== null)
      window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    const next = { x: (g.base.x + g.dx) / g.w, y: (g.base.y + g.dy) / g.h };
    // Move the resting place and drop the drag offset in the same frame.
    g.el.removeAttribute('data-dragging');
    g.el.style.translate = '';
    g.el.style.left = pct(next.x);
    g.el.style.top = pct(next.y);
    if (g.tiltEl) g.tiltEl.style.rotate = '';
    setMoved((previous) => ({ ...previous, [g.dragId]: next }));
    snap(g.el);
    haptic('threshold');
  };

  // Touch: the first real movement decides between page scroll and dragging.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the door mounts once there are memories; the gesture is read through its ref.
  useEffect(() => {
    const door = doorRef.current;
    if (!door) return undefined;
    const onTouchMove = (event: TouchEvent) => {
      const g = gestureRef.current;
      if (g?.pointerType !== 'touch') return;
      if (g.active || g.claimed) {
        if (event.cancelable) event.preventDefault();
        return;
      }
      if (g.scroll) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - g.x0;
      const dy = touch.clientY - g.y0;
      if (Math.hypot(dx, dy) < DECIDE_PX) return;
      const held = performance.now() - g.t0 >= HOLD_MS;
      if (held || Math.abs(dx) >= Math.abs(dy) * 0.8) {
        g.claimed = true;
        if (event.cancelable) event.preventDefault();
      } else {
        g.scroll = true;
      }
    };
    door.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => door.removeEventListener('touchmove', onTouchMove);
  }, [hasEntries]);

  const onDoorClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  };

  if (count === 0) return null;

  /* ---------- Render ---------- */

  const openEntry = open
    ? (visible.find((entry) => entry.key === open.key) ?? null)
    : null;
  const openState = open?.closing ? 'closing' : 'open';

  return (
    <div ref={rootRef} className="memory-fridge-world">
      <div className="memory-world-head">
        <h2>{t('memoryWorlds.fridge.heading')}</h2>
      </div>

      <div className="memory-fridge-door-wrap">
        {/* biome-ignore lint/a11y/useSemanticElements: the door is one collage of buttons, not a form fieldset. */}
        <div
          ref={doorRef}
          className="memory-fridge-door"
          role="group"
          aria-roledescription={t('memoryWorlds.fridge.roleDescription')}
          aria-label={t('memoryWorlds.fridge.label', { count: shown })}
          aria-describedby={hintId}
          data-phase={phase}
          data-primary-tab-swipe-block
          onPointerDown={onDoorPointerDown}
          onPointerMove={onDoorPointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          onClickCapture={onDoorClickCapture}
          onContextMenu={(event) => event.preventDefault()}
          onDragStart={(event) => event.preventDefault()}
        >
          <span className="memory-fridge-door-light" aria-hidden="true" />
          <span className="memory-fridge-handle" aria-hidden="true">
            <span className="memory-fridge-handle-bar" />
          </span>

          {visible.map((entry, index) => {
            const spot = layout.spots[index];
            const dragId = `i:${entry.key}`;
            const pos = moved[dragId] ?? spot;
            const isOpen = open?.key === entry.key;
            const style = {
              left: pct(pos.x),
              top: pct(pos.y),
              zIndex: raised[dragId] ?? index + 1,
              '--memory-fridge-rot': `${spot.rot.toFixed(2)}deg`,
              '--memory-fridge-scale': layout.scale,
              '--memory-fridge-pin-i': spot.rank,
              '--memory-fridge-fall-i': shown - 1 - spot.rank,
              '--memory-fridge-fall-dx': spot.fallDx,
              '--memory-fridge-fall-rot': spot.fallRot,
            } as CSSProperties;
            return (
              <div
                key={`${safeStart}:${entry.key}`}
                ref={(el) => {
                  if (el) dragEls.current.set(dragId, el);
                  else dragEls.current.delete(dragId);
                }}
                className="memory-fridge-slot"
                data-fridge-drag={dragId}
                data-kind={entry.kind}
                data-open={isOpen ? openState : undefined}
                style={style}
              >
                <span className="memory-fridge-tilt">
                  <span className="memory-fridge-lift">
                    <span className="memory-fridge-rot">
                      <span
                        className="memory-fridge-shadow"
                        aria-hidden="true"
                      />
                      <button
                        type="button"
                        className="memory-fridge-item"
                        aria-label={itemLabel(entry, t)}
                        aria-haspopup="dialog"
                        onClick={() => openItem(entry.key)}
                        onKeyDown={(event) => onItemKeyDown(event, entry)}
                      >
                        <DoorPaper
                          entry={entry}
                          loadMemoryImage={loadMemoryImage}
                        />
                      </button>
                      <Holder entry={entry} />
                    </span>
                  </span>
                </span>
              </div>
            );
          })}

          {hasPad ? (
            <button
              type="button"
              className="memory-fridge-pad"
              aria-label={t('memoryWorlds.fridge.pad')}
              onClick={swap}
            >
              <span className="memory-fridge-pad-rot" aria-hidden="true">
                <span className="memory-fridge-pad-shadow" />
                <span className="memory-fridge-pad-sheet" data-depth="2" />
                <span className="memory-fridge-pad-sheet" data-depth="1" />
                <span className="memory-fridge-pad-top">
                  <span className="memory-fridge-pad-text">
                    {t('memoryWorlds.fridge.padLine1')}
                    <br />
                    {t('memoryWorlds.fridge.padLine2')}
                  </span>
                </span>
                <span className="memory-fridge-pad-binding" />
                <span className="memory-fridge-pencil" />
              </span>
            </button>
          ) : null}

          {LETTERS.map((letter, index) => {
            const dragId = `l:${letter.id}`;
            const pos = moved[dragId] ?? {
              x: letter.x + letterShift,
              y: letter.y,
            };
            const style = {
              left: pct(pos.x),
              top: pct(pos.y),
              zIndex: raised[dragId] ?? 40 + index,
              '--memory-fridge-rot': `${letter.rot}deg`,
            } as CSSProperties;
            return (
              <span
                key={letter.id}
                ref={(el) => {
                  if (el) dragEls.current.set(dragId, el);
                  else dragEls.current.delete(dragId);
                }}
                className="memory-fridge-letter"
                data-fridge-drag={dragId}
                data-glyph={letter.glyph}
                data-color={letter.color}
                aria-hidden="true"
                style={style}
              >
                <span className="memory-fridge-tilt">
                  <span className="memory-fridge-lift">
                    <span className="memory-fridge-rot">
                      <LetterShape glyph={letter.glyph} />
                    </span>
                  </span>
                </span>
              </span>
            );
          })}
        </div>
      </div>

      <span id={hintId} className="sr-only">
        {t('memoryWorlds.fridge.hint')}
      </span>
      <ul className="sr-only" aria-label={t('memoryWorlds.fridge.allMemories')}>
        {order.map((entry) => (
          <li key={entry.key}>
            <Link
              to={entry.path}
              tabIndex={-1}
              onClick={(event) => onOpen(event, entry.path, entry.key)}
            >
              {t('memoryWorlds.fridge.memoryListItem', {
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

      {open && openEntry
        ? createPortal(
            <div
              className="memory-fridge-stage"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              onKeyDown={onStageKeyDown}
            >
              {/* A pointer shortcut outside the card; the close button and Escape offer the same. */}
              <div
                ref={scrimRef}
                className="memory-fridge-scrim"
                aria-hidden="true"
                onClick={close}
              />
              <div className="memory-fridge-stage-center">
                <article
                  ref={cardRef}
                  className="memory-fridge-card"
                  data-kind={openEntry.kind}
                  data-heart-emotion={
                    openEntry.kind === 'heart' ? openEntry.emotion : undefined
                  }
                >
                  <CardFace
                    entry={openEntry}
                    loadMemoryImage={loadMemoryImage}
                    kicker={openEntry.isLead ? kicker : ''}
                    titleId={titleId}
                    pressed={!reduceRef.current}
                  />
                  <button
                    ref={closeRef}
                    type="button"
                    className="memory-fridge-close"
                    aria-label={t('memoryWorlds.fridge.backToDoor')}
                    onClick={close}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                  <Link
                    className="memory-fridge-label"
                    to={openEntry.path}
                    onClick={(event) =>
                      onOpen(event, openEntry.path, openEntry.key)
                    }
                  >
                    {t('memoryWorlds.fridge.openInDiary')}
                    <svg
                      viewBox="0 0 16 12"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M1 6h12M9 2l4 4-4 4" />
                    </svg>
                  </Link>
                </article>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
