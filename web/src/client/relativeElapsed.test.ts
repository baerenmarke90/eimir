import { describe, expect, it } from 'vitest';
import { formatRelativeElapsed } from './relativeElapsed';

const now = new Date(2026, 10, 12, 21, 30);

function day(year: number, month: number, date: number): Date {
  return new Date(Date.UTC(year, month - 1, date));
}

describe('formatRelativeElapsed', () => {
  it('names today and yesterday in words', () => {
    expect(formatRelativeElapsed(day(2026, 11, 12), 'en', now)).toBe('today');
    expect(formatRelativeElapsed(day(2026, 11, 11), 'en', now)).toBe(
      'yesterday',
    );
  });

  it('switches from days to weeks, months and years', () => {
    expect(formatRelativeElapsed(day(2026, 11, 6), 'en', now)).toBe(
      '6 days ago',
    );
    expect(formatRelativeElapsed(day(2026, 10, 15), 'en', now)).toBe(
      '4 weeks ago',
    );
    expect(formatRelativeElapsed(day(2026, 4, 12), 'en', now)).toBe(
      '7 months ago',
    );
    expect(formatRelativeElapsed(day(2024, 11, 1), 'en', now)).toBe(
      '2 years ago',
    );
  });

  it('formats German output and future dates', () => {
    expect(formatRelativeElapsed(day(2026, 4, 12), 'de', now)).toBe(
      'vor 7 Monaten',
    );
    expect(formatRelativeElapsed(day(2026, 11, 14), 'en', now)).toBe(
      'in 2 days',
    );
  });
});
