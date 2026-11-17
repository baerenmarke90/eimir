import type { RecapAnswerView } from '../api/generated/models/RecapAnswerView';
import type { RecapFilmMediaView } from '../api/generated/models/RecapFilmMediaView';
import type { RecapFilmView } from '../api/generated/models/RecapFilmView';
import type { RecapSourceView } from '../api/generated/models/RecapSourceView';
import type { RecapTagView } from '../api/generated/models/RecapTagView';
import type { RecapView } from '../api/generated/models/RecapView';
import { recapRhythm } from './recaps';

/**
 * Monthly and yearly recaps as films (#1744, PO 2026-11-17).
 *
 * The server chooses the moments, the guaranteed highlight, the curated media
 * and a frozen look from a fixed catalogue. This module only arranges those
 * choices into timed scenes; it never invents or rewords text and exposes no
 * selection scores or reasons.
 *
 * A year film is cut into chapters: an intro, one chapter per month that opens
 * with a month marker, and a finale with the milestones as one "firsts"
 * sequence, the year's tags, the year highlight as the climax, a montage of the
 * month covers and the closing.
 */

export const FILM_MOODS = [
  'morning',
  'cobalt',
  'rose',
  'night',
  'sage',
  'sand',
  'ink',
  'paper',
] as const;
/** Moods whose headings use the editorial serif. */
const SERIF_MOODS = new Set(['morning', 'rose', 'night', 'ink', 'paper']);

export const FILM_WORDS_LIMIT = 140;
/** Short answers stay in the picture; longer ones get a scene of their own. */
export const FILM_INLINE_ANSWER_CHARS = 90;
/** From this length words are set as readable prose, never as a display heading. */
export const FILM_LONG_WORDS = 110;
export const FILM_MIN_TAGS = 3;
const MIN_OPENER_SOURCES = 3;
const CLIMAX_EXTRA_MS = 1_200;
const FIXED_MS = {
  cover: 5_000,
  fact: 3_600,
  place: 3_600,
  photo: 3_400,
  duo: 4_600,
  title: 4_000,
  tags: 4_000,
  closing: 5_500,
  month: 1_800,
  covers: 6_000,
} as const;
const FIRSTS_BASE_MS = 2_400;
const FIRSTS_ITEM_MS = 1_400;
/** A year film shows a firsts sequence from two milestones; one stays a title scene. */
export const FILM_MIN_FIRSTS = 2;
/** The cover montage needs a few months to read as a year. */
export const FILM_MIN_COVERS = 3;

export type FilmMedia = RecapFilmMediaView;

type Timing = {
  key: string;
  /** Scene time in milliseconds. */
  ms: number;
  transition: string;
  motion: string;
  /** Layout from the look; an empty string where the scene has one form. */
  layout: string;
  climax: boolean;
  /**
   * The progress chapter of a year film ('intro', 'm1' … 'm12', 'finale');
   * null in a monthly film, whose progress shows every scene.
   */
  chapter: string | null;
};

export type FilmCover = {
  month: number;
  media: FilmMedia;
  source: RecapSourceView;
};

export type FilmScene = Timing &
  (
    | {
        type: 'cover';
        title: string | null;
        media: FilmMedia[];
        source: RecapSourceView | null;
      }
    | { type: 'place'; places: string[] }
    | { type: 'fact'; days: number }
    | {
        type: 'rhythm';
        buckets: { index: number; goodDays: number }[];
        leading: number | null;
        total: number;
      }
    | {
        type: 'photo';
        source: RecapSourceView;
        media: FilmMedia;
        /** A heart moment's own words as the caption (PO 2026-11-17). */
        words: string | null;
        answers: RecapAnswerView[];
      }
    | {
        type: 'duo';
        source: RecapSourceView;
        media: FilmMedia[];
        answers: RecapAnswerView[];
      }
    | { type: 'words'; source: RecapSourceView; words: string }
    | { type: 'title'; source: RecapSourceView }
    | { type: 'answers'; source: RecapSourceView; answers: RecapAnswerView[] }
    | { type: 'tags'; tags: RecapTagView[] }
    | { type: 'month'; month: number }
    | { type: 'firsts'; sources: RecapSourceView[] }
    | { type: 'covers'; covers: FilmCover[] }
    | { type: 'closing'; media: FilmMedia[]; days: number }
  );

