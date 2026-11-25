/**
 * Fotobuch (#2283): the rediscovery selection as a premium layflat photo
 * book. A linen hardcover with a debossed photo window opens onto warm white
 * pages: every moment from old to new, full-bleed and precisely framed photos
 * in an editorial layout that changes from page to page, minimal season
 * chapter openers when the book spans several seasons, a page of its own for
 * the rediscovered moment, typographic pages for heart moments, milestones
 * and words, and an end page that shows the most recent photo as a print.
 *
 * Every page is a paper leaf that turns over around the spine in 3D: it
 * follows the finger 1:1 while dragged sideways (Motion Contract 4.6; a
 * vertical swipe keeps scrolling, a drag captures the pointer only once it is
 * one, so a tap still reaches a photo's link) and turns by itself on a tap on
 * the paper (right half forward, left half back), a key or a button. The
 * first and last pages resist with a small lift. Only the open page and its
 * neighbours are mounted; a jump (Home, End, back to the start) mounts its
 * target as the neighbour on its side. The closed book invites once with a
 * small lift of the cover's edge when it is first seen.
 *
 * Keyboard and screen readers: the book is one focusable group (arrow keys
 * and PageUp/PageDown turn, Home/End jump), hidden previous/next buttons
 * turn for the virtual cursor, and a live region announces the page. With
 * reduced motion the page changes at once behind a short crossfade.
 *
 * The turn engine: `src/motion/photoAlbum.ts`; the invite keyframes and
 * timing roles: `src/motion/memory-worlds.css`.
 */
