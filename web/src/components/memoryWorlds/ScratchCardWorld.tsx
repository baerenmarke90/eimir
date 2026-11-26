/**
 * Rubbellos (#2283): a vintage lucky ticket from a little enamel roll
 * dispenser. The couple scratches a gold foil heart free with the finger to
 * find a memory from their diary (foil crumbs fall, a light tick every few
 * centimetres); past 55 % the rest dissolves and the memory opens in the
 * diary. Three silver coins beside the heart are scratched as well: three
 * equal symbols bring an extra memory (the bonus). The won ticket is torn
 * off the roll sideways along its perforation, and the next one slides out
 * of the dispenser.
 *
 * Gesture (Motion Contract 4.6): once won, the ticket follows the finger
 * sideways (`--memory-scratch-tear`, written once per frame) and tears off
 * past a quarter of its width or with a fling; otherwise it springs back.
 * A clearly vertical drag is left to the page. Scratching itself is pointer
 * input on the foils (`ScratchFoil.tsx`) and never reaches the tear.
 *
 * Keyboard and screen readers: the foils and coins are decorative. The
 * visible "Freirubbeln" button reveals the heart and the coins at once and
 * then tears off the ticket ("Nächstes Los abreißen"); the revealed memory
 * and the bonus memory are links; a live region announces the win and every
 * new ticket. With reduced motion the scratching still follows the finger
 * (direct manipulation), but nothing celebrates, flies or slides: the next
 * ticket is there at once and no crumbs fall.
 *
 * Flight and dust: `src/motion/scratchCard.ts`; keyframes and timing roles:
 * `src/motion/memory-worlds.css`.
 */
import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { useContainerUnits } from '../../client/containerUnits';
import { useFitText } from '../../client/fitText';
import { useTranslation } from '../../i18n';
import { haptic } from '../../motion/haptics';
import {
  attachScratchDust,
  SCRATCH_TIMING,
  type ScratchDustHandle,
  TEAR_FOLLOW,
  TEAR_TILT_DEG,
  type TearPose,
  tearOff,
} from '../../motion/scratchCard';
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
import { ScratchFoil } from './ScratchFoil';
import {
  bonusFor,
  COIN_REVEAL,
  type CoinSymbol,
  cardFit,
  coinSymbols,
  HEART_D,
  HEART_REVEAL,
  heartPathIn,
  seeded,
  shorten,
  ticketSerial,
  tripleOf,
} from './scratchTicket';
import '../../motion/memory-worlds.css';
import './MemoryWorld.css';
import './ScratchCardWorld.css';
import { WorldHead } from './WorldHead';

type Entry = MemoryWorldEntry;

/* ---------- Tuning ---------- */

/** Horizontal movement before a drag on a revealed ticket starts tearing. */
const TEAR_START_PX = 6;
/** Share of the ticket width that tears it off (or a fling). */
const TEAR_COMMIT_SHARE = 0.25;
const TEAR_COMMIT_MIN_PX = 60;
/** Tear distance between two perforation "pops" (haptic ticks). */
const TEAR_TICK_PX = 22;
const TEAR_FLING_PX_PER_MS = 0.45;
const TEAR_FLING_MIN_PX = 30;
const CLICK_SUPPRESS_MS = 80;
/** The handwriting inside the heart never shrinks below this, in px. */
const CARD_MIN_PX = 14;
/** The heart card's title and the bonus title, shortened at a word. */
const WIN_TITLE_MAX = 48;
const BONUS_TITLE_MAX = 52;

/** The elements that get their own pixel unit (`--cu`). */
const UNIT_SELECTOR = '.memory-scratch-paper, .memory-scratch-field';

/* ---------- Printed security patterns (built once, used as CSS masks) ---------- */

