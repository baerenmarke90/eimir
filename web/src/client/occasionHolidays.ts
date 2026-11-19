/** Yearly cultural occasions shown only after a personal opt-in. */
export const OCCASION_HOLIDAY_IDS = [
  'newYear',
  'valentinesDay',
  'goodFriday',
  'easterSunday',
  'easterMonday',
  'pentecostSunday',
  'pentecostMonday',
  'stNicholas',
  'christmasEve',
  'christmasDay',
  'boxingDay',
  'newYearsEve',
] as const;

export type OccasionHolidayId = (typeof OCCASION_HOLIDAY_IDS)[number];

export interface OccasionHoliday {
  key: string;
  id: OccasionHolidayId;
  date: Date;
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function plusDays(date: Date, count: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + count);
  return result;
}

/** Gregorian computus; calculate in UTC to avoid local DST shifting a date-only event. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return utcDate(year, Math.floor(n / 31), (n % 31) + 1);
}

function dateFor(id: OccasionHolidayId, year: number): Date {
  switch (id) {
    case 'newYear':
      return utcDate(year, 1, 1);
    case 'valentinesDay':
      return utcDate(year, 2, 14);
    case 'goodFriday':
      return plusDays(easterSunday(year), -2);
    case 'easterSunday':
      return easterSunday(year);
    case 'easterMonday':
      return plusDays(easterSunday(year), 1);
    case 'pentecostSunday':
      return plusDays(easterSunday(year), 49);
    case 'pentecostMonday':
      return plusDays(easterSunday(year), 50);
    case 'stNicholas':
      return utcDate(year, 12, 6);
    case 'christmasEve':
      return utcDate(year, 12, 24);
    case 'christmasDay':
      return utcDate(year, 12, 25);
    case 'boxingDay':
      return utcDate(year, 12, 26);
    case 'newYearsEve':
      return utcDate(year, 12, 31);
  }
}

/** Return the next occurrence of each occasion, never records to write to the API. */
export function nextOccasionHolidays(today: Date): OccasionHoliday[] {
  const currentYear = today.getUTCFullYear();
  return OCCASION_HOLIDAY_IDS.map((id) => {
    let date = dateFor(id, currentYear);
    if (date.getTime() < today.getTime()) date = dateFor(id, currentYear + 1);
    return { key: `holiday:${id}`, id, date };
  });
}