import type { TFunction } from 'i18next';
import {
  type AnimationEvent as ReactAnimationEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { useContainerUnits } from '../../client/containerUnits';
import { resolvedLocale, useTranslation } from '../../i18n';
import { haptic } from '../../motion/haptics';
import {
  ALBUM_CURVES,
  ALBUM_TURN,
  type AlbumCurve,
  type AlbumTurn,
  dragAngle,
  dragCommitted,
  dragGrab,
  nudgeAngle,
  paintFade,
  paintTurn,
  releaseCompletes,
  releaseDuration,
  runAlbumTween,
} from '../../motion/photoAlbum';
import { observeVisibility } from '../../motion/visibility';
import { KeepsakeStampMark } from '../DiscoverKeepsakes';
import { MemoryPhoto } from './MemoryPhoto';
import {
  type LoadMemoryImage,
  type MemoryWorldEntry,
  type MemoryWorldProps,
  type OpenMemoryWorldItem,
  prefersReducedMotion,
  type SeasonKey,
  seasonOf,
  seasonSpan,
} from './model';
import '../HeartEmotionVisual.css';
import '../../motion/memory-worlds.css';
import './MemoryWorld.css';
import './PhotoAlbumWorld.css';
import { useWorldEntered } from './WorldEnter';

/** Horizontal movement before a drag takes over (taps still reach links). */
const DRAG_START_PX = 8;
const VERTICAL_CANCEL_PX = 10;
/** Reduced motion: horizontal distance that changes the page on release. */
const INSTANT_SWIPE_PX = 48;
/** A click right after a drag is not a tap. */
const CLICK_RESET_MS = 80;
/** Finger velocity older than this is stale when the finger lets go. */
const VELOCITY_STALE_MS = 90;
/** The pixel-unit element of the book (see client/containerUnits.ts). */
const UNIT_SELECTOR = '.memory-album-book';
/** The name of the cover's invite keyframes (`memory-worlds.css`). */
const INVITE_ANIMATION = 'eimir-motion-memory-album-invite';

/* ---------- Pages ---------- */

export type AlbumPhotoLayout =
  | 'bleed'
  | 'framed'
  | 'feature'
  | 'stack'
  | 'pair'
  | 'mosaic'
  | 'mosaic-mirror';

const LAYOUT_SIZE: Record<AlbumPhotoLayout, number> = {
  bleed: 1,
  framed: 1,
  feature: 1,
  stack: 2,
  pair: 2,
  mosaic: 3,
  'mosaic-mirror': 3,
};

/** The editorial rhythm photo pages follow, so neighbouring pages differ. */
const PHOTO_RHYTHM: readonly AlbumPhotoLayout[] = [
  'bleed',
  'stack',
  'mosaic',
  'framed',
  'pair',
  'mosaic-mirror',
  'feature',
];
const SINGLE_LAYOUTS: readonly AlbumPhotoLayout[] = [
  'bleed',
  'framed',
  'feature',
];

function fitLayout(rhythm: number, available: number): AlbumPhotoLayout {
  const wanted = PHOTO_RHYTHM[rhythm % PHOTO_RHYTHM.length];
  if (LAYOUT_SIZE[wanted] <= available) return wanted;
  if (available >= 2) return rhythm % 2 === 0 ? 'stack' : 'pair';
  return SINGLE_LAYOUTS[rhythm % SINGLE_LAYOUTS.length];
}

type TextKind = 'heart' | 'milestone' | 'words';

export type AlbumPage =
  | {
      kind: 'cover';
      key: string;
      photo?: MemoryWorldEntry;
      first: Date;
      last: Date;
      count: number;
    }
  | {
      kind: 'opener';
      key: string;
      season: SeasonKey;
      /** The year the season ends in (winter 2025/26 is 2026). */
      year: number;
      count: number;
    }
  | {
      kind: 'photos';
      key: string;
      layout: AlbumPhotoLayout;
      entries: MemoryWorldEntry[];
    }
  | { kind: TextKind; key: string; entry: MemoryWorldEntry }
  | { kind: 'end'; key: string; photo?: MemoryWorldEntry };

/**
 * The cover, then every moment from old to new. Several seasons get minimal
 * chapter openers; runs of photos are set in a changing editorial rhythm;
 * the rediscovered moment gets a page of its own; heart moments, milestones
 * and words each get a typographic page. The end page closes the book.
 */
export function buildAlbumPages(entries: readonly MemoryWorldEntry[]) {
  if (entries.length === 0) return [];
  const lead = entries.find((entry) => entry.isLead) ?? entries[0];
  const sorted = [...entries].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  const pages: AlbumPage[] = [
    {
      kind: 'cover',
      key: 'cover',
      photo:
        lead.kind === 'photo'
          ? lead
          : sorted.find((entry) => entry.kind === 'photo'),
      first: sorted[0].date,
      last: sorted[sorted.length - 1].date,
      count: entries.length,
    },
  ];

  const groups: {
    season: ReturnType<typeof seasonOf>;
    entries: MemoryWorldEntry[];
  }[] = [];
  for (const entry of sorted) {
    const season = seasonOf(entry.date);
    const last = groups[groups.length - 1];
    if (last && last.season.key === season.key) last.entries.push(entry);
    else groups.push({ season, entries: [entry] });
  }

  const chapters = groups.length > 1;
  let rhythm = 0;
  for (const group of groups) {
    if (chapters)
      pages.push({
        kind: 'opener',
        key: `season-${group.season.key}`,
        season: group.season.season,
        year: group.season.year,
        count: group.entries.length,
      });
    let run: MemoryWorldEntry[] = [];
    const flush = () => {
      let from = 0;
      while (from < run.length) {
        const layout = fitLayout(rhythm, run.length - from);
        const slice = run.slice(from, from + LAYOUT_SIZE[layout]);
        pages.push({
          kind: 'photos',
          key: `photos-${slice[0].key}`,
          layout,
          entries: slice,
        });
        from += slice.length;
        rhythm += 1;
      }
      run = [];
    };
    for (const entry of group.entries) {
      const kind = entry.kind;
      if (entry === lead && kind === 'photo') {
        flush();
        pages.push({
          kind: 'photos',
          key: `lead-${entry.key}`,
          layout: 'feature',
          entries: [entry],
        });
        continue;
      }
      if (kind === 'photo') {
        run.push(entry);
        continue;
      }
      flush();
      pages.push({ kind, key: `${kind}-${entry.key}`, entry });
    }
    flush();
  }

  // The closing page shows the most recent photo memory as a print.
  const lastPhoto = [...sorted]
    .reverse()
    .find((entry) => entry.kind === 'photo');
  pages.push({ kind: 'end', key: 'end', photo: lastPhoto });
  return pages;
}

/** "2026", or "2025/26" for a winter across the turn of the year. */
function yearLabel(season: SeasonKey, year: number, t: TFunction) {
  return season === 'winter'
    ? t('memoryWorlds.album.winterYear', {
        from: year - 1,
        to: String(year).slice(2),
      })
    : String(year);
}

/** What the live region says about a page. */
export function albumPageLabel(page: AlbumPage, t: TFunction): string {
  switch (page.kind) {
    case 'cover':
      return t('memoryWorlds.album.pageLabel.cover');
    case 'opener':
      return `${t(`rediscovery.season.${page.season}`)} ${yearLabel(page.season, page.year, t)}`;
    case 'photos':
      return page.entries.length === 1
        ? page.entries[0].title
        : t('memoryWorlds.album.pageLabel.photos', {
            count: page.entries.length,
          });
    case 'heart':
      return t('memoryWorlds.album.pageLabel.heart');
    case 'milestone':
      return t('memoryWorlds.album.pageLabel.milestone', {
        title: page.entry.title,
      });
    case 'words':
      return page.entry.title;
    case 'end':
      return t('memoryWorlds.album.pageLabel.end');
  }
}

function lengthClass(text: string) {
  return text.length > 150 ? 'long' : text.length > 60 ? 'medium' : 'short';
}

const monthFormatters = new Map<string, Intl.DateTimeFormat>();

/** The month and year under a milestone's large day, e.g. "Juni 2024". */
function monthYear(date: Date, locale: string) {
  if (Number.isNaN(date.getTime())) return '';
  let format = monthFormatters.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, {
      month: 'long',
      year: 'numeric',
    });
    monthFormatters.set(locale, format);
  }
  return format.format(date);
}

