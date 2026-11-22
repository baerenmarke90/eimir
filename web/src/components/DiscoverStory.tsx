import type { TFunction } from 'i18next';
import {
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import type { MemoryAttachmentSummary } from '../api/generated/models/MemoryAttachmentSummary';
import type { StoryItem } from '../api/generated/models/StoryItem';
import {
  buildDiscoverStoryThemes,
  type DiscoverStoryPosition,
  type DiscoverStoryThemeKey,
  stepDiscoverStory,
} from '../client/discoverStoryThemes';
import { galleryCover } from '../client/galleryCover';
import type { ObjectUrlSource } from '../client/objectUrlResource';
import {
  heartMomentDetailPath,
  memoryDetailPath,
  milestoneDetailPath,
} from '../client/routes';
import { resolvedLocale, useTranslation } from '../i18n';
import { KEEPSAKE_PAPER_CLASS, KeepsakeStampMark } from './DiscoverKeepsakes';
import { ExperienceAnswers } from './ExperienceAnswers';
import {
  HeartEmotionBadge,
  type HeartEmotionValue,
} from './HeartEmotionVisual';
import { CONTROLS_QUIET_MS } from './MediaGallery';
import { MemoryPreview } from './MemoryPreview';
import {
  formatStoryDate,
  storyItemKey,
  storyItemPresentation,
} from './storyPresentation';
import './DiscoverStory.css';
import '../motion/story-playback.css';
import { useReducedMotion } from '../motion/reducedMotion';
import { usePageVisible } from '../motion/scene';

/** A press longer than this pauses the story and does not count as a tap. */
const HOLD_THRESHOLD_MS = 350;

type LoadMemoryImage = (
  memoryId: string,
  attachmentId: string,
  signal?: AbortSignal,
) => Promise<ObjectUrlSource>;

type SlideKind = 'photo' | 'heart' | 'milestone' | 'words' | 'lead';

/** Theme keys of the viewer: the lead's own theme plus the curated ones. */
type StoryThemeKey = DiscoverStoryThemeKey | 'remember';

/**
 * The rediscovery lead (`story.featuredKicker`) plays as the story's first
 * slide, in a theme of its own. The page renders its composition (the
 * developing polaroid); the story places it first, pages past it and opens
 * it through its own open link, so the slide content holds no link.
 */
export interface DiscoverStoryLead {
  key: string;
  path: string;
  kindLabel: string;
  title: string;
  content: ReactNode;
  face: ReactNode;
}

interface StorySlide {
  key: string;
  kind: SlideKind;
  path: string;
  kindLabel: string;
  title: string;
  titleIsDate: boolean;
  dateTime: string;
  dateLabel: string;
  authorName: string;
  memoryId: string;
  cover?: MemoryAttachmentSummary;
  emotion?: HeartEmotionValue;
  experience?: Extract<StoryItem, { kind: 'MEMORY' }>['memory'];
  content?: ReactNode;
  face?: ReactNode;
}

const THEME_SLIDE_KIND: Record<StoryThemeKey, SlideKind> = {
  remember: 'lead',
  photos: 'photo',
  heartMoments: 'heart',
  milestones: 'milestone',
  words: 'words',
};

function buildSlide(
  item: StoryItem,
  kind: SlideKind,
  t: TFunction,
  locale: string,
  nicknameFor?: (accountId: string) => string | null,
): StorySlide {
  const presentation = storyItemPresentation(item, t, nicknameFor);
  const base = {
    key: storyItemKey(item),
    kind,
    kindLabel: presentation.kindLabel,
    title: presentation.title,
    titleIsDate: presentation.titleIsDate === true,
    dateTime: item.effectiveDate.toISOString().slice(0, 10),
    dateLabel: formatStoryDate(item.effectiveDate, locale),
    authorName: presentation.author,
    memoryId: '',
  };
  switch (item.kind) {
    case 'MEMORY':
      return {
        ...base,
        path: memoryDetailPath(item.memory.id),
        memoryId: item.memory.id,
        cover: galleryCover(item.memory),
        experience: item.memory.experienceKind ? item.memory : undefined,
      };
    case 'HEART_MOMENT':
      return {
        ...base,
        // The whole authored text is the slide; the excerpt is for cards.
        title: item.heartMoment.text.trim() || presentation.title,
        path: heartMomentDetailPath(item.heartMoment.id),
        emotion: item.heartMoment.emotion,
      };
    case 'MILESTONE':
      return { ...base, path: milestoneDetailPath(item.milestone.id) };
  }
}

/**
 * Share of the viewer that must be on screen for the story to play (#2192):
 * scrolled further, with only 60 % of the photo left, it pauses.
 */
export const STORY_PLAY_VISIBLE_SHARE = 0.6;

/** Fine steps, so the share is re-read close to where it crosses the limit. */
const VISIBILITY_STEPS = Array.from({ length: 21 }, (_, index) => index / 20);

/**
 * True while more than `share` of the element is on screen. A viewer taller
 * than the viewport (large text) is measured against the viewport height, so
 * it can still count as fully visible.
 */
function useMostlyVisible(
  ref: RefObject<HTMLElement | null>,
  mounted: boolean,
  share: number,
): boolean {
  const [visible, setVisible] = useState(
    () => typeof IntersectionObserver === 'undefined',
  );
  useEffect(() => {
    const node = ref.current;
    if (!mounted || !node || typeof IntersectionObserver === 'undefined')
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (!entry) return;
        const viewport = entry.rootBounds?.height ?? window.innerHeight;
        const full = Math.min(entry.boundingClientRect.height, viewport);
        setVisible(
          entry.isIntersecting &&
            full > 0 &&
            entry.intersectionRect.height / full > share,
        );
      },
      { threshold: VISIBILITY_STEPS },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, mounted, share]);
  return visible;
}

