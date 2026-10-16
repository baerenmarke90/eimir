import type { TFunction } from 'i18next';
import { resolvedLocale } from '../i18n';

/**
 * Formats recency for recent activity items:
 * - "Heute" for items from today
 * - "Gestern" for items from yesterday
 * - "vor X Tagen" for 2 to 6 days ago
 * - localized short date (e.g. "16. Feb.") for older entries
 */
export function formatRecency(
  date: Date,
  t: TFunction,
  now: Date = new Date(),
  locale = resolvedLocale(),
): string {
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const itemDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const diffDays = Math.round(
    (nowDate.getTime() - itemDate.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (diffDays <= 0) {
    return t('m5s5.common.today');
  }
  if (diffDays === 1) {
    return t('m5s5.common.yesterday');
  }
  if (diffDays >= 2 && diffDays <= 6) {
    return t('m5s5.common.daysAgo', { count: diffDays });
  }
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

/**
 * Formats relative time for notifications:
 * - "Gerade eben" for < 1 minute ago
 * - "vor X Min." for < 60 minutes ago
 * - "vor X Std." for < 24 hours ago (same calendar day)
 * - "Gestern" for yesterday
 * - "vor X Tagen" for 2 to 6 days ago
 * - localized short date (e.g. "16. Feb.") for older entries
 */
export function formatRelativeTime(
  date: Date,
  t: TFunction,
  now: Date = new Date(),
  locale = resolvedLocale(),
): string {
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);

  if (diffMinutes < 1) {
    return t('m5s5.common.justNow');
  }
  if (diffMinutes < 60) {
    return t('m5s5.common.minutesAgo', { count: diffMinutes });
  }
  if (diffHours < 24 && now.getDate() === date.getDate()) {
    return t('m5s5.common.hoursAgo', { count: diffHours });
  }

  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const itemDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const diffDays = Math.round(
    (nowDate.getTime() - itemDate.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (diffDays === 1) {
    return t('m5s5.common.yesterday');
  }
  if (diffDays >= 2 && diffDays <= 6) {
    return t('m5s5.common.daysAgo', { count: diffDays });
  }
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

/**
 * Formats relative date for upcoming real instants in the browser timezone.
 */
export function formatUpcomingRelative(
  date: Date,
  t: TFunction,
  now: Date = new Date(),
  locale = resolvedLocale(),
): string {
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const diffDays = Math.round(
    (targetDate.getTime() - nowDate.getTime()) / (24 * 60 * 60 * 1000),
  );

  const formattedShort = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
  }).format(date);

  if (diffDays <= 0) {
    return `${t('m5s5.common.today')} · ${formattedShort}`;
  }
  if (diffDays === 1) {
    return `${t('m5s5.common.tomorrow')} · ${formattedShort}`;
  }
  if (diffDays >= 2 && diffDays <= 30) {
    return `${t('m5s5.common.inDays', { count: diffDays })} · ${formattedShort}`;
  }
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
  }).format(date);
}

/**
 * Relative presentation for an OpenAPI `date` carrier.
 *
 * The target date is read in UTC because the generated client encodes a pure
 * calendar day at UTC midnight. The comparison date is browser-local today;
 * only YYYY-MM-DD values are compared, so the scheduled day itself can never
 * slide across a timezone boundary.
 */
export function formatUpcomingCalendarDate(
  date: Date,
  t: TFunction,
  now: Date = new Date(),
  locale = resolvedLocale(),
): string {
  const targetKey = date.toISOString().slice(0, 10);
  const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
  const targetDay = Date.parse(`${targetKey}T00:00:00Z`);
  const today = Date.parse(`${nowKey}T00:00:00Z`);
  const diffDays = Math.round((targetDay - today) / (24 * 60 * 60 * 1000));

  const formattedShort = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);

  if (diffDays <= 0) {
    return `${t('m5s5.common.today')} · ${formattedShort}`;
  }
  if (diffDays === 1) {
    return `${t('m5s5.common.tomorrow')} · ${formattedShort}`;
  }
  if (diffDays >= 2 && diffDays <= 30) {
    return `${t('m5s5.common.inDays', { count: diffDays })} · ${formattedShort}`;
  }
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(date);
}

/** Compact weekday + date for a true instant in the user's local timezone. */
export function formatCompactWeekdayDate(
  date: Date,
  locale = resolvedLocale(),
): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date);
}

/**
 * Compact weekday + date for an OpenAPI `date` carrier.
 *
 * Generated TypeScript models represent a date as a Date at UTC midnight.
 * Formatting that value in the browser timezone could shift it to the previous
 * day. `timeZone: UTC` reads only the encoded calendar components and therefore
 * preserves the authoritative day on every device.
 */
export function formatCompactCalendarDate(
  date: Date,
  locale = resolvedLocale(),
): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Full calendar date for a day-only value, e.g. the day a Plan is completed
 * on. Reading the UTC components preserves the encoded day on every device.
 */
export function formatCalendarDate(
  date: Date,
  locale = resolvedLocale(),
): string {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
