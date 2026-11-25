/**
 * Glas (#2283): a retro preserving jar of thick, slightly aqua glass with
 * raised lettering, a gingham cover tied with twine, a kraft label and a
 * hanging tag, full of coloured folded slips. Shaking it (moving it from
 * side to side with the finger, tapping it, pressing its tag or shaking the
 * phone) loosens the lid until it pops and one slip jumps out; the slip
 * flies onto a stage and unfolds into the memory. Laid down, it lies below
 * the jar: its kraft tab opens the memory in the diary, and its tag folds it
 * in thirds and carries it back into the jar (pulled up by the finger, or
 * pressed).
 *
 * One slip a day: today's draw is remembered on this device (only its key,
 * `JAR_DRAW_KEY`). While today's slip is out, the jar still rattles but
 * refuses gently and says so; the next day the jar is full again. A slip
 * that is put back may be followed by another one (never the same).
 *
 * Gestures (Motion Contract 4.6): the jar follows the finger sideways, and
 * every turn of the finger is one rattle; the slip follows the finger up
 * towards the jar and folds on the way, past a threshold it goes in by
 * itself, otherwise it springs back. The non-gesture alternatives are the
 * jar's tag and the slip's tag as named buttons (tap, Enter, Space); the
 * stage is a dialog that takes the focus and returns it to the tag. Subtle
 * haptics mark every rattle, the popping lid, each flap that lands, each
 * flap that folds and the slip landing in the pile. A live region announces
 * the draw, the refusal and the return. With reduced motion a press draws the
 * slip into the page at once, and putting it back is immediate.
 *
 * The frame-driven jar and fold and their timings:
 * `src/motion/memoryJar.ts`; keyframes, loops and timing roles:
 * `src/motion/memory-worlds.css`.
 */
import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
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
import { resolvedLocale, useTranslation } from '../../i18n';
import { haptic } from '../../motion/haptics';
import {
  clearFold,
  createJarDriver,
  dragFold,
  FOLD_COMMIT,
  FOLD_SLOP,
  type FoldParts,
  type FoldTrack,
  foldFlaps,
  JAR_SHAKES,
  JAR_TIMING,
  type JarDriver,
  type JarFlightStart,
  jarEaseInOut,
  jarFollow,
  jumpVars,
  measureFold,
  paintFold,
  runJarTween,
  stageFlightVars,
} from '../../motion/memoryJar';
import { observeVisibility } from '../../motion/visibility';
import {
  addRattle,
  buildSlips,
  createShakeDetector,
  FALLBACK_SLIP,
  type JarSlip,
  newRattleSeries,
  newReversalTrack,
  pickNextSlip,
  RATTLES_TO_OPEN,
  hasDrawnToday,
  readTodayDraw,
  rememberDraw,
  rememberReturn,
  SERIES_GAP_MS,
  SHAKE_FOLLOW,
  SLIP_REAL_MAX,
  type SlipTone,
  TAP_GAP_MS,
  trackReversal,
} from './jarRules';
import { Keepsake } from './MemoryPhoto';
import {
  type LoadMemoryImage,
  type MemoryWorldEntry,
  type MemoryWorldProps,
  type OpenMemoryWorldItem,
  prefersReducedMotion,
} from './model';
import '../../motion/memory-worlds.css';
import './MemoryWorld.css';
import './MemoryJarWorld.css';

type Entry = MemoryWorldEntry;

/** How long the note after a refused shake stays. */
const DRAWN_NOTE_MS = 4200;
/** A finger that moves this far starts moving the jar. */
const JAR_SLOP = 4;

/* ---------- Jar geometry (one unit = 1 px of the 240 × 330 jar) ---------- */

const OUTER =
  'M62 56 L178 56 Q184 56 184 62 L184 74 Q184 80 190 84 C214 96 218 104 218 126 ' +
  'L218 282 C218 306 202 314 178 314 L62 314 C38 314 22 306 22 282 L22 126 ' +
  'C22 104 26 96 50 84 Q56 80 56 74 L56 62 Q56 56 62 56 Z';
const INNER =
  'M64 64 L176 64 L176 76 Q176 84 184 89 C206 100 210 108 210 128 L210 278 ' +
  'C210 296 198 300 176 300 L64 300 C42 300 30 296 30 278 L30 128 ' +
  'C30 108 34 100 56 89 Q64 84 64 76 Z';

const f1 = (value: number) => value.toFixed(1);

/** Bottom edge of the gingham skirt: hanging folds, pinked teeth, round jar. */
function hemY(x: number) {
  const u = (x - 120) / 88;
  return 103 + 6 * (1 - u * u) + 2.6 * Math.sin(x * 0.16);
}
/** Where the twine pulls the cloth together around the neck. */
function cinchY(x: number) {
  const t = (x - 58) / 124;
  return 79.5 + 21 * t * (1 - t);
}
/** Front edge of the cloth lying on top of the lid. */
function topFrontY(x: number) {
  const u = (x - 120) / 70;
  return 46 + 11 * Math.sqrt(Math.max(0, 1 - u * u));
}

const HEM = (() => {
  const points: string[] = [];
  const steps = 44;
  for (let index = 0; index <= steps; index += 1) {
    const x = 208 - (176 * index) / steps;
    const tooth = index % 2 === 0 ? 0 : 2.2;
    points.push(`${f1(x)} ${f1(hemY(x) + tooth)}`);
  }
  return points.join(' L');
})();

const CLOTH_BAND =
  'M50 46 L50 60 Q51 72 58 79.5 Q120 90 182 79.5 Q189 72 190 60 L190 46 A70 11 0 0 1 50 46 Z';
const CLOTH_SKIRT = `M58 79.5 Q120 90 182 79.5 C194 85 204 93 208 102 L${HEM} C36 93 46 85 58 79.5 Z`;

function wedge(
  xTop: number,
  yTop: number,
  xBottom: number,
  yBottom: number,
  half: number,
) {
  return `M${f1(xTop)} ${f1(yTop)} L${f1(xBottom - half)} ${f1(yBottom)} L${f1(xBottom + half)} ${f1(yBottom)} Z`;
}
const SKIRT_FOLDS = [46, 70, 94, 118, 142, 166, 190]
  .map((x) => {
    const top = 120 + (x - 120) * 0.66;
    return wedge(top, cinchY(top), x, hemY(x), 3.2);
  })
  .join(' ');
const SKIRT_LIGHTS = [58, 82, 106, 130, 154, 178]
  .map((x) => {
    const top = 120 + (x - 120) * 0.66;
    return wedge(top, cinchY(top), x, hemY(x), 2.2);
  })
  .join(' ');
const BAND_GATHERS = [60, 74, 90, 106, 122, 138, 154, 170, 184]
  .map((x) => {
    const bottom = 120 + (x - 120) * 0.95;
    return `M${f1(x - 2.4)} ${f1(topFrontY(x))} L${f1(x + 2.4)} ${f1(topFrontY(x))} L${f1(bottom)} ${f1(cinchY(bottom) - 0.5)} Z`;
  })
  .join(' ');

