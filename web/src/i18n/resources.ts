import accountSettings from './locales/accountSettings';
import appIcon from './locales/appIcon';
import calendarPlan from './locales/calendarPlan';
import planFiles from './locales/planFiles';
import contextTags from './locales/contextTags';
import composer from './locales/composer';
import coupleExperiences from './locales/coupleExperiences';
import dailyEnergy from './locales/dailyEnergy';
import dailyInsights from './locales/dailyInsights';
import dailyQuote from './locales/dailyQuote';
import dailyVibe from './locales/dailyVibe';
import de from './locales/de';
import demo from './locales/demo';
import en from './locales/en.json';
import experiences from './locales/experiences';
import games from './locales/games';
import gentlePrompts from './locales/gentlePrompts';
import importantDates from './locales/importantDates';
import languageSettings from './locales/languageSettings';
import legal from './locales/legal';
import m5s3 from './locales/m5s3';
import m5s5 from './locales/m5s5';
import m5s6 from './locales/m5s6';
import mediaDrop from './locales/mediaDrop';
import memoryMap from './locales/memoryMap';
import memoryProduct from './locales/memoryProduct';
import navigation from './locales/navigation';
import notificationSettings from './locales/notificationSettings';
import onceMessages from './locales/onceMessages';
import offlinePage from './locales/offlinePage';
import partnerConnection from './locales/partnerConnection';
import people from './locales/people';
import photoPlaces from './locales/photoPlaces';
import photoReactions from './locales/photoReactions';
import photoSources from './locales/photoSources';
import privateArea from './locales/privateArea';
import productTour from './locales/productTour';
import profileIdentity from './locales/profileIdentity';
import profiles from './locales/profiles';
import recaps from './locales/recaps';
import rediscovery from './locales/rediscovery';
import relationshipComponents from './locales/relationshipComponents';
import relationshipReflections from './locales/relationshipReflections';
import sensitiveMedia from './locales/sensitiveMedia';
import serverAdmin from './locales/serverAdmin';
import mediaOverview from './locales/mediaOverview';
import snackbar from './locales/snackbar';
import spaceOffboarding from './locales/spaceOffboarding';
import storyProducts from './locales/storyProducts';
import taskBoundary from './locales/taskBoundary';
import taskSheets from './locales/taskSheets';
import video from './locales/video';
import voiceNotes from './locales/voiceNotes';
import weeklyInsights from './locales/weeklyInsights';
import wirDesign from './locales/wirDesign';
import wishSelection from './locales/wishSelection';

export const germanResources = {
  ...de,
  onceMessages,
  memoryMap,
  calendarPlan,
  planFiles,
  gentlePrompts,
  coupleExperiences,
  sensitiveMedia,
  video,
  voiceNotes,
  taskBoundary,
  taskSheets,
  accountSettings,
  appIcon,
  wirDesign,
  wishSelection,
  navigation: { ...de.navigation, ...navigation },
  notificationSettings,
  demo,
  dailyEnergy,
  dailyInsights,
  weeklyInsights,
  dailyQuote,
  dailyVibe,
  games,
  experiences,
  importantDates,
  legal,
  m5s3,
  m5s5,
  ...m5s6,
  memoryProduct,
  mediaDrop,
  partnerConnection,
  people,
  privateArea,
  profileIdentity,
  profiles,
  productTour,
  serverAdmin,
  spaceOffboarding,
  ...relationshipComponents,
  relationshipReflections,
  recaps,
  rediscovery,
  ...snackbar,
  ...storyProducts,
  contextTags,
  composer,
  mediaOverview,
  photoSources,
  photoPlaces,
  photoReactions,
  languageSettings,
  offlinePage,
};

/** Add complete bundled packs here; feature components never branch on languages. */
export const localeRegistry = {
  de: { name: 'Deutsch', direction: 'ltr', translation: germanResources },
  en: { name: 'English', direction: 'ltr', translation: en },
} as const;

export type SupportedLocale = keyof typeof localeRegistry;
export const supportedLocales = Object.keys(
  localeRegistry,
) as SupportedLocale[];
export const resources = Object.fromEntries(
  supportedLocales.map((locale) => [
    locale,
    { translation: localeRegistry[locale].translation },
  ]),
);
