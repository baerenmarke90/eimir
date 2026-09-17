import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import accountSettings from './locales/accountSettings';
import de from './locales/de';
import taskBoundary from './locales/taskBoundary';
import taskSheets from './locales/taskSheets';
import demo from './locales/demo';
import games from './locales/games';
import importantDates from './locales/importantDates';
import m5s3 from './locales/m5s3';
import m5s5 from './locales/m5s5';
import m5s6 from './locales/m5s6';
import memoryProduct from './locales/memoryProduct';
import navigation from './locales/navigation';
import partnerConnection from './locales/partnerConnection';
import people from './locales/people';
import privateArea from './locales/privateArea';
import profileIdentity from './locales/profileIdentity';
import profiles from './locales/profiles';
import serverAdmin from './locales/serverAdmin';
import snackbar from './locales/snackbar';
import relationshipComponents from './locales/relationshipComponents';
import spaceOffboarding from './locales/spaceOffboarding';
import storyProducts from './locales/storyProducts';

export const DEFAULT_LOCALE = 'de';

export function resolvedLocale(): string {
  return i18n.resolvedLanguage || i18n.language || DEFAULT_LOCALE;
}

function syncDocumentLanguage(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = resolvedLocale().split('-')[0];
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: {
      de: {
        translation: {
          ...de,
          taskBoundary,
          taskSheets,
          accountSettings,
          navigation: { ...de.navigation, ...navigation },
          demo,
          games,
          importantDates,
          m5s3,
          m5s5,
          ...m5s6,
          memoryProduct,
          partnerConnection,
          people,
          privateArea,
          profileIdentity,
          profiles,
          serverAdmin,
          spaceOffboarding,
          ...relationshipComponents,
          ...snackbar,
          ...storyProducts,
        },
      },
    },
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [DEFAULT_LOCALE],
    initAsync: false,
    interpolation: {
      escapeValue: false,
      format(value, format) {
        if (format !== 'firstName' || typeof value !== 'string') return value;
        const normalized = value.trim();
        if (
          !normalized ||
          normalized === relationshipComponents.formerMemberLabel
        ) {
          return normalized;
        }
        return normalized.split(/\s+/u, 1)[0] || normalized;
      },
    },
  });
}

syncDocumentLanguage();
i18n.on('languageChanged', syncDocumentLanguage);

export { i18n };
export { useTranslation } from 'react-i18next';
