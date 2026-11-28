/**
 * Post (#2283): letters from back then. A wall-mounted enamel mailbox hangs
 * above a desk; its red flag is up when post is waiting. The door is pulled
 * down (or pressed), an envelope comes out and lands on the desk, its flap is
 * lifted, and the postcard inside slides out. The card is turned by swiping
 * (or tapping), its paper tag opens the memory in the diary, and the read
 * card is put into the shoebox, after which the next letter drops through the
 * slot and the flag goes up again.
 *
 * Every memory comes in its own envelope design (airmail, kraft paper with a
 * button and string, rose with a wax seal, a typed urgent envelope, a deep
 * blue one with a floral liner, sage with gold foil), derived from its key,
 * kind and season so it never changes and neighbours never repeat.
 *
 * Gestures (Motion Contract 4.6): the door and the flap follow the finger and
 * latch past a threshold; the card turns with a sideways swipe and is carried
 * into the shoebox with a vertical drag. Their non-gesture alternatives are
 * the door, the flap and the shoebox as buttons (tap, Enter, Space) and a
 * "turn the card" button that appears on keyboard focus; keyboard focus
 * follows the post from step to step. Subtle haptics mark the latches, the
 * door hitting its stop, the arrival, the turned card and the new delivery.
 * A live region announces each step. With reduced motion every step shows
 * its result at once.
 *
 * Keyframes, loops and timing roles: `src/motion/memory-worlds.css`.
 */
import type { TFunction } from 'i18next';
import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { useFitText } from '../../client/fitText';
import { resolvedLocale, useTranslation } from '../../i18n';
import { haptic } from '../../motion/haptics';
import { observeVisibility } from '../../motion/visibility';
import { KeepsakeStampMark } from '../DiscoverKeepsakes';
import { MemoryPhoto } from './MemoryPhoto';
import {
  keyHash,
  type LoadMemoryImage,
  type MemoryWorldEntry,
  type MemoryWorldEntryKind,
  type MemoryWorldProps,
  prefersReducedMotion,
  seasonLabel,
  seasonOf,
} from './model';
import '../../motion/memory-worlds.css';
import './MemoryWorld.css';
import './PostWorld.css';
import { WorldHead } from './WorldHead';

type Entry = MemoryWorldEntry;
type EntryKind = MemoryWorldEntryKind;

/* ---------- Timing (ms; the lengths match the roles in memory-worlds.css) ---------- */

export const POST_TIMING = Object.freeze({
  /** The flag pops up shortly after the scene appears ("post is waiting"). */
  flagFirst: 650,
  /** The moment the falling door (820 ms) hits its stop. */
  doorStop: 430,
  /** The envelope starts sliding out once the door is mostly open. */
  mailDelay: 280,
  mailFlight: 1350,
  /** The spring-loaded door swings shut again after the post is out. */
  doorCloseDelay: 420,
  doorClose: 700,
  flapOpen: 520,
  cardPull: 1150,
  cardSettle: 1000,
  fileLift: 520,
  fileSink: 680,
  /** After filing: a new letter drops through the slot, then the flag pops up. */
  deliveryPause: 520,
  slotLetter: 1100,
  flagRaise: 950,
  /** A card that was not carried far enough springs back. */
  spring: 720,
});

/** Door angle (deg) at which a released drag lets the door fall open. */
const DOOR_LATCH = 36;
const DOOR_OPEN = 84;
/** Flap angle (deg) at which a released drag opens the envelope. */
const FLAP_LATCH = 95;
const DRAG_SLOP = 8;
/** A click right after a drag is not a tap. */
const CLICK_GUARD_MS = 80;
/** A filed card is this share of the shoebox width (CSS `--memory-post-boxed-w`). */
const BOXED_WIDTH = 0.58;
/** Distance (px) of a filed card above the box bottom (CSS `--memory-post-boxed-floor`). */
const BOXED_FLOOR = 6;
/** Filed cards drawn in the box; older ones are hidden underneath. */
const BOXED_MAX = 6;
/** Resting tilt (deg) of the mail layer (CSS `--memory-post-mail-tilt`). */
const MAIL_TILT = -1.2;
/** The postcard's words never shrink below these sizes, in px. */
const MOTIF_MIN_PX = 15;
const MESSAGE_MIN_PX = 13;

type Phase =
  | 'waiting'
  | 'opening'
  | 'envelope'
  | 'unsealing'
  | 'card'
  | 'filing'
  | 'delivering';

/** Where the postcard is relative to its envelope. */
type CardAt = 'inside' | 'pulled' | 'out' | 'rest';

type DoorMotion = 'still' | 'fall' | 'close';

interface Carry {
  x: number;
  y: number;
  r: number;
  s: number;
  mode: 'drag' | 'spring' | 'lift' | 'sink';
}

interface Filed {
  id: number;
  kind: EntryKind;
  tilt: number;
  shift: number;
  /** 0 = picture side up, 1 = writing side up. */
  side: number;
}

interface CardGesture {
  id: number;
  x: number;
  y: number;
  mode: 'turn' | 'carry' | null;
  startTurn: number;
  lastX: number;
  lastT: number;
  vx: number;
}

interface LatchGesture {
  id: number;
  y: number;
  moved: boolean;
  latched: boolean;
}

/** Two cards that are always in the shoebox. */
const DECORATION: readonly Filed[] = [
  { id: -2, kind: 'words', tilt: -3, shift: -10, side: 1 },
  { id: -1, kind: 'photo', tilt: 2.5, shift: 12, side: 0 },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** 0 = front, 1 = back, for any accumulated turn angle. */
export function sideOf(turn: number) {
  return ((Math.round(turn / 180) % 2) + 2) % 2;
}

/** The suppress-click flag that follows a drag, reset shortly after. */
function useSuppressClick() {
  const flag = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const arm = useCallback(() => {
    flag.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      flag.current = false;
    }, CLICK_GUARD_MS);
  }, []);
  return { flag, arm };
}

const postmarkFormatters = new Map<string, Intl.DateTimeFormat>();

/** "24.08.26": the short date of a postmark, in the app's locale. */
function postmarkDate(date: Date, locale: string): string {
  let format = postmarkFormatters.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
    postmarkFormatters.set(locale, format);
  }
  return format.format(date);
}

/* ---------- Stamp, postmark and paper clip ---------- */

