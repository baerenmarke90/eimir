import {
  localeRegistry,
  type SupportedLocale,
  supportedLocales,
} from './resources';

export const DEFAULT_LOCALE = 'de';
export const AUTOMATIC_LANGUAGE = 'auto';
export const SESSION_LANGUAGE_KEY = 'eimir-session-v1';
export const SESSION_LANGUAGE_EVENT = 'eimir:session-language';

export function resolveSupportedLocale(
  value: string | undefined,
): SupportedLocale | null {
  let tag = value?.trim().replaceAll('_', '-').toLowerCase() ?? '';
  while (tag) {
    const supported = supportedLocales.find(
      (locale) => locale.toLowerCase() === tag,
    );
    if (supported) return supported;
    tag = tag.slice(0, tag.lastIndexOf('-') < 0 ? 0 : tag.lastIndexOf('-'));
  }
  return null;
}

export function deviceLanguages(): string[] {
  if (typeof navigator === 'undefined') return [];
  return (
    navigator.languages?.length
      ? [...navigator.languages]
      : [navigator.language]
  )
    .filter((value) => typeof value === 'string' && value.length <= 64)
    .slice(0, 20);
}

export function detectLocale(
  languages: readonly string[] = deviceLanguages(),
): SupportedLocale {
  for (const value of languages) {
    const supported = resolveSupportedLocale(value);
    if (supported) return supported;
  }
  return DEFAULT_LOCALE;
}

export function effectiveLocale(preference?: string): SupportedLocale {
  return preference && preference !== AUTOMATIC_LANGUAGE
    ? (resolveSupportedLocale(preference) ?? DEFAULT_LOCALE)
    : detectLocale();
}

/** Source metadata can contain a legacy tag; display it without changing content. */
export function languageName(locale: string, displayLocale: string): string {
  try {
    return (
      new Intl.DisplayNames([displayLocale], { type: 'language' }).of(locale) ??
      locale
    );
  } catch {
    return locale;
  }
}

/** Only the currently signed-in session may supply an override at first paint. */
export function initialLanguage(): SupportedLocale {
  if (typeof window !== 'undefined') {
    try {
      const stored = JSON.parse(
        window.sessionStorage.getItem(SESSION_LANGUAGE_KEY) ?? 'null',
      );
      if (stored?.account?.id && stored?.tokens?.refreshToken) {
        return effectiveLocale(stored.account.languagePreference);
      }
    } catch {
      // Unavailable/invalid session storage is equivalent to a signed-out device.
    }
  }
  return detectLocale();
}

export { localeRegistry, supportedLocales };