const SLIP_CLIP = { clipPath: `path("${INNER}")` } satisfies CSSProperties;

/* ---------- Types and helpers ---------- */

type Phase =
  | 'idle'
  | 'popping'
  | 'stage'
  | 'returning'
  | 'carrying'
  | 'dropping';
type StageStep = 'measure' | 'play' | 'closing';
type PaperState = 'folded' | 'unfolding' | 'open' | 'folding';

function vars(values: Record<string, string>): CSSProperties {
  return values as CSSProperties;
}

/** Keeps touches that start here from reaching the app's page swipes. */
function isolateTouches(el: HTMLElement) {
  const stop = (event: TouchEvent) => event.stopPropagation();
  el.addEventListener('touchstart', stop, { passive: true });
  el.addEventListener('touchmove', stop, { passive: true });
  return () => {
    el.removeEventListener('touchstart', stop);
    el.removeEventListener('touchmove', stop);
  };
}

/* ---------- The jar's artwork ---------- */

function GlassBack() {
  return (
    <svg
      className="memory-jar-art"
      viewBox="0 0 240 330"
      aria-hidden="true"
      focusable="false"
    >
      <path d={INNER} className="memory-jar-back" />
      <ellipse cx="120" cy="296" rx="86" ry="5" className="memory-jar-floor" />
      <path d="M184 134 Q189 200 185 266" className="memory-jar-back-glint" />
    </svg>
  );
}

function Emboss({
  href,
  text,
  size,
  spacing,
}: {
  href: string;
  text: string;
  size: number;
  spacing: number;
}) {
  const line = (className: string, shift?: string) => (
    <text
      className={className}
      transform={shift}
      textAnchor="middle"
      fontSize={size}
      letterSpacing={spacing}
    >
      <textPath href={href} startOffset="50%">
        {text}
      </textPath>
    </text>
  );
  return (
    <g className="memory-jar-emboss">
      {line('memory-jar-emboss-shade', 'translate(0.8 0.9)')}
      {line('memory-jar-emboss-light', 'translate(-0.6 -0.7)')}
      {line('memory-jar-emboss-body')}
    </g>
  );
}

function GlassFront({
  uid,
  emboss,
  since,
}: {
  uid: string;
  emboss: string;
  since: string;
}) {
  const id = (name: string) => `${uid}-${name}`;
  return (
    <svg
      className="memory-jar-art"
      viewBox="0 0 240 330"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={id('wall')} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" className="memory-jar-stop-edge" />
          <stop offset="0.12" className="memory-jar-stop-mid" />
          <stop offset="0.88" className="memory-jar-stop-mid" />
          <stop offset="1" className="memory-jar-stop-edge" />
        </linearGradient>
        {/* Seen through the curved front wall, the slips near the sides sink into the glass colour. */}
        <linearGradient id={id('front')} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" className="memory-jar-stop-edge" />
          <stop offset="0.16" className="memory-jar-stop-clear" />
          <stop offset="0.8" className="memory-jar-stop-clear" />
          <stop offset="1" className="memory-jar-stop-edge" />
        </linearGradient>
        <linearGradient id={id('glint')} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" className="memory-jar-stop-glint" stopOpacity="0" />
          <stop
            offset="0.16"
            className="memory-jar-stop-glint"
            stopOpacity="0.92"
          />
          <stop
            offset="0.7"
            className="memory-jar-stop-glint"
            stopOpacity="0.5"
          />
          <stop offset="1" className="memory-jar-stop-glint" stopOpacity="0" />
        </linearGradient>
        <clipPath id={id('outer')}>
          <path d={OUTER} />
        </clipPath>
        <path id={id('arc-a')} d="M56 266 Q120 281 184 266" />
        <path id={id('arc-b')} d="M86 288 Q120 296 154 288" />
      </defs>
      {/* Thick glass: the wall, the heavy base and the tint of the front. */}
      <path
        d={`${OUTER} ${INNER}`}
        fillRule="evenodd"
        fill={`url(#${id('wall')})`}
      />
      <path d={INNER} fill={`url(#${id('front')})`} />
      <g clipPath={`url(#${id('outer')})`}>
        <rect
          x="0"
          y="299"
          width="240"
          height="16"
          className="memory-jar-base"
        />
      </g>
      <path
        d="M36 300 Q120 313 204 300"
        className="memory-jar-hl memory-jar-hl-soft"
        strokeWidth="1.4"
      />
      <ellipse
        cx="120"
        cy="307.5"
        rx="62"
        ry="2.6"
        className="memory-jar-lens"
      />
      {/* Raised glass lettering. */}
      <Emboss href={`#${id('arc-a')}`} text={emboss} size={11.5} spacing={3} />
      <Emboss href={`#${id('arc-b')}`} text={since} size={10} spacing={2.4} />
      {/* Highlights: a long glint on the left, a reflected window, a soft line on the right. */}
      <path
        d="M39 140 Q36 210 41 280 Q44 288 47 279 Q43 210 46 140 Q43 131 39 140 Z"
        fill={`url(#${id('glint')})`}
      />
      <path
        d="M54 156 Q52 210 55 258"
        className="memory-jar-hl memory-jar-hl-soft"
        strokeWidth="1.6"
      />
      <path
        d="M36 122 Q42 106 60 96"
        className="memory-jar-hl"
        strokeWidth="2.6"
      />
      <path
        d="M45 111 L55 107.5 L56 124 L46 128 Z M58.5 106.4 L67 103.6 L68 120 L59.5 123.2 Z"
        className="memory-jar-pane"
      />
      <path
        d="M201 150 Q204 204 200 262"
        className="memory-jar-hl memory-jar-hl-soft"
        strokeWidth="3"
      />
      <path
        d="M206 140 Q209 150 209 166"
        className="memory-jar-hl memory-jar-hl-soft"
        strokeWidth="1.2"
      />
      {/* In candlelight, the flame is mirrored in the glass. */}
      <path
        d="M44 204 Q48.5 211 44 217 Q39.5 211 44 204 Z"
        className="memory-jar-flame-glint"
      />
      <path d={OUTER} className="memory-jar-outline" />
      <path d={INNER} className="memory-jar-inner-line" />
    </svg>
  );
}

function Gingham({ id, transform }: { id: string; transform: string }) {
  return (
    <pattern
      id={id}
      width="9"
      height="9"
      patternUnits="userSpaceOnUse"
      patternTransform={transform}
    >
      <rect width="9" height="9" className="memory-jar-ging-base" />
      <rect width="4.5" height="9" className="memory-jar-ging-stripe" />
      <rect width="9" height="4.5" className="memory-jar-ging-stripe" />
    </pattern>
  );
}

