// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  occasionHolidayPreferenceKey,
  readOccasionHolidayPreference,
  saveOccasionHolidayPreference,
  useOccasionHolidayPreference,
} from './occasionHolidayPreferences';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('Occasion holiday preference', () => {
  const context = {
    instance: 'https://api.example.test',
    accountId: 'a',
    spaceId: 'space',
  };

  it('is off by default and isolated by instance, Account and Space', () => {
    const key = occasionHolidayPreferenceKey(
      context.instance,
      context.accountId,
      context.spaceId,
    );
    expect(readOccasionHolidayPreference(key)).toBe(false);
    saveOccasionHolidayPreference(key, true);
    expect(readOccasionHolidayPreference(key)).toBe(true);
    expect(
      readOccasionHolidayPreference(
        occasionHolidayPreferenceKey('https://elsewhere.test', 'a', 'space'),
      ),
    ).toBe(false);
    expect(
      readOccasionHolidayPreference(
        occasionHolidayPreferenceKey(context.instance, 'b', 'space'),
      ),
    ).toBe(false);
    expect(
      readOccasionHolidayPreference(
        occasionHolidayPreferenceKey(context.instance, 'a', 'other'),
      ),
    ).toBe(false);
  });

  it('updates already mounted readers and saves a reversible device choice', () => {
    const first = renderHook(() => useOccasionHolidayPreference(context));
    const second = renderHook(() => useOccasionHolidayPreference(context));
    expect(first.result.current.enabled).toBe(false);
    act(() => first.result.current.setEnabled(true));
    expect(second.result.current.enabled).toBe(true);
    const key = occasionHolidayPreferenceKey(
      context.instance,
      context.accountId,
      context.spaceId,
    );
    expect(localStorage.getItem(key)).toBe('true');
    act(() => second.result.current.setEnabled(false));
    expect(first.result.current.enabled).toBe(false);
    first.unmount();
    second.unmount();
  });

  it('fails closed when no Account is provided or browser storage is unavailable', () => {
    expect(occasionHolidayPreferenceKey(context.instance, '', 'space')).toBe('');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readOccasionHolidayPreference('unknown')).toBe(false);
  });
});
