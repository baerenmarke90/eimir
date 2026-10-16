const TRANSPORT_LEAP_YEAR = 2000;

export interface BirthdayInput {
  yearKnown: boolean;
  dateValue: string;
  monthValue: string;
  dayValue: string;
}

export function birthdayInputParts(value: Date | null): {
  monthValue: string;
  dayValue: string;
} {
  if (!value) return { monthValue: '', dayValue: '' };
  return {
    monthValue: String(value.getUTCMonth() + 1),
    dayValue: String(value.getUTCDate()),
  };
}

export function birthdayFromInput(input: BirthdayInput): Date | null {
  if (input.yearKnown) {
    return input.dateValue
      ? new Date(`${input.dateValue}T00:00:00.000Z`)
      : null;
  }

  if (!input.monthValue && !input.dayValue) return null;
  const month = Number(input.monthValue);
  const day = Number(input.dayValue);
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(month))
    return null;

  // This year exists only in the outgoing Date transport value. The server is
  // authoritative for canonicalizing unknown-year birthdays and never exposes
  // this reference year as user data.
  return new Date(Date.UTC(TRANSPORT_LEAP_YEAR, month - 1, day));
}

export function daysInMonth(month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) return 31;
  return new Date(Date.UTC(TRANSPORT_LEAP_YEAR, month, 0)).getUTCDate();
}