function LidArt({ uid }: { uid: string }) {
  const id = (name: string) => `${uid}-${name}`;
  return (
    <svg
      className="memory-jar-art memory-jar-lid-art"
      viewBox="0 0 240 330"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <Gingham id={id('ging')} transform="rotate(-3)" />
        {/* The top of the cover is seen from slightly above: its checks look flatter. */}
        <Gingham
          id={id('ging-top')}
          transform="translate(0 46) scale(1 0.42) rotate(-3)"
        />
        <linearGradient id={id('round')} x1="0" x2="1" y1="0" y2="0">
          <stop
            offset="0"
            className="memory-jar-stop-shade"
            stopOpacity="0.3"
          />
          <stop
            offset="0.18"
            className="memory-jar-stop-shade"
            stopOpacity="0.05"
          />
          <stop
            offset="0.36"
            className="memory-jar-stop-sheen"
            stopOpacity="0.16"
          />
          <stop
            offset="0.6"
            className="memory-jar-stop-sheen"
            stopOpacity="0"
          />
          <stop
            offset="1"
            className="memory-jar-stop-shade"
            stopOpacity="0.32"
          />
        </linearGradient>
        <radialGradient id={id('dome')} cx="0.38" cy="0.3" r="0.7">
          <stop
            offset="0"
            className="memory-jar-stop-sheen"
            stopOpacity="0.4"
          />
          <stop
            offset="0.6"
            className="memory-jar-stop-sheen"
            stopOpacity="0"
          />
          <stop
            offset="1"
            className="memory-jar-stop-shade"
            stopOpacity="0.16"
          />
        </radialGradient>
      </defs>
      {/* The cloth's shadow on the shoulder of the glass. */}
      <path d="M34 106 Q120 124 206 106" className="memory-jar-skirt-shadow" />
      {/* Gingham cover: band over the lid, the skirt below the twine, then the top. */}
      <path d={CLOTH_SKIRT} fill={`url(#${id('ging')})`} />
      <path d={CLOTH_BAND} fill={`url(#${id('ging')})`} />
      <path d={SKIRT_FOLDS} className="memory-jar-cloth-fold" />
      <path d={SKIRT_LIGHTS} className="memory-jar-cloth-light" />
      <path d={BAND_GATHERS} className="memory-jar-cloth-fold" />
      <path d={`${CLOTH_BAND} ${CLOTH_SKIRT}`} fill={`url(#${id('round')})`} />
      <ellipse
        cx="120"
        cy="46"
        rx="70"
        ry="11"
        fill={`url(#${id('ging-top')})`}
      />
      <ellipse cx="120" cy="46" rx="70" ry="11" fill={`url(#${id('dome')})`} />
      <path d="M50 46 A70 11 0 0 0 190 46" className="memory-jar-cloth-rim" />
      {/* Twine, wrapped twice and tied in a bow. */}
      <path d="M54 78.5 Q120 91 186 78.5" className="memory-jar-twine" />
      <path d="M54 78.5 Q120 91 186 78.5" className="memory-jar-twine-twist" />
      <path d="M55 82 Q120 94.5 185 82" className="memory-jar-twine" />
      <path d="M55 82 Q120 94.5 185 82" className="memory-jar-twine-twist" />
      <path
        d="M169 82 C158 70 147 73 151 81 C153 86 162 86 169 83.5"
        className="memory-jar-twine"
      />
      <path
        d="M171 82 C180 69 192 72 189 80 C187 86 178 86 171 83.5"
        className="memory-jar-twine"
      />
      <path
        d="M168.5 84.5 C165 92 161 98 158 106 M158 106 l-1.6 3 M158 106 l0.8 3.3 M171.5 84.5 C175 92 178 97 182 103 M182 103 l0.4 3.4 M182 103 l2 2.6"
        className="memory-jar-twine memory-jar-twine-thin"
      />
      <ellipse cx="170" cy="83" rx="3.4" ry="2.7" className="memory-jar-knot" />
    </svg>
  );
}

/* ---------- The slip as a sheet of paper ---------- */

/**
 * A slip of paper folded in thirds. Three panels lie over the real sheet,
 * each an exact, inert, full-size copy of it, clipped (statically) to its own
 * third with a 1 px overlap. Only the top and bottom panels rotate, so every
 * third keeps its picture and text while it turns. The real sheet stays
 * hidden while anything is folded and takes over only when all lie flat. The
 * copies stay mounted (behind the sheet when open), so their pictures are
 * decoded before the slip ever moves.
 */
function FoldedPaper({
  tone,
  state,
  style,
  innerRef,
  sheet,
  children,
}: {
  tone: SlipTone;
  state: PaperState;
  style?: CSSProperties;
  innerRef?: Ref<HTMLDivElement>;
  /** The sheet's content; `copy` for the inert panel copies. */
  sheet: (copy: boolean) => ReactNode;
  children?: ReactNode;
}) {
  const panel = (at: 'top' | 'middle' | 'bottom') => (
    <span className="memory-jar-panel" data-at={at} aria-hidden="true">
      <span className="memory-jar-face" data-face="front">
        <div className="memory-jar-sheet memory-jar-sheet-copy" inert>
          {sheet(true)}
        </div>
      </span>
      {at === 'middle' ? null : (
        <span className="memory-jar-face" data-face="back" />
      )}
    </span>
  );
  return (
    <div
      ref={innerRef}
      className="memory-jar-paper"
      data-tone={tone}
      data-state={state}
      style={style}
    >
      <span
        className="memory-jar-paper-shadow"
        data-part="middle"
        aria-hidden="true"
      />
      <span
        className="memory-jar-paper-shadow"
        data-part="full"
        aria-hidden="true"
      />
      <div className="memory-jar-sheet">{sheet(false)}</div>
      {panel('middle')}
      {panel('bottom')}
      {panel('top')}
      {children}
    </div>
  );
}

function SlipSheet({
  entry,
  drawnOn,
  kicker,
  openLabel,
  copy,
  loadMemoryImage,
  onOpen,
}: {
  entry: Entry;
  drawnOn: string;
  kicker: string;
  openLabel: string;
  copy: boolean;
  loadMemoryImage: LoadMemoryImage;
  onOpen: OpenMemoryWorldItem;
}) {
  // No develop effect: the photo must already be fully visible on the
  // panels while they fold (an animated filter would stutter).
  const keepsake = <Keepsake entry={entry} loadMemoryImage={loadMemoryImage} />;
  return (
    <div className="memory-jar-sheet-body">
      <p className="memory-jar-when">{drawnOn}</p>
      <p className="memory-jar-kicker">{kicker}</p>
      <div className="memory-jar-memory">
        {copy ? (
          <div className="memory-jar-memory-link" data-kind={entry.kind}>
            {keepsake}
          </div>
        ) : (
          <Link
            className="memory-jar-memory-link"
            data-kind={entry.kind}
            to={entry.path}
            onClick={(event) => onOpen(event, entry.path, entry.key)}
            aria-label={openLabel}
            draggable={false}
          >
            {keepsake}
          </Link>
        )}
      </div>
    </div>
  );
}

