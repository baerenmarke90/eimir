/**
 * Fotoautomat (#2283): the diary as a photo booth, in two styles the couple
 * chooses on this device (`boothStylePreference.ts`):
 *
 * - Klassisch: the old station cabin of the sixties. Drag the coin into the
 *   slot (or tap it), the curtain closes and four flashes shine through it,
 *   the development dial runs, and a wet strip in faded colour drops out of
 *   the chute. Wave it dry, look at it, or put it in the tin.
 * - Modern: an enamel machine with a lit sign. Press the button, the display
 *   counts down, the camera takes four shots with its own flash, and a strip
 *   is pushed out of the slot and develops. Look at it, or hang it on the
 *   line below.
 *
 * Every strip holds four moments from the same time; the first one holds
 * the rediscovery. Picking a strip up shows each picture next to what it
 * remembers, opening the memory in the diary.
 *
 * Gestures (Motion Contract 4.6): the coin follows the finger and the wet
 * strip swings from it. Their non-gesture alternatives are the coin as a
 * button (tap, Enter, Space) and the strip drying by itself. Subtle haptics
 * mark the countdown, each shot and the finished strip. With reduced motion
 * a run shows its finished strip at once. A live region announces each
 * stage. The style switch sits right below the booth's heading.
 *
 * Keyframes, loops and timing roles: `src/motion/memory-worlds.css`.
 */
import type { TFunction } from 'i18next';
import {
  type CSSProperties,
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useFitText } from '../../client/fitText';
import { useTranslation } from '../../i18n';
import { type HapticKind, haptic } from '../../motion/haptics';
import { observeVisibility } from '../../motion/visibility';
import { KeepsakeStampMark } from '../DiscoverKeepsakes';
import {
  BOOTH_STYLES,
  setBoothStyle,
  useBoothStyle,
} from './boothStylePreference';
import { MemoryPhoto } from './MemoryPhoto';
import {
  type LoadMemoryImage,
  type MemoryWorldEntry,
  type MemoryWorldProps,
  type OpenMemoryWorldItem,
  prefersReducedMotion,
  seasonSpan,
} from './model';
import '../../motion/memory-worlds.css';
import './MemoryWorld.css';
import './PhotoBoothWorld.css';
import { WorldHead } from './WorldHead';

type Entry = MemoryWorldEntry;

/** A booth always takes and prints four pictures. */
const SHOTS = 4;

/* ---------- Strips ---------- */

/**
 * Strips of four moments from the same time; the first one holds the
 * rediscovery and its three closest neighbours in time. With fewer moments
 * the same moment comes back like another pose.
 */
