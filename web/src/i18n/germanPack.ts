// The German source pack. Loaded on demand (catalog.ts) and imported eagerly only
// by tests and the static-locale generator (resources.ts).
import accountSettings from './locales/accountSettings';
import appIcon from './locales/appIcon';
import appUpdates from './locales/appUpdates';
import calendarPlan from './locales/calendarPlan';
import calendarSync from './locales/calendarSync';
import composer from './locales/composer';
import contextTags from './locales/contextTags';
import coupleExperiences from './locales/coupleExperiences';
import dailyEnergy from './locales/dailyEnergy';
import dailyQuote from './locales/dailyQuote';
import dailyVibe from './locales/dailyVibe';
import dateIdeas from './locales/dateIdeas';
import de from './locales/de';
import demo from './locales/demo';
import discreetPlans from './locales/discreetPlans';
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
import mediaOverview from './locales/mediaOverview';
import memoryMap from './locales/memoryMap';
import memoryProduct from './locales/memoryProduct';
import memoryWorldSettings from './locales/memoryWorldSettings';
import memoryWorlds from './locales/memoryWorlds';
import motionSettings from './locales/motionSettings';
import navigation from './locales/navigation';
import notificationSettings from './locales/notificationSettings';
import occasionMarks from './locales/occasionMarks';
import offlinePage from './locales/offlinePage';
import onceMessages from './locales/onceMessages';
import partnerConnection from './locales/partnerConnection';
import partnerLocation from './locales/partnerLocation';
import people from './locales/people';
import personColours from './locales/personColours';
import photoCrop from './locales/photoCrop';
import photoEdit from './locales/photoEdit';
import photoPlaces from './locales/photoPlaces';
import photoReactions from './locales/photoReactions';
import photoSources from './locales/photoSources';
import planFiles from './locales/planFiles';
import privateArea from './locales/privateArea';
import profileIdentity from './locales/profileIdentity';
import profiles from './locales/profiles';
import proPaywall from './locales/proPaywall';
import quietHints from './locales/quietHints';
import recaps from './locales/recaps';
import rediscovery from './locales/rediscovery';
import relationshipComponents from './locales/relationshipComponents';
import relationshipReflections from './locales/relationshipReflections';
import sensitiveMedia from './locales/sensitiveMedia';
import serverAdmin from './locales/serverAdmin';
import sharedNotes from './locales/sharedNotes';
import snackbar from './locales/snackbar';
import spaceOffboarding from './locales/spaceOffboarding';
import storageQuota from './locales/storageQuota';
import storyProducts from './locales/storyProducts';
import supportReport from './locales/supportReport';
import taskBoundary from './locales/taskBoundary';
import taskSheets from './locales/taskSheets';
import uploadFailure from './locales/uploadFailure';
import video from './locales/video';
import voiceNotes from './locales/voiceNotes';
import webViewNotice from './locales/webViewNotice';
import wirCheckIn from './locales/wirCheckIn';
import wirDesign from './locales/wirDesign';
import wirNotices from './locales/wirNotices';
import wirReelStyleSettings from './locales/wirReelStyleSettings';
import wishConcealment from './locales/wishConcealment';
import wishDateProposal from './locales/wishDateProposal';
import wishJourney from './locales/wishJourney';
import wishRepeat from './locales/wishRepeat';
import wishSelection from './locales/wishSelection';

export const germanResources = {
  ...de,
  onceMessages,
  memoryMap,
  calendarPlan,
  calendarSync,
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
  appUpdates,
  wirCheckIn,
  wirDesign,
  wirNotices,
  wishSelection,
  wishJourney,
  wishDateProposal,
  wishRepeat,
  wishConcealment,
  navigation: { ...de.navigation, ...navigation },
  notificationSettings,
  demo,
  discreetPlans,
  dailyEnergy,
  dailyQuote,
  dailyVibe,
  dateIdeas,
  games,
  experiences,
  importantDates,
  occasionMarks,
  legal,
  m5s3,
  m5s5,
  ...m5s6,
  memoryProduct,
  memoryWorlds,
  memoryWorldSettings,
  wirReelStyleSettings,
  mediaDrop,
  partnerConnection,
  partnerLocation,
  people,
  privateArea,
  proPaywall,
  personColours,
  profileIdentity,
  profiles,
  quietHints,
  serverAdmin,
  ...sharedNotes,
  spaceOffboarding,
  storageQuota,
  supportReport,
  uploadFailure,
  ...relationshipComponents,
  relationshipReflections,
  recaps,
  rediscovery,
  ...snackbar,
  ...storyProducts,
  ...motionSettings,
  contextTags,
  composer,
  mediaOverview,
  photoCrop,
  photoEdit,
  photoSources,
  photoPlaces,
  photoReactions,
  languageSettings,
  offlinePage,
  webViewNotice,
};