function svgUrl(svg: string) {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** A closed wavy ring: the building block of a guilloche rosette. */
function wavyRing(
  radius: number,
  amplitude: number,
  waves: number,
  phase: number,
  steps: number,
) {
  let d = '';
  for (let index = 0; index <= steps; index += 1) {
    const t = (index / steps) * Math.PI * 2;
    const r = radius + amplitude * Math.sin(waves * t + phase);
    d += `${index ? 'L' : 'M'}${(r * Math.cos(t)).toFixed(1)} ${(r * Math.sin(t)).toFixed(1)}`;
  }
  return `${d}Z`;
}

function hypotrochoid(
  big: number,
  small: number,
  offset: number,
  turns: number,
  steps: number,
) {
  let d = '';
  for (let index = 0; index <= steps; index += 1) {
    const t = (index / steps) * Math.PI * 2 * turns;
    const x =
      (big - small) * Math.cos(t) +
      offset * Math.cos(((big - small) / small) * t);
    const y =
      (big - small) * Math.sin(t) -
      offset * Math.sin(((big - small) / small) * t);
    d += `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

let patternStyle: CSSProperties | null = null;

/** The rosette, the guilloche band and the heart mask, built on first use. */
function patterns(): CSSProperties {
  if (patternStyle) return patternStyle;
  const rings: string[] = [];
  for (let k = 0; k < 6; k += 1)
    rings.push(wavyRing(44, 4.5, 18, (k * Math.PI) / 3, 200));
  for (let k = 0; k < 5; k += 1)
    rings.push(wavyRing(31, 3.5, 13, (k * 2 * Math.PI) / 5, 150));
  for (let k = 0; k < 4; k += 1)
    rings.push(wavyRing(19, 2.6, 9, (k * Math.PI) / 2, 100));
  rings.push(hypotrochoid(9, 4, 6, 4, 360));
  const rosette = svgUrl(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='-50 -50 100 100'><g fill='none' stroke='#000' stroke-width='0.32'>${rings
      .map((d) => `<path d='${d}'/>`)
      .join('')}</g></svg>`,
  );
  const waves: string[] = [];
  for (let k = 0; k < 5; k += 1) {
    let d = '';
    for (let x = 0; x <= 200; x += 1) {
      const y =
        8 + 5.5 * Math.sin((x / 16) * Math.PI * 2 + (k * Math.PI * 2) / 5);
      d += `${x ? 'L' : 'M'}${x} ${y.toFixed(2)}`;
    }
    waves.push(d);
  }
  const band = svgUrl(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 16' preserveAspectRatio='none'><g fill='none' stroke='#000' stroke-width='0.45'>${waves
      .map((d) => `<path d='${d}'/>`)
      .join('')}</g></svg>`,
  );
  const heart = svgUrl(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1' preserveAspectRatio='none'><path d='${HEART_D}'/></svg>`,
  );
  patternStyle = {
    '--memory-scratch-rosette-mask': rosette,
    '--memory-scratch-band-mask': band,
    '--memory-scratch-heart-mask': heart,
  } as CSSProperties;
  return patternStyle;
}

/* ---------- Scratch dust ---------- */

/** A canvas over the whole ticket where scratched-off foil crumbs fall. */
function DustLayer({
  handle,
}: {
  handle: RefObject<ScratchDustHandle | null>;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dust = attachScratchDust(canvas);
    handle.current = dust.handle;
    return () => {
      dust.detach();
      handle.current = null;
    };
  }, [handle]);
  return (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a canvas without a tabindex is not focusable; the crumbs are decorative.
    <canvas ref={ref} className="memory-scratch-dust" aria-hidden="true" />
  );
}

/* ---------- Printed motifs ---------- */

/** Two little hearts holding hands. */
function HeartPair() {
  return (
    <svg
      className="memory-scratch-pair"
      viewBox="0 0 64 44"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="memory-scratch-pair-limb"
        d="M15 30 L14 37 M19.5 30.5 L20.5 37 M45 30.5 L44 37 M49.5 30 L50.5 37"
      />
      <path
        className="memory-scratch-pair-limb"
        d="M26.5 22 Q29 28 32 27.5 Q35 28 37.5 22"
      />
      <path
        className="memory-scratch-pair-left"
        d={heartPathIn(6, 10, 22, 21)}
      />
      <path
        className="memory-scratch-pair-right"
        d={heartPathIn(36, 10, 22, 21)}
      />
      <circle className="memory-scratch-pair-hands" cx="32" cy="27.5" r="2.2" />
      <circle className="memory-scratch-pair-eye" cx="13.6" cy="19" r="1.3" />
      <circle className="memory-scratch-pair-eye" cx="20.4" cy="19" r="1.3" />
      <circle className="memory-scratch-pair-eye" cx="43.6" cy="19" r="1.3" />
      <circle className="memory-scratch-pair-eye" cx="50.4" cy="19" r="1.3" />
      <path
        className="memory-scratch-pair-smile"
        d="M15 22.4 Q17 24.4 19 22.4 M45 22.4 Q47 24.4 49 22.4"
      />
      <ellipse
        className="memory-scratch-pair-blush"
        cx="11.4"
        cy="22.6"
        rx="1.8"
        ry="1.1"
      />
      <ellipse
        className="memory-scratch-pair-blush"
        cx="22.6"
        cy="22.6"
        rx="1.8"
        ry="1.1"
      />
      <ellipse
        className="memory-scratch-pair-blush"
        cx="41.4"
        cy="22.6"
        rx="1.8"
        ry="1.1"
      />
      <ellipse
        className="memory-scratch-pair-blush"
        cx="52.6"
        cy="22.6"
        rx="1.8"
        ry="1.1"
      />
    </svg>
  );
}

const STAR_D =
  'M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L1.9 9.2l7.1-.6z';

