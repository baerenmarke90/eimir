import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import {
  formatCalendarDate,
  formatCompactCalendarDate,
  formatRecency,
} from './formatRecency';

describe('formatRecency', () => {
  const mockT = ((key: string, opts?: { count?: number }) => {
    if (key === 'm5s5.common.today') return 'Heute';
    if (key === 'm5s5.common.yesterday') return 'Gestern';
    if (key === 'm5s5.common.daysAgo') return `vor ${opts?.count} Tagen`;
    return key;
  }) as unknown as TFunction;

  const refNow = new Date('2026-09-04T14:30:00Z');

  it('formats today as Heute', () => {
    const todayMorning = new Date('2026-09-04T08:00:00Z');
    expect(formatRecency(todayMorning, mockT, refNow, 'de-DE')).toBe('Heute');
  });

  it('formats yesterday as Gestern', () => {
    const yesterday = new Date('2026-09-03T18:00:00Z');
    expect(formatRecency(yesterday, mockT, refNow, 'de-DE')).toBe('Gestern');
  });

  it('formats 2 to 6 days ago as vor X Tagen', () => {
    const threeDaysAgo = new Date('2026-09-01T10:00:00Z');
    expect(formatRecency(threeDaysAgo, mockT, refNow, 'de-DE')).toBe(
      'vor 3 Tagen',
    );

    const sixDaysAgo = new Date('2026-08-29T10:00:00Z');
    expect(formatRecency(sixDaysAgo, mockT, refNow, 'de-DE')).toBe(
      'vor 6 Tagen',
    );
  });

  it('formats older dates as localized date string', () => {
    const older = new Date('2026-02-16T12:00:00Z');
    const result = formatRecency(older, mockT, refNow, 'de-DE');
    expect(result).toMatch(/16\.\s*Feb\.?/);
  });

  it('keeps an OpenAPI calendar date on its encoded day across a negative timezone boundary', () => {
    const calendarDate = new Date('2026-09-05T00:00:00Z');

    expect(
      new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'America/Los_Angeles',
      }).format(calendarDate),
    ).toBe('Fri, Sep 4');

    expect(formatCompactCalendarDate(calendarDate, 'en-US')).toBe('Sat, Sep 5');
  });

  it('formats a full calendar day from its encoded UTC date without shifting it', () => {
    const calendarDate = new Date('2026-09-11T00:00:00Z');

    expect(formatCalendarDate(calendarDate, 'de-DE')).toBe('11.09.2026');
    expect(formatCalendarDate(calendarDate, 'en-US')).toBe('09/11/2026');
  });
});
