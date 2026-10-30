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