type Draft = FilmScene extends infer S
  ? S extends FilmScene
    ? Omit<S, keyof Timing> & {
        key: string;
        climax?: boolean;
        chapter?: string | null;
      }
    : never
  : never;

function hash(value: string): number {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1)
    result = Math.imul(result ^ value.charCodeAt(index), 0x01000193);
  return result >>> 0;
}

/** Titles the app writes when a memory is saved without one; not the couple's words. */
export function isFallbackTitle(title: string | null | undefined): boolean {
  const value = (title ?? '').trim();
  return !value || /^(Erinnerung vom|Memory from) .*\d/u.test(value);
}

/** Whole sentences first, else a word boundary; the couple's words are never reworded. */
export function filmExcerpt(text: string, limit = FILM_WORDS_LIMIT): string {
  const value = text.trim().split(/\s+/u).filter(Boolean).join(' ');
  if (value.length <= limit) return value;
  let kept = '';
  for (const sentence of value.split(/(?<=[.!?…])\s+/u)) {
    const next = `${kept} ${sentence}`.trim();
    if (next.length > limit) break;
    kept = next;
  }
  if (kept.length >= 40) return `${kept} …`;
  const head = value.slice(0, limit);
  const boundary = head.lastIndexOf(' ');
  return `${boundary > limit / 2 ? head.slice(0, boundary) : head} …`;
}

export function filmSerif(mood: string): boolean {
  return SERIF_MOODS.has(mood);
}

/** Reading time on a moving stage, at the pace the Product Owner approved in the prototype. */
export const FILM_MS_PER_CHAR = 11;
function readingMs(chars: number): number {
  return Math.max(4_500, 2_800 + chars * FILM_MS_PER_CHAR);
}

function sourceMedia(source: RecapSourceView): FilmMedia[] {
  if (!source.available) return [];
  if (source.media?.length) return source.media;
  // Curated or older selections may lack curated media; a non-sensitive
  // preview still carries the moment.
  return source.previewAttachmentId && !source.previewIsSensitive
    ? [
        {
          attachmentId: source.previewAttachmentId,
          parentId: source.id,
          kind: 'IMAGE',
        },
      ]
    : [];
}

function sourceWords(source: RecapSourceView): string {
  if (source.kind !== 'HEART_MOMENT') return '';
  return filmExcerpt(source.excerpt ?? source.title ?? '');
}

/** A source's own title, or null for an automatic fallback title. */
export function filmSourceTitle(source: RecapSourceView): string | null {
  if (!source.available || source.kind === 'HEART_MOMENT') return null;
  return isFallbackTitle(source.title) ? null : (source.title ?? null);
}

function lead(source: RecapSourceView): Draft {
  const key = source.key;
  if (!source.available) return { type: 'title', key, source };
  const media = sourceMedia(source);
  const images = media.filter((item) => item.kind === 'IMAGE');
  if (source.kind === 'MILESTONE' || source.kind === 'CHAPTER')
    return { type: 'title', key, source };
  if (source.kind === 'HEART_MOMENT') {
    const words = sourceWords(source);
    const picture = images[0] ?? media[0];
    return picture
      ? {
          type: 'photo',
          key,
          source,
          media: picture,
          words: words || null,
          answers: [],
        }
      : { type: 'words', key, source, words };
  }
  if (media.length >= 2)
    return { type: 'duo', key, source, media: media.slice(0, 3), answers: [] };
  if (media.length === 1)
    return {
      type: 'photo',
      key,
      source,
      media: media[0],
      words: null,
      answers: [],
    };
  return { type: 'title', key, source };
}

