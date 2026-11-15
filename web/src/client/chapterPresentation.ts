import type { TFunction } from 'i18next';

/** Authored calendar dates only; an open period never acquires a fabricated end. */
export function formatChapterPeriod(
  chapter: { startOn?: Date | null; endOn?: Date | null },
  t: TFunction,
  locale: string,
): string | null {
  const format = (date: Date) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeZone: 'UTC',
    }).format(date);
  const { startOn, endOn } = chapter;
  if (startOn && endOn) {
    return startOn.getTime() === endOn.getTime()
      ? format(startOn)
      : `${format(startOn)} – ${format(endOn)}`;
  }
  if (startOn) return t('m5s3.chapter.since', { date: format(startOn) });
  if (endOn) return t('m5s3.chapter.until', { date: format(endOn) });
  return null;
}
