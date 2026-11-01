/**
 * Relationship anniversary and duration preview helpers.
 */

export interface NextAnniversary {
  nextDate: Date;
  daysRemaining: number;
  isToday: boolean;
}

export interface RelationshipDuration {
  days: number;
  years: number;
  months: number;
  remainingDays: number;
}

export function parseDateInput(
  value: Date | string | null | undefined,
): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = trimmed.includes('T')
      ? new Date(trimmed)
      : new Date(`${trimmed}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/**
 * Calculates elapsed relationship duration using calendar arithmetic.
 */
export function calculateRelationshipDuration(
  startDateInput: Date | string | null | undefined,
  referenceDate?: Date,
): RelationshipDuration | null {
  const start = parseDateInput(startDateInput);
  if (!start) return null;

  const ref = referenceDate ?? new Date();
  if (Number.isNaN(ref.getTime())) return null;

  const startYear = start.getUTCFullYear();
  const startMonth = start.getUTCMonth();
  const startDay = start.getUTCDate();

  const refYear = ref.getUTCFullYear();
  const refMonth = ref.getUTCMonth();
  const refDay = ref.getUTCDate();

  const startMidnight = Date.UTC(startYear, startMonth, startDay);
  const refMidnight = Date.UTC(refYear, refMonth, refDay);

  if (startMidnight > refMidnight) {
    return null;
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  const days = Math.round((refMidnight - startMidnight) / msPerDay);

  // Clamp anniversaries to the last day of shorter months, preserving the
  // original start day rather than accumulating drift through repeated adds.
  const monthAnchor = (elapsedMonths: number) => {
    const lastDay = new Date(
      Date.UTC(startYear, startMonth + elapsedMonths + 1, 0),
    ).getUTCDate();
    return Date.UTC(
      startYear,
      startMonth + elapsedMonths,
      Math.min(startDay, lastDay),
    );
  };
  let elapsedMonths = (refYear - startYear) * 12 + refMonth - startMonth;
  if (monthAnchor(elapsedMonths) > refMidnight) elapsedMonths -= 1;

  return {
    days,
    years: Math.floor(elapsedMonths / 12),
    months: elapsedMonths % 12,
    remainingDays: Math.round(
      (refMidnight - monthAnchor(elapsedMonths)) / msPerDay,
    ),
  };
}

/**
 * Formats shared time automatically, independently of legacy display modes.
 */
export function formatRelationshipDuration(
  duration: RelationshipDuration | null,
  t: (key: string, values?: Record<string, unknown>) => string,
): string {
  if (!duration) {
    return t('profiles.relationshipNotAvailable');
  }
  const dayCount =
    duration.years === 0 ? duration.days : duration.remainingDays;
  const dayText = t('m5s5.dashboard.durationDayCount', { count: dayCount });
  if (duration.years === 0) {
    return t('m5s5.dashboard.durationAutomaticDays', { days: dayText });
  }
  const values = {
    years: duration.years,
    yearsLabel: t('m5s5.dashboard.durationYearUnit', { count: duration.years }),
    days: dayText,
  };
  return duration.months > 0
    ? t('m5s5.dashboard.durationYearsMonthsDays', {
        ...values,
        months: duration.months,
        monthsLabel: t('m5s5.dashboard.durationMonthUnit', {
          count: duration.months,
        }),
      })
    : t('m5s5.dashboard.durationYearsDays', values);
}

/**
 * Calculates the next occurrence of a relationship anniversary.
 * Handles year boundaries, leap years, and exact current-day matches.
 */
export function calculateNextAnniversary(
  startDateInput: Date | string | null | undefined,
  referenceDate?: Date,
): NextAnniversary | null {
  const start = parseDateInput(startDateInput);
  if (!start) return null;

  const ref = referenceDate ?? new Date();
  const startMonth = start.getUTCMonth();
  const startDay = start.getUTCDate();

  const refYear = ref.getUTCFullYear();
  const refMonth = ref.getUTCMonth();
  const refDay = ref.getUTCDate();

  // If today matches the anniversary month and day:
  if (refMonth === startMonth && refDay === startDay) {
    const nextDate = new Date(Date.UTC(refYear, startMonth, startDay));
    return {
      nextDate,
      daysRemaining: 0,
      isToday: true,
    };
  }

  // Determine whether this year's anniversary has already passed:
  const hasPassedThisYear =
    refMonth > startMonth || (refMonth === startMonth && refDay > startDay);
  const targetYear = hasPassedThisYear ? refYear + 1 : refYear;

  // Leap year adjustment for February 29:
  let targetDay = startDay;
  if (startMonth === 1 && startDay === 29) {
    const isLeapYear =
      (targetYear % 4 === 0 && targetYear % 100 !== 0) ||
      targetYear % 400 === 0;
    if (!isLeapYear) {
      targetDay = 28;
    }
  }

  const nextDate = new Date(Date.UTC(targetYear, startMonth, targetDay));
  const refMidnight = Date.UTC(refYear, refMonth, refDay);
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysRemaining = Math.max(
    1,
    Math.round((nextDate.getTime() - refMidnight) / msPerDay),
  );

  return {
    nextDate,
    daysRemaining,
    isToday: false,
  };
}

/**
 * Formats next anniversary detail with localized date and countdown.
 */
export function formatAnniversaryDetail(
  anniversary: NextAnniversary | null,
  t: (key: string, values?: Record<string, unknown>) => string,
  formatDate: (date: Date) => string,
): string {
  if (!anniversary) {
    return t('profiles.relationshipNotAvailable');
  }
  const formattedDate = formatDate(anniversary.nextDate);
  if (anniversary.isToday) {
    return `${formattedDate} · ${t('profiles.anniversaryToday')}`;
  }
  const suffix =
    anniversary.daysRemaining === 1
      ? t('profiles.anniversaryInDays_one')
      : t('profiles.anniversaryInDays_other', {
          count: anniversary.daysRemaining,
        });
  return `${formattedDate} · ${suffix}`;
}
