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

  let years = refYear - startYear;
  let months = refMonth - startMonth;
  if (refDay < startDay) {
    months -= 1;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  return { days, years, months };
}

/**
 * Formats relationship duration with emoji and localized text.
 */
export function formatRelationshipDuration(
  duration: RelationshipDuration | null,
  mode: 'DAYS' | 'YEARS_MONTHS' | undefined,
  t: (key: string, values?: Record<string, unknown>) => string,
): string {
  if (!duration) {
    return t('profiles.relationshipNotAvailable');
  }
  if (mode === 'DAYS') {
    return `❤️ ${t('profiles.relationshipDays', { days: duration.days })}`;
  }
  return `❤️ ${t('profiles.relationshipYearsMonths', {
    years: duration.years,
    months: duration.months,
  })}`;
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