/* ---------- Page pieces ---------- */

function Caption({
  entry,
  kicker,
}: {
  entry: MemoryWorldEntry;
  kicker?: string;
}) {
  return (
    <span className="memory-album-cap">
      {kicker ? (
        <span className="memory-album-cap-kicker">{kicker}</span>
      ) : null}
      <span className="memory-album-cap-title">{entry.title}</span>
      <time dateTime={entry.dateTime}>{entry.dateLabel}</time>
    </span>
  );
}

function PhotoItem({
  entry,
  kicker,
  caption = true,
  loadMemoryImage,
  onOpen,
}: {
  entry: MemoryWorldEntry;
  kicker?: string;
  caption?: boolean;
  loadMemoryImage: LoadMemoryImage;
  onOpen: OpenMemoryWorldItem;
}) {
  const { t } = useTranslation();
  return (
    <Link
      to={entry.path}
      onClick={(event) => onOpen(event, entry.path, entry.key)}
      className="memory-album-item"
      aria-label={t('memoryWorlds.album.photo', {
        title: entry.title,
        date: entry.dateLabel,
      })}
      draggable={false}
    >
      <span className="memory-album-frame">
        <MemoryPhoto entry={entry} loadMemoryImage={loadMemoryImage} />
      </span>
      {caption ? <Caption entry={entry} kicker={kicker} /> : null}
    </Link>
  );
}

function TextLink({
  entry,
  kind,
  onOpen,
  label,
  children,
}: {
  entry: MemoryWorldEntry;
  kind: TextKind;
  onOpen: OpenMemoryWorldItem;
  label: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={entry.path}
      onClick={(event) => onOpen(event, entry.path, entry.key)}
      className="memory-album-text"
      data-kind={kind}
      // Heart pages take the diary's emotion colours (HeartEmotionVisual.css).
      data-heart-emotion={kind === 'heart' ? entry.emotion : undefined}
      aria-label={label}
      draggable={false}
    >
      {children}
    </Link>
  );
}

const HEART_PATH =
  'M12 21C5 15.5 2 12 2 8A5 5 0 0 1 12 6A5 5 0 0 1 22 8C22 12 19 15.5 12 21Z';

/** A small printed vignette for a book without photos: a pen that has just drawn a heart. */
function EndVignette() {
  return (
    <svg
      className="memory-album-end-vignette"
      viewBox="0 0 120 84"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="memory-album-end-vignette-line"
        d="M10 70C24 71 32 66 40 62S54 58 60 62"
      />
      <path
        className="memory-album-end-vignette-heart"
        d="M60 62C49 53 44 47 44 41A8.5 8.5 0 0 1 60 37A8.5 8.5 0 0 1 76 41C76 47 71 53 60 62Z"
      />
      <g
        className="memory-album-end-vignette-line"
        transform="rotate(34 92 40)"
      >
        <rect x="88" y="4" width="8" height="40" rx="2" />
        <path d="M88 44H96L92 56Z" />
        <path d="M92 47V52" />
      </g>
    </svg>
  );
}