function isKeyboardFocus(element: Element): boolean {
  try {
    return element.matches(':focus-visible');
  } catch {
    return false;
  }
}

function ThemeFace({
  kind,
  slide,
  loadMemoryImage,
}: {
  kind: SlideKind;
  slide: StorySlide;
  loadMemoryImage: LoadMemoryImage;
}) {
  if (kind === 'photo' && slide.cover) {
    // Same resource scope as the slide, so the cover is fetched only once.
    return (
      <MemoryPreview
        memoryId={slide.memoryId}
        attachmentId={slide.cover.id}
        hasThumbnail={slide.cover.hasThumbnail}
        isSensitive={slide.cover.isSensitive}
        loadImage={loadMemoryImage}
        loadingMode="near-viewport"
      />
    );
  }
  if (kind === 'heart')
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    );
  if (kind === 'milestone') return <KeepsakeStampMark />;
  if (kind === 'lead') return slide.face ?? null;
  return null;
}

function StorySlideContent({
  slide,
  current,
  loadMemoryImage,
}: {
  slide: StorySlide;
  current: boolean;
  loadMemoryImage: LoadMemoryImage;
}) {
  const { t } = useTranslation();
  const date = <time dateTime={slide.dateTime}>{slide.dateLabel}</time>;
  switch (slide.kind) {
    case 'lead':
      return slide.content ?? null;
    case 'photo':
      return (
        <>
          <div className="momente-story-photo" data-playback-motion="true">
            {slide.cover ? (
              <MemoryPreview
                memoryId={slide.memoryId}
                attachmentId={slide.cover.id}
                hasThumbnail={slide.cover.hasThumbnail}
                isSensitive={slide.cover.isSensitive}
                loadImage={loadMemoryImage}
                loadingMode="near-viewport"
              />
            ) : null}
          </div>
          <div className="momente-story-caption">
            <span className="momente-story-kind">{slide.kindLabel}</span>
            <h3 className="momente-story-title">{slide.title}</h3>
            {slide.titleIsDate ? null : (
              <span className="momente-story-meta">{date}</span>
            )}
          </div>
        </>
      );
    case 'heart':
      return (
        <>
          <span className="momente-story-decor" aria-hidden="true">
            <svg
              className="momente-story-heart-mark"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </span>
          <blockquote
            className="momente-story-quote"
            data-length={slide.title.length > 90 ? 'long' : undefined}
          >
            {slide.title}
          </blockquote>
          <p className="momente-story-meta">
            <span>{t('discoverStory.from', { name: slide.authorName })}</span>
            {slide.emotion ? (
              <>
                <span aria-hidden="true">·</span>
                <HeartEmotionBadge emotion={slide.emotion} />
              </>
            ) : null}
            <span aria-hidden="true">·</span>
            {date}
          </p>
        </>
      );
    case 'milestone':
      return (
        <>
          <KeepsakeStampMark
            className="momente-story-stamp"
            pressed={current}
          />
          <h3 className="momente-story-title">{slide.title}</h3>
          <p className="momente-story-meta">
            <span>{slide.kindLabel}</span>
            <span aria-hidden="true">·</span>
            {date}
          </p>
        </>
      );
    case 'words':
      return (
        <>
          <h3 className="momente-story-title">{slide.title}</h3>
          {slide.experience?.experienceKind ? (
            <ExperienceAnswers
              answers={slide.experience.experienceAnswers ?? []}
              kind={slide.experience.experienceKind}
              preview
            />
          ) : null}
          <p className="momente-story-meta">
            <span>{slide.kindLabel}</span>
            {slide.titleIsDate ? null : (
              <>
                <span aria-hidden="true">·</span>
                {date}
              </>
            )}
          </p>
        </>
      );
  }
}