export function boothStrips(entries: readonly Entry[]): Entry[][] {
  if (entries.length === 0) return [];
  const byDate = (a: Entry, b: Entry) => a.date.getTime() - b.date.getTime();
  const lead = entries.find((entry) => entry.isLead) ?? entries[0];
  const others = entries.filter((entry) => entry !== lead);
  const first = [
    lead,
    ...others
      .map((entry) => ({
        entry,
        distance: Math.abs(entry.date.getTime() - lead.date.getTime()),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, SHOTS - 1)
      .map(({ entry }) => entry),
  ].sort(byDate);
  const rest = others.filter((entry) => !first.includes(entry)).sort(byDate);
  const strips = [first];
  const count = Math.ceil(rest.length / SHOTS);
  for (let part = 0; part < count; part += 1) {
    const from = Math.round((part * rest.length) / count);
    const to = Math.round(((part + 1) * rest.length) / count);
    strips.push(rest.slice(from, to));
  }
  return strips.map((strip) =>
    strip.length >= SHOTS
      ? strip
      : Array.from(
          { length: SHOTS },
          (_, index) => strip[index % strip.length],
        ),
  );
}

function stripSpan(strip: readonly Entry[], t: TFunction): string {
  return seasonSpan(strip[0].date, strip[strip.length - 1].date, t);
}

/** A printed strip: which strip, which run, and whether it was put away. */
interface Printed {
  strip: number;
  run: number;
  /** Hung on the line (Modern) or put in the tin (Klassisch). */
  kept: boolean;
}

/** Puts every printed strip away and adds the next one, still lying out. */
function printNext(previous: Printed[], strip: number): Printed[] {
  return [
    ...previous.map((item) => ({ ...item, kept: true })),
    { strip, run: (previous[previous.length - 1]?.run ?? 0) + 1, kept: false },
  ];
}

/** One beat of a run's orchestration (ms from its start). */
interface Beat<Stage> {
  at: number;
  stage: Stage;
  haptic?: HapticKind;
}

/* ---------- Pictures ---------- */

/** Notes never shrink below this (handwriting gets hard to read), in px. */
const NOTE_MIN_PX = 11;

/**
 * A note inside a booth picture that always fits its frame: the text first
 * shrinks, and only a text that still does not fit is shortened at a word
 * with "…" (`client/fitText`). The full words stay in the diary.
 */
function FittedNote({
  text,
  kind,
  children,
}: {
  text: string;
  kind: 'quote' | 'title';
  children?: ReactNode;
}) {
  const { boxRef, textRef } = useFitText<HTMLSpanElement, HTMLElement>(
    text,
    NOTE_MIN_PX,
  );
  return (
    <span ref={boxRef} className="memory-booth-note">
      {kind === 'title' ? children : null}
      {/* The text is written by the fitting, outside React. */}
      {kind === 'quote' ? (
        <q ref={textRef as RefObject<HTMLQuoteElement>} />
      ) : (
        <strong ref={textRef} />
      )}
      {kind === 'quote' ? children : null}
    </span>
  );
}

/** What one booth picture shows: the photo, or the moment as a small note. */
function BoothPicture({
  entry,
  loadMemoryImage,
}: {
  entry: Entry;
  loadMemoryImage: LoadMemoryImage;
}) {
  const { t } = useTranslation();
  switch (entry.kind) {
    case 'photo':
      return <MemoryPhoto entry={entry} loadMemoryImage={loadMemoryImage} />;
    case 'heart':
      return (
        <FittedNote text={entry.title} kind="quote">
          <span>
            {t('memoryWorlds.booth.noteFrom', { name: entry.author })}
          </span>
        </FittedNote>
      );
    case 'milestone':
      return (
        <FittedNote text={entry.title} kind="title">
          <KeepsakeStampMark className="memory-booth-mark" />
        </FittedNote>
      );
    case 'words':
      return <FittedNote text={entry.title} kind="title" />;
  }
}

/** A strip of four pictures; tapping it picks it up for a closer look. */
function Strip({
  strip,
  run,
  look,
  small,
  wet = 0,
  loadMemoryImage,
  onView,
}: {
  strip: Entry[];
  run: number;
  look: 'modern' | 'classic';
  small?: boolean;
  /** Klassisch only: how wet the fresh strip still is (1 to 0). */
  wet?: number;
  loadMemoryImage: LoadMemoryImage;
  onView: () => void;
}) {
  const { t } = useTranslation();
  const span = stripSpan(strip, t);
  const classic = look === 'classic';
  return (
    <button
      type="button"
      className={classic ? 'memory-booth-cabin-strip' : 'memory-booth-strip'}
      data-size={small ? 'small' : undefined}
      data-booth-run={run}
      style={classic ? ({ '--wet': wet } as CSSProperties) : undefined}
      onClick={onView}
      aria-label={t('memoryWorlds.booth.viewStrip', { span })}
    >
      {strip.map((entry, index) => (
        <span
          // The same moment may come back like another pose.
          // biome-ignore lint/suspicious/noArrayIndexKey: a picture is its moment at its place in the strip.
          key={`${entry.key}-${index}`}
          className={
            classic ? 'memory-booth-cabin-frame' : 'memory-booth-frame'
          }
          data-kind={entry.kind}
          style={{ '--i': index } as CSSProperties}
        >
          <BoothPicture entry={entry} loadMemoryImage={loadMemoryImage} />
        </span>
      ))}
      <span
        className={
          classic ? 'memory-booth-cabin-stamp' : 'memory-booth-strip-label'
        }
      >
        {span}
      </span>
      {classic && wet > 0 ? (
        <span className="memory-booth-cabin-wet" aria-hidden="true" />
      ) : null}
    </button>
  );
}

/* ---------- The picked-up strip ---------- */

/**
 * The picked-up strip: each picture next to what it remembers, opening the
 * memory in the diary. A fresh strip can be put away from here. Escape and
 * the close button close it; focus stays inside while it is open.
 */
function BoothViewer({
  strip,
  loadMemoryImage,
  onOpen,
  onClose,
  onKeep,
  keepLabel,
  tone,
}: {
  strip: Entry[];
  loadMemoryImage: LoadMemoryImage;
  onOpen: OpenMemoryWorldItem;
  onClose: () => void;
  onKeep?: () => void;
  keepLabel: string;
  tone?: 'retro';
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusables = [
      ...(sheetRef.current?.querySelectorAll<HTMLElement>('a[href], button') ??
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
  // Each moment once, even when it came back as another pose.
  const moments = strip.filter(
    (entry, index) =>
      strip.findIndex((other) => other.key === entry.key) === index,
  );
  return createPortal(
    <div
      className="memory-booth-viewer"
      data-tone={tone}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
    >
      {/* A pointer shortcut outside the sheet; the close button and Escape offer the same. */}
      <div
        className="memory-booth-viewer-scrim"
        onClick={onClose}
        aria-hidden="true"
      />
      <div ref={sheetRef} className="memory-booth-sheet">
        <p className="memory-booth-sheet-kicker">
          {t('memoryWorlds.booth.viewer.kicker')}
        </p>
        <h3 id={titleId}>{stripSpan(strip, t)}</h3>
        <ol className="memory-booth-contact">
          {moments.map((entry, index) => (
            <li key={entry.key} style={{ '--i': index } as CSSProperties}>
              <Link
                to={entry.path}
                onClick={(event) => onOpen(event, entry.path, entry.key)}
                className="memory-booth-contact-row"
              >
                {/* The picture repeats the words beside it. */}
                <span
                  className="memory-booth-frame"
                  data-kind={entry.kind}
                  aria-hidden="true"
                >
                  <BoothPicture
                    entry={entry}
                    loadMemoryImage={loadMemoryImage}
                  />
                </span>
                <span className="memory-booth-contact-text">
                  <strong>{entry.title}</strong>
                  <time dateTime={entry.dateTime}>{entry.dateLabel}</time>
                  <span className="memory-booth-contact-open">
                    {t('memoryWorlds.booth.viewer.openInDiary')}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
        <div className="memory-booth-sheet-actions">
          {onKeep ? (
            <button
              type="button"
              className="memory-booth-primary"
              onClick={onKeep}
            >
              {keepLabel}
            </button>
          ) : null}
          <button
            type="button"
            ref={closeRef}
            className="memory-booth-secondary"
            onClick={onClose}
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ---------- Shared run plumbing ---------- */

/** Timers of a run; all are cleared when the booth goes away. */
function useTimers() {
  const timers = useRef<number[]>([]);
  useEffect(
    () => () => {
      for (const timer of timers.current) window.clearTimeout(timer);
    },
    [],
  );
  const clear = useCallback(() => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  }, []);
  const schedule = useCallback((fn: () => void, at: number) => {
    timers.current.push(window.setTimeout(fn, at));
  }, []);
  return { clear, schedule };
}

/**
 * Brings the whole fresh strip into view so all four pictures can be watched
 * while they develop. Only ever scrolls down.
 */
function useRevealStrip(ref: RefObject<HTMLElement | null>) {
  return useCallback(() => {
    const element = ref.current;
    if (!element || typeof element.scrollIntoView !== 'function') return;
    const margin =
      Number.parseFloat(getComputedStyle(element).scrollMarginTop) || 0;
    if (element.getBoundingClientRect().top <= margin + 8) return;
    element.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  }, [ref]);
}

/**
 * Returns focus after the viewer closes or a strip is put away: to the
 * control that opened the viewer, else to the strip of that run where it
 * now lies (line or tin), else to the booth's main control.
 */
function useFocusReturn(
  rootRef: RefObject<HTMLElement | null>,
  mainRef: RefObject<HTMLElement | null>,
) {
  const opener = useRef<HTMLElement | null>(null);
  const pending = useRef<number | null>(null);
  const remember = useCallback(() => {
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement ? active : null;
  }, []);
  const request = useCallback((run: number) => {
    pending.current = run;
  }, []);
  // After every render: the strip may have moved to the line or the tin.
  useEffect(() => {
    const run = pending.current;
    if (run === null) return;
    pending.current = null;
    const root = rootRef.current;
    const from = opener.current;
    opener.current = null;
    const target =
      (from?.isConnected && root?.contains(from) ? from : null) ??
      root?.querySelector<HTMLElement>(`[data-booth-run="${run}"]`) ??
      mainRef.current;
    target?.focus({ preventScroll: true });
  });
  return { remember, request };
}

/** Pauses the booth's ambient loops while it is not seen (M8). */
function useAmbient(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return observeVisibility(root, (state) => {
      root.dataset.ambient = state.visible ? 'on' : 'paused';
    });
  }, [rootRef]);
}

/* ---------- Modern ---------- */

/** One run of the booth: countdown, four shots, then the strip is printed. */
type BoothStage =
  | { kind: 'idle' }
  | { kind: 'count'; digit: number }
  | { kind: 'shot'; shot: number }
  | { kind: 'wait' }
  | { kind: 'print' }
  | { kind: 'done' };

/** The print stage; `--memory-booth-print-duration` has the same length. */
const BOOTH_PRINT_MS = 3200;
const BOOTH_PRINT_AT_MS = 7800;
const BOOTH_TIMELINE: readonly Beat<BoothStage>[] = [
  { at: 0, stage: { kind: 'count', digit: 3 } },
  { at: 1000, stage: { kind: 'count', digit: 2 }, haptic: 'threshold' },
  { at: 2000, stage: { kind: 'count', digit: 1 }, haptic: 'threshold' },
  { at: 3000, stage: { kind: 'shot', shot: 1 }, haptic: 'commit' },
  { at: 4250, stage: { kind: 'shot', shot: 2 }, haptic: 'commit' },
  { at: 5500, stage: { kind: 'shot', shot: 3 }, haptic: 'commit' },
  { at: 6750, stage: { kind: 'shot', shot: 4 }, haptic: 'commit' },
  { at: 7450, stage: { kind: 'wait' } },
  { at: BOOTH_PRINT_AT_MS, stage: { kind: 'print' }, haptic: 'threshold' },
  {
    at: BOOTH_PRINT_AT_MS + BOOTH_PRINT_MS,
    stage: { kind: 'done' },
    haptic: 'success',
  },
];

function boothDisplay(
  stage: BoothStage,
  t: TFunction,
): { text: string; big: boolean; spoken: string } {
  switch (stage.kind) {
    case 'idle':
      return {
        text: t('memoryWorlds.booth.modern.display.ready'),
        big: false,
        spoken: '',
      };
    case 'count':
      return {
        text: String(stage.digit),
        big: true,
        spoken: String(stage.digit),
      };
    case 'shot':
      return {
        text: t('memoryWorlds.booth.modern.display.shot', {
          shot: stage.shot,
          shots: SHOTS,
        }),
        big: true,
        spoken: t('memoryWorlds.booth.shotSpoken', {
          shot: stage.shot,
          shots: SHOTS,
        }),
      };
    case 'wait':
      return {
        text: t('memoryWorlds.booth.modern.display.wait'),
        big: false,
        spoken: '',
      };
    case 'print':
      return {
        text: t('memoryWorlds.booth.modern.display.print'),
        big: false,
        spoken: t('memoryWorlds.booth.modern.printSpoken'),
      };
    case 'done':
      return {
        text: t('common.done'),
        big: false,
        spoken: t('memoryWorlds.booth.modern.doneSpoken'),
      };
  }
}

/** Points of a regular polygon, for the aperture blades. */
function polygon(cx: number, cy: number, r: number, sides: number, turn = 0) {
  return Array.from({ length: sides }, (_, index) => {
    const angle = turn + (index * 2 * Math.PI) / sides;
    return `${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`;
  }).join(' ');
}

const APERTURES = ['2.8', '4', '5.6', '8', '11', '16'];
/**
 * The maker's mark and the lens engraving: part of the hidden artwork like
 * the aperture numbers, the same in every language (not product copy).
 */
const CAMERA_MARK = 'eimir.';
const CAMERA_ENGRAVING = 'EIMIR 1:2.8 f=45mm · MADE FOR TWO';

/**
 * The camera behind the glass, built like an old rangefinder: chrome top
 * plate with flash reflector, viewfinder and self-timer light, black
 * leatherette body, and a chrome lens with a knurled focus ring, aperture
 * scale and coated glass. Per shot the flash fires and the shutter closes.
 * Artwork: its engravings are part of the picture, not product copy.
 */
const BoothCamera = memo(function BoothCamera({ shot }: { shot: number }) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (name: string) => `bc${raw}${name}`;
  const url = (name: string) => `url(#${id(name)})`;
  const cx = 100;
  const cy = 70;
  return (
    <svg
      className="memory-booth-camera"
      viewBox="0 0 200 128"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={id('chrome')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbfbf8" />
          <stop offset="0.35" stopColor="#cfcfca" />
          <stop offset="0.55" stopColor="#8e8e8a" />
          <stop offset="0.75" stopColor="#e4e4df" />
          <stop offset="1" stopColor="#a4a49f" />
        </linearGradient>
        <linearGradient id={id('mount')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f4f3ef" />
          <stop offset="0.45" stopColor="#8d8b86" />
          <stop offset="0.6" stopColor="#dedcd6" />
          <stop offset="1" stopColor="#6a6864" />
        </linearGradient>
        <linearGradient id={id('focus')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e9e8e3" />
          <stop offset="0.5" stopColor="#a9a8a3" />
          <stop offset="1" stopColor="#d6d5cf" />
        </linearGradient>
        <pattern
          id={id('leather')}
          width="3"
          height="3"
          patternUnits="userSpaceOnUse"
        >
          <rect width="3" height="3" fill="#1e1c1b" />
          <circle cx="0.8" cy="0.9" r="0.6" fill="#2d2a28" />
          <circle cx="2.2" cy="2.1" r="0.55" fill="#131211" />
          <circle cx="2.3" cy="0.6" r="0.35" fill="#282523" />
        </pattern>
        <linearGradient id={id('leatherLight')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.1" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.35" />
        </linearGradient>
        <radialGradient id={id('glass')} cx="44%" cy="40%" r="62%">
          <stop offset="0" stopColor="#3a4a6e" />
          <stop offset="0.35" stopColor="#1a1f36" />
          <stop offset="0.75" stopColor="#08080f" />
          <stop offset="1" stopColor="#020204" />
        </radialGradient>
        <linearGradient id={id('viewfinder')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6d7f9e" />
          <stop offset="0.5" stopColor="#1f2737" />
          <stop offset="1" stopColor="#3b4659" />
        </linearGradient>
        <linearGradient id={id('fresnel')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6f4ec" />
          <stop offset="1" stopColor="#c4bfb2" />
        </linearGradient>
        <radialGradient id={id('burst')}>
          <stop offset="0" stopColor="#fffef6" stopOpacity="1" />
          <stop offset="0.45" stopColor="#fff6d8" stopOpacity="0.6" />
          <stop offset="1" stopColor="#fff6d8" stopOpacity="0" />
        </radialGradient>
        <path
          id={id('ring')}
          d={`M ${cx - 25},${cy} a 25,25 0 1,1 50,0 a 25,25 0 1,1 -50,0`}
        />
      </defs>
      {/* Leatherette body with chrome top plate and base. */}
      <rect
        x="6"
        y="8"
        width="188"
        height="114"
        rx="10"
        fill={url('leather')}
      />
      <rect
        x="6"
        y="8"
        width="188"
        height="114"
        rx="10"
        fill={url('leatherLight')}
      />
      <rect x="6" y="6" width="188" height="34" rx="11" fill={url('chrome')} />
      <rect x="6" y="26" width="188" height="14" fill={url('chrome')} />
      <line x1="6" y1="40" x2="194" y2="40" stroke="#4c4b48" strokeWidth="1" />
      <line x1="6" y1="41" x2="194" y2="41" stroke="#000" strokeOpacity="0.5" />
      <rect x="6" y="114" width="188" height="8" rx="4" fill={url('chrome')} />
      {/* Flash reflector in a chrome frame. */}
      <rect
        x="13"
        y="10"
        width="46"
        height="26"
        rx="4"
        fill="#d9d8d3"
        stroke="#7d7c78"
        strokeWidth="0.8"
      />
      <rect
        x="16"
        y="13"
        width="40"
        height="20"
        rx="2.5"
        fill={url('fresnel')}
      />
      {[0, 1, 2, 3, 4, 5].map((line) => (
        <line
          key={`v${line}`}
          x1={21 + line * 6}
          y1="13.5"
          x2={21 + line * 6}
          y2="32.5"
          stroke="#000"
          strokeOpacity="0.09"
        />
      ))}
      {[0, 1].map((line) => (
        <line
          key={`h${line}`}
          x1="16.5"
          y1={19.5 + line * 7}
          x2="55.5"
          y2={19.5 + line * 7}
          stroke="#000"
          strokeOpacity="0.07"
        />
      ))}
      {/* Rangefinder and viewfinder windows, self-timer light. */}
      <rect
        x="138"
        y="13"
        width="12"
        height="10"
        rx="1.5"
        fill={url('viewfinder')}
        stroke="#5f5e5a"
        strokeWidth="0.8"
      />
      <rect
        x="156"
        y="12"
        width="20"
        height="13"
        rx="2"
        fill={url('viewfinder')}
        stroke="#5f5e5a"
        strokeWidth="0.8"
      />
      <circle
        cx="185"
        cy="18"
        r="4.6"
        fill="#a8a7a2"
        stroke="#6c6b67"
        strokeWidth="0.6"
      />
      <circle className="memory-booth-led" cx="185" cy="18" r="3" />
      <text
        x="166"
        y="35"
        textAnchor="middle"
        fontSize="5.5"
        fontStyle="italic"
        fontWeight="700"
        fill="#55544f"
        fontFamily="Georgia, serif"
      >
        {CAMERA_MARK}
      </text>
      {/* Lens: chrome mount, knurled focus ring, aperture scale, glass. */}
      <circle cx={cx} cy={cy} r="47" fill={url('mount')} />
      <circle
        cx={cx}
        cy={cy}
        r="44"
        fill={url('focus')}
        stroke="#6f6e6a"
        strokeWidth="0.6"
      />
      <circle
        cx={cx}
        cy={cy}
        r="41"
        fill="none"
        stroke="#5b5a56"
        strokeWidth="5"
        strokeDasharray="1.1 1.4"
      />
      <circle
        cx={cx}
        cy={cy}
        r="37.5"
        fill="#121214"
        stroke="#9a9994"
        strokeWidth="1"
      />
      {APERTURES.map((value, index) => {
        const angle = -Math.PI / 2 + ((index - 2.5) * Math.PI) / 9;
        return (
          <text
            key={value}
            x={cx + 34 * Math.cos(angle)}
            y={cy + 34 * Math.sin(angle) + 1.4}
            textAnchor="middle"
            fontSize="3.8"
            fill={value === '8' ? '#f2c94c' : '#e9e7e0'}
            fontFamily="system-ui, sans-serif"
          >
            {value}
          </text>
        );
      })}
      <circle cx={cx} cy={cy - 38.8} r="0.9" fill="#d8413a" />
      <circle
        cx={cx}
        cy={cy}
        r="30"
        fill="#0b0b0d"
        stroke="#3d3d43"
        strokeWidth="0.8"
      />
      <text
        fontSize="3.2"
        letterSpacing="0.35"
        fill="#d9d7d0"
        fillOpacity="0.8"
        fontFamily="system-ui, sans-serif"
      >
        <textPath href={`#${id('ring')}`} startOffset="6%">
          {CAMERA_ENGRAVING}
        </textPath>
      </text>
      <circle
        cx={cx}
        cy={cy}
        r="22"
        fill={url('glass')}
        stroke="#000"
        strokeWidth="1.5"
      />
      {/* Aperture blades behind the front element. */}
      <polygon
        points={polygon(cx, cy, 10, 7, 0.3)}
        fill="#030305"
        stroke="#34343c"
        strokeWidth="0.6"
      />
      {Array.from({ length: 7 }, (_, index) => {
        const angle = 0.3 + (index * 2 * Math.PI) / 7;
        return (
          <line
            // biome-ignore lint/suspicious/noArrayIndexKey: the blades are a fixed set.
            key={index}
            x1={cx + 10 * Math.cos(angle)}
            y1={cy + 10 * Math.sin(angle)}
            x2={cx + 17 * Math.cos(angle + 0.5)}
            y2={cy + 17 * Math.sin(angle + 0.5)}
            stroke="#2a2a33"
            strokeWidth="0.6"
          />
        );
      })}
      {/* Warm coating reflections, as on older single-coated lenses. */}
      <circle
        cx={cx}
        cy={cy}
        r="18"
        fill="none"
        stroke="#d98b3a"
        strokeOpacity="0.4"
        strokeWidth="2"
        strokeDasharray="18 200"
        transform={`rotate(198 ${cx} ${cy})`}
      />
      <circle
        cx={cx}
        cy={cy}
        r="14"
        fill="none"
        stroke="#a06bd6"
        strokeOpacity="0.28"
        strokeWidth="1.2"
        strokeDasharray="9 200"
        transform={`rotate(30 ${cx} ${cy})`}
      />
      <ellipse
        cx={cx - 7}
        cy={cy - 8}
        rx="8"
        ry="4.5"
        fill="#fff"
        fillOpacity="0.28"
        transform={`rotate(-35 ${cx - 7} ${cy - 8})`}
      />
      <circle
        cx={cx - 10}
        cy={cy - 11}
        r="1.5"
        fill="#fff"
        fillOpacity="0.85"
      />
      <circle cx={cx + 8} cy={cy + 9} r="1.1" fill="#fff" fillOpacity="0.4" />
      {shot > 0 ? (
        <g key={shot}>
          <polygon
            className="memory-booth-shutter"
            points={polygon(cx, cy, 23, 7, 0.3)}
            fill="#030305"
          />
          <circle
            className="memory-booth-flash-burst"
            cx="36"
            cy="23"
            r="34"
            fill={url('burst')}
          />
          <rect
            className="memory-booth-flash-fire"
            x="16"
            y="13"
            width="40"
            height="20"
            rx="2.5"
            fill="#fffef8"
          />
          <g className="memory-booth-flash-flare">
            <ellipse cx="36" cy="23" rx="34" ry="1.4" fill="#fff" />
            <ellipse cx="36" cy="23" rx="1.4" ry="20" fill="#fff" />
          </g>
        </g>
      ) : null}
    </svg>
  );
});

/** A booth with the style switch shown right below its heading. */
type BoothProps = MemoryWorldProps & { styleSwitch: ReactNode };

/**
 * The modern booth: press the button, the display counts down, the camera
 * takes four shots with its own flash, and a strip with four moments from
 * the same time is pushed out of the slot and develops. Pick the strip up
 * to see what each picture remembers, or hang it on the line below.
 */
function ModernBooth({
  entries,
  loadMemoryImage,
  onOpen,
  styleSwitch,
}: BoothProps) {
  const { t } = useTranslation();
  const strips = useMemo(() => boothStrips(entries), [entries]);
  const [printed, setPrinted] = useState<Printed[]>([]);
  const [stage, setStage] = useState<BoothStage>({ kind: 'idle' });
  const [animated, setAnimated] = useState(true);
  const [viewing, setViewing] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const outRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const lineId = useId();
  const timers = useTimers();
  const revealStrip = useRevealStrip(outRef);
  const focus = useFocusReturn(rootRef, buttonRef);
  useAmbient(rootRef);

  const latest = printed[printed.length - 1];
  const busy = stage.kind !== 'idle' && stage.kind !== 'done';
  const fresh =
    latest && !latest.kept && (stage.kind === 'print' || stage.kind === 'done')
      ? latest
      : null;
  const hung = printed
    .filter((item) => item.kept)
    .reverse()
    .slice(0, 6);
  const taken =
    stage.kind === 'shot'
      ? stage.shot
      : stage.kind === 'wait' || stage.kind === 'print' || stage.kind === 'done'
        ? SHOTS
        : 0;
  const display = boothDisplay(stage, t);
  const stripOf = (item: Printed) => strips[item.strip % strips.length];
  const viewed = printed.find((item) => item.run === viewing);

  const view = (run: number) => {
    focus.remember();
    setViewing(run);
  };
  const closeViewer = () => {
    if (viewing !== null) focus.request(viewing);
    setViewing(null);
  };
  const hangFresh = () => {
    if (latest) focus.request(latest.run);
    setViewing(null);
    setPrinted((previous) => previous.map((item) => ({ ...item, kept: true })));
    haptic('commit');
  };

  const press = () => {
    if (busy || strips.length === 0) return;
    haptic('press');
    const strip = latest ? (latest.strip + 1) % strips.length : 0;
    // A strip still lying at the slot goes onto the line first.
    setPrinted((previous) => printNext(previous, strip));
    timers.clear();
    if (prefersReducedMotion()) {
      setAnimated(false);
      setStage({ kind: 'done' });
      window.requestAnimationFrame(revealStrip);
      return;
    }
    setAnimated(true);
    for (const beat of BOOTH_TIMELINE) {
      const play = () => {
        setStage(beat.stage);
        if (beat.haptic) haptic(beat.haptic);
        if (beat.stage.kind === 'print')
          window.requestAnimationFrame(revealStrip);
      };
      // The countdown starts with the press itself.
      if (beat.at === 0) play();
      else timers.schedule(play, beat.at);
    }
  };

  if (strips.length === 0) return null;

  return (
    <div ref={rootRef} className="memory-booth-modern">
      <WorldHead heading={t('memoryWorlds.booth.modern.heading')} />
      {styleSwitch}
      <div
        className="memory-booth"
        data-stage={stage.kind}
        data-digit={stage.kind === 'count' ? stage.digit : undefined}
      >
        <div className="memory-booth-sign" aria-hidden="true">
          {t('memoryWorlds.booth.modern.sign')}
        </div>
        <div className="memory-booth-panel" aria-hidden="true">
          <div className="memory-booth-window">
            <BoothCamera shot={stage.kind === 'shot' ? stage.shot : 0} />
            {stage.kind === 'shot' ? (
              <span className="memory-booth-window-glow" key={stage.shot} />
            ) : null}
          </div>
          <div className="memory-booth-status">
            <div
              className="memory-booth-display"
              data-size={display.big ? 'big' : undefined}
            >
              <span key={display.text}>{display.text}</span>
            </div>
            <div className="memory-booth-lamps">
              {Array.from({ length: SHOTS }, (_, index) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: one lamp per shot.
                  key={index}
                  className="memory-booth-lamp"
                  data-on={index < taken ? 'true' : undefined}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="memory-booth-controls">
          <button
            ref={buttonRef}
            type="button"
            className="memory-booth-button"
            onClick={press}
            aria-disabled={busy || undefined}
          >
            <svg
              className="memory-booth-button-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <rect
                x="7"
                y="2"
                width="10"
                height="20"
                rx="1.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M9 5h6v3.5H9zM9 10.25h6v3.5H9zM9 15.5h6V19H9z"
                fill="currentColor"
              />
            </svg>
            <span>
              {busy
                ? t('memoryWorlds.booth.modern.printing')
                : printed.length
                  ? t('memoryWorlds.booth.modern.printAgain')
                  : t('memoryWorlds.booth.modern.print')}
            </span>
          </button>
          <span className="memory-booth-coin-slot" aria-hidden="true" />
        </div>
        <div className="memory-booth-slot" aria-hidden="true" />
      </div>
      <p className="sr-only" aria-live="polite">
        {display.spoken}
      </p>
      <div className="memory-booth-out" ref={outRef}>
        {fresh ? (
          <div
            className="memory-booth-fresh"
            key={fresh.run}
            data-animate={animated ? 'true' : undefined}
          >
            <Strip
              strip={stripOf(fresh)}
              run={fresh.run}
              look="modern"
              loadMemoryImage={loadMemoryImage}
              onView={() => view(fresh.run)}
            />
          </div>
        ) : null}
      </div>
      {fresh && stage.kind === 'done' ? (
        <div className="memory-booth-fresh-actions">
          <button
            type="button"
            className="memory-booth-primary"
            onClick={() => view(fresh.run)}
          >
            {t('memoryWorlds.booth.view')}
          </button>
          <button
            type="button"
            className="memory-booth-secondary"
            onClick={hangFresh}
          >
            {t('memoryWorlds.booth.modern.hang')}
          </button>
        </div>
      ) : null}
      {hung.length > 0 ? (
        <section className="memory-booth-line" aria-labelledby={lineId}>
          <h3 id={lineId}>{t('memoryWorlds.booth.modern.line')}</h3>
          <div className="memory-booth-line-row" data-primary-tab-swipe-block>
            {hung.map((item) => (
              <div
                key={item.run}
                className="memory-booth-hung"
                style={
                  {
                    '--tilt': item.run % 2 ? '2deg' : '-2deg',
                    '--sway-i': item.run % 3,
                    '--sway-amp': `${1.4 + (item.run % 2) * 0.8}deg`,
                  } as CSSProperties
                }
              >
                <span className="memory-booth-peg" aria-hidden="true" />
                <Strip
                  strip={stripOf(item)}
                  run={item.run}
                  look="modern"
                  small
                  loadMemoryImage={loadMemoryImage}
                  onView={() => view(item.run)}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {viewed ? (
        <BoothViewer
          strip={stripOf(viewed)}
          loadMemoryImage={loadMemoryImage}
          onOpen={onOpen}
          onClose={closeViewer}
          onKeep={viewed.kept ? undefined : hangFresh}
          keepLabel={t('memoryWorlds.booth.modern.hang')}
        />
      ) : null}
    </div>
  );
}

/* ---------- Klassisch ---------- */

/**
 * One visit to the old cabin: the coin drops, the curtain closes, four
 * flashes light up the curtain, the curtain opens again, the development
 * dial runs, and the wet strip drops out of the chute.
 */
type CabinStage =
  | { kind: 'idle' }
  | { kind: 'coin' }
  | { kind: 'closing' }
  | { kind: 'shot'; shot: number }
  | { kind: 'develop' }
  | { kind: 'drop' }
  | { kind: 'done' };

/** The develop stage; `--memory-booth-dial-run-duration` has the same length. */
const CABIN_DEVELOP_MS = 5000;
const CABIN_DEVELOP_AT_MS = 7000;
/** The strip lands this long after it starts to drop. */
const CABIN_LAND_MS = 520;
const CABIN_TIMELINE: readonly (Beat<CabinStage> & { wet?: true })[] = [
  { at: 0, stage: { kind: 'coin' } },
  { at: 350, stage: { kind: 'coin' }, haptic: 'threshold' },
  { at: 800, stage: { kind: 'closing' } },
  { at: 2300, stage: { kind: 'shot', shot: 1 }, haptic: 'commit' },
  { at: 3600, stage: { kind: 'shot', shot: 2 }, haptic: 'commit' },
  { at: 4900, stage: { kind: 'shot', shot: 3 }, haptic: 'commit' },
  { at: 6200, stage: { kind: 'shot', shot: 4 }, haptic: 'commit' },
  { at: CABIN_DEVELOP_AT_MS, stage: { kind: 'develop' } },
  // The dial ticks every minute of the development.
  { at: 8000, stage: { kind: 'develop' }, haptic: 'threshold' },
  { at: 9000, stage: { kind: 'develop' }, haptic: 'threshold' },
  { at: 10000, stage: { kind: 'develop' }, haptic: 'threshold' },
  { at: 11000, stage: { kind: 'develop' }, haptic: 'threshold' },
  {
    at: CABIN_DEVELOP_AT_MS + CABIN_DEVELOP_MS,
    stage: { kind: 'drop' },
    wet: true,
  },
  {
    at: CABIN_DEVELOP_AT_MS + CABIN_DEVELOP_MS + CABIN_LAND_MS,
    stage: { kind: 'drop' },
    haptic: 'success',
  },
  {
    at: CABIN_DEVELOP_AT_MS + CABIN_DEVELOP_MS + 1000,
    stage: { kind: 'done' },
  },
];

/** The fresh strip dries by this much every tick (`--memory-booth-dry-duration`). */
const DRY_STEP = 0.07;
const DRY_TICK_MS = 500;
/** Waving the strip dries it by one per this many px of travel. */
const WAVE_DRY_PX = 1400;
/** A drag starts after this much travel; the coin snaps into the slot within this distance. */
const COIN_DRAG_PX = 6;
const COIN_SNAP_PX = 48;
const WAVE_START_PX = 8;
const SWING_MAX_DEG = 16;
/** A click right after a drag is not a tap. */
const CLICK_GUARD_MS = 80;

function cabinStatus(stage: CabinStage): 'free' | 'busy' | 'wait' {
  switch (stage.kind) {
    case 'coin':
    case 'closing':
    case 'shot':
      return 'busy';
    case 'develop':
      return 'wait';
    default:
      return 'free';
  }
}

/** `wetRun`: the strip of an animated run comes out wet. */
function cabinSpoken(stage: CabinStage, wetRun: boolean, t: TFunction): string {
  switch (stage.kind) {
    case 'coin':
      return t('memoryWorlds.booth.classic.coinSpoken');
    case 'closing':
      return t('memoryWorlds.booth.classic.closingSpoken');
    case 'shot':
      return t('memoryWorlds.booth.shotSpoken', {
        shot: stage.shot,
        shots: SHOTS,
      });
    case 'develop':
      return t('memoryWorlds.booth.classic.developSpoken');
    case 'drop':
    case 'done':
      return wetRun
        ? t('memoryWorlds.booth.classic.wetSpoken')
        : t('memoryWorlds.booth.classic.doneSpoken');
    default:
      return '';
  }
}

/** The sample strip in the display case: four little poses of a couple. */
const SAMPLE_HEADS: readonly (readonly [number, number, number])[][] = [
  [
    [13, 13, 0],
    [25, 14, 0],
  ],
  [[19, 13, -12]],
  [
    [15, 13, 14],
    [23, 13, -14],
  ],
  [
    [12, 12, -6],
    [26, 14, 8],
  ],
];

function CabinSampleStrip() {
  return (
    <svg
      className="memory-booth-cabin-sample"
      viewBox="0 0 38 136"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="38" height="136" fill="#f1ede3" />
      {SAMPLE_HEADS.map((frame, index) => (
        <g
          // biome-ignore lint/suspicious/noArrayIndexKey: the poses are a fixed set.
          key={index}
          transform={`translate(3 ${3 + index * 33})`}
        >
          <rect
            width="32"
            height="30"
            fill={index % 2 ? '#8a8781' : '#a29f98'}
          />
          {frame.map(([x, y, tilt]) => (
            <g key={`${x}-${y}`} transform={`rotate(${tilt} ${x} ${y + 6})`}>
              <ellipse cx={x} cy={y} rx="4.6" ry="5.6" fill="#2c2b29" />
              <path
                d={`M ${x - 8} 30 Q ${x} ${y + 3} ${x + 8} 30 Z`}
                fill="#3a3936"
              />
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}

const DIAL_MINUTES = [0, 1, 2, 3, 4];

/**
 * The old cabin from the station: drag the coin into the slot, the curtain
 * closes and four flashes shine through it, the development dial runs for a
 * while, then a wet strip in faded colour with moments from the diary drops
 * out of the chute. Wave it dry, look at it, or put it in the tin.
 */
function ClassicCabin({
  entries,
  loadMemoryImage,
  onOpen,
  styleSwitch,
}: BoothProps) {
  const { t } = useTranslation();
  const strips = useMemo(() => boothStrips(entries), [entries]);
  const [printed, setPrinted] = useState<Printed[]>([]);
  const [stage, setStage] = useState<CabinStage>({ kind: 'idle' });
  const [animated, setAnimated] = useState(true);
  const [viewing, setViewing] = useState<number | null>(null);
  const [coinDrag, setCoinDrag] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [nearSlot, setNearSlot] = useState(false);
  const [coinFlight, setCoinFlight] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [coinBack, setCoinBack] = useState(false);
  const [wet, setWet] = useState(0);
  const [swing, setSwing] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const coinRef = useRef<HTMLButtonElement>(null);
  const slotRef = useRef<HTMLSpanElement>(null);
  const outRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const coinStart = useRef<{
    x: number;
    y: number;
    id: number;
    moved: boolean;
  } | null>(null);
  const wave = useRef<{
    x: number;
    last: number;
    id: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const timers = useTimers();
  const revealStrip = useRevealStrip(outRef);
  const focus = useFocusReturn(rootRef, coinRef);
  useAmbient(rootRef);

  // The fresh strip dries by itself within a few seconds.
  useEffect(() => {
    if (wet <= 0) return;
    const timer = window.setTimeout(() => {
      const next = Math.max(0, wet - DRY_STEP);
      if (next === 0) haptic('success');
      setWet(next);
    }, DRY_TICK_MS);
    return () => window.clearTimeout(timer);
  }, [wet]);

  const latest = printed[printed.length - 1];
  const busy = stage.kind !== 'idle' && stage.kind !== 'done';
  const fresh =
    latest && !latest.kept && (stage.kind === 'drop' || stage.kind === 'done')
      ? latest
      : null;
  const boxed = printed
    .filter((item) => item.kept)
    .reverse()
    .slice(0, 8);
  const status = cabinStatus(stage);
  const stripOf = (item: Printed) => strips[item.strip % strips.length];
  const viewed = printed.find((item) => item.run === viewing);
  const curtainClosed =
    stage.kind === 'coin' || stage.kind === 'closing' || stage.kind === 'shot';

  const guardClick = () => {
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, CLICK_GUARD_MS);
  };

  const view = (run: number) => {
    focus.remember();
    setViewing(run);
  };
  const closeViewer = () => {
    if (viewing !== null) focus.request(viewing);
    setViewing(null);
  };
  const boxFresh = () => {
    if (latest) focus.request(latest.run);
    setViewing(null);
    setPrinted((previous) => previous.map((item) => ({ ...item, kept: true })));
    haptic('commit');
  };

  const insert = () => {
    if (busyRef.current || strips.length === 0) return;
    busyRef.current = true;
    haptic('press');
    // Fly the coin from where it is into the slot.
    const coinBox = coinRef.current?.getBoundingClientRect();
    const slotBox = slotRef.current?.getBoundingClientRect();
    if (coinBox && slotBox) {
      const offset = coinDrag ?? { x: 0, y: 0 };
      setCoinFlight({
        x:
          slotBox.left +
          slotBox.width / 2 -
          (coinBox.left + coinBox.width / 2) +
          offset.x,
        y:
          slotBox.top +
          slotBox.height / 2 -
          (coinBox.top + coinBox.height / 2) +
          offset.y,
      });
    }
    setCoinDrag(null);
    setNearSlot(false);
    const strip = latest ? (latest.strip + 1) % strips.length : 0;
    // A strip still lying below the chute goes into the tin first.
    setPrinted((previous) => printNext(previous, strip));
    setWet(0);
    timers.clear();
    const finish = () => {
      busyRef.current = false;
      setCoinFlight(null);
      setCoinBack(true);
    };
    if (prefersReducedMotion()) {
      setAnimated(false);
      setStage({ kind: 'done' });
      finish();
      window.requestAnimationFrame(revealStrip);
      return;
    }
    setAnimated(true);
    for (const beat of CABIN_TIMELINE) {
      const play = () => {
        setStage(beat.stage);
        if (beat.haptic) haptic(beat.haptic);
        if (beat.wet) {
          setWet(1);
          window.requestAnimationFrame(revealStrip);
        }
        if (beat.stage.kind === 'done') finish();
      };
      // The coin drops with the press itself.
      if (beat.at === 0) play();
      else timers.schedule(play, beat.at);
    }
  };

  const slotDistance = (dx: number, dy: number) => {
    const coinBox = coinRef.current?.getBoundingClientRect();
    const slotBox = slotRef.current?.getBoundingClientRect();
    if (!coinBox || !slotBox || !coinDrag) return Number.POSITIVE_INFINITY;
    const x = coinBox.left + coinBox.width / 2 - coinDrag.x + dx;
    const y = coinBox.top + coinBox.height / 2 - coinDrag.y + dy;
    return Math.hypot(
      x - (slotBox.left + slotBox.width / 2),
      y - (slotBox.top + slotBox.height / 2),
    );
  };

  // The coin follows the finger 1:1; near the slot it snaps in on release.
  const onCoinDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (busy || event.button !== 0) return;
    setCoinBack(false);
    coinStart.current = {
      x: event.clientX,
      y: event.clientY,
      id: event.pointerId,
      moved: false,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The pointer may already be gone (e.g. a cancelled touch).
    }
    setCoinDrag({ x: 0, y: 0 });
  };
  const onCoinMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = coinStart.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) > COIN_DRAG_PX) start.moved = true;
    setCoinDrag({ x: dx, y: dy });
    const near = slotDistance(dx, dy) < COIN_SNAP_PX;
    if (near !== nearSlot) {
      setNearSlot(near);
      if (near) haptic('threshold');
    }
  };
  const onCoinUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = coinStart.current;
    if (!start || start.id !== event.pointerId) return;
    coinStart.current = null;
    guardClick();
    if (!start.moved || nearSlot) {
      insert();
    } else {
      setCoinDrag(null);
      setNearSlot(false);
    }
  };
  const onCoinCancel = () => {
    coinStart.current = null;
    setCoinDrag(null);
    setNearSlot(false);
  };

  // Waving the wet strip: it swings from the fingers and dries faster.
  const onWaveDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    wave.current = {
      x: event.clientX,
      last: event.clientX,
      id: event.pointerId,
      moved: false,
    };
  };
  const onWaveMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = wave.current;
    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.x;
    if (!current.moved && Math.abs(dx) > WAVE_START_PX) {
      current.moved = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The pointer may already be gone (e.g. a cancelled touch).
      }
    }
    if (!current.moved) return;
    setSwing(Math.max(-SWING_MAX_DEG, Math.min(SWING_MAX_DEG, dx / 5)));
    const step = Math.abs(event.clientX - current.last);
    current.last = event.clientX;
    if (wet > 0) {
      const next = Math.max(0, wet - step / WAVE_DRY_PX);
      if (next === 0) haptic('success');
      setWet(next);
    }
  };
  const onWaveUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = wave.current;
    if (!current || current.id !== event.pointerId) return;
    wave.current = null;
    if (current.moved) guardClick();
    setSwing(0);
  };
  const viewFresh = (run: number) => {
    if (suppressClick.current) return;
    view(run);
  };

  if (strips.length === 0) return null;

  const coinStyle: CSSProperties | undefined = coinFlight
    ? ({
        '--coin-x': `${coinFlight.x}px`,
        '--coin-y': `${coinFlight.y}px`,
      } as CSSProperties)
    : coinDrag
      ? { translate: `${coinDrag.x}px ${coinDrag.y}px` }
      : undefined;

  return (
    <div ref={rootRef} className="memory-booth-classic">
      <WorldHead heading={t('memoryWorlds.booth.classic.heading')} />
      {styleSwitch}
      <div
        className="memory-booth-cabin-scene"
        data-stage={stage.kind}
        data-primary-tab-swipe-block
      >
        <div className="memory-booth-cabin-floor" aria-hidden="true" />
        <div className="memory-booth-cabin">
          <div className="memory-booth-cabin-crown" aria-hidden="true">
            <span className="memory-booth-cabin-neon">
              {t('memoryWorlds.booth.classic.neon')}
            </span>
            <span className="memory-booth-cabin-tagline">
              {t('memoryWorlds.booth.classic.tagline', { shots: SHOTS })}
            </span>
          </div>
          <div className="memory-booth-cabin-body">
            <div className="memory-booth-cabin-door" aria-hidden="true">
              <span className="memory-booth-cabin-status" data-tone={status}>
                {t(`memoryWorlds.booth.classic.status.${status}`)}
              </span>
              <span className="memory-booth-cabin-inside">
                <span className="memory-booth-cabin-mirror" />
                <span className="memory-booth-cabin-stool" />
              </span>
              <span className="memory-booth-cabin-rod" />
              <span
                className="memory-booth-cabin-curtain"
                data-closed={curtainClosed ? 'true' : undefined}
              />
              {stage.kind === 'shot' ? (
                <span className="memory-booth-cabin-flash" key={stage.shot} />
              ) : null}
            </div>
            <div className="memory-booth-cabin-machine" aria-hidden="true">
              <span className="memory-booth-cabin-showcase">
                <span className="memory-booth-cabin-showcase-label">
                  {t('memoryWorlds.booth.classic.sample')}
                </span>
                <CabinSampleStrip />
                <CabinSampleStrip />
              </span>
              <span className="memory-booth-cabin-price">
                <strong>
                  {t('memoryWorlds.booth.classic.price', { shots: SHOTS })}
                </strong>
                <span>{t('memoryWorlds.booth.classic.priceAmount')}</span>
              </span>
              <span
                className="memory-booth-cabin-coinplate"
                data-near={nearSlot ? 'true' : undefined}
              >
                <span className="memory-booth-cabin-slot" ref={slotRef} />
                <span>{t('memoryWorlds.booth.classic.insertHere')}</span>
              </span>
              <span className="memory-booth-cabin-dial">
                <span className="memory-booth-cabin-dial-face">
                  {DIAL_MINUTES.map((minute) => (
                    <span
                      key={minute}
                      className="memory-booth-cabin-dial-num"
                      style={
                        { '--a': `${-135 + minute * 67.5}deg` } as CSSProperties
                      }
                    >
                      {minute}
                    </span>
                  ))}
                  <span className="memory-booth-cabin-dial-hand" />
                  <span className="memory-booth-cabin-dial-caption">
                    {t('memoryWorlds.booth.classic.dial')}
                  </span>
                </span>
              </span>
            </div>
          </div>
          <div className="memory-booth-cabin-base" aria-hidden="true">
            <span className="memory-booth-cabin-chute">
              {t('memoryWorlds.booth.classic.chute')}
            </span>
          </div>
        </div>
        {stage.kind === 'shot' ? (
          <span
            className="memory-booth-cabin-spill"
            key={stage.shot}
            aria-hidden="true"
          />
        ) : null}
        <button
          type="button"
          ref={coinRef}
          className="memory-booth-cabin-coin"
          data-state={
            coinFlight
              ? 'inserting'
              : coinDrag
                ? 'dragging'
                : busy
                  ? 'gone'
                  : coinBack
                    ? 'back'
                    : undefined
          }
          style={coinStyle}
          onPointerDown={onCoinDown}
          onPointerMove={onCoinMove}
          onPointerUp={onCoinUp}
          onPointerCancel={onCoinCancel}
          onClick={() => {
            if (!suppressClick.current) insert();
          }}
          aria-disabled={busy || undefined}
          aria-label={t('memoryWorlds.booth.classic.coin')}
        >
          <span aria-hidden="true">
            {t('memoryWorlds.booth.classic.coinValue')}
          </span>
        </button>
        {!busy && !coinDrag && !fresh ? (
          <span className="memory-booth-cabin-hint" aria-hidden="true">
            {t('memoryWorlds.booth.classic.hint')}
          </span>
        ) : null}
      </div>
      <p className="sr-only" aria-live="polite">
        {cabinSpoken(stage, animated, t)}
      </p>
      <div className="memory-booth-cabin-out" ref={outRef}>
        {fresh ? (
          <div
            className="memory-booth-cabin-fresh"
            key={fresh.run}
            data-animate={animated ? 'true' : undefined}
            data-waving={swing !== 0 ? 'true' : undefined}
            data-primary-tab-swipe-block
            style={{ '--swing': `${swing}deg` } as CSSProperties}
            onPointerDown={onWaveDown}
            onPointerMove={onWaveMove}
            onPointerUp={onWaveUp}
            onPointerCancel={onWaveUp}
          >
            <Strip
              strip={stripOf(fresh)}
              run={fresh.run}
              look="classic"
              wet={wet}
              loadMemoryImage={loadMemoryImage}
              onView={() => viewFresh(fresh.run)}
            />
          </div>
        ) : null}
      </div>
      {fresh && stage.kind === 'done' ? (
        wet > 0 ? (
          <p className="memory-booth-cabin-wet-hint">
            {t('memoryWorlds.booth.classic.wetHint')}
          </p>
        ) : (
          <div className="memory-booth-fresh-actions">
            <button
              type="button"
              className="memory-booth-primary"
              onClick={() => view(fresh.run)}
            >
              {t('memoryWorlds.booth.view')}
            </button>
            <button
              type="button"
              className="memory-booth-secondary"
              onClick={boxFresh}
            >
              {t('memoryWorlds.booth.classic.box')}
            </button>
          </div>
        )
      ) : null}
      {boxed.length > 0 ? (
        <section
          className="memory-booth-cabin-tin"
          aria-label={t('memoryWorlds.booth.classic.tinLabel')}
        >
          <h3>{t('memoryWorlds.booth.classic.tin')}</h3>
          <div
            className="memory-booth-cabin-tin-row"
            data-primary-tab-swipe-block
          >
            {boxed.map((item, index) => (
              <div
                key={item.run}
                className="memory-booth-cabin-tin-item"
                style={
                  {
                    '--tilt': `${((item.run * 37) % 9) - 4}deg`,
                    '--i': index,
                  } as CSSProperties
                }
              >
                <Strip
                  strip={stripOf(item)}
                  run={item.run}
                  look="classic"
                  small
                  loadMemoryImage={loadMemoryImage}
                  onView={() => view(item.run)}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {viewed ? (
        <BoothViewer
          strip={stripOf(viewed)}
          loadMemoryImage={loadMemoryImage}
          onOpen={onOpen}
          onClose={closeViewer}
          onKeep={viewed.kept ? undefined : boxFresh}
          keepLabel={t('memoryWorlds.booth.classic.box')}
          tone="retro"
        />
      ) : null}
    </div>
  );
}

/* ---------- The world ---------- */

/**
 * The photo booth world with its style switch (Klassisch or Modern,
 * remembered on this device), right below the booth's heading.
 */
export function PhotoBoothWorld(props: MemoryWorldProps) {
  const { t } = useTranslation();
  const style = useBoothStyle();
  if (props.entries.length === 0) return null;
  const styleSwitch = (
    // biome-ignore lint/a11y/useSemanticElements: a pair of toggle buttons, not a form fieldset.
    <div
      className="memory-booth-style"
      role="group"
      aria-label={t('memoryWorlds.booth.styleLabel')}
    >
      {BOOTH_STYLES.map((value) => (
        <button
          key={value}
          type="button"
          className="memory-booth-style-option"
          aria-pressed={style === value}
          onClick={() => setBoothStyle(value)}
        >
          {t(`memoryWorlds.booth.style.${value}`)}
        </button>
      ))}
    </div>
  );
  return (
    <div className="memory-booth-world" data-style={style}>
      {style === 'classic' ? (
        <ClassicCabin {...props} styleSwitch={styleSwitch} />
      ) : (
        <ModernBooth {...props} styleSwitch={styleSwitch} />
      )}
    </div>
  );
}