/** A kraft tab held to the slip with a paper clip: opens the memory. */
function DiaryTab({
  entry,
  onOpen,
  label,
  text,
}: {
  entry: Entry;
  onOpen: OpenMemoryWorldItem;
  label: string;
  text: string;
}) {
  return (
    <Link
      className="memory-jar-attach memory-jar-diary-tab"
      data-attach="diary"
      to={entry.path}
      onClick={(event) => onOpen(event, entry.path, entry.key)}
      aria-label={label}
      draggable={false}
    >
      <svg
        className="memory-jar-clip"
        viewBox="0 0 16 40"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M5 37 V8 a3.5 3.5 0 0 1 7 0 V31 a2 2 0 0 1 -4 0 V11" />
      </svg>
      <span className="memory-jar-diary-tab-paper">{text}</span>
    </Link>
  );
}

/** The pointer handlers of the slip's tag, which the slip follows up. */
type GripHandlers = Required<
  Pick<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'
  >
>;

/** A kraft tag tied to the top of the slip: pull it up (or press it) to put the slip back. */
function BackTag({
  label,
  text,
  onClick,
  grip,
}: {
  label: string;
  text: string;
  onClick: () => void;
  grip?: GripHandlers;
}) {
  const isolate = useCallback(
    (el: HTMLButtonElement | null) => (el ? isolateTouches(el) : undefined),
    [],
  );
  return (
    <button
      ref={isolate}
      type="button"
      className="memory-jar-attach memory-jar-back-tag"
      data-attach="back"
      data-primary-tab-swipe-block
      data-pull-to-refresh-block="true"
      aria-label={label}
      onClick={onClick}
      {...grip}
    >
      <span className="memory-jar-back-tag-paper">
        <svg
          className="memory-jar-back-arrow"
          viewBox="0 0 14 18"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M7.2 16.5 C6.6 12 7.4 7 7 2.8 M2.6 7.4 C4.4 5.6 5.6 4.2 7 2.6 C8.4 4.3 9.8 5.6 11.6 7.2" />
        </svg>
        <span>{text}</span>
      </span>
    </button>
  );
}

/* ---------- The world ---------- */

