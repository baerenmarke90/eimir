/**
 * The shared model of the memory worlds (#2283): one rediscovery item as a
 * keepsake a world can show (a print, a heart moment card, a milestone, a
 * note), plus small helpers the worlds share.
 */
import type { TFunction } from 'i18next';
import type { MouseEvent } from 'react';
import type { MemoryAttachmentSummary } from '../../api/generated/models/MemoryAttachmentSummary';
import type { StoryItem } from '../../api/generated/models/StoryItem';
import { galleryCover } from '../../client/galleryCover';
import type { ObjectUrlSource } from '../../client/objectUrlResource';
import {
  heartMomentDetailPath,
  memoryDetailPath,
  milestoneDetailPath,
} from '../../client/routes';
import {
  formatStoryDate,
  storyItemKey,
  storyItemPresentation,
} from '../storyPresentation';

/** The app's one reduced-motion source (Motion Contract M9). */
export { prefersReducedMotion } from '../../motion/reducedMotion';

export type LoadMemoryImage = (
  memoryId: string,
  attachmentId: string,
  signal?: AbortSignal,
) => Promise<ObjectUrlSource>;

export type OpenMemoryWorldItem = (
  event: MouseEvent<HTMLAnchorElement>,
  to: string,
  selectedKey?: string,
) => void;

export type MemoryWorldEntryKind = 'photo' | 'heart' | 'milestone' | 'words';

export interface MemoryWorldEntry {
  key: string;
  kind: MemoryWorldEntryKind;
  path: string;
  title: string;
  date: Date;
  /** `YYYY-MM-DD` for `<time dateTime>`. */
  dateTime: string;
  dateLabel: string;
  author: string;
  /** The memory id for photos; empty for heart moments and milestones. */
  memoryId: string;
  cover?: MemoryAttachmentSummary;
  /** Heart moments only: the feeling, which colours them like in the diary. */
  emotion?: string;
  /** All shown photos of a memory in their authored order (sensitive ones left out). */
  photos?: MemoryAttachmentSummary[];
  /** The memory's own words, line by line: places, answers, heart moment text. */
  verses?: string[];
  isLead: boolean;
}

/** What every world receives. */
export interface MemoryWorldProps {
  /** The lead first, then the rest of the rediscovery selection. */
  entries: MemoryWorldEntry[];
  /** The lead's kicker, e.g. "Heute vor 2 Jahren". */
  kicker: string;
  loadMemoryImage: LoadMemoryImage;
  onOpen: OpenMemoryWorldItem;
}

/** Sentences shorter than this stay one line; longer ones break at phrases. */
const VERSE_MAX_CHARS = 64;

/** Splits a text into short lines (sentences, or phrases of long sentences). */
export function splitVerses(text: string): string[] {
  const clean = text.trim().replace(/\s+/gu, ' ');
  if (!clean) return [];
  const sentences = clean.match(/[^.!?…]+[.!?…]*/gu) ?? [clean];
  return sentences.flatMap((sentence) => {
    const line = sentence.trim();
    if (line.length <= VERSE_MAX_CHARS) return line ? [line] : [];
    // Long sentences break at commas and dashes into singable phrases.
    return line
      .split(/(?<=[,;–])\s+/u)
      .map((part) => part.trim())
      .filter(Boolean);
  });
}

export interface MemoryWorldEntryOptions {
  isLead: boolean;
  t: TFunction;
  locale: string;
  nicknameFor?: (accountId: string) => string | null;
  /** The lead's headline from the rediscovery selection. */
  headline?: string;
}

