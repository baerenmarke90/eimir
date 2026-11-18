import { describe, expect, it, vi } from 'vitest';
import {
  detectLocale,
  effectiveLocale,
  initialLanguage,
  resolveSupportedLocale,
  SESSION_LANGUAGE_KEY,
} from './locale';

describe('personal locale resolution', () => {
  it('uses the full ordered device list and normalizes supported regional tags', () => {
    expect(detectLocale(['zz-ZZ', 'en-US', 'de-CH'])).toBe('en');
    expect(detectLocale(['de_CH', 'en'])).toBe('de');
    expect(detectLocale(['zz', 'qaa'])).toBe('de');
    expect(resolveSupportedLocale('EN-gb')).toBe('en');
    expect(resolveSupportedLocale('xx')).toBeNull();
  });

  it('keeps an explicit account choice ahead of the device and rejects stale signed-out overrides', () => {
    expect(effectiveLocale('en')).toBe('en');
    expect(effectiveLocale('auto')).toBe('de');
    const getItem = vi.fn(() =>
      JSON.stringify({
        account: { id: 'own', languagePreference: 'en' },
        tokens: { refreshToken: 'test', refreshExpiresAt: '2099-01-01' },
      }),
    );
    vi.stubGlobal('window', { sessionStorage: { getItem } });
    try {
      expect(initialLanguage()).toBe('en');
      expect(getItem).toHaveBeenCalledWith(SESSION_LANGUAGE_KEY);
      getItem.mockReturnValue(
        JSON.stringify({
          account: { id: 'previous', languagePreference: 'en' },
          tokens: { refreshToken: 'expired', refreshExpiresAt: '2000-01-01' },
        }),
      );
      expect(initialLanguage()).toBe('de');
      getItem.mockReturnValue(
        JSON.stringify({ account: { languagePreference: 'en' } }),
      );
      expect(initialLanguage()).toBe('de');
      getItem.mockReturnValue('{');
      expect(initialLanguage()).toBe('de');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