function withAnswers(source: RecapSourceView): Draft[] {
  const first = lead(source);
  const answers = source.available ? (source.answers ?? []) : [];
  if (!answers.length) return [first];
  if (first.type === 'title')
    return [{ type: 'answers', key: source.key, source, answers }];
  const chars = answers.reduce((sum, answer) => sum + answer.text.length, 0);
  if (
    chars <= FILM_INLINE_ANSWER_CHARS &&
    (first.type === 'photo' || first.type === 'duo')
  )
    return [{ ...first, answers }];
  return [
    first,
    { type: 'answers', key: `${source.key}:answers`, source, answers },
  ];
}

/** Never the same scene type twice in a row: vary the picture form instead. */
function vary(body: Draft[]): Draft[] {
  for (let index = 1; index < body.length; index += 1) {
    const previous = body[index - 1];
    const current = body[index];
    if (previous.type !== current.type) continue;
    const target = current.climax ? previous : current;
    const position = target === current ? index : index - 1;
    if (target.type === 'duo') {
      body[position] = {
        type: 'photo',
        key: target.key,
        source: target.source,
        media: target.media[0],
        words: null,
        answers: target.answers,
        climax: target.climax,
      };
    } else if (target.type === 'photo') {
      const images = sourceMedia(target.source).filter(
        (item) => item.kind === 'IMAGE' || item === target.media,
      );
      if (images.length >= 2 && !target.words)
        body[position] = {
          type: 'duo',
          key: target.key,
          source: target.source,
          media: images.slice(0, 2),
          answers: target.answers,
          climax: target.climax,
        };
    }
  }
  return body;
}

function answerChars(draft: Draft): number {
  return 'answers' in draft
    ? draft.answers.reduce((sum, answer) => sum + answer.text.length, 0)
    : 0;
}

function sceneMs(draft: Draft): number {
  const clip = (media: FilmMedia[]) =>
    Math.max(
      0,
      ...media
        .filter((item) => item.kind === 'VIDEO')
        .map((item) => (item.clipSeconds ?? 0) * 1_000 + 600),
    );
  let ms: number;
  switch (draft.type) {
    case 'words':
      ms = readingMs(draft.words.length);
      break;
    case 'answers':
      ms = readingMs(answerChars(draft));
      break;
    case 'photo':
      ms = Math.max(
        draft.words ? readingMs(draft.words.length) : FIXED_MS.photo,
        clip([draft.media]),
      );
      ms += answerChars(draft) * FILM_MS_PER_CHAR;
      break;
    case 'duo':
      ms =
        Math.max(FIXED_MS.duo, clip(draft.media)) +
        answerChars(draft) * FILM_MS_PER_CHAR;
      break;
    case 'rhythm':
      ms = readingMs(40 + draft.buckets.length * 12);
      break;
    case 'firsts':
      ms = FIRSTS_BASE_MS + draft.sources.length * FIRSTS_ITEM_MS;
      break;
    default:
      ms = FIXED_MS[draft.type];
  }
  return Math.round(ms + (draft.climax ? CLIMAX_EXTRA_MS : 0));
}

const LAYOUT_TYPES: Partial<Record<Draft['type'], string>> = {
  photo: 'photo',
  duo: 'duo',
  words: 'words',
  title: 'title',
  answers: 'answers',
  place: 'place',
  fact: 'fact',
};

/** The month (1-12) a source starts in, read in UTC like every period date. */
function sourceMonth(source: RecapSourceView): number | null {
  return source.occurredOn ? source.occurredOn.getUTCMonth() + 1 : null;
}

/** Moments with their answers, varied so no scene type repeats in a row. */
function momentDrafts(
  sources: RecapSourceView[],
  highlightKey: string | null,
): Draft[] {
  return vary(
    sources.flatMap((source) =>
      withAnswers(source).map((draft) =>
        draft.key === highlightKey ? { ...draft, climax: true } : draft,
      ),
    ),
  );
}

