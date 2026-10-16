import { describe, expect, it } from 'vitest';
import {
  calculateNextAnniversary,
  calculateRelationshipDuration,
  formatAnniversaryDetail,
  formatRelationshipDuration,
} from './relationshipPreview';

describe('calculateNextAnniversary', () => {
  it('returns null when relationship start date is missing or invalid', () => {
    expect(calculateNextAnniversary(null)).toBeNull();
    expect(calculateNextAnniversary(undefined)).toBeNull();
    expect(calculateNextAnniversary('')).toBeNull();
    expect(calculateNextAnniversary('invalid-date')).toBeNull();
  });

  it('calculates next anniversary when it occurs later in the current year', () => {
    // Reference: March 1, 2026. Anniversary: June 14.
    const refDate = new Date('2026-03-01T12:00:00.000Z');
    const result = calculateNextAnniversary('2022-06-14', refDate);

    expect(result).not.toBeNull();
    expect(result?.isToday).toBe(false);
    expect(result?.nextDate.toISOString().slice(0, 10)).toBe('2026-06-14');
    // March has 31 days (30 days remaining in March), April 30, May 31, June 14 -> 30 + 30 + 31 + 14 = 105 days
    expect(result?.daysRemaining).toBe(105);
  });

  it('calculates next anniversary in the following year when already passed this year', () => {
    // Reference: September 4, 2026. Anniversary: February 14.
    const refDate = new Date('2026-09-04T12:00:00.000Z');
    const result = calculateNextAnniversary('2022-02-14', refDate);

    expect(result).not.toBeNull();
    expect(result?.isToday).toBe(false);
    expect(result?.nextDate.toISOString().slice(0, 10)).toBe('2027-02-14');
    expect(result?.daysRemaining).toBe(163);
  });

  it('identifies when today is the anniversary', () => {
    // Reference: September 4, 2026. Anniversary: September 4.
    const refDate = new Date('2026-09-04T08:00:00.000Z');
    const result = calculateNextAnniversary('2020-09-04', refDate);

    expect(result).not.toBeNull();
    expect(result?.isToday).toBe(true);
    expect(result?.daysRemaining).toBe(0);
    expect(result?.nextDate.toISOString().slice(0, 10)).toBe('2026-09-04');
  });

  it('handles leap day (Feb 29) start date in non-leap target years', () => {
    // Started on leap day 2024-02-29. Reference: Jan 1, 2025 (non-leap year).
    const refDate = new Date('2025-01-01T00:00:00.000Z');
    const result = calculateNextAnniversary('2024-02-29', refDate);

    expect(result).not.toBeNull();
    expect(result?.nextDate.toISOString().slice(0, 10)).toBe('2025-02-28');
  });

  it('formats anniversary detail correctly for future countdown and for today', () => {
    const mockT = (key: string, values?: Record<string, unknown>) => {
      if (key === 'profiles.anniversaryToday') return 'Heute! 🎉';
      if (key === 'profiles.anniversaryInDays_one') return 'in 1 Tag';
      if (key === 'profiles.anniversaryInDays_other')
        return `in ${values?.count} Tagen`;
      if (key === 'profiles.relationshipNotAvailable') return 'not-available';
      return key;
    };
    const mockFormatDate = (d: Date) => d.toISOString().slice(0, 10);

    expect(formatAnniversaryDetail(null, mockT, mockFormatDate)).toBe(
      'not-available',
    );

    const todayResult = {
      nextDate: new Date('2026-09-04T00:00:00.000Z'),
      daysRemaining: 0,
      isToday: true,
    };
    expect(formatAnniversaryDetail(todayResult, mockT, mockFormatDate)).toBe(
      '2026-09-04 · Heute! 🎉',
    );

    const futureResult = {
      nextDate: new Date('2026-12-25T00:00:00.000Z'),
      daysRemaining: 112,
      isToday: false,
    };
    expect(formatAnniversaryDetail(futureResult, mockT, mockFormatDate)).toBe(
      '2026-12-25 · in 112 Tagen',
    );
  });
});

describe('calculateRelationshipDuration', () => {
  it('returns null for missing, invalid, or future dates', () => {
    const refDate = new Date('2026-09-04T00:00:00.000Z');
    expect(calculateRelationshipDuration(null, refDate)).toBeNull();
    expect(calculateRelationshipDuration('', refDate)).toBeNull();
    expect(calculateRelationshipDuration('invalid', refDate)).toBeNull();
    expect(calculateRelationshipDuration('2027-01-01', refDate)).toBeNull();
  });

  it('calculates duration in days, years, and months correctly', () => {
    const refDate = new Date('2026-09-04T00:00:00.000Z');
    // Started on 2023-06-04: 3 years, 3 months
    const result = calculateRelationshipDuration('2023-06-04', refDate);
    expect(result).not.toBeNull();
    expect(result?.years).toBe(3);
    expect(result?.months).toBe(3);
    expect(result?.days).toBeGreaterThan(1100);
  });
});

describe('formatRelationshipDuration', () => {
  const mockT = (key: string, values?: Record<string, unknown>) => {
    if (key === 'profiles.relationshipDays') return `${values?.days} Tage`;
    if (key === 'profiles.relationshipYearsMonths')
      return `${values?.years} Jahre, ${values?.months} Monate`;
    if (key === 'profiles.relationshipNotAvailable') return 'not-available';
    return key;
  };

  it('formats null duration as not available', () => {
    expect(formatRelationshipDuration(null, 'YEARS_MONTHS', mockT)).toBe(
      'not-available',
    );
  });

  it('formats days mode', () => {
    expect(
      formatRelationshipDuration(
        { days: 450, years: 1, months: 2 },
        'DAYS',
        mockT,
      ),
    ).toBe('❤️ 450 Tage');
  });

  it('formats years and months mode', () => {
    expect(
      formatRelationshipDuration(
        { days: 450, years: 1, months: 2 },
        'YEARS_MONTHS',
        mockT,
      ),
    ).toBe('❤️ 1 Jahre, 2 Monate');
  });
});