export function MemoryJarWorld({
  entries,
  loadMemoryImage,
  onOpen,
}: MemoryWorldProps) {
  const { t } = useTranslation();
  const locale = resolvedLocale();
  const uid = `mj${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const hintId = `${uid}-hint`;
  const [drawnKey, setDrawnKey] = useState<string | null>(() =>
    readTodayDraw(),
  );
  // One slip a day: also after the slip is back in the jar (PO 2026-11-25).
  const [drawnToday, setDrawnToday] = useState(() => hasDrawnToday());
  const [phase, setPhaseState] = useState<Phase>('idle');
  const [stageStep, setStageStep] = useState<StageStep>('measure');
  const [stageUnfolded, setStageUnfolded] = useState(false);
  const [flight, setFlight] = useState<CSSProperties | undefined>(undefined);
  const [fly, setFly] = useState<JarSlip | null>(null);
  const [returningKey, setReturningKey] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [drawnNote, setDrawnNote] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const jarRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const shadowRef = useRef<HTMLSpanElement | null>(null);
  const groupRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const lidLooseRef = useRef<HTMLDivElement | null>(null);
  const tagHangRef = useRef<HTMLSpanElement | null>(null);
  const tagRef = useRef<HTMLButtonElement | null>(null);
  const flyingRef = useRef<HTMLSpanElement | null>(null);
  const drawnRefEl = useRef<HTMLDivElement | null>(null);
  const pagePaperRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const stagePaperRef = useRef<HTMLDivElement | null>(null);
  const stageColumnRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const phaseRef = useRef<Phase>('idle');
  const drawnRef = useRef<Entry | null>(null);
  const lastKeyRef = useRef<string | null>(null);
  const returningKeyRef = useRef<string | null>(null);
  const closingRef = useRef(false);
  const revealRef = useRef(false);
  const tagBusyRef = useRef(false);
  const focusTagRef = useRef(false);
  const visibleRef = useRef(true);
  const startRef = useRef<JarFlightStart | null>(null);
  const suppressClick = useRef(false);
  const gripSuppress = useRef(false);
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    active: boolean;
  } | null>(null);
  const reversal = useRef(newReversalTrack(0));
  const series = useRef(newRattleSeries());
  const timers = useRef<number[]>([]);
  const relaxTimer = useRef<number | undefined>(undefined);
  const noteTimer = useRef<number | undefined>(undefined);
  const driverRef = useRef<JarDriver | null>(null);
  const fold = useRef<{
    track: FoldTrack | null;
    cancel: () => void;
    drag: { id: number; x: number; y: number; active: boolean } | null;
    bottomTick: boolean;
    topTick: boolean;
  }>({
    track: null,
    cancel: () => undefined,
    drag: null,
    bottomTick: false,
    topTick: false,
  });
  const popRef = useRef<() => void>(() => undefined);
  const shakeRef = useRef<() => void>(() => undefined);
  const openStageRef = useRef<() => void>(() => undefined);
  const closeStageRef = useRef<() => void>(() => undefined);

  const drawn = entries.find((entry) => entry.key === drawnKey) ?? null;
  const slips = useMemo(() => buildSlips(entries), [entries]);
  const year = useMemo(() => {
    if (entries.length === 0) return new Date().getFullYear();
    return Math.min(...entries.map((entry) => entry.date.getFullYear()));
  }, [entries]);
  const realCount = Math.min(entries.length, SLIP_REAL_MAX);
  const today = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(new Date()),
    [locale],
  );
  const drawnOn = t('memoryWorlds.jar.drawnOn', { date: today });
  const kicker = t('memoryWorlds.jar.kicker');
  const sheetFor = (entry: Entry) => (copy: boolean) => (
    <SlipSheet
      entry={entry}
      drawnOn={drawnOn}
      kicker={kicker}
      openLabel={t('memoryWorlds.jar.open', {
        title: entry.title,
        date: entry.dateLabel,
      })}
      copy={copy}
      loadMemoryImage={loadMemoryImage}
      onOpen={onOpen}
    />
  );

  useLayoutEffect(() => {
    drawnRef.current = drawn;
  });

  const later = useCallback((run: () => void, ms: number) => {
    const handle = window.setTimeout(() => {
      timers.current = timers.current.filter((item) => item !== handle);
      run();
    }, ms);
    timers.current.push(handle);
  }, []);

  const goPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  /** The jar's frame loop, created once. */
  const driver = useCallback((): JarDriver => {
    if (!driverRef.current)
      driverRef.current = createJarDriver(
        () => ({
          jar: jarRef.current,
          body: bodyRef.current,
          shadow: shadowRef.current,
          groups: groupRefs.current,
          lid: lidLooseRef.current,
          tag: tagHangRef.current,
        }),
        // Visual only: the slips hop, and the lid clinks while it is on.
        (intensity) =>
          driverRef.current?.clink(intensity, phaseRef.current === 'idle'),
      );
    return driverRef.current;
  }, []);

  useEffect(
    () => () => {
      for (const handle of timers.current) window.clearTimeout(handle);
      window.clearTimeout(relaxTimer.current);
      window.clearTimeout(noteTimer.current);
      driverRef.current?.stop();
      fold.current.cancel();
    },
    [],
  );

  // The candle's flicker pauses while the jar is not seen (M8); a shaken
  // phone only counts while the jar is seen.
  const hasEntries = entries.length > 0;
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !hasEntries) return;
    return observeVisibility(root, (state) => {
      visibleRef.current = state.visible;
      root.dataset.ambient = state.visible ? 'on' : 'paused';
    });
  }, [hasEntries]);

  // The jar keeps its touches: no page swipe, no pull-to-refresh starts on it.
  const jarCallbackRef = useCallback((el: HTMLDivElement | null) => {
    jarRef.current = el;
    if (!el) return undefined;
    const release = isolateTouches(el);
    return () => {
      release();
      jarRef.current = null;
    };
  }, []);

  // Keyboard focus comes back to the jar's tag after the stage or a return.
  useEffect(() => {
    if (focusRequest === 0 || phase !== 'idle' || !focusTagRef.current) return;
    focusTagRef.current = false;
    tagRef.current?.focus({ preventScroll: true });
  }, [phase, focusRequest]);

  const requestTagFocus = () => {
    focusTagRef.current = true;
    setFocusRequest((count) => count + 1);
  };

  /** Whether the keyboard focus is in the world or its stage (or was lost). */
  const focusInside = () => {
    const active = document.activeElement;
    return (
      !active ||
      active === document.body ||
      !!rootRef.current?.contains(active) ||
      !!stageRef.current?.contains(active)
    );
  };

  /* ----- Today's draw ----- */

  /** After today's draw a shake only rattles: say so clearly. */
  const showDrawnNote = () => {
    setDrawnNote(true);
    setAnnouncement(t('memoryWorlds.jar.drawnNote'));
    window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(
      () => setDrawnNote(false),
      DRAWN_NOTE_MS,
    );
  };

  const refuse = () => {
    haptic('refuse');
    showDrawnNote();
  };

  const commitDraw = (pick: Entry) => {
    drawnRef.current = pick;
    setDrawnKey(pick.key);
    setDrawnToday(true);
    rememberDraw(pick.key);
  };

  /** Today's slip is out, or was drawn and put back: no new draw today. */
  const alreadyDrawn = () => drawnRef.current !== null || hasDrawnToday();

  /** Reduced motion: the slip is simply there. */
  const drawNow = () => {
    const pick = pickNextSlip(entries, lastKeyRef.current);
    if (!pick) return;
    commitDraw(pick);
    haptic('commit');
    revealRef.current = true;
    setAnnouncement(
      t('memoryWorlds.jar.announce.drawn', { title: pick.title }),
    );
  };

  /* ----- Counting the shake (independent of the visual physics) ----- */

  /**
   * One counted rattle: a turn of the finger, a tap. The jar opens after
   * `RATTLES_TO_OPEN` of them, or after a while of continuous shaking.
   * After today's draw the jar still rattles, then refuses gently.
   */
  const countRattle = (intensity: number, gap: number) => {
    if (phaseRef.current !== 'idle') return;
    const s = series.current;
    const enough = addRattle(s, performance.now(), gap);
    haptic('threshold');
    const jar = driver();
    jar.clink(intensity, true);
    jar.kick();
    window.clearTimeout(relaxTimer.current);
    if (!alreadyDrawn()) {
      jar.loosen(Math.min(1, s.count / RATTLES_TO_OPEN));
      if (enough) {
        popRef.current();
        return;
      }
    } else if (enough && !s.refused) {
      s.refused = true;
      later(() => haptic('refuse'), JAR_TIMING.refuseDelay);
      showDrawnNote();
    }
    relaxTimer.current = window.setTimeout(() => {
      series.current.count = 0;
      driver().loosen(0);
    }, JAR_TIMING.relax);
  };

  const releaseGesture = () => {
    const g = gesture.current;
    gesture.current = null;
    if (g?.active) {
      try {
        jarRef.current?.releasePointerCapture(g.id);
      } catch {
        // The capture may already be gone.
      }
      later(() => {
        suppressClick.current = false;
      }, JAR_TIMING.clickReset);
    }
    driverRef.current?.release();
  };

  /* ----- Drawing ----- */

  const openStage = () => {
    const rect = flyingRef.current?.getBoundingClientRect();
    const slip = fly ?? FALLBACK_SLIP;
    startRef.current =
      rect && rect.width > 0
        ? {
            cx: rect.left + rect.width / 2,
            cy: rect.top + rect.height / 2,
            w: slip.w * 1.2,
          }
        : null;
    closingRef.current = false;
    setStageUnfolded(false);
    setStageStep('measure');
    goPhase('stage');
    const current = drawnRef.current;
    if (current)
      setAnnouncement(
        t('memoryWorlds.jar.announce.drawn', { title: current.title }),
      );
  };

  /** The lid pops and one slip jumps out of the jar. */
  const pop = () => {
    if (phaseRef.current !== 'idle' || alreadyDrawn()) return;
    const pick = pickNextSlip(entries, lastKeyRef.current);
    if (!pick) return;
    releaseGesture();
    driver().calm();
    series.current.count = 0;
    tagBusyRef.current = false;
    window.clearTimeout(relaxTimer.current);
    setFly(slips.find((slip) => slip.key === pick.key) ?? FALLBACK_SLIP);
    commitDraw(pick);
    goPhase('popping');
    later(() => haptic('commit'), JAR_TIMING.popHaptic);
    later(() => openStageRef.current(), JAR_TIMING.popToStage);
  };

  /** The jar can always be shaken while it stands still, also after today's draw. */
  const shakeable = phase === 'idle';

  /** A tap is one gentle shake, and counts as one rattle. */
  const tapShake = () => {
    if (phaseRef.current !== 'idle') return;
    if (prefersReducedMotion()) {
      if (alreadyDrawn()) refuse();
      else drawNow();
      return;
    }
    const jar = driver();
    if (jar.busy()) return;
    jar.shake(JAR_SHAKES.tap);
    countRattle(0.6, TAP_GAP_MS);
  };

  /**
   * The tag or a shaken phone: a good shake by itself, then the lid opens for
   * sure; after today's draw it only rattles and refuses gently.
   */
  const shakeHard = (press: boolean) => {
    if (phaseRef.current !== 'idle' || tagBusyRef.current) return;
    const already = alreadyDrawn();
    if (prefersReducedMotion()) {
      if (already) refuse();
      else drawNow();
      return;
    }
    tagBusyRef.current = true;
    if (press) haptic('press');
    driver().shake(JAR_SHAKES.hard);
    later(() => {
      tagBusyRef.current = false;
      if (already) refuse();
      else popRef.current();
    }, JAR_TIMING.hardShake);
  };

  useLayoutEffect(() => {
    popRef.current = pop;
    shakeRef.current = () => shakeHard(false);
    openStageRef.current = openStage;
    closeStageRef.current = () => {
      closeStage();
    };
  });

  const onTagClick = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    shakeHard(true);
  };

  /* ----- Gesture on the jar: the count comes from the finger itself ----- */

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      event.button !== 0 ||
      phaseRef.current !== 'idle' ||
      prefersReducedMotion()
    )
      return;
    // No preventDefault: taps must still reach the tag and the jar.
    gesture.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      active: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    if (!g.active) {
      if (Math.abs(dx) <= JAR_SLOP && Math.abs(dy) <= JAR_SLOP) return;
      // A mostly vertical move scrolls the page.
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) * 2) {
        gesture.current = null;
        return;
      }
      g.active = true;
      suppressClick.current = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Capture is a nicety; the gesture still works without it.
      }
      reversal.current = newReversalTrack(event.clientX);
    }
    driver().hold(jarFollow(dx));
    const travel = trackReversal(reversal.current, event.clientX);
    if (travel !== null)
      countRattle(Math.min(1, Math.max(0.3, travel / 80)), SERIES_GAP_MS);
  };

  // pointercancel only ends this drag: the rattle count goes on if the next
  // touch follows quickly.
  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    releaseGesture();
  };

  /* ----- Shaking the phone ----- */

  // Android WebView: acceleration including gravity, minus a slowly tracked
  // gravity estimate (`createShakeDetector`). Listens while the jar is on the
  // page; a shake counts only while the jar is seen and idle (also after
  // today's draw, then it only rattles; with reduced motion it draws at
  // once). iOS (permission prompt) is skipped.
  useEffect(() => {
    if (!hasEntries || typeof window.DeviceMotionEvent === 'undefined') return;
    const ctor = window.DeviceMotionEvent as unknown as {
      requestPermission?: unknown;
    };
    if (typeof ctor.requestPermission === 'function') return;
    const detect = createShakeDetector();
    const onMotion = (event: DeviceMotionEvent) => {
      const a = event.accelerationIncludingGravity;
      if (!a || a.x === null || a.y === null || a.z === null) return;
      const reading = detect({ x: a.x, y: a.y, z: a.z }, performance.now());
      if (!reading || !visibleRef.current) return;
      // The slips follow the phone's sideways movement right away.
      if (
        Math.abs(reading.lateral) > SHAKE_FOLLOW &&
        phaseRef.current === 'idle' &&
        !prefersReducedMotion()
      )
        driverRef.current?.push(reading.lateral);
      if (reading.shake) shakeRef.current();
    };
    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [hasEntries]);

  /* ----- The stage ----- */

  useLayoutEffect(() => {
    if (phase !== 'stage' || stageStep !== 'measure') return;
    const rect = stagePaperRef.current?.getBoundingClientRect() ?? null;
    setFlight(
      vars(stageFlightVars(rect, startRef.current, window.innerHeight)),
    );
    setStageStep('play');
    closeButtonRef.current?.focus({ preventScroll: true });
    later(() => {
      if (phaseRef.current === 'stage' && !closingRef.current)
        haptic('threshold');
    }, JAR_TIMING.stageTopLand);
    later(() => {
      if (phaseRef.current === 'stage' && !closingRef.current) haptic('moment');
    }, JAR_TIMING.stageBottomLand);
    // One state change once both flaps lie flat: the real sheet takes over.
    later(() => {
      if (phaseRef.current === 'stage') setStageUnfolded(true);
    }, JAR_TIMING.stageUnfolded);
  }, [phase, stageStep, later]);

  const revealPageSheet = useCallback(() => {
    const el = drawnRefEl.current;
    if (!el || typeof el.scrollIntoView !== 'function') return;
    const rect = el.getBoundingClientRect();
    if (rect.top > 0 && rect.bottom > window.innerHeight - 24)
      el.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start',
      });
  }, []);

  const closeStage = (reveal = true) => {
    if (phaseRef.current !== 'stage' || closingRef.current) return false;
    closingRef.current = true;
    if (focusInside()) requestTagFocus();
    setStageStep('closing');
    // The page's slip appears only now; bring it into view once the jar has shrunk.
    if (reveal) later(revealPageSheet, JAR_TIMING.revealPage);
    later(() => goPhase('idle'), JAR_TIMING.stageClose);
    return true;
  };

  // The stage is a dialog: Escape lays the slip down.
  useEffect(() => {
    if (phase !== 'stage') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeStageRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  /** Keeps the keyboard focus inside the stage. */
  const onStageKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const focusables = [
      ...(stageRef.current?.querySelectorAll<HTMLElement>('a[href], button') ??
        []),
    ].filter((el) => !el.closest('[inert]'));
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

  // Reduced motion: the drawn slip appears in the page; bring it into view.
  useEffect(() => {
    if (!revealRef.current || !drawn || phase !== 'idle') return;
    revealRef.current = false;
    revealPageSheet();
  }, [drawn, phase, revealPageSheet]);

  /* ----- Putting the slip back: it folds as it goes up into the jar ----- */

  const foldParts = (): FoldParts | null => {
    const paper = pagePaperRef.current;
    if (!paper) return null;
    const pick = (selector: string) =>
      paper.querySelector<HTMLElement>(selector);
    return {
      paper,
      top: pick('.memory-jar-panel[data-at="top"]'),
      bottom: pick('.memory-jar-panel[data-at="bottom"]'),
      diary: pick('[data-attach="diary"]'),
      back: pick('[data-attach="back"]'),
    };
  };

  /** Paints the fold, with a tick as each flap lands. */
  const applyFold = (p: number, carry: number) => {
    const parts = foldParts();
    const f = fold.current;
    if (!parts || !f.track) return;
    const flaps = foldFlaps(p);
    if (flaps.bottom >= 0.995 && !f.bottomTick) {
      f.bottomTick = true;
      haptic('threshold');
    } else if (flaps.bottom < 0.9) f.bottomTick = false;
    if (flaps.top >= 0.995 && !f.topTick) {
      f.topTick = true;
      haptic('threshold');
    } else if (flaps.top < 0.9) f.topTick = false;
    paintFold(parts, f.track, p, carry);
  };

  const tween = (
    ms: number,
    onFrame: (t: number) => void,
    onDone: () => void,
  ) => {
    fold.current.cancel();
    fold.current.cancel = runJarTween(ms, onFrame, () => {
      fold.current.cancel = () => undefined;
      onDone();
    });
  };

  /** Measures the way from the slip to the jar's mouth, before anything moves. */
  const startFold = () => {
    const paper = pagePaperRef.current?.getBoundingClientRect();
    const jar = jarRef.current?.getBoundingClientRect();
    const track = paper && jar ? measureFold(paper, jar) : null;
    if (!track) return false;
    const f = fold.current;
    f.track = track;
    f.bottomTick = false;
    f.topTick = false;
    return true;
  };

  const finishReturn = (key: string) => {
    if (focusInside()) requestTagFocus();
    lastKeyRef.current = key;
    returningKeyRef.current = null;
    drawnRef.current = null;
    fold.current.track = null;
    setDrawnKey(null);
    rememberReturn(key);
    setReturningKey(null);
    goPhase('idle');
    setAnnouncement(t('memoryWorlds.jar.announce.back'));
  };

  const beginReturn = (key: string) => {
    returningKeyRef.current = key;
    setReturningKey(key);
    goPhase('returning');
  };

  /** The folded slip flies into the jar's mouth; the lid lifts and closes again. */
  const carryToJar = () => {
    const key = returningKeyRef.current;
    goPhase('carrying');
    tween(
      JAR_TIMING.carry,
      (t) => applyFold(1, t),
      () => {
        goPhase('dropping');
        later(() => haptic('commit'), JAR_TIMING.dropLand);
        later(() => {
          if (key) finishReturn(key);
        }, JAR_TIMING.dropDone);
      },
    );
  };

  const foldOnFrom = (from: number) => {
    const f = fold.current;
    tween(
      JAR_TIMING.fold * (1 - from),
      (t) => {
        if (f.track) f.track.p = from + (1 - from) * jarEaseInOut(t);
        applyFold(f.track?.p ?? 1, 0);
      },
      carryToJar,
    );
  };

  const springBack = () => {
    const f = fold.current;
    const fromP = f.track?.p ?? 0;
    const fromY = f.track?.dragY ?? 0;
    tween(
      JAR_TIMING.springBack,
      (t) => {
        const e = 1 - (1 - t) ** 3;
        if (f.track) {
          f.track.p = fromP * (1 - e);
          f.track.dragY = fromY * (1 - e);
        }
        applyFold(f.track?.p ?? 0, 0);
      },
      () => {
        const parts = foldParts();
        if (parts) clearFold(parts);
        f.track = null;
        returningKeyRef.current = null;
        setReturningKey(null);
        goPhase('idle');
      },
    );
  };

  /** A press on the slip's tag (or from the stage): it folds and goes back by itself. */
  const startPutBack = () => {
    const current = drawnRef.current;
    if (phaseRef.current !== 'idle' || !current) return;
    if (prefersReducedMotion() || !startFold()) {
      haptic('commit');
      finishReturn(current.key);
      return;
    }
    beginReturn(current.key);
    foldOnFrom(0);
  };

  const returnFromStage = () => {
    if (closeStage(false)) later(startPutBack, JAR_TIMING.stageToReturn);
  };

  const grip: GripHandlers = {
    onPointerDown: (event) => {
      if (
        event.button !== 0 ||
        phaseRef.current !== 'idle' ||
        prefersReducedMotion()
      )
        return;
      fold.current.drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        active: false,
      };
    },
    onPointerMove: (event) => {
      const f = fold.current;
      const d = f.drag;
      if (!d || d.id !== event.pointerId) return;
      const dy = event.clientY - d.y;
      if (!d.active) {
        if (Math.hypot(event.clientX - d.x, dy) < FOLD_SLOP) return;
        const current = drawnRef.current;
        if (!current || phaseRef.current !== 'idle' || !startFold()) {
          f.drag = null;
          return;
        }
        d.active = true;
        gripSuppress.current = true;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Capture is a nicety; the gesture still works without it.
        }
        beginReturn(current.key);
      }
      if (!f.track) return;
      dragFold(f.track, dy);
      applyFold(f.track.p, 0);
    },
    onPointerUp: (event) => endGrip(event, false),
    onPointerCancel: (event) => endGrip(event, true),
  };

  function endGrip(
    event: ReactPointerEvent<HTMLButtonElement>,
    cancel: boolean,
  ) {
    const f = fold.current;
    const d = f.drag;
    if (!d || d.id !== event.pointerId) return;
    f.drag = null;
    if (!d.active) return;
    later(() => {
      gripSuppress.current = false;
    }, JAR_TIMING.clickReset);
    if (!cancel && (f.track?.p ?? 0) >= FOLD_COMMIT)
      foldOnFrom(f.track?.p ?? 0);
    else springBack();
  }

  const onGripClick = () => {
    if (gripSuppress.current) {
      gripSuppress.current = false;
      return;
    }
    startPutBack();
  };

  /* ----- Render ----- */

  const stageClosing = phase === 'stage' && stageStep === 'closing';
  const inPage =
    phase === 'idle' ||
    phase === 'returning' ||
    phase === 'carrying' ||
    stageClosing;
  const small = !!drawn && (inPage || phase === 'dropping');

  // The jar shrinks (and grows back) in place: its layout changes at once,
  // the shown size follows (transform only, `data-resize`).
  const smallSeen = useRef(small);
  const resize = useRef<'shrink' | 'grow' | undefined>(undefined);
  if (smallSeen.current !== small) {
    smallSeen.current = small;
    resize.current = small ? 'shrink' : 'grow';
  }

  if (entries.length === 0) return null;

  const hiddenKey = phase === 'dropping' ? null : (drawn?.key ?? null);
  const showPageSheet = !!drawn && inPage;
  const folding = phase === 'returning' || phase === 'carrying';

  const flyStyle = fly
    ? {
        left: `${fly.left}px`,
        top: `${fly.top}px`,
        width: `${fly.w}px`,
        height: `${fly.h}px`,
        ...vars(jumpVars(fly)),
      }
    : undefined;

  const diaryLabel = (entry: Entry) =>
    t('memoryWorlds.jar.diaryNamed', { title: entry.title });

  const stage =
    drawn && phase === 'stage'
      ? createPortal(
          <div
            ref={stageRef}
            className="memory-jar-stage"
            data-step={stageStep}
            role="dialog"
            aria-modal="true"
            aria-label={t('memoryWorlds.jar.stage')}
            onKeyDown={onStageKeyDown}
          >
            <div className="memory-jar-scrim" aria-hidden="true" />
            {/* A tap beside the slip lays it down; the close button and Escape offer the same. */}
            {/* biome-ignore lint/a11y/noStaticElementInteractions: a pointer shortcut only. */}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: the close button and Escape are the keyboard way. */}
            <div
              className="memory-jar-stage-scroll"
              onClick={(event) => {
                if (
                  event.target === event.currentTarget ||
                  event.target === stageColumnRef.current
                )
                  closeStage();
              }}
            >
              <div ref={stageColumnRef} className="memory-jar-stage-column">
                <button
                  ref={closeButtonRef}
                  type="button"
                  className="memory-jar-stage-close"
                  onClick={() => closeStage()}
                >
                  {t('memoryWorlds.jar.putDown')}
                </button>
                <FoldedPaper
                  innerRef={stagePaperRef}
                  tone={drawn.kind}
                  state={
                    stageStep === 'measure'
                      ? 'folded'
                      : stageUnfolded
                        ? 'open'
                        : 'unfolding'
                  }
                  style={flight}
                  sheet={sheetFor(drawn)}
                >
                  <BackTag
                    label={t('memoryWorlds.jar.backLabel')}
                    text={t('memoryWorlds.jar.back')}
                    onClick={returnFromStage}
                  />
                  <DiaryTab
                    entry={drawn}
                    onOpen={onOpen}
                    label={diaryLabel(drawn)}
                    text={t('memoryWorlds.jar.diary')}
                  />
                </FoldedPaper>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  const tagLines = drawnToday
    ? [t('memoryWorlds.jar.tag.drawn'), t('memoryWorlds.jar.tag.tomorrow')]
    : [t('memoryWorlds.jar.tag.shake'), t('memoryWorlds.jar.tag.me')];

  return (
    <div
      ref={rootRef}
      className="memory-jar-world"
      data-phase={phase}
      data-drawn={drawn ? 'true' : undefined}
    >
      <div className="memory-world-head">
        <h2>{t('memoryWorlds.jar.heading')}</h2>
      </div>
      <div
        className="memory-jar-scene"
        data-small={small ? 'true' : undefined}
        data-resize={resize.current}
        data-primary-tab-swipe-block
      >
        <span className="memory-jar-candle" aria-hidden="true">
          <span className="memory-jar-candle-flame" />
        </span>
        {/* biome-ignore lint/a11y/useSemanticElements: the jar is one object, not a form fieldset. */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: the tag is the jar's keyboard control. */}
        <div
          ref={jarCallbackRef}
          className="memory-jar-jar"
          role="group"
          aria-label={t('memoryWorlds.jar.label', { count: realCount })}
          aria-describedby={hintId}
          data-primary-tab-swipe-block
          data-pull-to-refresh-block="true"
          data-shakeable={shakeable ? 'true' : undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onClickCapture={(event) => {
            if (!suppressClick.current) return;
            suppressClick.current = false;
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={tapShake}
        >
          <span
            ref={shadowRef}
            className="memory-jar-shadow"
            aria-hidden="true"
          />
          <div ref={bodyRef} className="memory-jar-body">
            <GlassBack />
            <div
              className="memory-jar-slips"
              aria-hidden="true"
              style={SLIP_CLIP}
            >
              {[0, 1, 2].map((group) => (
                <div
                  key={group}
                  ref={(el) => {
                    groupRefs.current[group] = el;
                  }}
                  className="memory-jar-group"
                >
                  {slips
                    .filter(
                      (slip) => slip.group === group && slip.key !== hiddenKey,
                    )
                    .map((slip) => {
                      const dropping =
                        phase === 'dropping' && slip.key === returningKey;
                      return (
                        <span
                          key={slip.key}
                          className="memory-jar-slip"
                          data-tone={slip.tone}
                          data-drop={dropping ? 'true' : undefined}
                          style={vars({
                            left: `${slip.left}px`,
                            top: `${slip.top}px`,
                            '--memory-jar-r': `${slip.rot}deg`,
                            ...(dropping
                              ? { '--memory-jar-drop': `${60 - slip.top}px` }
                              : {}),
                          })}
                        >
                          <span
                            className="memory-jar-slip-paper"
                            style={{
                              width: `${slip.w}px`,
                              height: `${slip.h}px`,
                            }}
                          />
                        </span>
                      );
                    })}
                </div>
              ))}
            </div>
            {phase === 'popping' && fly ? (
              <span
                ref={flyingRef}
                className="memory-jar-flying"
                data-tone={drawn?.kind ?? fly.tone}
                style={flyStyle}
                aria-hidden="true"
              >
                <span className="memory-jar-slip-paper" />
              </span>
            ) : null}
            <GlassFront
              uid={uid}
              emboss={t('memoryWorlds.jar.emboss')}
              since={t('memoryWorlds.jar.since', { year })}
            />
            <span className="memory-jar-label" aria-hidden="true">
              <span className="memory-jar-label-paper">
                <span className="memory-jar-label-small">
                  {t('memoryWorlds.jar.labelSmall')}
                </span>
                <span className="memory-jar-label-big">
                  {t('memoryWorlds.jar.labelBig')}
                </span>
                <svg viewBox="0 0 96 12" aria-hidden="true" focusable="false">
                  <path d="M3 7 C20 3 44 10 70 5" />
                  <path d="M81 5.5 C79.5 2.5 75 3.6 77 7.4 L81 10.6 L85 7.4 C87 3.6 82.5 2.5 81 5.5 Z" />
                </svg>
              </span>
            </span>
            <div className="memory-jar-lid">
              <div ref={lidLooseRef} className="memory-jar-lid-loose">
                <LidArt uid={uid} />
                <span ref={tagHangRef} className="memory-jar-tag-hang">
                  <button
                    ref={tagRef}
                    type="button"
                    className="memory-jar-tag"
                    data-today={drawnToday ? 'drawn' : undefined}
                    aria-disabled={shakeable ? undefined : 'true'}
                    aria-label={
                      drawnToday
                        ? t('memoryWorlds.jar.tag.drawnLabel')
                        : t('memoryWorlds.jar.tag.drawLabel')
                    }
                    onClick={onTagClick}
                  >
                    <span className="memory-jar-tag-paper" aria-hidden="true">
                      <span>{tagLines[0]}</span> <span>{tagLines[1]}</span>
                    </span>
                  </button>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <span id={hintId} className="sr-only">
        {t('memoryWorlds.jar.hint')}
      </span>
      {showPageSheet && drawn ? (
        <div ref={drawnRefEl} className="memory-jar-drawn" key={drawn.key}>
          <div className="memory-jar-drawn-tilt">
            <FoldedPaper
              innerRef={pagePaperRef}
              tone={drawn.kind}
              state={folding ? 'folding' : 'open'}
              sheet={sheetFor(drawn)}
            >
              <BackTag
                label={t('memoryWorlds.jar.backLabel')}
                text={t('memoryWorlds.jar.back')}
                onClick={onGripClick}
                grip={grip}
              />
              <DiaryTab
                entry={drawn}
                onOpen={onOpen}
                label={diaryLabel(drawn)}
                text={t('memoryWorlds.jar.diary')}
              />
            </FoldedPaper>
          </div>
        </div>
      ) : null}
      {/* While the slip jumps out, its picture is already loaded and decoded
          (invisibly), so the stage's panels show it from their first frame. */}
      {drawn && (phase === 'popping' || phase === 'stage') ? (
        <div className="memory-jar-preload" aria-hidden="true" inert>
          <div className="memory-jar-sheet">{sheetFor(drawn)(true)}</div>
        </div>
      ) : null}
      {drawnNote ? (
        <p className="memory-jar-note" aria-hidden="true">
          {t('memoryWorlds.jar.drawnNote')}
        </p>
      ) : null}
      <p className="sr-only" role="status">
        {announcement}
      </p>
      {stage}
    </div>
  );
}