function StarCluster() {
  return (
    <svg
      className="memory-scratch-stars"
      viewBox="0 0 48 40"
      aria-hidden="true"
      focusable="false"
    >
      <path transform="translate(2 12) scale(1.1)" d={STAR_D} />
      <path transform="translate(28 2) scale(0.7)" d={STAR_D} />
      <path transform="translate(31 24) scale(0.55)" d={STAR_D} />
    </svg>
  );
}

function CoinFace({ symbol }: { symbol: CoinSymbol }) {
  return (
    <svg
      className="memory-scratch-coin-glyph"
      data-symbol={symbol}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {symbol === 'heart' ? <path d={heartPathIn(2.5, 3.5, 19, 18)} /> : null}
      {symbol === 'kiss' ? (
        <>
          <path d="M2 12 C5 6.5 9 6 12 9 C15 6 19 6.5 22 12 C18.5 17 15 18.5 12 18.5 C9 18.5 5.5 17 2 12 Z" />
          <path
            className="memory-scratch-coin-lips-line"
            d="M3.5 12 C8 13.2 16 13.2 20.5 12"
          />
        </>
      ) : null}
      {symbol === 'star' ? <path d={STAR_D} /> : null}
    </svg>
  );
}

/** Little sparkles twinkling on the untouched foil (x %, y %, phase). */
const SPARKLES: readonly [number, number, number][] = [
  [24, 26, 0],
  [72, 20, 7],
  [80, 52, 14],
  [30, 60, 21],
  [56, 72, 4],
];

interface Confetto {
  x: number;
  dx: number;
  rot: number;
  /** 0..1 of the confetti's delay spread. */
  delay: number;
  /** 0..1 of the confetti's length range. */
  length: number;
  kind: 'heart' | 'star' | 'strip';
  tone: number;
  size: number;
}

const CONFETTI: readonly Confetto[] = (() => {
  const rand = seeded(1729);
  return Array.from({ length: 18 }, (_, index) => ({
    x: 6 + rand() * 88,
    dx: (rand() - 0.5) * 90,
    rot: (rand() - 0.5) * 420,
    delay: rand(),
    length: rand(),
    kind: index % 3 === 0 ? 'heart' : index % 3 === 1 ? 'star' : 'strip',
    tone: index % 4,
    size: 8 + rand() * 6,
  }));
})();

function Confetti() {
  return (
    <span className="memory-scratch-confetti" aria-hidden="true">
      {CONFETTI.map((piece, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: the confetti are a fixed set.
          key={index}
          className="memory-scratch-confetto"
          data-kind={piece.kind}
          data-tone={piece.tone}
          style={
            {
              left: `${piece.x}%`,
              '--memory-scratch-confetto-dx': piece.dx.toFixed(1),
              '--memory-scratch-confetto-rot': piece.rot.toFixed(0),
              '--memory-scratch-confetto-delay': piece.delay.toFixed(3),
              '--memory-scratch-confetto-length': piece.length.toFixed(3),
              '--memory-scratch-confetto-size': `${piece.size.toFixed(1)}px`,
            } as CSSProperties
          }
        >
          {piece.kind === 'heart' ? (
            <svg viewBox="0 0 24 22" aria-hidden="true" focusable="false">
              <path d={heartPathIn(1, 1, 22, 20)} />
            </svg>
          ) : null}
          {piece.kind === 'star' ? (
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d={STAR_D} />
            </svg>
          ) : null}
        </span>
      ))}
    </span>
  );
}

/** What is hidden under the foil: the photo, or a handwritten card. */
function MemoryFace({
  entry,
  loadMemoryImage,
}: {
  entry: Entry;
  loadMemoryImage: LoadMemoryImage;
}) {
  if (entry.kind === 'photo' && entry.cover)
    return <MemoryPhoto entry={entry} loadMemoryImage={loadMemoryImage} />;
  return <MemoryCard entry={entry} />;
}

function MemoryCard({ entry }: { entry: Entry }) {
  const fit = cardFit(entry);
  const { boxRef, textRef } = useFitText<HTMLDivElement, HTMLElement>(
    fit.text,
    CARD_MIN_PX,
  );
  return (
    <div
      ref={boxRef}
      className="memory-scratch-card"
      data-kind={entry.kind}
      data-emotion={entry.emotion}
      data-size={fit.size}
    >
      {entry.kind === 'milestone' ? (
        <KeepsakeStampMark className="memory-scratch-card-mark" />
      ) : null}
      {entry.kind === 'heart' ? (
        <q
          ref={textRef as RefObject<HTMLQuoteElement>}
          className="memory-scratch-card-text"
        />
      ) : (
        <strong ref={textRef} className="memory-scratch-card-text" />
      )}
      {entry.kind === 'heart' ? (
        <span className="memory-scratch-card-from">{entry.author}</span>
      ) : null}
    </div>
  );
}

/* ---------- One ticket ---------- */