const SLIDE_CLASS: Record<SlideKind, string> = {
  lead: 'momente-story-slide-lead',
  photo: 'momente-story-slide-photo',
  heart: 'momente-story-slide-heart',
  milestone: 'momente-story-slide-milestone',
  words: `momente-story-slide-words ${KEEPSAKE_PAPER_CLASS}`,
};

/**
 * Momente > Erinnerungen "Fotostory": round theme bubbles above one large
 * story viewer. The rediscovery lead (`story.featuredKicker`), when there
 * is one, plays first; Photos, Heart Moments, Milestones and Memories told
 * in words follow as slides in the canonical order of the curated
 * selection. Autoplay runs only with motion allowed, while more than 60 % of
 * the viewer is visible, the document is visible and nobody holds, pauses or
 * keyboard-focuses it;
 * the progress segment's CSS animation is the timer (no per-frame renders).
 */
export function DiscoverStory({
  items,
  loadMemoryImage,
  onOpen,
  nicknameFor,
  lead,
}: {
  /** The rediscovery lead, played before the curated themes. */
  lead?: DiscoverStoryLead | null;
  items: readonly StoryItem[];
  loadMemoryImage: LoadMemoryImage;
  onOpen: (event: MouseEvent<HTMLAnchorElement>, to: string) => void;
  nicknameFor?: (accountId: string) => string | null;
}) {
  const { t } = useTranslation();
  const locale = resolvedLocale();
  const themes = useMemo(() => {
    const curated: { key: StoryThemeKey; items: StorySlide[] }[] =
      buildDiscoverStoryThemes(items).map((theme) => ({
        key: theme.key,
        items: theme.items.map((item) =>
          buildSlide(item, THEME_SLIDE_KIND[theme.key], t, locale, nicknameFor),
        ),
      }));
    if (!lead) return curated;
    const leadSlide: StorySlide = {
      key: `lead:${lead.key}`,
      kind: 'lead',
      path: lead.path,
      kindLabel: lead.kindLabel,
      title: lead.title,
      titleIsDate: false,
      dateTime: '',
      dateLabel: '',
      authorName: '',
      memoryId: '',
      content: lead.content,
      face: lead.face,
    };
    return [{ key: 'remember' as const, items: [leadSlide] }, ...curated];
  }, [items, t, locale, nicknameFor, lead]);
  const selectionKey = themes
    .map((theme) => theme.items.map((slide) => slide.key).join(','))
    .join('|');

  const [position, setPosition] = useState<DiscoverStoryPosition>({
    theme: 0,
    slide: 0,
  });
  const [seen, setSeen] = useState<ReadonlySet<StoryThemeKey>>(() => new Set());
  const [userPaused, setUserPaused] = useState(false);
  const [holding, setHolding] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  // Autoplay stops after the very last slide; "play" then starts over.
  const [finished, setFinished] = useState(false);
  const [lastSelection, setLastSelection] = useState(selectionKey);
  if (lastSelection !== selectionKey) {
    // A renewed or replaced selection starts again from its first theme.
    setLastSelection(selectionKey);
    setPosition({ theme: 0, slide: 0 });
    setSeen(new Set());
    setFinished(false);
    setUserPaused(false);
  }

  const viewerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const mostlyVisible = useMostlyVisible(
    viewerRef,
    themes.length > 0,
    STORY_PLAY_VISIBLE_SHARE,
  );
  const documentVisible = usePageVisible();
  const autoplay = !reducedMotion;
  const playing =
    autoplay &&
    !userPaused &&
    !holding &&
    !keyboardFocus &&
    mostlyVisible &&
    documentVisible;

  const themeIndex = Math.min(position.theme, themes.length - 1);
  const theme = themes[themeIndex];
  const slideIndex = theme
    ? Math.min(position.slide, theme.items.length - 1)
    : 0;
  const current = theme?.items[slideIndex];
  // Only the visible and the following slide are mounted (and load media).
  const nextPosition = stepDiscoverStory(
    themes,
    { theme: themeIndex, slide: slideIndex },
    1,
    { wrap: true },
  );
  const upcoming = nextPosition
    ? themes[nextPosition.theme]?.items[nextPosition.slide]
    : undefined;

  useEffect(() => {
    if (!theme) return;
    setSeen((previous) =>
      previous.has(theme.key) ? previous : new Set(previous).add(theme.key),
    );
  }, [theme]);

  const step = useCallback(
    (direction: 1 | -1, source: 'user' | 'autoplay') => {
      const target = stepDiscoverStory(
        themes,
        { theme: themeIndex, slide: slideIndex },
        direction,
        { wrap: source === 'user' },
      );
      if (!target) {
        if (source === 'autoplay') {
          setFinished(true);
          setUserPaused(true);
        }
        return;
      }
      setFinished(false);
      setPosition(target);
    },
    [themes, themeIndex, slideIndex],
  );

  // Like the media viewer in Erinnerungen, the overlaid controls (pause and
  // open) fade after a quiet moment so the slide stands on its own. A touch,
  // the pointer entering or focus brings them back at once; while the story
  // is paused they stay, so the play control is never hidden.
  const [controlsResting, setControlsResting] = useState(false);
  const quietTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeControls = useCallback(() => {
    if (quietTimer.current) clearTimeout(quietTimer.current);
    setControlsResting(false);
    quietTimer.current = setTimeout(() => {
      quietTimer.current = null;
      setControlsResting(true);
    }, CONTROLS_QUIET_MS);
  }, []);
  useEffect(() => {
    wakeControls();
    return () => {
      if (quietTimer.current) clearTimeout(quietTimer.current);
    };
  }, [wakeControls]);
  const controlsQuiet = controlsResting && !userPaused;

  // Press-and-hold pauses after a short delay; a quick tap never flickers
  // the progress and still pages. A completed hold does not count as a tap.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressTap = useRef(false);
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    wakeControls();
    if (!autoplay || event.button !== 0) return;
    if ((event.target as Element).closest('a, .momente-story-playback')) return;
    suppressTap.current = false;
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      suppressTap.current = true;
      setHolding(true);
    }, HOLD_THRESHOLD_MS);
  }
  function endPress() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    setHolding(false);
  }
  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    },
    [],
  );
  function tap(direction: 1 | -1) {
    if (suppressTap.current) {
      suppressTap.current = false;
      return;
    }
    step(direction, 'user');
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    step(event.key === 'ArrowRight' ? 1 : -1, 'user');
  }
  function onFocus(event: FocusEvent<HTMLDivElement>) {
    // Keyboard focus inside the viewer suspends autoplay (APG carousel).
    setKeyboardFocus(isKeyboardFocus(event.target));
    wakeControls();
  }
  function onBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null))
      setKeyboardFocus(false);
  }

  if (!theme || !current) return null;
  const themeLabel = t(`discoverStory.theme.${theme.key}`);

  return (
    <section
      className="momente-story"
      aria-roledescription={t('discoverStory.roleDescription')}
      aria-label={t('discoverStory.label')}
      data-autoplay={autoplay ? 'true' : 'false'}
      data-playing={playing ? 'true' : 'false'}
    >
      <ul
        className="momente-story-themes"
        aria-label={t('discoverStory.themesLabel')}
      >
        {themes.map((entry, index) => {
          const active = index === themeIndex;
          const wasSeen = !active && seen.has(entry.key);
          return (
            <li key={entry.key}>
              <button
                type="button"
                className="momente-story-bubble"
                data-story-theme={entry.key}
                data-seen={wasSeen ? 'true' : undefined}
                aria-current={active ? 'true' : undefined}
                onClick={() => {
                  setFinished(false);
                  setPosition({ theme: index, slide: 0 });
                }}
              >
                <span className="momente-story-bubble-ring" aria-hidden="true">
                  <span
                    className="momente-story-bubble-face"
                    data-heart-emotion={entry.items[0].emotion}
                  >
                    <ThemeFace
                      kind={THEME_SLIDE_KIND[entry.key]}
                      slide={entry.items[0]}
                      loadMemoryImage={loadMemoryImage}
                    />
                  </span>
                </span>
                <span className="momente-story-bubble-label">
                  {t(`discoverStory.theme.${entry.key}`)}
                  <span className="sr-only">
                    {`, ${t('discoverStory.themeCount', { count: entry.items.length })}`}
                    {wasSeen ? `, ${t('discoverStory.themeSeen')}` : ''}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {/* biome-ignore lint/a11y/useSemanticElements: the viewer is the slide group of the APG carousel pattern, not a form fieldset. */}
      <div
        ref={viewerRef}
        className="momente-story-viewer"
        role="group"
        aria-label={themeLabel}
        data-story-theme={theme.key}
        data-controls={controlsQuiet ? 'quiet' : undefined}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the viewer takes focus so ArrowLeft/ArrowRight page the story.
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        onPointerEnter={wakeControls}
        onPointerDown={onPointerDown}
        onPointerUp={endPress}
        onPointerCancel={endPress}
        onPointerLeave={endPress}
        onContextMenu={(event) => {
          // A long press must not open the system image/link menu.
          if (holding) event.preventDefault();
        }}
      >
        <div
          className="momente-story-progress"
          aria-hidden="true"
          data-playback-motion="true"
        >
          {theme.items.map((slide, index) => (
            <span
              key={`${theme.key}:${slide.key}`}
              className="momente-story-segment"
              data-state={
                index < slideIndex
                  ? 'done'
                  : index === slideIndex
                    ? 'current'
                    : 'upcoming'
              }
            >
              <span
                className="momente-story-segment-fill"
                onAnimationEnd={(event) => {
                  if (
                    index !== slideIndex ||
                    event.target !== event.currentTarget ||
                    !playing
                  )
                    return;
                  step(1, 'autoplay');
                }}
              />
            </span>
          ))}
        </div>
        <div
          className="momente-story-stage"
          aria-live={playing ? 'off' : 'polite'}
        >
          {[current, upcoming]
            .filter(
              (slide, index): slide is StorySlide =>
                Boolean(slide) && (index === 0 || slide !== current),
            )
            .map((slide) => {
              const isCurrent = slide === current;
              return (
                <article
                  key={slide.key}
                  className={`momente-story-slide ${SLIDE_CLASS[slide.kind]}`}
                  data-story-slide={slide.kind}
                  data-state={isCurrent ? 'current' : 'upcoming'}
                  data-heart-emotion={slide.emotion}
                  aria-roledescription={t('discoverStory.slideRoleDescription')}
                  aria-label={
                    isCurrent
                      ? t('discoverStory.slidePosition', {
                          position: slideIndex + 1,
                          count: theme.items.length,
                        })
                      : undefined
                  }
                  aria-hidden={isCurrent ? undefined : true}
                  inert={isCurrent ? undefined : true}
                >
                  <StorySlideContent
                    slide={slide}
                    current={isCurrent}
                    loadMemoryImage={loadMemoryImage}
                  />
                </article>
              );
            })}
        </div>
        <button
          type="button"
          className="momente-story-tap momente-story-tap-previous"
          aria-label={t('discoverStory.previous')}
          onClick={() => tap(-1)}
        />
        <button
          type="button"
          className="momente-story-tap momente-story-tap-next"
          aria-label={t('discoverStory.next')}
          onClick={() => tap(1)}
        />
        {autoplay ? (
          <button
            type="button"
            className="momente-story-playback"
            aria-label={
              userPaused ? t('discoverStory.play') : t('discoverStory.pause')
            }
            onClick={() => {
              if (finished) {
                setFinished(false);
                setPosition({ theme: 0, slide: 0 });
              }
              setUserPaused((value) => !value);
            }}
          >
            {userPaused ? (
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M8 5.5v13l10.5-6.5z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
              </svg>
            )}
          </button>
        ) : null}
        <Link
          to={current.path}
          className="momente-story-open"
          aria-label={t('discoverStory.openName', {
            kind: current.kindLabel,
            title: current.title,
          })}
          onClick={(event) => onOpen(event, current.path)}
        >
          {t('discoverStory.open')}
        </Link>
      </div>
    </section>
  );
}