/** A rectangle whose edges are perforated with semicircular notches. */
function perforatedRect(
  width: number,
  height: number,
  radius: number,
  pitch: number,
) {
  const along = (length: number) => {
    const count = Math.max(1, Math.floor(length / pitch));
    const gap = length / count;
    return Array.from({ length: count }, (_, index) => gap / 2 + index * gap);
  };
  const r = radius;
  const notch = (x: number, y: number) =>
    `A${r} ${r} 0 0 0 ${x.toFixed(2)} ${y.toFixed(2)}`;
  let path = 'M0 0';
  for (const x of along(width))
    path += ` L${(x - r).toFixed(2)} 0 ${notch(x + r, 0)}`;
  path += ` L${width} 0`;
  for (const y of along(height))
    path += ` L${width} ${(y - r).toFixed(2)} ${notch(width, y + r)}`;
  path += ` L${width} ${height}`;
  for (const x of along(width).reverse())
    path += ` L${(x + r).toFixed(2)} ${height} ${notch(x - r, height)}`;
  path += ` L0 ${height}`;
  for (const y of along(height).reverse())
    path += ` L0 ${(y + r).toFixed(2)} ${notch(0, y - r)}`;
  return `${path} Z`;
}

const STAMP_W = 46;
const STAMP_H = 56;
const STAMP_PATH = perforatedRect(STAMP_W, STAMP_H, 2.1, 6.2);

type StampMotifName =
  | 'heart'
  | 'star'
  | 'house'
  | 'mountain'
  | 'plane'
  | 'clock'
  | 'leaf';

const KIND_MOTIF: Record<EntryKind, StampMotifName> = {
  heart: 'heart',
  milestone: 'star',
  words: 'house',
  photo: 'mountain',
};

function StampMotif({ motif }: { motif: StampMotifName }) {
  switch (motif) {
    case 'heart':
      return (
        <path
          className="memory-post-stamp-ink"
          d="M23 41 C14 34 11 29 11 25 C11 21.5 13.8 19 17 19 C19.6 19 21.6 20.6 23 22.6 C24.4 20.6 26.4 19 29 19 C32.2 19 35 21.5 35 25 C35 29 32 34 23 41 Z"
        />
      );
    case 'star':
      return (
        <path
          className="memory-post-stamp-ink"
          d="M23 16 L26.2 25.4 L36 25.6 L28.2 31.4 L31 41 L23 35.2 L15 41 L17.8 31.4 L10 25.6 L19.8 25.4 Z"
        />
      );
    case 'house':
      return (
        <g className="memory-post-stamp-ink">
          <path d="M12 30 L23 20 L34 30 L34 42 L12 42 Z" />
          <rect
            className="memory-post-stamp-paper"
            x="20"
            y="33"
            width="6"
            height="9"
          />
        </g>
      );
    case 'mountain':
      return (
        <g>
          <circle className="memory-post-stamp-sun" cx="30" cy="22" r="4.5" />
          <path
            className="memory-post-stamp-ink"
            d="M8 43 L18 28 L24 36 L29 30 L38 43 Z"
          />
        </g>
      );
    case 'plane':
      return (
        <path
          className="memory-post-stamp-ink"
          d="M10 34 L33 21.5 Q38 19 37 23.5 L26 33 L28 42 L25 43 L21 36 L15 39 L13 37 L17 33.5 Z"
        />
      );
    case 'clock':
      return (
        <g>
          <circle className="memory-post-stamp-ink" cx="23" cy="30" r="11" />
          <path className="memory-post-stamp-hand" d="M23 23 V30 L28 33" />
        </g>
      );
    case 'leaf':
      return (
        <g>
          <path
            className="memory-post-stamp-ink"
            d="M11 43 C11 27 21 18 36 17 C35 32 27 42 11 43 Z"
          />
          <path className="memory-post-stamp-hand" d="M13 41 L30 23" />
        </g>
      );
  }
}

function PostStamp({
  kind,
  motif = KIND_MOTIF[kind],
}: {
  kind: EntryKind;
  motif?: StampMotifName;
}) {
  return (
    <svg
      className="memory-post-stamp"
      data-kind={kind}
      viewBox={`-1 -1 ${STAMP_W + 2} ${STAMP_H + 2}`}
      aria-hidden="true"
      focusable="false"
    >
      <path className="memory-post-stamp-paper" d={STAMP_PATH} />
      <rect
        className="memory-post-stamp-field"
        x="5"
        y="5"
        width={STAMP_W - 10}
        height={STAMP_H - 10}
      />
      <StampMotif motif={motif} />
      <text className="memory-post-stamp-value" x="8" y="13.5">
        80
      </text>
    </svg>
  );
}

/* ---------- Envelope designs ---------- */

export type EnvelopeDesign =
  | 'airmail'
  | 'kraft'
  | 'rose'
  | 'telegram'
  | 'midnight'
  | 'sage';

const ENVELOPE_DESIGNS: readonly EnvelopeDesign[] = [
  'airmail',
  'kraft',
  'rose',
  'telegram',
  'midnight',
  'sage',
];

/** Designs that suit a memory best, by kind and (for photos) season. */
function envelopeCandidates(entry: Entry): EnvelopeDesign[] {
  switch (entry.kind) {
    case 'heart':
      return ['rose', 'sage', 'midnight'];
    case 'milestone':
      return ['telegram', 'airmail', 'midnight'];
    case 'words':
      return ['kraft', 'telegram', 'sage'];
    case 'photo':
      switch (seasonOf(entry.date).season) {
        case 'winter':
          return ['midnight', 'kraft', 'airmail'];
        case 'spring':
          return ['sage', 'rose', 'airmail'];
        case 'summer':
          return ['airmail', 'kraft', 'rose'];
        default:
          return ['kraft', 'telegram', 'midnight'];
      }
  }
}

/**
 * One envelope per memory, derived from its key (so a memory always comes in
 * the same envelope for the same delivery order); neighbours never repeat.
 */