interface Slot {
  id: number;
  index: number;
  revealed: boolean;
  /** Revealed by the button: the bonus coins open too. */
  revealAll: boolean;
  celebrate: boolean;
  fresh: boolean;
  leaving: TearPose | null;
}

interface TearDrag {
  pointerId: number;
  x: number;
  y: number;
  engaged: boolean;
  dx: number;
  lastX: number;
  lastT: number;
  vx: number;
  ticks: number;
  armed: boolean;
  commitAt: number;
}

const AUTO_TEAR: TearPose = Object.freeze({ dir: 1, x: 0, rot: 0, auto: true });

function Ticket({
  slot,
  entry,
  pool,
  loadMemoryImage,
  onOpen,
  onReveal,
  onTear,
  onLeft,
}: {
  slot: Slot;
  entry: Entry;
  /** All memories of the roll: the bonus memory comes from here. */
  pool: readonly Entry[];
  loadMemoryImage: LoadMemoryImage;
  onOpen: OpenMemoryWorldItem;
  onReveal: (id: number, entry: Entry, revealAll: boolean) => void;
  onTear: (id: number, pose: TearPose) => void;
  onLeft: (id: number) => void;
}) {
  const { t } = useTranslation();
  const { id, revealed, leaving } = slot;
  const ticketRef = useRef<HTMLDivElement>(null);
  const winRef = useRef<HTMLDivElement>(null);
  const dust = useRef<ScratchDustHandle | null>(null);
  const drag = useRef<TearDrag | null>(null);
  const frame = useRef(0);
  const suppressClick = useRef(false);
  const timers = useRef<number[]>([]);
  const onLeftRef = useRef(onLeft);
  useLayoutEffect(() => {
    onLeftRef.current = onLeft;
  });
  const [scratched, setScratched] = useState(false);
  const [coins, setCoins] = useState([false, false, false]);

  const hash = keyHash(entry.key);
  const serial = ticketSerial(entry.key);
  const seed = (hash ^ Math.imul(id + 1, 7919)) >>> 0;
  const symbols = coinSymbols(hash);
  const triple = tripleOf(symbols);
  const bonus = triple ? bonusFor(pool, entry, triple, hash) : null;
  const coinOpen = coins.map((open) => open || slot.revealAll);
  const allCoins = coinOpen.every(Boolean);
  const wonBonus = allCoins && triple !== null;
  const stamp = useMemo(
    () => ({
      word: t('memoryWorlds.scratch.foilStamp'),
      sub: t('memoryWorlds.scratch.foilStampSub'),
    }),
    [t],
  );

  // Three equal coins: a little extra, felt as well as seen.
  const bonusCelebrated = useRef(false);
  useEffect(() => {
    if (!wonBonus || bonusCelebrated.current || slot.revealAll) return;
    bonusCelebrated.current = true;
    const timer = window.setTimeout(
      () => haptic('success'),
      SCRATCH_TIMING.bonusHaptic,
    );
    timers.current.push(timer);
  }, [wonBonus, slot.revealAll]);

  useEffect(
    () => () => {
      for (const timer of timers.current) window.clearTimeout(timer);
      cancelAnimationFrame(frame.current);
    },
    [],
  );

  // Once won, bring the handwritten note into view when it is below the fold.
  useEffect(() => {
    if (!revealed || leaving) return;
    const timer = window.setTimeout(
      () => {
        const note = winRef.current;
        if (!note || typeof note.scrollIntoView !== 'function') return;
        const box = note.getBoundingClientRect();
        if (box.bottom > window.innerHeight - 24)
          note.scrollIntoView({
            behavior: prefersReducedMotion() ? 'auto' : 'smooth',
            block: 'nearest',
          });
      },
      slot.celebrate ? SCRATCH_TIMING.winScroll : 0,
    );
    timers.current.push(timer);
    return () => window.clearTimeout(timer);
  }, [revealed, leaving, slot.celebrate]);

  // Torn off: fly away sideways, falling with gravity, from where the finger
  // let go. Without Web Animations the ticket leaves at once.
  useLayoutEffect(() => {
    const element = ticketRef.current;
    if (!leaving || !element) return;
    element.dataset.tearDir = leaving.dir > 0 ? 'right' : 'left';
    const animation = tearOff(element, leaving);
    if (!animation) {
      onLeftRef.current(id);
      return;
    }
    animation.onfinish = () => onLeftRef.current(id);
    return () => animation.cancel();
  }, [leaving, id]);

  const revealCoin = (index: number) => {
    setCoins((previous) => previous.map((open, at) => open || at === index));
    haptic('commit');
  };

  const applyTear = () => {
    frame.current = 0;
    const element = ticketRef.current;
    const current = drag.current;
    if (element && current)
      element.style.setProperty('--memory-scratch-tear', current.dx.toFixed(1));
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!revealed || leaving || drag.current?.engaged) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // Never from a scratch field: the coins (also once open) and the
    // unscratched foil.
    if (
      (event.target as Element).closest(
        '.memory-scratch-coin, canvas[data-active="true"]',
      )
    )
      return;
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      engaged: false,
      dx: 0,
      lastX: event.clientX,
      lastT: event.timeStamp,
      vx: 0,
      ticks: 0,
      armed: false,
      commitAt: 0,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    const element = ticketRef.current;
    if (!current || !element || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.engaged) {
      if (
        Math.abs(dy) > TEAR_START_PX * 2 &&
        Math.abs(dy) > Math.abs(dx) * 1.5
      ) {
        // Clearly vertical: not a tear.
        drag.current = null;
        return;
      }
      if (Math.abs(dx) < TEAR_START_PX) return;
      current.engaged = true;
      current.commitAt = Math.max(
        TEAR_COMMIT_MIN_PX,
        element.offsetWidth * TEAR_COMMIT_SHARE,
      );
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // Capture is a nicety here; the drag continues without it.
      }
      element.dataset.tearing = 'true';
    }
    const dt = event.timeStamp - current.lastT;
    if (dt > 0)
      current.vx =
        current.vx * 0.6 + ((event.clientX - current.lastX) / dt) * 0.4;
    current.lastX = event.clientX;
    current.lastT = event.timeStamp;
    current.dx = dx - Math.sign(dx) * TEAR_START_PX;
    const side = current.dx >= 0 ? 'right' : 'left';
    if (element.dataset.tearDir !== side) element.dataset.tearDir = side;
    // The perforation pops tooth by tooth; one more tick when it would let go.
    const ticks = Math.floor(Math.abs(current.dx) / TEAR_TICK_PX);
    if (ticks > current.ticks && ticks * TEAR_TICK_PX < current.commitAt)
      haptic('threshold');
    current.ticks = ticks;
    const armed = Math.abs(current.dx) >= current.commitAt;
    if (armed !== current.armed) {
      current.armed = armed;
      haptic('threshold');
    }
    if (!frame.current) frame.current = requestAnimationFrame(applyTear);
  };

  const finishTear = (
    event: ReactPointerEvent<HTMLDivElement>,
    cancelled: boolean,
  ) => {
    const current = drag.current;
    const element = ticketRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    if (!current.engaged || !element) return;
    if (element.hasPointerCapture(event.pointerId))
      element.releasePointerCapture(event.pointerId);
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    delete element.dataset.tearing;
    suppressClick.current = true;
    timers.current.push(
      window.setTimeout(() => {
        suppressClick.current = false;
      }, CLICK_SUPPRESS_MS),
    );
    const flung =
      !cancelled &&
      Math.abs(current.vx) > TEAR_FLING_PX_PER_MS &&
      Math.abs(current.dx) > TEAR_FLING_MIN_PX &&
      Math.sign(current.vx) === Math.sign(current.dx);
    // A cancelled pointer still tears when the ticket was pulled far enough.
    if (Math.abs(current.dx) >= current.commitAt || flung) {
      element.style.setProperty('--memory-scratch-tear', current.dx.toFixed(1));
      onTear(id, {
        dir: current.dx >= 0 ? 1 : -1,
        x: current.dx * TEAR_FOLLOW,
        rot: current.dx * TEAR_TILT_DEG,
        auto: false,
      });
    } else {
      // Not torn: the ticket springs back onto the perforation.
      element.style.removeProperty('--memory-scratch-tear');
    }
  };

  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClick.current) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const openLabel = t('memoryWorlds.scratch.openLabel', {
    title: entry.title,
    date: entry.dateLabel,
  });

  return (
    // biome-ignore lint/a11y/useSemanticElements: the ticket is one named object of the world, not a form fieldset.
    <div
      ref={ticketRef}
      className="memory-scratch-ticket"
      role="group"
      aria-roledescription={t('memoryWorlds.scratch.roleDescription')}
      aria-label={t('memoryWorlds.scratch.label', { serial })}
      data-feed={slot.fresh ? 'true' : undefined}
      data-revealed={revealed ? 'true' : undefined}
      data-celebrate={slot.celebrate ? 'true' : undefined}
      data-leaving={leaving ? 'true' : undefined}
      aria-hidden={leaving ? true : undefined}
      inert={leaving ? true : undefined}
      style={patterns()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finishTear(event, false)}
      onPointerCancel={(event) => finishTear(event, true)}
      onLostPointerCapture={(event) => {
        // Only the ticket's own capture: a child losing its implicit touch
        // capture (when the ticket takes it over) bubbles up here as well.
        if (event.target === event.currentTarget) finishTear(event, true);
      }}
      onClickCapture={onClickCapture}
      onDragStart={(event) => event.preventDefault()}
    >
      <div className="memory-scratch-paper">
        <span
          className="memory-scratch-band"
          data-edge="top"
          aria-hidden="true"
        />
        <span
          className="memory-scratch-band"
          data-edge="bottom"
          aria-hidden="true"
        />
        <div className="memory-scratch-serial">
          <span className="memory-scratch-serial-number">
            {t('memoryWorlds.scratch.serial', { serial })}
          </span>
          {revealed && !leaving ? (
            <span
              className="memory-scratch-tab"
              aria-hidden="true"
              onClick={() => onTear(id, AUTO_TEAR)}
            >
              {t('memoryWorlds.scratch.tearTab')}
              <svg viewBox="0 0 16 10" aria-hidden="true" focusable="false">
                <path d="M1 5 H14 M10 1.5 L14 5 L10 8.5" />
              </svg>
            </span>
          ) : null}
        </div>
        <div className="memory-scratch-title">
          <HeartPair />
          <p className="memory-scratch-name">
            {t('memoryWorlds.scratch.name')}
          </p>
          <StarCluster />
        </div>
        <p className="memory-scratch-rule">{t('memoryWorlds.scratch.rule')}</p>

        <div className="memory-scratch-play">
          <div
            className="memory-scratch-field"
            data-scratched={scratched ? 'true' : undefined}
          >
            <span className="memory-scratch-rosette" aria-hidden="true" />
            <svg
              className="memory-scratch-outline"
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
            >
              <path d={HEART_D} />
            </svg>
            <div className="memory-scratch-memory" aria-hidden="true">
              <MemoryFace entry={entry} loadMemoryImage={loadMemoryImage} />
            </div>
            {revealed ? (
              <Link
                className="memory-scratch-open"
                to={entry.path}
                draggable={false}
                onClick={(event) => onOpen(event, entry.path, entry.key)}
                aria-label={openLabel}
              >
                <span className="memory-scratch-open-label" aria-hidden="true">
                  {t('memoryWorlds.scratch.open')}
                </span>
              </Link>
            ) : null}
            <ScratchFoil
              className="memory-scratch-foil"
              shape="heart"
              metal="gold"
              threshold={HEART_REVEAL}
              revealed={revealed}
              seed={seed}
              dust={dust}
              stamp={stamp}
              onFirstScratch={() => setScratched(true)}
              onReveal={() => onReveal(id, entry, false)}
            />
            {!revealed && !scratched ? (
              <span className="memory-scratch-sparkles" aria-hidden="true">
                {SPARKLES.map(([x, y, phase]) => (
                  <span
                    key={`${x}-${y}`}
                    className="memory-scratch-sparkle"
                    style={
                      {
                        left: `${x}%`,
                        top: `${y}%`,
                        '--memory-scratch-sparkle-phase': phase,
                      } as CSSProperties
                    }
                  />
                ))}
              </span>
            ) : null}
            {revealed && slot.celebrate ? (
              <>
                <span className="memory-scratch-shimmer" aria-hidden="true" />
                <Confetti />
              </>
            ) : null}
          </div>
          <div
            className="memory-scratch-coins"
            data-all={allCoins ? 'true' : undefined}
            data-triple={wonBonus ? 'true' : undefined}
            aria-hidden="true"
          >
            {symbols.map((symbol, index) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: the three coins are a fixed set.
                key={index}
                className="memory-scratch-coin"
                data-revealed={coinOpen[index] ? 'true' : undefined}
                style={
                  { '--memory-scratch-coin-index': index } as CSSProperties
                }
              >
                <span className="memory-scratch-coin-face">
                  <CoinFace symbol={symbol} />
                </span>
                <ScratchFoil
                  className="memory-scratch-coin-foil"
                  shape="coin"
                  metal="silver"
                  threshold={COIN_REVEAL}
                  revealed={coinOpen[index]}
                  seed={seed + index + 1}
                  dust={dust}
                  onReveal={() => revealCoin(index)}
                />
              </span>
            ))}
          </div>
        </div>

        <div
          className="memory-scratch-win"
          ref={winRef}
          data-revealed={revealed ? 'true' : undefined}
        >
          {revealed ? (
            <>
              <span className="memory-scratch-win-stamp">
                {t('memoryWorlds.scratch.win.stamp')}
              </span>
              <p className="memory-scratch-win-note">
                <span className="memory-scratch-win-ask">
                  {t('memoryWorlds.scratch.win.ask')}
                </span>
                {entry.kind === 'photo' ? (
                  <span className="memory-scratch-win-title">
                    {shorten(entry.title, WIN_TITLE_MAX)}
                  </span>
                ) : null}
                <time dateTime={entry.dateTime}>{entry.dateLabel}</time>
              </p>
            </>
          ) : (
            <p className="memory-scratch-win-blank">
              <span>{t('memoryWorlds.scratch.win.blank')}</span>
              <span className="memory-scratch-win-line" aria-hidden="true" />
            </p>
          )}
        </div>

        <div
          className="memory-scratch-bonus"
          data-state={wonBonus ? 'won' : allCoins ? 'none' : 'open'}
          role="status"
        >
          {wonBonus ? (
            <>
              <span className="memory-scratch-bonus-stamp">
                {t('memoryWorlds.scratch.bonus.stamp')}
              </span>
              <span className="memory-scratch-bonus-text">
                <span className="memory-scratch-bonus-ask">
                  {t(`memoryWorlds.scratch.bonus.${triple ?? 'heart'}`)}
                </span>
                {bonus ? (
                  <Link
                    className="memory-scratch-bonus-link"
                    to={bonus.path}
                    draggable={false}
                    onClick={(event) => onOpen(event, bonus.path, bonus.key)}
                    aria-label={t('memoryWorlds.scratch.bonus.link', {
                      title: bonus.title,
                      date: bonus.dateLabel,
                    })}
                  >
                    {shorten(bonus.title, BONUS_TITLE_MAX)}
                    <span className="memory-scratch-bonus-date">
                      {bonus.dateLabel}
                    </span>
                  </Link>
                ) : (
                  <span className="memory-scratch-bonus-ask">
                    {t('memoryWorlds.scratch.bonus.double')}
                  </span>
                )}
              </span>
            </>
          ) : allCoins ? (
            <span className="memory-scratch-bonus-none">
              {t('memoryWorlds.scratch.bonus.none')}
            </span>
          ) : (
            <span className="memory-scratch-bonus-hint">
              {t('memoryWorlds.scratch.bonus.hint')}
            </span>
          )}
        </div>

        <p className="memory-scratch-small">
          {t('memoryWorlds.scratch.smallPrint')}
        </p>
        <DustLayer handle={dust} />
      </div>
    </div>
  );
}

