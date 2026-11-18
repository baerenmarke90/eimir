// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  passportStatisticsKey,
  readPassportStatisticsPreference,
  savePassportStatisticsPreference,
} from './passportPreferences';
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
describe('Personal passport statistics preference', () => {
  it('defaults off, stores only a boolean and restores a deliberate choice', () => {
    const key = passportStatisticsKey(
      'https://example.test',
      'account-a',
      'space-a',
    );
    expect(readPassportStatisticsPreference(key)).toBe(false);
    savePassportStatisticsPreference(key, true);
    expect(localStorage.getItem(key)).toBe('true');
    expect(readPassportStatisticsPreference(key)).toBe(true);
    savePassportStatisticsPreference(key, false);
    expect(readPassportStatisticsPreference(key)).toBe(false);
  });
  it('isolates the instance, account and relationship and rejects corrupt state', () => {
    savePassportStatisticsPreference(
      passportStatisticsKey('https://a.test', 'a', 'a'),
      true,
    );
    for (const values of [
      ['https://b.test', 'a', 'a'],
      ['https://a.test', 'b', 'a'],
      ['https://a.test', 'a', 'b'],
    ]) {
      expect(
        readPassportStatisticsPreference(
          passportStatisticsKey(values[0], values[1], values[2]),
        ),
      ).toBe(false);
    }
    localStorage.setItem('corrupt', '{"enabled":true}');
    expect(readPassportStatisticsPreference('corrupt')).toBe(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Unavailable');
    });
    expect(readPassportStatisticsPreference('corrupt')).toBe(false);
  });
});