export function toMemoryWorldEntry(
  item: StoryItem,
  { isLead, t, locale, nicknameFor, headline }: MemoryWorldEntryOptions,
): MemoryWorldEntry {
  const presentation = storyItemPresentation(item, t, nicknameFor);
  const base = {
    key: storyItemKey(item),
    title: headline || presentation.title,
    date: item.effectiveDate,
    dateTime: item.effectiveDate.toISOString().slice(0, 10),
    dateLabel: formatStoryDate(item.effectiveDate, locale),
    author: presentation.author,
    memoryId: '',
    isLead,
  };
  switch (item.kind) {
    case 'MEMORY': {
      const cover = galleryCover(item.memory);
      const photos = [...item.memory.attachments]
        .filter(
          (attachment) =>
            attachment.mediaType === 'IMAGE' && attachment.isSensitive !== true,
        )
        .sort((a, b) => a.position - b.position);
      const verses = [
        ...(item.memory.places ?? []).map((place) =>
          t('memoryWorlds.placeVerse', { place: place.name }),
        ),
        ...(item.memory.experienceAnswers ?? []).flatMap((answer) =>
          splitVerses(answer.body),
        ),
      ];
      return {
        ...base,
        kind: cover ? 'photo' : 'words',
        path: memoryDetailPath(item.memory.id),
        memoryId: item.memory.id,
        cover,
        photos,
        verses,
      };
    }
    case 'HEART_MOMENT':
      return {
        ...base,
        kind: 'heart',
        title: item.heartMoment.text.trim() || base.title,
        emotion: item.heartMoment.emotion,
        verses: splitVerses(item.heartMoment.text),
        path: heartMomentDetailPath(item.heartMoment.id),
      };
    case 'MILESTONE':
      return {
        ...base,
        kind: 'milestone',
        path: milestoneDetailPath(item.milestone.id),
      };
  }
}

/**
 * The entries of a world: the lead first, then the selection without
 * duplicates. Memories whose cover photo is sensitive stay out unless this
 * device chose to show them (their photo then stays covered).
 */
export function buildMemoryWorldEntries({
  lead,
  leadHeadline,
  items,
  showSensitive,
  t,
  locale,
  nicknameFor,
}: {
  lead: StoryItem | null;
  leadHeadline?: string;
  items: readonly StoryItem[];
  showSensitive: boolean;
  t: TFunction;
  locale: string;
  nicknameFor?: (accountId: string) => string | null;
}): MemoryWorldEntry[] {
  const list: MemoryWorldEntry[] = [];
  const seen = new Set<string>();
  const add = (entry: MemoryWorldEntry) => {
    if (seen.has(entry.key)) return;
    seen.add(entry.key);
    list.push(entry);
  };
  if (lead)
    add(
      toMemoryWorldEntry(lead, {
        isLead: true,
        t,
        locale,
        nicknameFor,
        headline: leadHeadline,
      }),
    );
  for (const item of items)
    add(toMemoryWorldEntry(item, { isLead: false, t, locale, nicknameFor }));
  return showSensitive
    ? list
    : list.filter((entry) => entry.cover?.isSensitive !== true);
}

/** A stable, cheap hash of a key (for per-entry variation that never changes). */
export function keyHash(text: string): number {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1)
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  return hash;
}

export type SeasonKey = 'winter' | 'spring' | 'summer' | 'autumn';

const SEASON_KEYS: readonly SeasonKey[] = [
  'winter',
  'spring',
  'summer',
  'autumn',
];

/** The meteorological season of a date; December belongs to the next winter. */
export function seasonOf(date: Date): {
  key: string;
  season: SeasonKey;
  /** The year the season ends in (winter 2025/26 is 2026). */
  year: number;
} {
  const month = date.getMonth();
  const year = month === 11 ? date.getFullYear() + 1 : date.getFullYear();
  const index =
    month === 11 || month <= 1 ? 0 : month <= 4 ? 1 : month <= 7 ? 2 : 3;
  return { key: `${year}-${index}`, season: SEASON_KEYS[index], year };
}

/** "Sommer 2026", or "Winter 2025/26" across the turn of the year. */
export function seasonLabel(date: Date, t: TFunction): string {
  const { season, year } = seasonOf(date);
  if (season === 'winter')
    return t('memoryWorlds.winterSpan', {
      from: year - 1,
      to: String(year).slice(2),
    });
  return t('rediscovery.season.line', {
    season: t(`rediscovery.season.${season}`),
    year,
  });
}

/**
 * The seasons from `first` to `last`: "Sommer 2026", "Frühling – Sommer 2026"
 * or, across years, "2023 – 2026" (the Fotoautomat's strips and the
 * Fotobuch's cover share the span template).
 */
export function seasonSpan(first: Date, last: Date, t: TFunction): string {
  const from = seasonOf(first);
  const to = seasonOf(last);
  if (from.key === to.key) return seasonLabel(first, t);
  if (from.year === to.year && from.season !== 'winter')
    return t('memoryWorlds.booth.span', {
      from: t(`rediscovery.season.${from.season}`),
      to: seasonLabel(last, t),
    });
  const a = first.getFullYear();
  const b = last.getFullYear();
  return a === b ? String(a) : t('memoryWorlds.booth.span', { from: a, to: b });
}
