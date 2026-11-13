import type { TFunction } from 'i18next';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import { resolvedLocale } from '../i18n';

/**
 * Discreet plans (#1790 F3) are a shared visual shield, never a permission.
 * Every surface outside the revealed detail shows the list title only.
 */
type DiscreetPresentation = Pick<
  PlanDetail,
  'title' | 'discreet' | 'discreetTitleMode' | 'previewTitle'
>;

/** Title shown wherever the Plan is concealed: lists, Wir, Search, export. */
export function planListTitle(
  plan: DiscreetPresentation,
  t: TFunction,
): string {
  if (!plan.discreet || plan.discreetTitleMode === 'ORIGINAL')
    return plan.title;
  return plan.previewTitle?.trim() || t('discreetPlans.fallbackTitle');
}

/** A server-projected list title; empty means the neutral fallback. */
export function concealedTitle(title: string | null | undefined, t: TFunction) {
  return title?.trim() || t('discreetPlans.fallbackTitle');
}

type CalendarSource = Pick<
  PlanDetail,
  | 'id'
  | 'spaceId'
  | 'title'
  | 'description'
  | 'plannedOn'
  | 'plannedStart'
  | 'plannedEnd'
  | 'updatedAt'
  | 'version'
  | 'discreet'
  | 'discreetTitleMode'
  | 'previewTitle'
>;

/** The calendar export carries only the list title and time when discreet. */
export function calendarPresentation<T extends CalendarSource>(
  plan: T,
  location: string | undefined,
  t: TFunction,
): { plan: T; location: string | undefined } {
  if (!plan.discreet) return { plan, location };
  return {
    plan: { ...plan, title: planListTitle(plan, t), description: null },
    location: undefined,
  };
}

type PartOfDay = 'MORNING' | 'MIDDAY' | 'AFTERNOON' | 'EVENING';

function partOfDay(hour: number): PartOfDay {
  if (hour < 11) return 'MORNING';
  if (hour < 14) return 'MIDDAY';
  if (hour < 17) return 'AFTERNOON';
  return 'EVENING';
}

function localDay(value: Date): string {
  return `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
}

type Schedule = Pick<PlanDetail, 'plannedOn' | 'plannedStart' | 'plannedEnd'>;

/**
 * Three neutral preview titles from schedule metadata only: weekday, start
 * time and duration/overnight. Title, description, place and tags are never
 * inputs, so a suggestion cannot leak the content. Rule-based, no provider.
 */
export function discreetTitleSuggestions(
  schedule: Schedule,
  t: TFunction,
): string[] {
  const candidates: string[] = [];
  const weekday = (value: Date, timeZone?: string) =>
    new Intl.DateTimeFormat(resolvedLocale(), {
      weekday: 'long',
      timeZone,
    }).format(value);
  if (schedule.plannedStart) {
    const start = schedule.plannedStart;
    const end = schedule.plannedEnd;
    const overnight = Boolean(end && localDay(end) !== localDay(start));
    const part = partOfDay(start.getHours());
    if (overnight) {
      // Friday and Saturday starts that run overnight read as a weekend.
      const weekendStart = start.getDay() === 5 || start.getDay() === 6;
      candidates.push(
        t(
          weekendStart
            ? 'discreetPlans.suggestions.weekend'
            : 'discreetPlans.suggestions.overnight',
        ),
      );
    }
    candidates.push(t(`discreetPlans.suggestions.${part}`));
    candidates.push(
      t(`discreetPlans.suggestions.weekdayPart.${part}`, {
        weekday: weekday(start),
      }),
    );
  } else if (schedule.plannedOn) {
    // A date-only day is a calendar day, so format it without a zone shift.
    candidates.push(
      t('discreetPlans.suggestions.weekday', {
        weekday: weekday(schedule.plannedOn, 'UTC'),
      }),
      t('discreetPlans.suggestions.day'),
    );
  }
  candidates.push(
    t('discreetPlans.suggestions.together'),
    t('discreetPlans.suggestions.day'),
    t('discreetPlans.suggestions.plan'),
  );
  return [...new Set(candidates)].slice(0, 3);
}