export function envelopeDesigns(entries: readonly Entry[]): EnvelopeDesign[] {
  const pick = (entry: Entry, avoid: EnvelopeDesign[]) => {
    const hash = keyHash(`${entry.key}:envelope`);
    const candidates = envelopeCandidates(entry);
    const ordered = [
      ...candidates.map(
        (_, offset) => candidates[(hash + offset) % candidates.length],
      ),
      ...ENVELOPE_DESIGNS.map(
        (_, offset) =>
          ENVELOPE_DESIGNS[(hash + offset) % ENVELOPE_DESIGNS.length],
      ),
    ];
    return ordered.find((design) => !avoid.includes(design)) ?? ordered[0];
  };
  const designs: EnvelopeDesign[] = [];
  entries.forEach((entry, position) => {
    designs.push(pick(entry, position > 0 ? [designs[position - 1]] : []));
  });
  // The delivery wraps around: the last letter must also differ from the first.
  const last = designs.length - 1;
  if (last > 1 && designs[last] === designs[0])
    designs[last] = pick(entries[last], [designs[last - 1], designs[0]]);
  return designs;
}

const HEART_PATH =
  'M12 19 C5 14 2.5 10.6 2.5 7.4 C2.5 4.6 4.7 2.5 7.4 2.5 C9.3 2.5 11 3.6 12 5.2 C13 3.6 14.7 2.5 16.6 2.5 C19.3 2.5 21.5 4.6 21.5 7.4 C21.5 10.6 19 14 12 19 Z';

/** What keeps the flap shut; it goes with the flap and hides once it is open. */
function FlapClosure({ design }: { design: EnvelopeDesign }) {
  switch (design) {
    case 'airmail':
      return (
        <span
          className="memory-post-seal memory-post-seal-heart"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 22" aria-hidden="true" focusable="false">
            <path d={HEART_PATH} />
          </svg>
        </span>
      );
    case 'kraft':
      return (
        <span
          className="memory-post-seal memory-post-seal-button"
          aria-hidden="true"
        >
          <svg
            className="memory-post-string"
            viewBox="0 0 40 52"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M20 4 C32 4 32 26 20 26 C8 26 8 48 20 48 C32 48 32 26 20 26 C8 26 8 4 20 4 Z" />
            <path d="M20 26 C27 30 29 40 34 50" />
          </svg>
          <span className="memory-post-button-disc" />
        </span>
      );
    case 'rose':
      return (
        <span
          className="memory-post-seal memory-post-seal-wax"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 22" aria-hidden="true" focusable="false">
            <path d={HEART_PATH} />
          </svg>
        </span>
      );
    case 'telegram':
      return (
        <span
          className="memory-post-seal memory-post-seal-label"
          aria-hidden="true"
        />
      );
    case 'midnight':
      return (
        <span
          className="memory-post-seal memory-post-seal-star"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 1.8 L14.9 8.6 L22.2 9.2 L16.6 14 L18.3 21.2 L12 17.4 L5.7 21.2 L7.4 14 L1.8 9.2 L9.1 8.6 Z" />
          </svg>
        </span>
      );
    case 'sage':
      return (
        <span
          className="memory-post-seal memory-post-seal-foil"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              className="memory-post-foil-leaf"
              d="M5 19 C5 11 10 5.5 19 5 C18.6 13.5 13.5 18.8 5 19 Z"
            />
            <path className="memory-post-foil-vein" d="M6 18 L15 9" />
          </svg>
        </span>
      );
  }
}

function EnvelopeStamp({
  kind,
  motif,
}: {
  kind: EntryKind;
  motif: StampMotifName;
}) {
  return (
    <span className="memory-post-env-stamp">
      <PostStamp kind={kind} motif={motif} />
    </span>
  );
}

function EnvelopeAddress({ main, small }: { main: string; small: string }) {
  return (
    <span className="memory-post-env-address">
      <span>{main}</span>
      <span className="memory-post-env-address-small">{small}</span>
    </span>
  );
}

/** The front pocket: stamp, address and the design's own details. */
function EnvelopePocket({
  design,
  entry,
  t,
}: {
  design: EnvelopeDesign;
  entry: Entry;
  t: TFunction;
}) {
  const season = seasonLabel(entry.date, t);
  const name = entry.author;
  switch (design) {
    case 'airmail':
      return (
        <>
          <span className="memory-post-airmail">
            {t('memoryWorlds.post.envelope.airmail')}
          </span>
          <EnvelopeStamp kind="words" motif="plane" />
          <EnvelopeAddress
            main={t('memoryWorlds.post.toBoth')}
            small={t('memoryWorlds.post.envelope.fromSeason', { name, season })}
          />
        </>
      );
    case 'kraft':
      return (
        <>
          <span className="memory-post-pocket-button" />
          <EnvelopeStamp kind="photo" motif="house" />
          <EnvelopeAddress
            main={t('memoryWorlds.post.envelope.forTwo')}
            small={t('memoryWorlds.post.envelope.by', { name })}
          />
        </>
      );
    case 'rose':
      return (
        <>
          <svg
            className="memory-post-pressed"
            viewBox="0 0 44 44"
            aria-hidden="true"
            focusable="false"
          >
            <path
              className="memory-post-pressed-stem"
              d="M8 40 C14 32 18 26 22 18"
            />
            <path
              className="memory-post-pressed-leaf"
              d="M14 31 C9 29 7 25 8 21 C12 22 15 26 14 31 Z"
            />
            <g className="memory-post-pressed-petals">
              <circle cx="22" cy="12" r="4.6" />
              <circle cx="28.5" cy="15.5" r="4.6" />
              <circle cx="27" cy="22.5" r="4.6" />
              <circle cx="19.5" cy="23" r="4.6" />
              <circle cx="16.5" cy="16" r="4.6" />
            </g>
            <circle
              className="memory-post-pressed-core"
              cx="22.5"
              cy="18"
              r="2.6"
            />
          </svg>
          <EnvelopeStamp kind="heart" motif="heart" />
          <EnvelopeAddress
            main={t('memoryWorlds.post.envelope.forBoth')}
            small={t('memoryWorlds.post.envelope.love', { name })}
          />
        </>
      );
    case 'telegram':
      return (
        <>
          <span className="memory-post-urgent">
            {t('memoryWorlds.post.envelope.urgent')}
          </span>
          <EnvelopeStamp kind="milestone" motif="clock" />
          <span className="memory-post-typed">
            <span>{t('memoryWorlds.post.envelope.to')}</span>
            <span>{t('memoryWorlds.post.diary')}</span>
            <span>{t('memoryWorlds.post.envelope.from', { name })}</span>
          </span>
        </>
      );
    case 'midnight':
      return (
        <>
          <EnvelopeStamp kind="heart" motif="star" />
          <EnvelopeAddress
            main={t('memoryWorlds.post.toBoth')}
            small={season}
          />
        </>
      );
    case 'sage':
      return (
        <>
          <EnvelopeStamp kind="photo" motif="leaf" />
          <EnvelopeAddress
            main={t('memoryWorlds.post.envelope.forYou')}
            small={t('memoryWorlds.post.envelope.from', { name })}
          />
        </>
      );
  }
}