/* ---------- The dispenser ---------- */

type CrankMotion = 'turn' | 'nudge' | null;

/**
 * The enamel dispenser: a glass window shows the paper roll with the
 * perforation of the next ticket; the heart crank on the roll's axle turns
 * when a ticket comes out, and a tap on it dispenses the next one once the
 * hanging ticket is won (before that it only wiggles: locked).
 */
function Dispenser({
  feedRun,
  crankRun,
  crankMotion,
  onCrank,
}: {
  feedRun: number;
  crankRun: number;
  crankMotion: CrankMotion;
  onCrank: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="memory-scratch-dispenser">
      <span className="memory-scratch-disp-body" aria-hidden="true">
        <span className="memory-scratch-disp-plate">
          <span className="memory-scratch-disp-plate-title">
            {t('memoryWorlds.scratch.dispenser.title')}
          </span>
          <span className="memory-scratch-disp-plate-sub">
            {t('memoryWorlds.scratch.dispenser.subtitle')}
          </span>
        </span>
        <span className="memory-scratch-disp-window">
          <span className="memory-scratch-roll">
            <span className="memory-scratch-roll-end" data-side="start" />
            <span className="memory-scratch-roll-face">
              <span
                className="memory-scratch-roll-paper"
                key={`paper-${feedRun}`}
                data-turning={feedRun > 0 ? 'true' : undefined}
              >
                <span className="memory-scratch-roll-edge" />
                <svg
                  className="memory-scratch-roll-heart"
                  viewBox="0 0 24 22"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d={heartPathIn(1, 1, 22, 20)} />
                </svg>
              </span>
            </span>
            <span className="memory-scratch-roll-end" data-side="end" />
          </span>
        </span>
        <span className="memory-scratch-disp-axle" />
      </span>
      <span
        className="memory-scratch-disp-crank"
        key={`crank-${crankRun}`}
        data-motion={crankMotion ?? undefined}
        aria-hidden="true"
        onClick={onCrank}
      >
        <span className="memory-scratch-disp-crank-arm" />
        <svg
          className="memory-scratch-disp-crank-handle"
          viewBox="0 0 24 22"
          aria-hidden="true"
          focusable="false"
        >
          <path d={heartPathIn(1, 1, 22, 20)} />
        </svg>
      </span>
      <span className="memory-scratch-disp-mouth" aria-hidden="true">
        <span className="memory-scratch-disp-blade" />
      </span>
    </div>
  );
}

