// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkInPromptDue,
  checkInRowExpected,
  markCheckInPromptDay,
  rememberCheckInRow,
} from './wirCheckInPrompt';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('Wir check-in prompt day', () => {
  it('is due once per day and again on the next day', () => {
    expect(checkInPromptDue('anna', 'space', '2026-11-22')).toBe(true);
    markCheckInPromptDay('anna', 'space', '2026-11-22');
    expect(checkInPromptDue('anna', 'space', '2026-11-22')).toBe(false);
    expect(checkInPromptDue('anna', 'space', '2026-11-23')).toBe(true);
  });

  it('keeps viewers and Spaces apart', () => {
    markCheckInPromptDay('anna', 'space', '2026-11-22');
    expect(checkInPromptDue('ben', 'space', '2026-11-22')).toBe(true);
    expect(checkInPromptDue('anna', 'other', '2026-11-22')).toBe(true);
  });

  it('still holds for the session when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(checkInPromptDue('blocked', 'space', '2026-11-22')).toBe(true);
    markCheckInPromptDay('blocked', 'space', '2026-11-22');
    expect(checkInPromptDue('blocked', 'space', '2026-11-22')).toBe(false);
  });
});

describe('Wir check-in row expectation', () => {
  const today = new Date(2026, 10, 22, 9);
  const tomorrow = new Date(2026, 10, 23, 9);

  it('expects the row only on the day a mark was last seen', () => {
    expect(checkInRowExpected('anna', 'space', today)).toBe(false);
    rememberCheckInRow('anna', 'space', true, today);
    expect(checkInRowExpected('anna', 'space', today)).toBe(true);
    expect(checkInRowExpected('anna', 'space', tomorrow)).toBe(false);
  });

  it('stops expecting the row once the mark is gone', () => {
    rememberCheckInRow('anna', 'space', true, today);
    rememberCheckInRow('anna', 'space', false, today);
    expect(checkInRowExpected('anna', 'space', today)).toBe(false);
  });
});
