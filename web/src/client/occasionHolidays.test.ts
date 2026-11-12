import { describe, expect, it } from 'vitest';
import { easterSunday, nextOccasionHolidays } from './occasionHolidays';

describe('Occasion holidays', () => {
  it('calculates Easter Sundays in Gregorian leap and non-leap years', () => {
    expect(easterSunday(2026).toISOString().slice(0, 10)).toBe('2026-04-05');
    expect(easterSunday(2027).toISOString().slice(0, 10)).toBe('2027-03-28');
    expect(easterSunday(2028).toISOString().slice(0, 10)).toBe('2028-04-16');
    expect(easterSunday(2038).toISOString().slice(0, 10)).toBe('2038-04-25');
  });

  it('uses a different year for each elapsed occasion without duplicate entries', () => {
    const holidays = nextOccasionHolidays(new Date('2026-11-12T00:00:00Z'));
    const byId = Object.fromEntries(
      holidays.map(({ id, date }) => [id, date.toISOString().slice(0, 10)]),
    );
    expect(byId.easterSunday).toBe('2027-03-28');
    expect(byId.christmasEve).toBe('2026-12-24');
    expect(byId.christmasDay).toBe('2026-12-25');
    expect(byId.newYear).toBe('2027-01-01');
    expect(holidays.length).toBe(new Set(holidays.map((item) => item.key)).size);
  });

  it('includes an occasion occurring today rather than skipping to next year', () => {
    const holidays = nextOccasionHolidays(new Date('2026-12-24T00:00:00Z'));
    expect(
      holidays.find((item) => item.id === 'christmasEve')?.date.toISOString(),
    ).toBe('2026-12-24T00:00:00.000Z');
  });
});
