import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import accountSettings from './locales/accountSettings';
import appIcon from './locales/appIcon';
import appUpdates from './locales/appUpdates';
import contextTags from './locales/contextTags';
import dailyEnergy from './locales/dailyEnergy';
import dailyInsights from './locales/dailyInsights';
import dailyQuote from './locales/dailyQuote';
import dailyVibe from './locales/dailyVibe';
import de from './locales/de';
import sensitiveMedia from './locales/sensitiveMedia';
import demo from './locales/demo';
import games from './locales/games';
import importantDates from './locales/importantDates';
import m5s3 from './locales/m5s3';
import m5s5 from './locales/m5s5';
import m5s6 from './locales/m5s6';
import memoryProduct from './locales/memoryProduct';
import navigation from './locales/navigation';
import notificationSettings from './locales/notificationSettings';
import partnerConnection from './locales/partnerConnection';
import people from './locales/people';
import photoPlaces from './locales/photoPlaces';
import photoReactions from './locales/photoReactions';
import photoSources from './locales/photoSources';
import privateArea from './locales/privateArea';
import productTour from './locales/productTour';
import profileIdentity from './locales/profileIdentity';
import profiles from './locales/profiles';
import relationshipComponents from './locales/relationshipComponents';
import serverAdmin from './locales/serverAdmin';
import sharedPhotos from './locales/sharedPhotos';
import snackbar from './locales/snackbar';
import spaceOffboarding from './locales/spaceOffboarding';
import storyProducts from './locales/storyProducts';
import taskBoundary from './locales/taskBoundary';
import taskSheets from './locales/taskSheets';

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
          sensitiveMedia,
          taskBoundary,
          taskSheets,
          accountSettings,
          appIcon,
          appUpdates,
          navigation: { ...de.navigation, ...navigation },
          notificationSettings,
          demo,
          dailyEnergy,
          dailyInsights,
          dailyQuote,
          dailyVibe,
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
          productTour,
          serverAdmin,
          spaceOffboarding,
          ...relationshipComponents,
          ...snackbar,
          ...storyProducts,
          contextTags,
          sharedPhotos,
          photoSources,
          photoPlaces,
          photoReactions,
        },
      },
    },
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [DEFAULT_LOCALE],
    initAsync: false,
    interpolation: {
      escapeValue: false,
    },
  });

  i18n.services.formatter?.add('firstName', (value: unknown) => {
    if (typeof value !== 'string') return String(value ?? '');
    const normalized = value.trim();
    if (
      !normalized ||
      normalized === relationshipComponents.formerMemberLabel
    ) {
      return normalized;
    }
    return normalized.split(/\s+/u, 1)[0] || normalized;
  });
}

syncDocumentLanguage();
i18n.on('languageChanged', syncDocumentLanguage);

export { useTranslation } from 'react-i18next';
export { i18n };