function PageContent({
  page,
  kicker,
  leadKey,
  loadMemoryImage,
  onOpen,
  onRestart,
}: {
  page: AlbumPage;
  kicker: string;
  leadKey: string;
  loadMemoryImage: LoadMemoryImage;
  onOpen: OpenMemoryWorldItem;
  onRestart: () => void;
}) {
  const { t } = useTranslation();
  const locale = resolvedLocale();
  const moments = (count: number) => t('memoryWorlds.album.moments', { count });
  switch (page.kind) {
    case 'cover':
      // A linen hardcover with a debossed photo window. A tap anywhere opens
      // the book (handled by the book); keyboard users turn with the keys.
      return (
        <div className="memory-album-cover">
          <span
            className="memory-album-cover-window"
            data-empty={page.photo ? undefined : 'true'}
          >
            {page.photo ? (
              <MemoryPhoto
                entry={page.photo}
                loadMemoryImage={loadMemoryImage}
              />
            ) : (
              <span className="memory-album-cover-mark" aria-hidden="true">
                {t('memoryWorlds.album.coverMark')}
              </span>
            )}
          </span>
          <span className="memory-album-cover-title">
            {seasonSpan(page.first, page.last, t)}
          </span>
          <span className="memory-album-cover-meta">{moments(page.count)}</span>
        </div>
      );
    case 'opener':
      return (
        <div className="memory-album-opener">
          <span className="memory-album-small">{moments(page.count)}</span>
          <span className="memory-album-opener-words">
            <h3 className="memory-album-season">
              {t(`rediscovery.season.${page.season}`)}
            </h3>
            <span className="memory-album-rule" aria-hidden="true" />
            <span className="memory-album-year">
              {yearLabel(page.season, page.year, t)}
            </span>
          </span>
        </div>
      );
    case 'photos': {
      const first = page.entries[0];
      const last = page.entries[page.entries.length - 1];
      return (
        <div className="memory-album-spread" data-layout={page.layout}>
          {page.layout.startsWith('mosaic') ? (
            <>
              <span className="memory-album-tiles">
                {page.entries.map((entry) => (
                  <PhotoItem
                    key={entry.key}
                    entry={entry}
                    caption={false}
                    loadMemoryImage={loadMemoryImage}
                    onOpen={onOpen}
                  />
                ))}
              </span>
              <span className="memory-album-mosaic-cap" aria-hidden="true">
                <span className="memory-album-cap-title">
                  {page.entries
                    .map((entry) => entry.title)
                    .join(t('memoryWorlds.album.separator'))}
                </span>
                <span className="memory-album-small">
                  {first.dateLabel === last.dateLabel
                    ? first.dateLabel
                    : t('memoryWorlds.album.dateRange', {
                        from: first.dateLabel,
                        to: last.dateLabel,
                      })}
                </span>
              </span>
            </>
          ) : (
            page.entries.map((entry) => (
              <PhotoItem
                key={entry.key}
                entry={entry}
                kicker={entry.key === leadKey ? kicker : undefined}
                loadMemoryImage={loadMemoryImage}
                onOpen={onOpen}
              />
            ))
          )}
        </div>
      );
    }
    case 'heart': {
      const entry = page.entry;
      return (
        <TextLink
          entry={entry}
          kind="heart"
          onOpen={onOpen}
          label={t('memoryWorlds.album.heart', {
            name: entry.author,
            title: entry.title,
          })}
        >
          {entry.key === leadKey ? (
            <span className="memory-album-small">{kicker}</span>
          ) : null}
          <svg
            className="memory-album-heart"
            viewBox="0 0 24 22"
            aria-hidden="true"
            focusable="false"
          >
            <path d={HEART_PATH} />
          </svg>
          <q
            className="memory-album-quote"
            data-length={lengthClass(entry.title)}
          >
            {entry.title}
          </q>
          <span className="memory-album-sign">
            <span>{t('memoryWorlds.album.sign', { name: entry.author })}</span>
            <time dateTime={entry.dateTime}>{entry.dateLabel}</time>
          </span>
        </TextLink>
      );
    }
    case 'milestone': {
      const entry = page.entry;
      return (
        <TextLink
          entry={entry}
          kind="milestone"
          onOpen={onOpen}
          label={t('memoryWorlds.album.milestone', {
            title: entry.title,
            date: entry.dateLabel,
          })}
        >
          <span className="memory-album-mark-head">
            <span className="memory-album-small">
              {entry.key === leadKey
                ? kicker
                : t('memoryWorlds.album.milestoneKicker')}
            </span>
            <KeepsakeStampMark className="memory-album-stamp" />
          </span>
          <span className="memory-album-mark">
            <time className="memory-album-mark-day" dateTime={entry.dateTime}>
              {entry.date.getDate()}
            </time>
            <span className="memory-album-mark-month">
              {monthYear(entry.date, locale)}
            </span>
            <span className="memory-album-rule" aria-hidden="true" />
            <strong className="memory-album-mark-title">{entry.title}</strong>
          </span>
        </TextLink>
      );
    }
    case 'words': {
      const entry = page.entry;
      return (
        <TextLink
          entry={entry}
          kind="words"
          onOpen={onOpen}
          label={t('memoryWorlds.album.words', {
            title: entry.title,
            date: entry.dateLabel,
          })}
        >
          <span className="memory-album-small">
            {entry.key === leadKey ? (
              <>
                {kicker}
                {t('memoryWorlds.album.separator')}
              </>
            ) : null}
            <time dateTime={entry.dateTime}>{entry.dateLabel}</time>
          </span>
          <span
            className="memory-album-words"
            data-length={lengthClass(entry.title)}
          >
            {entry.title}
          </span>
          <span className="memory-album-sign">
            <span>{t('memoryWorlds.album.sign', { name: entry.author })}</span>
          </span>
        </TextLink>
      );
    }
    case 'end': {
      const photo = page.photo;
      return (
        <div className="memory-album-end">
          {photo ? (
            // The most recent photo memory, laid in as a framed print.
            <Link
              to={photo.path}
              onClick={(event) => onOpen(event, photo.path, photo.key)}
              className="memory-album-end-print"
              aria-label={t('memoryWorlds.album.latest', {
                title: photo.title,
                date: photo.dateLabel,
              })}
              draggable={false}
            >
              <span className="memory-album-end-photo">
                <MemoryPhoto entry={photo} loadMemoryImage={loadMemoryImage} />
              </span>
            </Link>
          ) : (
            <EndVignette />
          )}
          <h3 className="memory-album-end-title">
            {t('memoryWorlds.album.endTitle')}
          </h3>
          <p className="memory-album-end-text">
            {t('memoryWorlds.album.endText')}
          </p>
          <button
            type="button"
            className="memory-album-end-action"
            onClick={onRestart}
          >
            {t('memoryWorlds.album.restart')}
          </button>
        </div>
      );
    }
  }
}

