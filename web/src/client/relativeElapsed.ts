const DAY_MS = 86_400_000;

/**
 * Locale-aware "how long ago" label for a date-only value (for example
 * "7 months ago"). Both sides are compared as calendar days, so the result
 * does not depend on the time of day or the viewer's time zone offset.
 */
export function formatRelativeElapsed(
  happenedOn: Date,
  locale: string,
  now: Date = new Date(),
): string {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((happenedOn.getTime() - today) / DAY_MS);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const abs = Math.abs(days);
  const sign = days < 0 ? -1 : 1;
  if (abs < 7) return formatter.format(days, 'day');
  if (abs < 56) return formatter.format(sign * Math.floor(abs / 7), 'week');
  if (abs < 365) {
    return formatter.format(sign * Math.floor(abs / 30.44), 'month');
  }
  return formatter.format(sign * Math.floor(abs / 365.25), 'year');
}