function withChapter(drafts: Draft[], chapter: string): Draft[] {
  return drafts.map((draft) => ({ ...draft, chapter }));
}

/**
 * A year film: month chapters in calendar order, then the finale. The year
 * highlight leaves its month chapter and closes the film as the climax; the
 * milestones leave theirs and play together as the firsts (PO 2026-11-17).
 */
function yearBody(
  sources: RecapSourceView[],
  film: RecapFilmView,
  highlight: RecapSourceView | null,
): { chapters: Draft[]; finale: Draft[]; covers: FilmCover[] } {
  const firsts = sources.filter(
    (source) => source.available && source.kind === 'MILESTONE',
  );
  const byMonth = new Map<number, RecapSourceView[]>();
  for (const source of sources) {
    const month = sourceMonth(source);
    if (
      !source.available ||
      month === null ||
      source === highlight ||
      source.kind === 'MILESTONE'
    )
      continue;
    byMonth.set(month, [...(byMonth.get(month) ?? []), source]);
  }
  const chapters = [...byMonth.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([month, items]) =>
      withChapter(
        [
          { type: 'month', key: `month:${month}`, month },
          ...momentDrafts(items, null),
        ],
        `m${month}`,
      ),
    );
  const firstsDrafts: Draft[] =
    firsts.length >= FILM_MIN_FIRSTS
      ? [{ type: 'firsts', key: 'firsts', sources: firsts }]
      : firsts.flatMap((source) => withAnswers(source));
  const covers = (film.monthHighlights ?? []).flatMap(({ month, key }) => {
    const own = sources.find((source) => source.key === key);
    const candidates = [
      ...(own ? [own] : []),
      ...sources.filter(
        (source) => source !== own && sourceMonth(source) === month,
      ),
    ];
    for (const source of candidates) {
      const media = sourceMedia(source).find((item) => item.kind === 'IMAGE');
      if (media) return [{ month, media, source }];
    }
    return [];
  });
  return {
    chapters,
    finale: [
      ...firstsDrafts,
      ...(film.tags.length >= FILM_MIN_TAGS
        ? [{ type: 'tags' as const, key: 'tags', tags: film.tags }]
        : []),
      ...(highlight ? momentDrafts([highlight], highlight.key) : []),
      ...(covers.length >= FILM_MIN_COVERS
        ? [{ type: 'covers' as const, key: 'covers', covers }]
        : []),
    ],
    covers,
  };
}