/* ---------- The book ---------- */

/** Where a mounted leaf lies: -1 turned over (left), 0 the open page, 1 beneath it. */
interface Slot {
  index: number;
  key: string;
  slot: number;
}

/** A non-adjacent target (Home/End, back to the start, a new book) turns in as a neighbour. */
interface Jump {
  target: number;
  forward: boolean;
}

/** A turn waiting for the render that mounts its target as a neighbour. */
interface PendingTurn extends Jump {
  press: boolean;
}

interface Gesture {
  id: number;
  x: number;
  y: number;
  /** Finger x relative to the spine when it went down. */
  fromSpine: number;
  width: number;
  lastX: number;
  lastT: number;
  vx: number;
  started: boolean;
  instant?: boolean;
  forward?: boolean;
  rubber?: boolean;
  /** Distance from the spine of the leaf point the finger holds. */
  grab: number;
  angle: number;
  turn?: AlbumTurn | null;
  crossed?: boolean;
}

type Invite = 'waiting' | 'on' | 'off';

/** Euer Fotobuch: the cover first, then every moment from old to new. */
export function PhotoAlbumWorld({
  entries,
  kicker,
  loadMemoryImage,
  onOpen,
}: MemoryWorldProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  // The book's type and margins get pixel units (see client/containerUnits.ts).
  useContainerUnits(rootRef, UNIT_SELECTOR);
  const pages = useMemo(() => buildAlbumPages(entries), [entries]);
  const leadKey = useMemo(
    () => (entries.find((entry) => entry.isLead) ?? entries[0])?.key ?? '',
    [entries],
  );
  const [index, setIndex] = useState(0);
  const [jump, setJump] = useState<Jump | null>(null);
  const [invite, setInvite] = useState<Invite>(() =>
    prefersReducedMotion() ? 'off' : 'waiting',
  );
  const hintId = useId();

  const bookRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const leafEls = useRef(new Map<string, HTMLDivElement>());
  const cancelTween = useRef<(() => void) | null>(null);
  const tweenRun = useRef(0);
  const dragFrame = useRef<number | undefined>(undefined);
  const animating = useRef(false);
  const pending = useRef<PendingTurn | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const clickTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      cancelTween.current?.();
      if (dragFrame.current !== undefined)
        cancelAnimationFrame(dragFrame.current);
      window.clearTimeout(clickTimer.current);
    },
    [],
  );

  // The closed book invites once, when it is first seen.
  const hasPages = pages.length > 1;
  const entered = useWorldEntered();
  useEffect(() => {
    const book = bookRef.current;
    if (invite !== 'waiting' || !book || !hasPages || !entered) return;
    let stop: (() => void) | null = null;
    let seen = false;
    stop = observeVisibility(book, (state) => {
      if (!state.visible || seen) return;
      seen = true;
      setInvite((previous) => (previous === 'waiting' ? 'on' : previous));
    });
    return () => stop?.();
  }, [invite, hasPages, entered]);

  const count = pages.length;
  const at = Math.min(index, Math.max(0, count - 1));

  // Only the open page and its two neighbours are mounted; a jump target
  // takes the place of the neighbour on its side.
  const slots: Slot[] = [];
  const used = new Set<number>();
  const mount = (i: number, slot: number) => {
    if (i < 0 || i >= count || used.has(i)) return;
    used.add(i);
    slots.push({ index: i, key: pages[i].key, slot });
  };
  mount(at, 0);
  mount(jump?.forward ? jump.target : at + 1, 1);
  mount(jump && !jump.forward ? jump.target : at - 1, -1);
  // Stable document order, so a landed turn never moves DOM nodes.
  slots.sort((a, b) => a.index - b.index);

  /** Back to rest: every inline style a turn wrote is removed; CSS places the leaves by role. */
  const settle = () => {
    for (const element of stageRef.current?.querySelectorAll<HTMLElement>(
      '[data-album-fx]',
    ) ?? [])
      element.removeAttribute('style');
    bookRef.current?.removeAttribute('data-turning');
  };

  const bindTurn = (
    leafIndex: number,
    underIndex?: number,
  ): AlbumTurn | null => {
    const leaf = pages[leafIndex]
      ? leafEls.current.get(pages[leafIndex].key)
      : undefined;
    if (!leaf) return null;
    const under =
      underIndex !== undefined && pages[underIndex]
        ? leafEls.current.get(pages[underIndex].key)
        : undefined;
    const pick = (root: HTMLElement | undefined, name: string) =>
      root?.querySelector<HTMLElement>(`[data-album-fx="${name}"]`) ?? null;
    leaf.style.visibility = 'visible';
    leaf.style.willChange = 'transform';
    bookRef.current?.setAttribute('data-turning', 'true');
    return {
      leaf,
      front: pick(leaf, 'front'),
      back: pick(leaf, 'back'),
      shade: pick(leaf, 'shade'),
      ridge: pick(leaf, 'ridge'),
      backShade: pick(leaf, 'back-shade'),
      cast: pick(under, 'cast'),
      width: stageRef.current?.clientWidth || 320,
    };
  };

  /** One frame-driven value from `from` to `to`, painted every frame. */
  const animate = (
    from: number,
    to: number,
    ms: number,
    curve: AlbumCurve,
    paint: (value: number) => void,
    done: () => void,
  ) => {
    cancelTween.current?.();
    const run = tweenRun.current + 1;
    tweenRun.current = run;
    animating.current = true;
    const cancel = runAlbumTween(from, to, ms, curve, paint, () => {
      if (tweenRun.current !== run) return;
      animating.current = false;
      cancelTween.current = null;
      done();
    });
    if (tweenRun.current === run && animating.current)
      cancelTween.current = cancel;
  };

  const keepFocus = () => {
    // Focus inside a page that turned away would be lost in a hidden leaf.
    if (stageRef.current?.contains(document.activeElement))
      bookRef.current?.focus({ preventScroll: true });
  };

  /** The page has landed: a light tick, and the book is open at `target`. */
  const land = (target: number) => {
    keepFocus();
    haptic('threshold');
    if (target === at) settle();
    setIndex(target);
    setJump(null);
  };

  /** A complete turn to a mounted neighbour, by itself (tap, button, key, reduced-motion swipe). */
  const startTurn = (target: number, forward: boolean, press: boolean) => {
    const turn = forward ? bindTurn(at, target) : bindTurn(target, at);
    if (!turn) {
      land(target);
      return;
    }
    if (press) haptic('press');
    if (prefersReducedMotion()) {
      paintFade(turn, forward, 0);
      animate(
        0,
        1,
        ALBUM_TURN.reducedFade,
        ALBUM_CURVES.steady,
        (progress) => paintFade(turn, forward, progress),
        () => land(target),
      );
      return;
    }
    const from = forward ? 0 : 180;
    paintTurn(turn, from);
    animate(
      from,
      180 - from,
      ALBUM_TURN.auto,
      ALBUM_CURVES.turn,
      (angle) => paintTurn(turn, angle),
      () => land(target),
    );
  };

  /** A refused tap or key: the page lifts a little and falls back. */
  const nudge = () => {
    haptic('refuse');
    if (prefersReducedMotion()) return;
    const turn = bindTurn(at, at + 1 < count ? at + 1 : undefined);
    if (!turn) return;
    animate(
      0,
      1,
      ALBUM_TURN.nudgeDuration,
      ALBUM_CURVES.steady,
      (progress) => paintTurn(turn, nudgeAngle(progress)),
      settle,
    );
  };

  // Every commit puts the leaves back to rest, unless a turn or drag owns
  // them. A turn that needed a new neighbour starts right here.
  useLayoutEffect(() => {
    const turn = pending.current;
    if (turn) {
      pending.current = null;
      startTurn(turn.target, turn.forward, turn.press);
      return;
    }
    if (!animating.current && !gesture.current?.started) settle();
  });

  // A new book (other memories, e.g. after renewing the selection): the open
  // page turns over onto the new cover, or the cover shows at once.
  const signature = pages.map((page) => page.key).join('|');
  const signatureRef = useRef(signature);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new set of pages starts the turn onto the new cover.
  useLayoutEffect(() => {
    if (signatureRef.current === signature) return;
    signatureRef.current = signature;
    cancelTween.current?.();
    cancelTween.current = null;
    animating.current = false;
    gesture.current = null;
    pending.current = null;
    settle();
    if (prefersReducedMotion() || count < 2) {
      setIndex(0);
      setJump(null);
      return;
    }
    setIndex(count - 1);
    pending.current = { target: 0, forward: true, press: false };
    setJump({ target: 0, forward: true });
  }, [signature]);

  if (count === 0) return null;

  const busy = () => animating.current || Boolean(gesture.current?.started);

  const turnTo = (target: number) => {
    if (busy() || target === at) return;
    if (target < 0 || target >= count) {
      nudge();
      return;
    }
    setInvite('off');
    const forward = target > at;
    if (Math.abs(target - at) === 1) {
      startTurn(target, forward, true);
      return;
    }
    pending.current = { target, forward, press: true };
    setJump({ target, forward });
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (busy() || event.button !== 0) return;
    const rect = stageRef.current?.getBoundingClientRect();
    const width = rect?.width || 320;
    gesture.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      fromSpine: event.clientX - (rect?.left ?? 0),
      width,
      lastX: event.clientX,
      lastT: event.timeStamp,
      vx: 0,
      started: false,
      grab: width,
      angle: 0,
    };
    suppressClick.current = false;
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    const dt = event.timeStamp - g.lastT;
    if (dt > 0) {
      g.vx = 0.75 * ((event.clientX - g.lastX) / dt) + 0.25 * g.vx;
      g.lastX = event.clientX;
      g.lastT = event.timeStamp;
    }
    if (!g.started) {
      if (Math.abs(dy) > VERTICAL_CANCEL_PX && Math.abs(dy) > Math.abs(dx)) {
        // Vertical: the page scrolls, the book stays.
        gesture.current = null;
        return;
      }
      if (Math.abs(dx) < DRAG_START_PX || Math.abs(dx) < Math.abs(dy)) return;
      g.started = true;
      g.forward = dx < 0;
      g.instant = prefersReducedMotion();
      suppressClick.current = true;
      setInvite('off');
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The pointer may already be gone (e.g. a cancelled touch).
      }
      if (g.instant) return;
      g.rubber = g.forward ? at + 1 >= count : at - 1 < 0;
      g.grab = dragGrab(g.forward, g.rubber, g.fromSpine, g.width);
      if (g.rubber) {
        g.turn = bindTurn(at, at + 1 < count ? at + 1 : undefined);
        haptic('refuse');
      } else if (g.forward) {
        g.turn = bindTurn(at, at + 1);
      } else {
        g.turn = bindTurn(at - 1, at);
        g.angle = 180;
      }
      // Paint the resting pose at once, before the leaf is first seen.
      if (g.turn) paintTurn(g.turn, g.angle);
    }
    if (g.instant || !g.turn) return;
    g.angle = dragAngle(
      { forward: g.forward === true, rubber: g.rubber === true, grab: g.grab },
      dx,
    );
    if (!g.rubber) {
      const crossed = dragCommitted(g.forward === true, g.angle);
      if (crossed !== Boolean(g.crossed)) {
        g.crossed = crossed;
        haptic('threshold');
      }
    }
    // One write per frame, however often the finger reports.
    if (dragFrame.current === undefined)
      dragFrame.current = requestAnimationFrame(() => {
        dragFrame.current = undefined;
        const live = gesture.current;
        if (live?.turn) paintTurn(live.turn, live.angle);
      });
  };

  const release = (
    event: ReactPointerEvent<HTMLDivElement>,
    cancel = false,
  ) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    gesture.current = null;
    if (!g.started) return;
    if (dragFrame.current !== undefined) {
      cancelAnimationFrame(dragFrame.current);
      dragFrame.current = undefined;
    }
    // Swallow only the click that belongs to this drag, never a later tap.
    window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => {
      suppressClick.current = false;
    }, CLICK_RESET_MS);
    if (event.timeStamp - g.lastT > VELOCITY_STALE_MS) g.vx = 0;
    const dx = event.clientX - g.x;

    if (g.instant) {
      const fling = ALBUM_TURN.fling;
      const step =
        g.vx < -fling || dx < -INSTANT_SWIPE_PX
          ? 1
          : g.vx > fling || dx > INSTANT_SWIPE_PX
            ? -1
            : 0;
      if (cancel || step === 0) return;
      const target = at + step;
      if (target < 0 || target >= count) {
        haptic('refuse');
        return;
      }
      startTurn(target, step > 0, false);
      return;
    }

    const turn = g.turn;
    if (!turn) {
      settle();
      return;
    }
    const from = g.angle;
    if (g.rubber) {
      animate(
        from,
        0,
        ALBUM_TURN.releaseMin,
        ALBUM_CURVES.release,
        (angle) => paintTurn(turn, angle),
        settle,
      );
      return;
    }
    const forward = g.forward === true;
    const complete = !cancel && releaseCompletes(forward, from, g.vx);
    const to = forward === complete ? 180 : 0;
    const target = forward ? at + 1 : at - 1;
    animate(
      from,
      to,
      releaseDuration(from, to),
      ALBUM_CURVES.release,
      (angle) => paintTurn(turn, angle),
      complete ? () => land(target) : settle,
    );
  };

  /** A tap on the paper (not on a photo, text or control): right half forward, left half back. */
  const onBookClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    if (
      event.target instanceof Element &&
      event.target.closest('a, button, input, select, textarea')
    )
      return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect?.width) return;
    const right = event.clientX >= rect.left + rect.width / 2;
    // The closed book opens from either half.
    turnTo(right || at === 0 ? at + 1 : at - 1);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const keys: Record<string, number> = {
      ArrowRight: at + 1,
      ArrowLeft: at - 1,
      PageDown: at + 1,
      PageUp: at - 1,
      Home: 0,
      End: count - 1,
    };
    const target = keys[event.key];
    if (target === undefined) return;
    event.preventDefault();
    turnTo(target);
  };

  const onLeafAnimationEnd = (event: ReactAnimationEvent<HTMLDivElement>) => {
    if (event.animationName === INVITE_ANIMATION) setInvite('off');
  };

  const current = pages[at];
  const inviting = invite === 'on' && at === 0 && !jump && count > 1;

  return (
    <div ref={rootRef} className="memory-album-world">
      <div className="memory-world-head">
        <h2>{t('memoryWorlds.album.heading')}</h2>
      </div>

      {/* biome-ignore lint/a11y/useSemanticElements: the book is a named group of pages, not a form fieldset. */}
      <div
        ref={bookRef}
        className="memory-album-book"
        data-primary-tab-swipe-block
        role="group"
        aria-roledescription={t('memoryWorlds.album.roleDescription')}
        aria-label={t('memoryWorlds.album.label', { page: at + 1, count })}
        aria-describedby={hintId}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the book itself turns its pages with the arrow keys.
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => release(event)}
        onPointerCancel={(event) => release(event, true)}
        onClickCapture={(event) => {
          if (!suppressClick.current) return;
          suppressClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={onBookClick}
      >
        <div className="memory-album-block" data-at={current.kind}>
          <div
            ref={stageRef}
            className="memory-album-stage"
            style={{ perspective: `${ALBUM_TURN.perspective}px` }}
          >
            {slots.map(({ index: i, key, slot }) => {
              const page = pages[i];
              const hidden = slot !== 0;
              return (
                <div
                  key={key}
                  ref={(element) => {
                    if (element) leafEls.current.set(key, element);
                    else leafEls.current.delete(key);
                  }}
                  className="memory-album-leaf"
                  data-album-fx="leaf"
                  data-role={slot < 0 ? 'prev' : slot > 0 ? 'next' : 'current'}
                  data-page={page.kind}
                  data-invite={slot === 0 && inviting ? 'true' : undefined}
                  onAnimationEnd={onLeafAnimationEnd}
                  aria-hidden={hidden || undefined}
                  inert={hidden || undefined}
                >
                  <div
                    className="memory-album-face memory-album-sheet"
                    data-album-fx="front"
                    data-page={page.kind}
                  >
                    <PageContent
                      page={page}
                      kicker={kicker}
                      leadKey={leadKey}
                      loadMemoryImage={loadMemoryImage}
                      onOpen={onOpen}
                      onRestart={() => turnTo(0)}
                    />
                    {page.kind === 'cover' ? null : (
                      // The printed folio in the outer corner, like a real book's page number.
                      <span
                        className="memory-album-folio"
                        data-on-photo={
                          page.kind === 'photos' && page.layout === 'bleed'
                            ? 'true'
                            : undefined
                        }
                        aria-hidden="true"
                      >
                        {i + 1}
                      </span>
                    )}
                    <span
                      className="memory-album-cast"
                      data-album-fx="cast"
                      aria-hidden="true"
                    />
                    <span
                      className="memory-album-shade"
                      data-album-fx="shade"
                      aria-hidden="true"
                    />
                    <span
                      className="memory-album-ridge"
                      data-album-fx="ridge"
                      aria-hidden="true"
                    />
                  </div>
                  <div
                    className="memory-album-face memory-album-back"
                    data-album-fx="back"
                    aria-hidden="true"
                  >
                    <span
                      className="memory-album-back-shade"
                      data-album-fx="back-shade"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* The virtual cursor of a screen reader turns with these; keyboard
          users turn with the keys on the focusable book. */}
      <div className="sr-only">
        <button
          type="button"
          tabIndex={-1}
          onClick={() => turnTo(at - 1)}
          disabled={at === 0}
        >
          {t('memoryWorlds.album.previous')}
        </button>
        <button
          type="button"
          tabIndex={-1}
          onClick={() => turnTo(at + 1)}
          disabled={at >= count - 1}
        >
          {t('memoryWorlds.album.next')}
        </button>
      </div>
      <p id={hintId} className="sr-only">
        {t('memoryWorlds.album.hint')}
      </p>
      <p className="sr-only" aria-live="polite">
        {t('memoryWorlds.album.page', {
          page: at + 1,
          count,
          label: albumPageLabel(current, t),
        })}
      </p>
    </div>
  );
}
