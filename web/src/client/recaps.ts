import type { RecapPeriod } from '../api/generated/models/RecapPeriod';
import type { RecapSourceView } from '../api/generated/models/RecapSourceView';
import type { RecapView } from '../api/generated/models/RecapView';
import {
  chapterDetailPath,
  heartMomentDetailPath,
  memoryDetailPath,
  milestoneDetailPath,
  planDetailPath,
} from './routes';

export function recapPeriodKey(value: RecapPeriod): string {
  return `${value.kind}:${value.year}:${value.month ?? 0}`;
}
export function recapPeriodLabel(value: RecapPeriod, locale: string): string {
  return value.kind === 'YEAR'
    ? new Intl.NumberFormat(locale, { useGrouping: false }).format(value.year)
    : new Intl.DateTimeFormat(locale, {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(Date.UTC(value.year, (value.month ?? 1) - 1, 1)));
}
export function recapDate(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(value);
}
export function recapPeriodStatus(
  value: Pick<RecapView, 'savedAt' | 'isPartial' | 'throughOn'>,
  locale: string,
  translate: (key: string, options?: Record<string, unknown>) => string,
): string {
  return value.savedAt
    ? translate('recaps.saved')
    : value.isPartial
      ? translate('recaps.partial', {
          date: recapDate(value.throughOn, locale),
        })
      : translate('recaps.complete');
}
export function recapSourcePath(source: RecapSourceView): string {
  switch (source.kind) {
    case 'MEMORY':
      return memoryDetailPath(source.id);
    case 'HEART_MOMENT':
      return heartMomentDetailPath(source.id);
    case 'MILESTONE':
      return milestoneDetailPath(source.id);
    case 'CHAPTER':
      return chapterDetailPath(source.id);
    case 'PLAN':
      return planDetailPath(source.id);
  }
}
export function recapHeadline(
  value: RecapView,
  translate: (key: string) => string,
): string {
  return (
    value.headline ??
    translate(
      `recaps.fallback.${['MOMENTS', 'WORDS', 'MILESTONES', 'CHAPTERS', 'PLANS'].includes(value.theme) ? value.theme : 'MIXED'}`,
    )
  );
}

/** Attention timing uses the server's viewer day; edition dates remain authoritative. */
export function monthlyRecapInvitation(
  editions: RecapView[],
  today: Date,
): RecapView | undefined {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const day = today.getUTCDate();
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const period =
    day >= last - 2
      ? year * 12 + month
      : day <= 7
        ? year * 12 + month - 1
        : null;
  if (period === null) return undefined;
  return editions
    .filter(
      (edition) =>
        edition.kind === 'MONTH' &&
        edition.status === 'READY' &&
        edition.year * 12 + (edition.month ?? 0) - 1 === period &&
        edition.sources.some((source) => source.available),
    )
    .sort(
      (a, b) =>
        Number(Boolean(a.savedAt)) - Number(Boolean(b.savedAt)) ||
        (b.generatedAt?.getTime() ?? 0) - (a.generatedAt?.getTime() ?? 0),
    )[0];
}
