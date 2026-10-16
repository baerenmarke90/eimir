import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dateInputValueToApiDate,
  effectiveDateInputValue,
  formatDateInputValue,
  localDateInputValue,
} from './dateInput';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('localDateInputValue', () => {
  it('uses the browser-local calendar components', () => {
    expect(localDateInputValue(new Date(2026, 8, 10, 23, 30))).toBe(
      '2026-09-10',
    );
  });

  it('does not use the UTC calendar date at a timezone boundary', () => {
    vi.stubEnv('TZ', 'Pacific/Kiritimati');
    const instant = new Date('2026-09-10T12:30:00Z');

    expect(instant.toISOString().slice(0, 10)).toBe('2026-09-10');
    expect(localDateInputValue(instant)).toBe('2026-09-11');
  });
});

describe('effectiveDateInputValue', () => {
  it('keeps an explicitly selected date', () => {
    expect(
      effectiveDateInputValue('2025-12-24', new Date(2026, 8, 10, 12, 0)),
    ).toBe('2025-12-24');
  });

  it('falls back to local today when the field is empty', () => {
    expect(effectiveDateInputValue('', new Date(2026, 8, 10, 12, 0))).toBe(
      '2026-09-10',
    );
    expect(effectiveDateInputValue('   ', new Date(2026, 8, 10, 12, 0))).toBe(
      '2026-09-10',
    );
  });
});

describe('date-only Memory Create helpers', () => {
  it('preserves the calendar date through the generated API Date carrier', () => {
    expect(dateInputValueToApiDate('2025-12-24').toISOString()).toBe(
      '2025-12-24T00:00:00.000Z',
    );
  });

  it('formats the calendar date with the resolved locale without timezone drift', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles');

    expect(formatDateInputValue('2026-09-10', 'de-DE')).toBe('10.09.2026');
  });
});
