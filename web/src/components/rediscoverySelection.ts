import type { TFunction } from 'i18next';
import type { DashboardItem } from '../api/generated/models/DashboardItem';
import type { PartOfDay } from '../api/generated/models/PartOfDay';
import type { RediscoveryContext } from '../api/generated/models/RediscoveryContext';
import type { StoryItem } from '../api/generated/models/StoryItem';

/**
 * Varying wording for the two rediscovery cards (#1790 C2): Wir
 * "Erinnert ihr euch?" and Momente "Wisst ihr noch?".
 *
 * - An authored title (or a heart moment's own words) stays the headline; a
 *   variant line fills the secondary line next to the date.
 * - Without a title, a variant becomes the headline and the date moves to the
 *   secondary line, so a card never shows a bare date as its title.
 * - Selection is a pure function of the viewer's calendar day and the card:
 *   stable across re-render and reload, different from the previous day's
 *   variant for the same card, falling back to relative time.
 *
 * Privacy: every non-date variant comes from the server's viewer-safe
 * `RediscoveryContext`, which is only produced for couple-shared sources.
 */

export const REDISCOVERY_VARIANTS = [
  'place',
  'excerpt',
  'relativeTime',
  'weekday',
  'season',
  'chapter',
  'tag',
  'mediaCount',
] as const;

export type RediscoveryVariant = (typeof REDISCOVERY_VARIANTS)[number];

/** A calendar day as `YYYY-MM-DD`; never a local instant. */
export type CalendarDay = string;

export type RediscoverySource = {
  /** Stable card identity, e.g. `MEMORY:<id>`. */
  cardKey: string;
  /** The moment's own calendar day. */
  day: CalendarDay;
  /** Authored headline text (memory/milestone title or heart moment words). */
  authoredHeadline?: string | null;
  context?: RediscoveryContext | null;
};

export type RediscoveryOptions = {
  /** The viewer's current calendar day. */
  today: CalendarDay;
  /** Variants already conveyed elsewhere on the card (e.g. a kicker). */
  exclude?: readonly RediscoveryVariant[];
};

export type RediscoveryWording = {
  headline: string;
  /** Variant line shown beside the date; null when the variant is the headline. */
  variantLine: string | null;
  headlineIsVariant: boolean;
  variant: RediscoveryVariant | null;
};

const DAY_MS = 86_400_000;
const MIN_MEDIA_COUNT = 2;

function parseDay(day: CalendarDay): { y: number; m: number; d: number } {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return { y, m, d };
}