/** A round date stamp with wavy cancellation lines that run across the stamp. */
function Postmark({ date, ring }: { date: Date; ring: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ringId = `memory-post-ring-${id}`;
  return (
    <svg
      className="memory-post-postmark"
      viewBox="0 0 100 60"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <path id={ringId} d="M12 30 A18 18 0 1 1 48 30 A18 18 0 1 1 12 30" />
      </defs>
      <circle cx="30" cy="30" r="23" />
      <circle cx="30" cy="30" r="14.5" />
      <text className="memory-post-postmark-ring">
        <textPath href={`#${ringId}`} startOffset="2%">
          {ring}
        </textPath>
      </text>
      <text
        className="memory-post-postmark-date"
        x="30"
        y="32.6"
        textAnchor="middle"
      >
        {postmarkDate(date, resolvedLocale())}
      </text>
      <g className="memory-post-postmark-waves">
        <path d="M55 17 q5 -3.6 10 0 t10 0 t10 0 t10 0" />
        <path d="M55 25 q5 -3.6 10 0 t10 0 t10 0 t10 0" />
        <path d="M55 33 q5 -3.6 10 0 t10 0 t10 0 t10 0" />
        <path d="M55 41 q5 -3.6 10 0 t10 0 t10 0 t10 0" />
      </g>
    </svg>
  );
}

function PaperClip() {
  return (
    <svg
      className="memory-post-clip"
      viewBox="0 0 16 44"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M11 13 V34 a4 4 0 0 1 -8 0 V8 a5.5 5.5 0 0 1 11 0 V31 a2.5 2.5 0 0 1 -5 0 V13" />
    </svg>
  );
}

/* ---------- Postcard faces ---------- */

/** Words on the card that always fit their space (`client/fitText`). */
function CardWords({
  text,
  minPx,
  className,
  quote,
}: {
  text: string;
  minPx: number;
  className: string;
  quote?: boolean;
}) {
  const { boxRef, textRef } = useFitText<HTMLSpanElement, HTMLSpanElement>(
    text,
    minPx,
  );
  return (
    <span ref={boxRef} className={`${className}-box`}>
      {/* The text is written by the fitting, outside React. */}
      <span
        ref={textRef}
        className={className}
        data-quote={quote ? 'true' : undefined}
      />
    </span>
  );
}

function CardFront({
  entry,
  loadMemoryImage,
  hidden,
  t,
}: {
  entry: Entry;
  loadMemoryImage: LoadMemoryImage;
  hidden: boolean;
  t: TFunction;
}) {
  return (
    <div
      className="memory-post-face memory-post-front"
      data-kind={entry.kind}
      aria-hidden={hidden || undefined}
    >
      {entry.kind === 'photo' ? (
        <MemoryPhoto entry={entry} loadMemoryImage={loadMemoryImage} />
      ) : (
        <div className="memory-post-motif">
          {entry.kind === 'milestone' ? (
            <KeepsakeStampMark className="memory-post-motif-mark" />
          ) : entry.kind === 'heart' ? (
            <svg
              className="memory-post-motif-heart"
              viewBox="0 0 24 22"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M12 21 C4 15 1 11 1 7 C1 3.6 3.6 1 7 1 C9.2 1 11 2.3 12 4 C13 2.3 14.8 1 17 1 C20.4 1 23 3.6 23 7 C23 11 20 15 12 21 Z" />
            </svg>
          ) : null}
          <CardWords
            text={entry.title}
            minPx={MOTIF_MIN_PX}
            className="memory-post-motif-title"
          />
        </div>
      )}
      <span className="memory-post-greeting">
        {t('memoryWorlds.post.greeting', {
          season: seasonLabel(entry.date, t),
        })}
      </span>
    </div>
  );
}

function CardBack({
  entry,
  kicker,
  hidden,
  t,
}: {
  entry: Entry;
  kicker: string;
  hidden: boolean;
  t: TFunction;
}) {
  return (
    <div
      className="memory-post-face memory-post-back"
      aria-hidden={hidden || undefined}
    >
      <span className="memory-post-back-print" aria-hidden="true">
        {t('memoryWorlds.post.postcard')}
      </span>
      <div className="memory-post-message">
        <span className="memory-post-message-kicker">{kicker}</span>
        <CardWords
          text={entry.title}
          minPx={MESSAGE_MIN_PX}
          className="memory-post-message-text"
          quote={entry.kind === 'heart'}
        />
        <span className="memory-post-sign">
          {t('memoryWorlds.post.sign', { name: entry.author })}
        </span>
      </div>
      <div className="memory-post-address">
        <PostStamp kind={entry.kind} />
        <Postmark date={entry.date} ring={t('memoryWorlds.post.postmark')} />
        <span className="memory-post-to">{t('memoryWorlds.post.toBoth')}</span>
        <span className="memory-post-to">{t('memoryWorlds.post.diary')}</span>
        <span className="memory-post-to">
          <time dateTime={entry.dateTime}>{entry.dateLabel}</time>
        </span>
      </div>
    </div>
  );
}

/* ---------- World ---------- */

export function PostWorld({
  entries,
  kicker,
  loadMemoryImage,
  onOpen,
}: MemoryWorldProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('waiting');
  // The flag pops up shortly after the scene appears ("post is waiting").
  const [flagUp, setFlagUp] = useState(() => prefersReducedMotion());
  /** The flag was lowered once: from now on lowering it is animated. */
  const [flagMoved, setFlagMoved] = useState(false);
  /** The card was turned or moved at least once: no more turn hint. */
  const [touched, setTouched] = useState(false);
  const [door, setDoor] = useState(0);
  const [doorFrom, setDoorFrom] = useState(0);
  const [doorMotion, setDoorMotion] = useState<DoorMotion>('still');
  const [doorDragging, setDoorDragging] = useState(false);
  const [flight, setFlight] = useState<{ x: number; y: number } | null>(null);
  const [flap, setFlap] = useState(0);
  const [flapDragging, setFlapDragging] = useState(false);
  const [cardAt, setCardAt] = useState<CardAt>('inside');
  const [envelopeAway, setEnvelopeAway] = useState(false);
  const [turn, setTurn] = useState(0);
  const [turning, setTurning] = useState(false);
  const [carry, setCarry] = useState<Carry | null>(null);
  const [near, setNear] = useState(false);
  const [filed, setFiled] = useState<Filed[]>([]);
  const [deliveries, setDeliveries] = useState(0);
  const [announcement, setAnnouncement] = useState('');

  const timers = useRef<number[]>([]);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(() => {
    const raise = window.setTimeout(
      () => setFlagUp(true),
      POST_TIMING.flagFirst,
    );
    return () => {
      window.clearTimeout(raise);
      for (const timer of timers.current) window.clearTimeout(timer);
    };
  }, []);

  const rootRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const cavityRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const mouthRef = useRef<HTMLButtonElement>(null);
  const shoeboxRef = useRef<HTMLDivElement>(null);
  const doorRef = useRef<HTMLButtonElement>(null);
  const flapRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLAnchorElement>(null);
  const doorGesture = useRef<LatchGesture | null>(null);
  const flapGesture = useRef<LatchGesture | null>(null);
  const cardGesture = useRef<CardGesture | null>(null);
  const nearRef = useRef(false);
  const turnRef = useRef(0);
  turnRef.current = turn;
  const doorSuppress = useSuppressClick();
  const flapSuppress = useSuppressClick();
  const cardSuppress = useSuppressClick();
  /** Set when a step was triggered from the keyboard: focus follows the post. */
  const focusNext = useRef(false);

  const count = entries.length;
  const hasEntries = count > 0;
  const current = hasEntries ? entries[index % count] : null;
  const designs = useMemo(() => envelopeDesigns(entries), [entries]);
  const design = designs[index % Math.max(1, count)] ?? 'airmail';

  // The flag's flutter and the door's twitch pause while the post is not seen (M8).
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !hasEntries) return;
    return observeVisibility(root, (state) => {
      root.dataset.ambient = state.visible ? 'on' : 'paused';
    });
  }, [hasEntries]);

  // Keyboard users follow the post from step to step.
  useEffect(() => {
    if (!focusNext.current) return;
    const target =
      phase === 'envelope'
        ? flapRef.current
        : phase === 'card'
          ? openRef.current
          : phase === 'waiting'
            ? doorRef.current
            : null;
    if (!target) return;
    focusNext.current = false;
    target.focus({ preventScroll: true });
  }, [phase]);

  const reveal = useCallback(() => {
    const element = spotRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const margin =
      Number.parseFloat(getComputedStyle(element).scrollMarginTop) || 0;
    // Only scroll down, and only when the card would be cut off.
    if (rect.bottom <= window.innerHeight - 24 || rect.top <= margin + 8)
      return;
    element.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  }, []);

  if (!current) return null;

  const side = sideOf(turn);
  const showEnvelope =
    phase === 'opening' || phase === 'envelope' || phase === 'unsealing';
  const showMail = phase !== 'waiting' && phase !== 'delivering';

  /* ----- Step 1: open the mailbox door ----- */

  const openDoor = (from: number) => {
    if (phase !== 'waiting') return;
    haptic('press');
    setFlagUp(false);
    setFlagMoved(true);
    setDoorDragging(false);
    if (prefersReducedMotion()) {
      setDoor(0);
      setDoorMotion('still');
      setFlight(null);
      setPhase('envelope');
      setAnnouncement(t('memoryWorlds.post.announce.waiting'));
      window.requestAnimationFrame(reveal);
      return;
    }
    const cavity = cavityRef.current?.getBoundingClientRect();
    const spot = spotRef.current?.getBoundingClientRect();
    setFlight(
      cavity && spot
        ? {
            x: cavity.left + cavity.width / 2 - (spot.left + spot.width / 2),
            y: cavity.top + cavity.height / 2 - (spot.top + spot.height / 2),
          }
        : { x: 0, y: -160 },
    );
    setDoorFrom(from);
    setDoorMotion('fall');
    setDoor(DOOR_OPEN);
    setPhase('opening');
    later(() => haptic('threshold'), POST_TIMING.doorStop);
    const landed = POST_TIMING.mailDelay + POST_TIMING.mailFlight;
    later(() => {
      setPhase('envelope');
      setAnnouncement(t('memoryWorlds.post.announce.arrived'));
      haptic('commit');
      reveal();
    }, landed);
    later(
      () => setDoorMotion('still'),
      landed + POST_TIMING.doorCloseDelay - 40,
    );
    later(() => {
      setDoorMotion('close');
      setDoor(0);
    }, landed + POST_TIMING.doorCloseDelay);
    later(
      () => haptic('threshold'),
      landed + POST_TIMING.doorCloseDelay + POST_TIMING.doorClose * 0.55,
    );
  };

  const onDoorDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (phase !== 'waiting' || event.button !== 0) return;
    doorGesture.current = {
      id: event.pointerId,
      y: event.clientY,
      moved: false,
      latched: false,
    };
  };
  const onDoorMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = doorGesture.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    const dy = event.clientY - gesture.y;
    if (!gesture.moved) {
      if (dy < DRAG_SLOP) return;
      gesture.moved = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The pointer may already be gone (e.g. a cancelled touch).
      }
      setDoorMotion('still');
      setDoorDragging(true);
    }
    const angle = clamp((dy - DRAG_SLOP) * 0.78, 0, DOOR_OPEN);
    const latched = angle >= DOOR_LATCH;
    if (latched !== gesture.latched) {
      gesture.latched = latched;
      haptic('threshold');
    }
    setDoor(angle);
  };
  const onDoorUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = doorGesture.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    doorGesture.current = null;
    if (!gesture.moved) return;
    doorSuppress.arm();
    setDoorDragging(false);
    if (gesture.latched && event.type === 'pointerup') {
      openDoor(door);
    } else {
      setDoorMotion('close');
      setDoor(0);
    }
  };
  const onDoorClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (doorSuppress.flag.current) return;
    focusNext.current = event.detail === 0;
    openDoor(0);
  };

  /* ----- Step 2: unseal the envelope ----- */

  const unseal = () => {
    if (phase !== 'envelope') return;
    haptic('press');
    setFlapDragging(false);
    setFlap(180);
    const arrived = t('memoryWorlds.post.announce.card', {
      title: current.title,
    });
    if (prefersReducedMotion()) {
      setCardAt('rest');
      setPhase('card');
      setAnnouncement(arrived);
      return;
    }
    setPhase('unsealing');
    later(() => setCardAt('pulled'), POST_TIMING.flapOpen);
    later(() => {
      setCardAt('out');
      setEnvelopeAway(true);
    }, POST_TIMING.flapOpen + POST_TIMING.cardPull);
    later(
      () => {
        setCardAt('rest');
        setEnvelopeAway(false);
        setPhase('card');
        setAnnouncement(arrived);
        haptic('moment');
      },
      POST_TIMING.flapOpen + POST_TIMING.cardPull + POST_TIMING.cardSettle,
    );
  };

  const onFlapDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (phase !== 'envelope' || event.button !== 0) return;
    flapGesture.current = {
      id: event.pointerId,
      y: event.clientY,
      moved: false,
      latched: false,
    };
  };
  const onFlapMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = flapGesture.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    const lift = gesture.y - event.clientY;
    if (!gesture.moved) {
      if (lift < DRAG_SLOP) return;
      gesture.moved = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The pointer may already be gone (e.g. a cancelled touch).
      }
      setFlapDragging(true);
    }
    const angle = clamp((lift - DRAG_SLOP) * 1.7, 0, 180);
    const latched = angle >= FLAP_LATCH;
    if (latched !== gesture.latched) {
      gesture.latched = latched;
      haptic('threshold');
    }
    setFlap(angle);
  };
  const onFlapUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = flapGesture.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    flapGesture.current = null;
    if (!gesture.moved) return;
    flapSuppress.arm();
    if (gesture.latched && event.type === 'pointerup') {
      unseal();
    } else {
      setFlapDragging(false);
      setFlap(0);
    }
  };
  const onFlapClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (flapSuppress.flag.current) return;
    focusNext.current = event.detail === 0;
    unseal();
  };

  /* ----- Step 3: turn the card, open the memory ----- */

  const turnBy = (steps: number) => {
    if (phase !== 'card') return;
    haptic('commit');
    setTouched(true);
    setTurn((value) => Math.round(value / 180) * 180 + steps * 180);
  };

  /* ----- Step 4: put the card into the shoebox ----- */

  const fileCard = () => {
    if (phase !== 'card') return;
    const wrapper = cardRef.current;
    const card = wrapper?.getBoundingClientRect();
    const box = shoeboxRef.current?.getBoundingClientRect();
    const mouth = mouthRef.current?.getBoundingClientRect();
    // The resting pose in the box is decided first, so the flying card lands
    // exactly where the filed card is drawn afterwards (no jump).
    const hash = keyHash(current.key);
    const tilt = ((hash % 9) - 4) * 0.8;
    const shift = (((hash >>> 5) % 7) - 3) * 4;
    const filedSide = sideOf(turnRef.current);
    const finish = () => {
      setFiled((previous) => [
        ...previous.slice(-(BOXED_MAX - 1)),
        {
          id: (previous[previous.length - 1]?.id ?? 0) + 1,
          kind: current.kind,
          tilt,
          shift,
          side: filedSide,
        },
      ]);
      setCarry(null);
      setNear(false);
      nearRef.current = false;
      setTurn(0);
      setTouched(false);
      setCardAt('inside');
      setFlap(0);
      setIndex((value) => value + 1);
    };
    // Without a laid-out card (or with reduced motion) the card is filed at once.
    if (
      prefersReducedMotion() ||
      !wrapper ||
      !card ||
      !box ||
      !mouth ||
      wrapper.offsetWidth === 0
    ) {
      haptic('commit');
      finish();
      setFlagUp(true);
      setPhase('waiting');
      setAnnouncement(t('memoryWorlds.post.announce.filedNew'));
      return;
    }
    // Unrotated card size; the bounding box includes the mail tilt.
    const width = wrapper.offsetWidth;
    const height = wrapper.offsetHeight;
    const scale = (box.width * BOXED_WIDTH) / width;
    const boxedHeight = scale * height;
    const centerX = card.left + card.width / 2;
    const centerY = card.top + card.height / 2;
    const targetX = box.left + box.width / 2 + shift;
    // Resting on the floor of the box, exactly like `.memory-post-boxed`.
    const restY = box.bottom - BOXED_FLOOR - boxedHeight / 2;
    // Hovering just above the front wall before it sinks in.
    const hoverY = mouth.top + 4 - boxedHeight / 2;
    // The card moves inside the tilted mail layer: turn screen offsets back.
    const angle = (-MAIL_TILT * Math.PI) / 180;
    const local = (dx: number, dy: number) => ({
      x: dx * Math.cos(angle) - dy * Math.sin(angle),
      y: dx * Math.sin(angle) + dy * Math.cos(angle),
    });
    const hover = local(targetX - centerX, hoverY - centerY);
    const rest = local(targetX - centerX, restY - centerY);
    const restTurn = tilt - MAIL_TILT;
    setNear(false);
    nearRef.current = false;
    setPhase('filing');
    setCarry({ ...hover, r: restTurn + 2.5, s: scale, mode: 'lift' });
    later(
      () => setCarry({ ...rest, r: restTurn, s: scale, mode: 'sink' }),
      POST_TIMING.fileLift,
    );
    later(() => {
      haptic('commit');
      finish();
      setPhase('delivering');
      setAnnouncement(t('memoryWorlds.post.announce.filed'));
    }, POST_TIMING.fileLift + POST_TIMING.fileSink);
    const delivered =
      POST_TIMING.fileLift + POST_TIMING.fileSink + POST_TIMING.deliveryPause;
    later(() => setDeliveries((value) => value + 1), delivered);
    const flagAt = delivered + POST_TIMING.slotLetter - 250;
    later(() => {
      setFlagUp(true);
      haptic('success');
    }, flagAt);
    later(
      () => {
        setPhase('waiting');
        setAnnouncement(t('memoryWorlds.post.announce.newPost'));
      },
      flagAt + POST_TIMING.flagRaise * 0.6,
    );
  };

  const overMouth = (x: number, y: number) => {
    const mouth = mouthRef.current?.getBoundingClientRect();
    if (!mouth) return false;
    const pad = 26;
    return (
      x >= mouth.left - pad &&
      x <= mouth.right + pad &&
      y >= mouth.top - pad * 2 &&
      y <= mouth.bottom + pad
    );
  };

  const onCardDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (phase !== 'card' || event.button !== 0) return;
    cardGesture.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      mode: null,
      startTurn: turnRef.current,
      lastX: event.clientX,
      lastT: event.timeStamp,
      vx: 0,
    };
  };
  const onCardMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = cardGesture.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.mode) {
      if (Math.hypot(dx, dy) < DRAG_SLOP) return;
      gesture.mode = Math.abs(dx) > Math.abs(dy) ? 'turn' : 'carry';
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The pointer may already be gone (e.g. a cancelled touch).
      }
      setTouched(true);
      if (gesture.mode === 'turn') setTurning(true);
    }
    if (gesture.mode === 'turn') {
      const elapsed = Math.max(1, event.timeStamp - gesture.lastT);
      gesture.vx =
        gesture.vx * 0.6 + ((event.clientX - gesture.lastX) / elapsed) * 0.4;
      gesture.lastX = event.clientX;
      gesture.lastT = event.timeStamp;
      const angle = gesture.startTurn + dx * 0.62;
      // A light tick each time the card stands on its edge.
      if (
        Math.floor((angle + 90) / 180) !==
        Math.floor((turnRef.current + 90) / 180)
      )
        haptic('threshold');
      turnRef.current = angle;
      setTurn(angle);
      return;
    }
    const isNear = overMouth(event.clientX, event.clientY);
    if (isNear !== nearRef.current) {
      nearRef.current = isNear;
      setNear(isNear);
      if (isNear) haptic('threshold');
    }
    setCarry({
      x: dx,
      y: dy,
      r: clamp(dx * 0.04, -8, 8),
      s: isNear ? 0.74 : 1 - clamp(dy / 900, 0, 0.12),
      mode: 'drag',
    });
  };
  const onCardUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = cardGesture.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    cardGesture.current = null;
    if (!gesture.mode) return;
    cardSuppress.arm();
    const cancelled = event.type !== 'pointerup';
    if (gesture.mode === 'turn') {
      setTurning(false);
      const delta = turnRef.current - gesture.startTurn;
      const steps = cancelled
        ? 0
        : Math.abs(delta) > 55
          ? Math.sign(delta)
          : Math.abs(gesture.vx) > 0.45
            ? Math.sign(gesture.vx)
            : 0;
      if (steps !== 0) haptic('commit');
      setTurn(gesture.startTurn + steps * 180);
      return;
    }
    if (!cancelled && nearRef.current) {
      fileCard();
      return;
    }
    setNear(false);
    nearRef.current = false;
    setCarry({ x: 0, y: 0, r: 0, s: 1, mode: 'spring' });
    later(
      () => setCarry((value) => (value?.mode === 'spring' ? null : value)),
      POST_TIMING.spring,
    );
  };
  const onCardClick = () => {
    if (cardSuppress.flag.current) return;
    turnBy(1);
  };

  /* ----- Render ----- */

  const cardTurnStyle = { '--memory-post-turn': turn } as CSSProperties;
  const carryStyle = carry
    ? ({
        '--memory-post-cx': carry.x,
        '--memory-post-cy': carry.y,
        '--memory-post-cr': carry.r,
        '--memory-post-cs': carry.s,
      } as CSSProperties)
    : undefined;
  const mailStyle = flight
    ? ({
        '--memory-post-fx': flight.x,
        '--memory-post-fy': flight.y,
      } as CSSProperties)
    : undefined;
  const doorStyle = {
    '--memory-post-door': door,
    '--memory-post-door-from': doorFrom,
  } as CSSProperties;
  const flapStyle = { '--memory-post-flap': flap } as CSSProperties;

  return (
    <div ref={rootRef} className="memory-post-world">
      <WorldHead heading={t('memoryWorlds.post.heading')} />
      <div
        className="memory-post-scene"
        data-phase={phase}
        data-sink={carry?.mode === 'sink' ? 'true' : undefined}
        data-primary-tab-swipe-block
      >
        {/* The wall-mounted enamel mailbox. */}
        <div className="memory-post-box">
          <span className="memory-post-box-shadow" aria-hidden="true" />
          <span className="memory-post-box-roof" aria-hidden="true" />
          <span className="memory-post-box-shell" aria-hidden="true">
            <span className="memory-post-rivets" />
            <span className="memory-post-slot">
              <span className="memory-post-slot-lip" />
            </span>
            <span className="memory-post-plate">
              <span className="memory-post-plate-main">
                {t('memoryWorlds.post.plate')}
              </span>
              <span className="memory-post-plate-sub">
                {t('memoryWorlds.post.plateFor')}
              </span>
            </span>
          </span>
          {deliveries > 0 ? (
            <span className="memory-post-slot-drop" aria-hidden="true">
              <span className="memory-post-slot-letter" key={deliveries} />
            </span>
          ) : null}
          <span
            className="memory-post-cavity"
            ref={cavityRef}
            aria-hidden="true"
          >
            {phase === 'waiting' || phase === 'opening' ? (
              <span className="memory-post-cavity-mail" />
            ) : null}
          </span>
          <button
            type="button"
            ref={doorRef}
            className="memory-post-door"
            data-motion={doorMotion}
            data-dragging={doorDragging ? 'true' : undefined}
            style={doorStyle}
            disabled={phase !== 'waiting'}
            aria-label={t('memoryWorlds.post.openBox')}
            onPointerDown={onDoorDown}
            onPointerMove={onDoorMove}
            onPointerUp={onDoorUp}
            onPointerCancel={onDoorUp}
            onClick={onDoorClick}
          >
            <span className="memory-post-door-face" aria-hidden="true">
              <span className="memory-post-door-knob" />
              <span className="memory-post-door-lock" />
            </span>
            <span className="memory-post-door-inside" aria-hidden="true" />
          </button>
          <span className="memory-post-hinge" aria-hidden="true" />
          <span
            className="memory-post-flag"
            data-up={flagUp ? 'true' : 'false'}
            data-moved={flagMoved ? 'true' : undefined}
            key={flagUp ? 'up' : 'down'}
            aria-hidden="true"
          >
            <span className="memory-post-flag-arm">
              <span className="memory-post-flag-plate" />
            </span>
            <span className="memory-post-flag-hub" />
          </span>
        </div>

        {/* Where the post lands. */}
        <div className="memory-post-spot" ref={spotRef}>
          {showMail ? (
            <div
              className="memory-post-mail"
              data-design={design}
              data-flying={phase === 'opening' ? 'true' : undefined}
              style={mailStyle}
            >
              {/* Envelope parts are siblings of the card so the card can sit
                  between the opened flap and the front pocket. */}
              {showEnvelope ? (
                <span
                  className="memory-post-env-rear"
                  data-away={envelopeAway ? 'true' : undefined}
                  aria-hidden="true"
                />
              ) : null}
              <div
                className="memory-post-card"
                ref={cardRef}
                data-at={cardAt}
                data-carry={carry?.mode}
                data-near={near ? 'true' : undefined}
              >
                <div className="memory-post-carry" style={carryStyle}>
                  {/* biome-ignore lint/a11y/noStaticElementInteractions: the swipe and tap that turn the card are a pointer shortcut; keyboard users turn it with the button below. */}
                  {/* biome-ignore lint/a11y/useKeyWithClickEvents: the button below is the keyboard path for turning the card. */}
                  <div
                    className="memory-post-turn"
                    data-turning={turning ? 'true' : undefined}
                    data-hint={
                      phase === 'card' && !touched ? 'true' : undefined
                    }
                    data-side={side === 0 ? 'front' : 'back'}
                    style={cardTurnStyle}
                    onPointerDown={onCardDown}
                    onPointerMove={onCardMove}
                    onPointerUp={onCardUp}
                    onPointerCancel={onCardUp}
                    onClick={onCardClick}
                  >
                    <CardFront
                      entry={current}
                      loadMemoryImage={loadMemoryImage}
                      hidden={phase !== 'card' || side !== 0}
                      t={t}
                    />
                    <CardBack
                      entry={current}
                      kicker={kicker}
                      hidden={phase !== 'card' || side !== 1}
                      t={t}
                    />
                  </div>
                  {phase === 'card' || phase === 'filing' ? (
                    <Link
                      ref={openRef}
                      className="memory-post-open"
                      to={current.path}
                      onClick={(event) =>
                        onOpen(event, current.path, current.key)
                      }
                      aria-label={t('memoryWorlds.post.openNamed', {
                        title: current.title,
                      })}
                      data-hidden={turning || carry ? 'true' : undefined}
                      tabIndex={phase === 'card' ? undefined : -1}
                      draggable={false}
                    >
                      <PaperClip />
                      <span className="memory-post-open-tag">
                        {t('memoryWorlds.post.open')}
                      </span>
                    </Link>
                  ) : null}
                </div>
                {phase === 'card' ? (
                  <button
                    type="button"
                    className="memory-post-focus-only"
                    onClick={() => turnBy(1)}
                  >
                    {side === 0
                      ? t('memoryWorlds.post.turnOver')
                      : t('memoryWorlds.post.turnBack')}
                  </button>
                ) : null}
              </div>
              {showEnvelope ? (
                <>
                  <button
                    type="button"
                    ref={flapRef}
                    className="memory-post-flap"
                    data-open={flap > 90 ? 'true' : undefined}
                    data-dragging={flapDragging ? 'true' : undefined}
                    data-away={envelopeAway ? 'true' : undefined}
                    style={flapStyle}
                    disabled={phase !== 'envelope'}
                    aria-label={t('memoryWorlds.post.openEnvelope', {
                      name: current.author,
                    })}
                    onPointerDown={onFlapDown}
                    onPointerMove={onFlapMove}
                    onPointerUp={onFlapUp}
                    onPointerCancel={onFlapUp}
                    onClick={onFlapClick}
                  >
                    <span className="memory-post-flap-outer" aria-hidden="true">
                      <span className="memory-post-flap-paper" />
                    </span>
                    <span className="memory-post-flap-inner" aria-hidden="true">
                      <span className="memory-post-flap-liner" />
                    </span>
                    <FlapClosure design={design} />
                  </button>
                  <span
                    className="memory-post-pocket"
                    data-away={envelopeAway ? 'true' : undefined}
                    aria-hidden="true"
                  >
                    <span className="memory-post-pocket-paper" />
                    <EnvelopePocket design={design} entry={current} t={t} />
                  </span>
                </>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* The desk below the mailbox, with a letter opener and a loose stamp. */}
        <div className="memory-post-desk" aria-hidden="true">
          <span className="memory-post-opener">
            <span className="memory-post-opener-blade" />
            <span className="memory-post-opener-handle" />
          </span>
          <span className="memory-post-loose-stamp">
            <PostStamp kind="heart" />
          </span>
        </div>

        {/* The shoebox for read cards. */}
        <div
          className="memory-post-shoebox"
          ref={shoeboxRef}
          data-near={near ? 'true' : undefined}
        >
          <span className="memory-post-shoebox-lid" aria-hidden="true" />
          <span className="memory-post-shoebox-back" aria-hidden="true" />
          {/* Clipped at the walls and the floor: nothing can slip out. */}
          <span className="memory-post-shoebox-cards" aria-hidden="true">
            {[...DECORATION, ...filed].map((item) => (
              <span
                key={item.id}
                className="memory-post-boxed"
                data-kind={item.kind}
                data-side={item.side === 0 ? 'front' : 'back'}
                style={
                  {
                    '--memory-post-tilt': item.tilt,
                    '--memory-post-shift': item.shift,
                  } as CSSProperties
                }
              />
            ))}
          </span>
          <button
            type="button"
            ref={mouthRef}
            className="memory-post-shoebox-front"
            disabled={phase !== 'card'}
            aria-label={t('memoryWorlds.post.file')}
            onClick={(event) => {
              focusNext.current = event.detail === 0;
              fileCard();
            }}
          >
            <span className="memory-post-shoebox-label" aria-hidden="true">
              {t('memoryWorlds.post.read')}
            </span>
          </button>
        </div>
      </div>
      <p className="sr-only" role="status">
        {announcement}
      </p>
    </div>
  );
}