/* ---------- World ---------- */

/**
 * Euer Glückslos: a vintage lucky ticket per memory, the lead first. Scratch
 * the gold heart free (or press "Freirubbeln") to win the memory; tear the
 * won ticket off and the next one comes out of the dispenser.
 */
export function ScratchCardWorld({
  entries,
  loadMemoryImage,
  onOpen,
}: MemoryWorldProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  // The ticket's paper and the heart field get pixel units (containerUnits.ts).
  useContainerUnits(rootRef, UNIT_SELECTOR);
  const ordered = useMemo(() => {
    const lead = entries.find((entry) => entry.isLead);
    return lead
      ? [lead, ...entries.filter((entry) => entry !== lead)]
      : entries;
  }, [entries]);
  const [tickets, setTickets] = useState<Slot[]>(() => [
    {
      id: 0,
      index: 0,
      revealed: false,
      revealAll: false,
      celebrate: false,
      fresh: false,
      leaving: null,
    },
  ]);
  const [feedRun, setFeedRun] = useState(0);
  const [crank, setCrank] = useState<{ run: number; motion: CrankMotion }>({
    run: 0,
    motion: null,
  });
  const [announcement, setAnnouncement] = useState('');
  const nextId = useRef(1);
  const timers = useRef<number[]>([]);
  const hasEntries = ordered.length > 0;

  useEffect(
    () => () => {
      for (const timer of timers.current) window.clearTimeout(timer);
    },
    [],
  );

  // The sparkles on the untouched foil pause while the ticket is not seen (M8).
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !hasEntries) return;
    return observeVisibility(root, (state) => {
      root.dataset.ambient = state.visible ? 'on' : 'paused';
    });
  }, [hasEntries]);

  const reveal = useCallback(
    (id: number, entry: Entry, revealAll: boolean) => {
      const celebrate = !prefersReducedMotion();
      setTickets((previous) =>
        previous.map((slot) =>
          slot.id === id && !slot.revealed
            ? { ...slot, revealed: true, revealAll, celebrate }
            : slot,
        ),
      );
      haptic('success');
      setAnnouncement(
        t('memoryWorlds.scratch.won', {
          title: entry.title,
          date: entry.dateLabel,
        }),
      );
    },
    [t],
  );

  const tear = useCallback(
    (id: number, pose: TearPose) => {
      const reduced = prefersReducedMotion();
      const freshId = nextId.current;
      nextId.current += 1;
      setTickets((previous) => {
        const slot = previous.find((item) => item.id === id && !item.leaving);
        if (!slot) return previous;
        const fresh: Slot = {
          id: freshId,
          index: slot.index + 1,
          revealed: false,
          revealAll: false,
          celebrate: false,
          fresh: !reduced,
          leaving: null,
        };
        if (reduced)
          return [...previous.filter((item) => item.id !== id), fresh];
        return [
          ...previous.map((item) =>
            item.id === id ? { ...item, leaving: pose } : item,
          ),
          fresh,
        ];
      });
      haptic('commit');
      setAnnouncement(t('memoryWorlds.scratch.fresh'));
      if (reduced) return;
      setFeedRun((run) => run + 1);
      setCrank((previous) => ({ run: previous.run + 1, motion: 'turn' }));
      for (const at of SCRATCH_TIMING.feedTicks)
        timers.current.push(window.setTimeout(() => haptic('threshold'), at));
    },
    [t],
  );

  const left = useCallback((id: number) => {
    setTickets((previous) => previous.filter((slot) => slot.id !== id));
  }, []);

  if (!hasEntries) return null;
  const current = tickets.find((slot) => !slot.leaving) ?? null;
  const currentEntry = current ? ordered[current.index % ordered.length] : null;

  const turnCrank = () => {
    if (!current) return;
    if (current.revealed) {
      tear(current.id, AUTO_TEAR);
      return;
    }
    // Locked until the hanging ticket is won: the crank only wiggles.
    haptic('refuse');
    if (!prefersReducedMotion())
      setCrank((previous) => ({ run: previous.run + 1, motion: 'nudge' }));
  };

  const fallback = () => {
    if (!current || !currentEntry) return;
    if (!current.revealed) reveal(current.id, currentEntry, true);
    else tear(current.id, AUTO_TEAR);
  };

  return (
    <div ref={rootRef} className="memory-scratch-world">
      <WorldHead heading={t('memoryWorlds.scratch.heading')} />
      <div className="memory-scratch-scene" data-primary-tab-swipe-block>
        <Dispenser
          feedRun={feedRun}
          crankRun={crank.run}
          crankMotion={crank.motion}
          onCrank={turnCrank}
        />
        <div className="memory-scratch-track">
          {tickets.map((slot) => (
            <Ticket
              key={slot.id}
              slot={slot}
              entry={ordered[slot.index % ordered.length]}
              pool={ordered}
              loadMemoryImage={loadMemoryImage}
              onOpen={onOpen}
              onReveal={reveal}
              onTear={tear}
              onLeft={left}
            />
          ))}
        </div>
      </div>
      <div className="memory-scratch-actions">
        <button
          type="button"
          className="memory-scratch-fallback"
          onClick={fallback}
        >
          {current?.revealed
            ? t('memoryWorlds.scratch.tear')
            : t('memoryWorlds.scratch.reveal')}
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