/** The film's scenes, or null when the edition has no film (legacy reader). */
export function recapFilmScenes(value: RecapView): FilmScene[] | null {
  const film: RecapFilmView | null | undefined = value.film;
  if (!film || (value.kind !== 'MONTH' && value.kind !== 'YEAR')) return null;
  const sources = value.sources;
  const highlight =
    sources.find((source) => source.key === film.highlightKey) ?? null;
  const images = (source: RecapSourceView) =>
    sourceMedia(source).filter((item) => item.kind === 'IMAGE');
  const yearly =
    value.kind === 'YEAR' ? yearBody(sources, film, highlight) : null;
  // A year cover shows the month highlights; a month cover its own pictures.
  const coverMedia = [
    ...(highlight ? images(highlight).slice(0, 1) : []),
    ...(yearly
      ? yearly.covers
          .filter((cover) => cover.source !== highlight)
          .map((cover) => cover.media)
      : sources
          .filter((source) => source !== highlight)
          .flatMap((source) => images(source))),
  ].slice(0, 4);
  const coverTitle = highlight
    ? (filmSourceTitle(highlight) ??
      (sourceWords(highlight) ? filmExcerpt(sourceWords(highlight), 60) : null))
    : null;
  const days =
    value.facts?.activeDays ??
    new Set(
      sources
        .map((source) => source.occurredOn?.toISOString().slice(0, 10))
        .filter(Boolean),
    ).size;
  const places = [
    ...new Set(
      sources
        .filter((source) => source.available && source.placeName)
        .map((source) => source.placeName as string),
    ),
  ].slice(0, 3);
  const opener: Draft[] =
    sources.length < MIN_OPENER_SOURCES
      ? []
      : places.length >= 2
        ? [{ type: 'place', key: 'place', places }]
        : days > 0
          ? [{ type: 'fact', key: 'fact', days }]
          : [];
  const rhythm = recapRhythm(value);
  const intro: Draft[] = [
    {
      type: 'cover',
      key: 'cover',
      title: coverTitle,
      media: coverMedia,
      source: highlight,
    },
    ...opener,
    ...(rhythm
      ? [
          {
            type: 'rhythm' as const,
            key: 'rhythm',
            buckets: rhythm.buckets,
            leading: rhythm.leading,
            total: rhythm.total,
          },
        ]
      : []),
  ];
  const closing: Draft = {
    type: 'closing',
    key: 'reflections',
    media: coverMedia,
    days,
  };
  const drafts: Draft[] = yearly
    ? [
        ...withChapter(intro, 'intro'),
        ...yearly.chapters,
        ...withChapter([...yearly.finale, closing], 'finale'),
      ]
    : [
        ...intro,
        ...momentDrafts(sources, film.highlightKey),
        ...(film.tags.length >= FILM_MIN_TAGS
          ? [{ type: 'tags' as const, key: 'tags', tags: film.tags }]
          : []),
        closing,
      ];
  const [first, second] = film.transitions;
  const counts: Record<string, number> = {};
  return drafts.map((draft, index) => {
    const layoutType = LAYOUT_TYPES[draft.type];
    const order = layoutType ? (film.layouts[layoutType] ?? []) : [];
    const seen = layoutType ? (counts[layoutType] ?? 0) : 0;
    if (layoutType) counts[layoutType] = seen + 1;
    const climax = Boolean(draft.climax);
    const transition =
      index === 0
        ? first
        : climax
          ? second
          : (index + (hash(`${value.id}:${index}`) % 4 === 0 ? 1 : 0)) % 2
            ? second
            : first;
    return {
      ...draft,
      climax,
      chapter: draft.chapter ?? null,
      ms: sceneMs(draft),
      transition: transition ?? 'fade',
      motion: film.motions.length
        ? film.motions[index % film.motions.length]
        : 'zoom-in',
      layout:
        draft.type === 'cover'
          ? film.cover
          : order.length
            ? order[seen % order.length]
            : '',
    } as FilmScene;
  });
}

export type FilmChapter = {
  chapter: string;
  /** Index of the chapter's first scene. */
  start: number;
  count: number;
};

/**
 * Progress chapters of a year film in playback order; null for a monthly film,
 * whose progress keeps one bar per scene.
 */
export function filmChapters(scenes: FilmScene[] | null): FilmChapter[] | null {
  if (!scenes?.length || scenes.some((scene) => scene.chapter === null))
    return null;
  const result: FilmChapter[] = [];
  scenes.forEach((scene, index) => {
    const last = result.at(-1);
    if (last && last.chapter === scene.chapter) last.count += 1;
    else
      result.push({
        chapter: scene.chapter as string,
        start: index,
        count: 1,
      });
  });
  return result;
}

/** The source a scene links back to, if any. */
export function filmSceneSource(scene: FilmScene): RecapSourceView | null {
  return 'source' in scene && scene.source ? scene.source : null;
}

/** The first picture a scene waits for before its time starts. */
export function filmSceneLeadMedia(scene: FilmScene): FilmMedia | null {
  switch (scene.type) {
    case 'cover':
    case 'duo':
    case 'closing':
      return scene.media[0] ?? null;
    case 'covers':
      return scene.covers[0]?.media ?? null;
    case 'photo':
      return scene.media;
    default:
      return null;
  }
}
