import type { NotificationItem } from '../api/generated/models/NotificationItem';
import type { RecapPeriod } from '../api/generated/models/RecapPeriod';
import type { RecapSourceView } from '../api/generated/models/RecapSourceView';
import type { RecapView } from '../api/generated/models/RecapView';
import { resolvedLocale, type TranslateText } from '../i18n';
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
/**
 * A recap notice names only its period (#1744). The server sends it as the
 * target's machine key ("2026-10" or "2026"); the month carries its year only
 * when the notice was issued in another year.
 */
export function recapNoticePeriod(
  key: string | null | undefined,
  issued: Date,
  locale: string,
): { kind: 'MONTH' | 'YEAR'; label: string } | null {
  const match = /^(\d{4})(?:-(0[1-9]|1[0-2]))?$/.exec(key ?? '');
  if (!match) return null;
  const year = Number(match[1]);
  if (!match[2])
    return {
      kind: 'YEAR',
      label: new Intl.NumberFormat(locale, { useGrouping: false }).format(year),
    };
  return {
    kind: 'MONTH',
    label: new Intl.DateTimeFormat(locale, {
      month: 'long',
      ...(issued.getUTCFullYear() === year ? {} : { year: 'numeric' }),
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, Number(match[2]) - 1, 1))),
  };
}

export function recapNoticeTitle(
  item: Pick<NotificationItem, 'kind' | 'targetType' | 'target' | 'createdAt'>,
  translate: TranslateText,
  locale = resolvedLocale(),
): string {
  const grew = item.kind === 'RECAP_GREW';
  if (!grew && item.targetType !== 'RECAP')
    return translate('recaps.notice.earlier');
  const period =
    item.targetType === 'RECAP'
      ? recapNoticePeriod(item.target?.title, item.createdAt, locale)
      : null;
  const base = grew ? 'recaps.notice.grew' : 'recaps.notice.ready';
  return period
    ? translate(`${base}${period.kind === 'YEAR' ? 'Year' : 'Month'}`, {
        period: period.label,
      })
    : translate(base);
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
  translate: TranslateText,
): string {
  // A retained snapshot of a running period is the only "kept" state couples see.
  return value.savedAt && value.isPartial
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
      : day <= 3
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

/** Mirrors the server's bounded manual selection. */
export const RECAP_SELECTION_LIMIT = 24;

export type RecapScene =
  | { type: 'cover'; key: string }
  | {
      type: 'facts';
      key: string;
      lines: RecapFactLine[];
      busiestMonth: number | null;
    }
  | {
      type: 'highlight';
      key: string;
      source: RecapSourceView;
      layout: 'photo' | 'words' | 'title';
    }
  | { type: 'closing'; key: string };

export type RecapFactLine = {
  kind: 'MEMORY' | 'HEART_MOMENT' | 'MILESTONE' | 'CHAPTER' | 'PLAN' | 'DAYS';
  count: number;
};

/** Counted lines worth a scene of their own; a near-empty period shows none. */
export function recapFactLines(value: RecapView): RecapFactLine[] {
  const facts = value.facts;
  if (!facts) return [];
  const kinds: RecapFactLine[] = [
    { kind: 'MEMORY' as const, count: facts.memories },
    { kind: 'HEART_MOMENT' as const, count: facts.heartMoments },
    { kind: 'PLAN' as const, count: facts.plans },
    { kind: 'MILESTONE' as const, count: facts.milestones },
    { kind: 'CHAPTER' as const, count: facts.chapters },
  ].filter((line) => line.count > 0);
  if (kinds.reduce((sum, line) => sum + line.count, 0) < 3) return [];
  const lines = kinds.sort((a, b) => b.count - a.count).slice(0, 3);
  return facts.activeDays > 1
    ? [...lines, { kind: 'DAYS', count: facts.activeDays }]
    : lines;
}

/** One ordered scene list drives pages, progress and playback. */
export function recapScenes(value: RecapView): RecapScene[] {
  const lines = recapFactLines(value);
  return [
    { type: 'cover', key: 'cover' },
    ...(lines.length
      ? [
          {
            type: 'facts' as const,
            key: 'facts',
            lines,
            busiestMonth: value.facts?.busiestMonth ?? null,
          },
        ]
      : []),
    ...value.sources.map((source) => ({
      type: 'highlight' as const,
      key: source.key,
      source,
      layout:
        source.available && source.previewAttachmentId
          ? ('photo' as const)
          : source.available && source.kind === 'HEART_MOMENT'
            ? ('words' as const)
            : ('title' as const),
    })),
    { type: 'closing', key: 'reflections' },
  ];
}
