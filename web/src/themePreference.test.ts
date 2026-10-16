import { afterEach, describe, expect, it } from 'vitest';
import { readThemePreference, storeThemePreference } from './theme';

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  'window',
);

afterEach(() => {
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

describe('theme preference fallback', () => {
  it('keeps the active preference across remount-style reads when storage is blocked', () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: () => {
            throw new Error('storage blocked');
          },
          setItem: () => {
            throw new Error('storage blocked');
          },
        },
      },
    });

    expect(readThemePreference()).toBe('system');

    storeThemePreference('dark');
    expect(readThemePreference()).toBe('dark');

    storeThemePreference('light');
    expect(readThemePreference()).toBe('light');
  });
});
