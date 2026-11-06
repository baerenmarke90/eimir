import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  DEFAULT_LOCALE,
  initialLanguage,
  resolveSupportedLocale,
  SESSION_LANGUAGE_EVENT,
} from './locale';
import { localeRegistry, resources, supportedLocales } from './resources';

export { DEFAULT_LOCALE } from './locale';

export function resolvedLocale(): string {
  return (
    resolveSupportedLocale(i18n.resolvedLanguage || i18n.language) ||
    DEFAULT_LOCALE
  );
}

function syncDocumentLanguage(): void {
  if (typeof document === 'undefined') return;
  const locale = resolvedLocale() as keyof typeof localeRegistry;
  document.documentElement.lang = locale;
  document.documentElement.dir = localeRegistry[locale].direction;
  document.title = i18n.t('brand.pageTitle');
  for (const meta of document.querySelectorAll(
    'meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]',
  )) {
    meta.setAttribute('content', i18n.t('brand.description'));
  }
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: initialLanguage(),
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: supportedLocales,
    initAsync: false,
    interpolation: {
      escapeValue: false,
    },
  });

  i18n.services.formatter?.add('firstName', (value: unknown) => {
    if (typeof value !== 'string') return String(value ?? '');
    const normalized = value.trim();
    if (!normalized || normalized === i18n.t('formerMemberLabel')) {
      return normalized;
    }
    return normalized.split(/\s+/u, 1)[0] || normalized;
  });
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
