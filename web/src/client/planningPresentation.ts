import type { TFunction } from 'i18next';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import type { WishDetail } from '../api/generated/models/WishDetail';
import {
  formatCompactCalendarDate,
  formatCompactWeekdayDate,
} from './formatRecency';
import { resolvedLocale } from '../i18n';

/**
 * Shared Planen product-reference (#859) status/date pill presentation for
 * both the overview cards and the Plan detail hierarchy, so the two surfaces
 * never drift apart on what a given lifecycle state is called.
 */
export function wishPillTone(status: WishDetail['status']): string {
  if (status === 'COMPLETED') return 'completed';
  if (status === 'PLANNED') return 'scheduled';
  return 'open';
}

export function planPillTone(
  plan: Pick<PlanDetail, 'status' | 'plannedOn' | 'plannedStart'>,
): string {
  if (plan.status === 'IDEA') return 'idea';
  if (plan.status === 'PLANNED')
    return plan.plannedOn || plan.plannedStart ? 'scheduled' : 'idea';
  return 'completed';
}

/** Bare status word, e.g. for the Plan detail page's separate status pill. */
export function planStatusWord(
  t: TFunction,
  plan: Pick<PlanDetail, 'status'>,
): string {
  if (plan.status === 'IDEA') return t('m5s3.plan.status.IDEA');
  if (plan.status === 'PLANNED') return t('m5s3.plan.statusPillPlanned');
  return t(`m5s3.plan.status.${plan.status}`);
}

export function planScheduleLabel(
  plan: Pick<PlanDetail, 'plannedOn' | 'plannedStart' | 'plannedEnd'>,
  locale = resolvedLocale(),
): string | null {
  if (plan.plannedOn) return formatCompactCalendarDate(plan.plannedOn, locale);
  if (plan.plannedStart) {
    const formatTime = (value: Date) =>
      new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
      }).format(value);
    const startDate = formatCompactWeekdayDate(plan.plannedStart, locale);
    const startTime = formatTime(plan.plannedStart);
    if (!plan.plannedEnd) return `${startDate} · ${startTime}`;

    const sameDay =
      plan.plannedStart.getFullYear() === plan.plannedEnd.getFullYear() &&
      plan.plannedStart.getMonth() === plan.plannedEnd.getMonth() &&
      plan.plannedStart.getDate() === plan.plannedEnd.getDate();
    if (sameDay) {
      return `${startDate} · ${startTime}–${formatTime(plan.plannedEnd)}`;
    }
    return `${startDate} · ${startTime} – ${formatCompactWeekdayDate(
      plan.plannedEnd,
      locale,
    )} · ${formatTime(plan.plannedEnd)}`;
  }
  return null;
}

/**
 * Combined "{{status}} → {{date}}" pill label for the Planen overview list.
 * A true calendar date is formatted in UTC to preserve its encoded day;
 * timestamp schedules continue to use the browser's local timezone.
 */
export function planPillLabel(
  t: TFunction,
  plan: Pick<
    PlanDetail,
    'status' | 'plannedOn' | 'plannedStart' | 'plannedEnd'
  >,
): string {
  const statusWord = planStatusWord(t, plan);
  const date = planScheduleLabel(plan);
  if (plan.status === 'PLANNED' && date) {
    return t('m5s3.overview.scheduledMeta', { status: statusWord, date });
  }
  return statusWord;
}
