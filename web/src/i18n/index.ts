import i18n, { type BackendModule } from 'i18next';
import { useEffect, useState } from 'react';
import { initReactI18next } from 'react-i18next';
import {
  DEFAULT_LOCALE,
  initialLanguage,
  resolveSupportedLocale,
  SESSION_LANGUAGE_EVENT,
} from './locale';
import {
  localeCatalog,
  type SupportedLocale,
  supportedLocales,
} from './catalog';

export { DEFAULT_LOCALE } from './locale';

export interface TranslateText {
  (key: string): string;
  (key: string, values: Record<string, unknown>): string;
}

export function resolvedLocale(): string {
  return (
    resolveSupportedLocale(i18n.resolvedLanguage || i18n.language) ||
    DEFAULT_LOCALE
  );
}

function syncDocumentLanguage(): void {
  if (typeof document === 'undefined') return;
  const locale = resolvedLocale() as SupportedLocale;
  document.documentElement.lang = locale;
  document.documentElement.dir = localeCatalog[locale].direction;
  // Before the first pack arrives the page keeps its static title and description.
  if (!i18n.hasResourceBundle(locale, 'translation')) return;
  document.title = i18n.t('brand.pageTitle');
  for (const meta of document.querySelectorAll(
    'meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]',
  )) {
    meta.setAttribute('content', i18n.t('brand.description'));
  }
}

/**
 * Resolves resources per language on demand. i18next asks for the active
 * language and its fallback before it announces a language change, so the
 * previous language stays on screen until the next one has arrived (no flash
 * of untranslated keys). Chunks are cached by the service worker like any
 * other /assets/ file.
 */
const lazyLocaleBackend: BackendModule = {
  type: 'backend',
  init() {},
  read(language, _namespace, callback) {
    const entry = localeCatalog[language as SupportedLocale] as
      | (typeof localeCatalog)[SupportedLocale]
      | undefined;
    // Pseudo languages such as i18next's cimode carry no resources.
    if (!entry) {
      callback(null, {});
      return;
    }
    entry.load().then(
      (pack) => callback(null, pack as Record<string, unknown>),
      (error: unknown) =>
        callback(
          error instanceof Error ? error : new Error(String(error)),
          null,
        ),
    );
  },
};

/**
 * Settles when the first language (and its fallback) is loaded. The
 * application mounts only after this, and tests await it, so rendering never
 * starts with a missing pack.
 */
export const i18nReady: Promise<void> = i18n.isInitialized
  ? Promise.resolve()
  : i18n
      .use(lazyLocaleBackend)
      .use(initReactI18next)
      .init({
        lng: initialLanguage(),
        fallbackLng: DEFAULT_LOCALE,
        supportedLngs: supportedLocales,
        interpolation: {
          escapeValue: false,
        },
      })
      .then(
        () => undefined,
        () => undefined,
      );

if (i18n.services.formatter) {
  i18n.services.formatter.add('firstName', (value: unknown) => {
    if (typeof value !== 'string') return String(value ?? '');
    const normalized = value.trim();
    if (!normalized || normalized === i18n.t('formerMemberLabel')) {
      return normalized;
    }
    return normalized.split(/\s+/u, 1)[0] || normalized;
  });
}

/** Loads another language's pack for text that is rendered in it, e.g. a quote in its source language. */
export function loadLocaleResources(locale: string): Promise<void> {
  return i18n.loadLanguages(locale).then(
    () => undefined,
    () => undefined,
  );
}

/**
 * True once the pack for `locale` can be used as a per-call `lng`. Text that
 * is rendered in a language other than the active one (a quote in its source
 * language)
 * calls this so that the pack is fetched and the component renders again.
 */
export function useLocaleResources(locale: string | undefined): boolean {
  const [loadedLocale, setLoadedLocale] = useState<string>();
  useEffect(() => {
    if (!locale) return;
    let current = true;
    void loadLocaleResources(locale).then(() => {
      if (current) setLoadedLocale(locale);
    });
    return () => {
      current = false;
    };
  }, [locale]);
  return (
    !locale ||
    i18n.hasResourceBundle(locale, 'translation') ||
    loadedLocale === locale
  );
}

syncDocumentLanguage();
i18n.on('languageChanged', syncDocumentLanguage);

if (typeof window !== 'undefined') {
  const syncSessionLanguage = () => {
    const locale = initialLanguage();
    if (locale !== resolvedLocale()) void i18n.changeLanguage(locale);
  };
  window.addEventListener(SESSION_LANGUAGE_EVENT, syncSessionLanguage);
  window.addEventListener('languagechange', syncSessionLanguage);
}

export { Trans, useTranslation } from 'react-i18next';
export { i18n };