/** Days since the Unix epoch for a calendar day, independent of time zones. */
export function dayNumber(day: CalendarDay): number {
  const { y, m, d } = parseDay(day);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** Calendar day of an OpenAPI date-only value (a UTC-midnight carrier). */
export function calendarDayOf(value: Date): CalendarDay {
  return value.toISOString().slice(0, 10);
}

/** The viewer's local calendar day for an instant. */
export function localCalendarDay(value: Date): CalendarDay {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/** FNV-1a: a small stable string hash, identical on every device. */
function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Variants whose source data exists for this card, in canonical order. */
export function availableVariants(
  source: RediscoverySource,
  options: RediscoveryOptions,
): RediscoveryVariant[] {
  const context = source.context ?? null;
  const media = (context?.photoCount ?? 0) + (context?.videoCount ?? 0);
  const has: Record<RediscoveryVariant, boolean> = {
    place: Boolean(context?.placeName?.trim()),
    excerpt: Boolean(context?.excerpt?.trim()),
    relativeTime: dayNumber(options.today) > dayNumber(source.day),
    weekday: true,
    season: true,
    chapter: Boolean(context?.chapterTitle?.trim()),
    tag: Boolean(context?.tag?.trim()),
    mediaCount: media >= MIN_MEDIA_COUNT,
  };
  const excluded = new Set(options.exclude ?? []);
  return REDISCOVERY_VARIANTS.filter(
    (variant) => has[variant] && !excluded.has(variant),
  );
}

/**
 * Deterministic per viewer day and card. Consecutive days advance the
 * rotation by one, so the same card never repeats yesterday's variant while
 * more than one variant is available.
 */
export function selectVariant(
  available: readonly RediscoveryVariant[],
  cardKey: string,
  today: CalendarDay,
): RediscoveryVariant | null {
  if (available.length === 0) return null;
  const offset = stableHash(cardKey) % available.length;
  return available[(dayNumber(today) + offset) % available.length];
}

function countText(t: TFunction, count: number): string {
  return count >= 2 && count <= 12
    ? t(`rediscovery.numberWords.${count}`)
    : String(count);
}

function counted(t: TFunction, key: string, count: number): string {
  return t(key, { count, countText: countText(t, count) });
}

/** A generated line may open with a number word ("three weeks ago"). */
function sentenceStart(line: string, locale: string): string {
  return line.charAt(0).toLocaleUpperCase(locale) + line.slice(1);
}

function monthsBetween(
  from: ReturnType<typeof parseDay>,
  to: ReturnType<typeof parseDay>,
) {
  let months = (to.y - from.y) * 12 + (to.m - from.m);
  if (to.d < from.d) months -= 1;
  return months;
}

export function relativeTimeLine(
  t: TFunction,
  day: CalendarDay,
  today: CalendarDay,
): string {
  const days = dayNumber(today) - dayNumber(day);
  if (days <= 0) return t('rediscovery.relative.today');
  if (days === 1) return t('rediscovery.relative.yesterday');
  if (days < 7) return counted(t, 'rediscovery.relative.days', days);
  const from = parseDay(day);
  const to = parseDay(today);
  const months = monthsBetween(from, to);
  const sameDayOfMonth = from.d === to.d;
  if (months >= 12) {
    const years = Math.floor(months / 12);
    const exact = sameDayOfMonth && from.m === to.m;
    return counted(
      t,
      exact ? 'rediscovery.relative.yearsExact' : 'rediscovery.relative.years',
      years,
    );
  }
  if (months >= 2) {
    return counted(
      t,
      sameDayOfMonth
        ? 'rediscovery.relative.monthsExact'
        : 'rediscovery.relative.months',
      months,
    );
  }
  const weeks = Math.floor(days / 7);
  return counted(
    t,
    days % 7 === 0
      ? 'rediscovery.relative.weeksExact'
      : 'rediscovery.relative.weeks',
    weeks,
  );
}

function weekdayName(day: CalendarDay, locale: string): string {
  const { y, m, d } = parseDay(day);
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

function seasonKey(month: number): 'spring' | 'summer' | 'autumn' | 'winter' {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

export function phraseVariant(
  variant: RediscoveryVariant,
  source: RediscoverySource,
  t: TFunction,
  locale: string,
  today: CalendarDay,
): string {
  const context = source.context ?? null;
  switch (variant) {
    case 'place':
      return context?.placeName?.trim() ?? '';
    case 'excerpt':
      return t(
        context?.excerptTruncated
          ? 'rediscovery.excerptTruncated'
          : 'rediscovery.excerpt',
        { text: context?.excerpt?.trim() ?? '' },
      );
    case 'relativeTime':
      return sentenceStart(relativeTimeLine(t, source.day, today), locale);
    case 'weekday': {
      const part: PartOfDay | null | undefined = context?.partOfDay;
      return t(`rediscovery.weekday.${part ?? 'plain'}`, {
        weekday: weekdayName(source.day, locale),
      });
    }
    case 'season': {
      const { y, m } = parseDay(source.day);
      return t('rediscovery.season.line', {
        season: t(`rediscovery.season.${seasonKey(m)}`),
        year: y,
      });
    }
    case 'chapter':
      return t('rediscovery.chapter', {
        chapter: context?.chapterTitle?.trim() ?? '',
      });
    case 'tag':
      return t('rediscovery.tag', { tag: context?.tag?.trim() ?? '' });
    case 'mediaCount': {
      const photos = context?.photoCount ?? 0;
      const videos = context?.videoCount ?? 0;
      if (photos > 0 && videos > 0) {
        return counted(t, 'rediscovery.media.mixed', photos + videos);
      }
      return photos > 0
        ? counted(t, 'rediscovery.media.photos', photos)
        : counted(t, 'rediscovery.media.videos', videos);
    }
  }
}

export function rediscoveryWording(
  source: RediscoverySource,
  options: RediscoveryOptions,
  t: TFunction,
  locale: string,
): RediscoveryWording {
  const authored = source.authoredHeadline?.trim() || null;
  let variant = selectVariant(
    availableVariants(source, options),
    source.cardKey,
    options.today,
  );
  let line = variant
    ? phraseVariant(variant, source, t, locale, options.today)
    : '';
  if (!line.trim()) {
    variant = 'relativeTime';
    line = sentenceStart(
      relativeTimeLine(t, source.day, options.today),
      locale,
    );
  }
  if (authored) {
    return {
      headline: authored,
      variantLine: line,
      headlineIsVariant: false,
      variant,
    };
  }
  return {
    headline: line,
    variantLine: null,
    headlineIsVariant: true,
    variant,
  };
}

/** The viewer's current day: the server's `viewerLocalDate` when present. */
export function viewerToday(viewerLocalDate?: Date | null): CalendarDay {
  return viewerLocalDate
    ? calendarDayOf(viewerLocalDate)
    : localCalendarDay(new Date());
}

/** Wir rediscovery card source from the dashboard projection. */
export function dashboardRediscoverySource(
  item: DashboardItem,
  context?: RediscoveryContext | null,
): RediscoverySource {
  return {
    cardKey: `${item.type}:${item.id}`,
    day: item.occurredOn
      ? calendarDayOf(item.occurredOn)
      : localCalendarDay(item.createdAt ?? new Date()),
    authoredHeadline: item.titleOrText,
    context,
  };
}

/** Momente lead card source from the discover projection. */
export function storyRediscoverySource(
  item: StoryItem,
  context?: RediscoveryContext | null,
): RediscoverySource {
  switch (item.kind) {
    case 'MEMORY':
      return {
        cardKey: `MEMORY:${item.memory.id}`,
        day: calendarDayOf(item.memory.happenedOn ?? item.effectiveDate),
        authoredHeadline: item.memory.title,
        context,
      };
    case 'HEART_MOMENT':
      return {
        cardKey: `HEART_MOMENT:${item.heartMoment.id}`,
        day: calendarDayOf(item.heartMoment.happenedOn ?? item.effectiveDate),
        authoredHeadline: item.heartMoment.text,
        context,
      };
    case 'MILESTONE':
      return {
        cardKey: `MILESTONE:${item.milestone.id}`,
        day: calendarDayOf(item.milestone.happenedOn ?? item.effectiveDate),
        authoredHeadline: item.milestone.title,
        context,
      };
  }
}
