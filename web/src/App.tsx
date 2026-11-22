import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { AppearanceApi } from './api/generated/apis/AppearanceApi';
import { DailyCheckInsApi } from './api/generated/apis/DailyCheckInsApi';
import { DailyQuoteApi } from './api/generated/apis/DailyQuoteApi';
import { EntitlementsApi } from './api/generated/apis/EntitlementsApi';
import { GamesApi } from './api/generated/apis/GamesApi';
import { SpacesApi } from './api/generated/apis/SpacesApi';
import type { AccountView } from './api/generated/models/AccountView';
import { AttachmentReadRequestParentTypeEnum } from './api/generated/models/AttachmentReadRequest';
import type { SpaceView } from './api/generated/models/SpaceView';
import type { TokenView } from './api/generated/models/TokenView';
import { Configuration } from './client/apiConfiguration';
import { AppIconProvider } from './client/appIconContext';
import { clearPublicationMemory } from './client/approximateLocation';
import { invalidateStoryProjections } from './client/authorSummaryConsumers';
import {
  stopBrowserPushForSignedOutAccount,
  useBrowserPush,
} from './client/browserPush';
import { loadReferenceClientConfig } from './client/config';
import { invalidateDashboard } from './client/dashboardQueries';
import {
  rememberCurrentAuthReturnTarget,
  restoreAuthReturnTarget,
} from './client/deepLinks';
import {
  stopNativePushForSignedOutAccount,
  useDevicePush,
} from './client/devicePush';
import { enableGentlePrompts, useGentleUse } from './client/gentlePrompts';
import { useHistoryEntryTracker } from './client/historyEntries';
import {
  ActiveAccountMismatchError,
  revokeUnacceptedSession,
} from './client/identityFlow';
import { loadInstanceAccessStatus } from './client/instanceStatus';
import { createM4ProductApis } from './client/m4Product';
import { ProfilesApi } from './client/mediaApis';
import type { MemoryMapSession } from './client/memoryMapSession';
import {
  ONCE_CREATE_ROUTE,
  ONCE_ROUTE,
  OnceMessagesProvider,
} from './client/onceMessages';
import { createPartnerLocationApi } from './client/partnerLocation';
import { PartnerNicknameProvider } from './client/partnerNickname';
import { createPeopleApi } from './client/peopleApi';
import { PersonColoursProvider } from './client/personColoursContext';
import { PLAN_SHORT_LINK_ROUTE_PATTERN } from './client/planShortLink';
import { createPrivateAreaApi } from './client/privateArea';
import {
  clientProblemKind,
  normalizeClientError,
} from './client/problemDetails';
import { clearProductReadCacheInBackground } from './client/productReadCache';
import { createReferenceApis } from './client/referenceFlow';
import {
  ACTIVITY_ROUTE,
  appRoutePath,
  CHAPTER_CREATE_ROUTE,
  CHAPTER_DETAIL_ROUTE_PATTERN,
  COLLECTION_CREATE_ROUTE,
  COLLECTION_DETAIL_ROUTE_PATTERN,
  DATE_IDEAS_ROUTE,
  DEFAULT_APP_ROUTE,
  GAMES_GARDEN_ROUTE,
  GAMES_HEART_HUNT_ROUTE,
  GAMES_MOMENTS_ROUTE,
  GAMES_PICTURE_PING_PONG_ROUTE,
  GAMES_WHO_OF_US_ROUTE,
  GAMES_WISH_DETECTIVE_ROUTE,
  HAPPINESS_ROUTE,
  HEART_MOMENT_CREATE_ROUTE,
  HEART_MOMENT_DETAIL_ROUTE_PATTERN,
  HEART_MOMENT_EDIT_ROUTE_PATTERN,
  LEGACY_ROUTE_REWRITES,
  MEMORY_CREATE_ROUTE,
  MEMORY_DETAIL_ROUTE_PATTERN,
  MEMORY_EDIT_ROUTE_PATTERN,
  MEMORY_MAP_ROUTE,
  MILESTONE_CREATE_ROUTE,
  MILESTONE_DETAIL_ROUTE_PATTERN,
  MILESTONE_EDIT_ROUTE_PATTERN,
  MORE_COLLECTIONS_ROUTE,
  MORE_INSIGHTS_PATTERNS_ROUTE,
  MORE_INSIGHTS_RECAP_ROUTE,
  MORE_INSIGHTS_ROUTE,
  MORE_NOTES_ROUTE,
  MORE_NOTIFICATIONS_ROUTE,
  MORE_PEOPLE_ROUTE,
  MORE_PLACES_ROUTE,
  MORE_PROFILE_ROUTE,
  MORE_SETTINGS_CATEGORY_ROUTE_PATTERN,
  MORE_SETTINGS_ROUTE,
  NOTE_CREATE_ROUTE,
  NOTE_DETAIL_ROUTE_PATTERN,
  NOTE_EDIT_ROUTE_PATTERN,
  PARTNER_LOCATION_MAP_ROUTE,
  PARTNER_LOCATION_SETTINGS_ROUTE,
  PLACE_DETAIL_ROUTE_PATTERN,
  PLAN_CREATE_ROUTE,
  PLAN_DETAIL_ROUTE_PATTERN,
  PRO_PAYWALL_ROUTE,
  RECAP_DETAIL_ROUTE_PATTERN,
  REMINDER_DETAIL_ROUTE_PATTERN,
  SEARCH_ROUTE,
  SERVER_ADMIN_ROUTE,
  STORY_CHAPTERS_ROUTE,
  STORY_OURS_ROUTE,
  STORY_PHOTOS_ROUTE,
  STORY_RECAPS_ROUTE,
  STORY_YEAR_ROUTE_PATTERN,
  STORY_YEARS_ROUTE,
  settingsCategoryPath,
  TIME_TRAVEL_ROUTE,
  WISH_CREATE_ROUTE,
  WISH_DETAIL_ROUTE_PATTERN,
  WISH_SELECTION_ROUTE,
} from './client/routes';
import { createServerAdminApis } from './client/serverAdmin';
import {
  clearStoredSession,
  isAccessTokenValid,
  loadStoredSession,
  refreshSessionTokens,
  storeSession,
} from './client/sessionPersistence';
import { createSharedPlanningApis } from './client/sharedPlanning';
import { signOutSession } from './client/signOutSession';
import { postSnackbar } from './client/snackbar';
import {
  canReuseMembershipsAfterRefreshFailure,
  loadAuthorizedMemberships,
  loadAuthorizedSpaces,
  resolveActiveSpaceId,
} from './client/spaceContext';
import { loadAuthorizedStoryImageResource } from './client/storyMediaLoader';
import { type StoryStartupReads, startStoryReads } from './client/storyStartup';
import { useAccountLanguage } from './client/useAccountLanguage';
import { useCalendarGoogleAppReturn } from './client/useCalendarGoogleAppReturn';
import { useIdentityEntry } from './client/useIdentityEntry';
import { usePlanShortLinkAppOpen } from './client/usePlanShortLinkAppOpen';
import { useSessionRefresh } from './client/useSessionRefresh';
import { useSystemTimeZone } from './client/useSystemTimeZone';
import { useVideoTransferNavigation } from './client/useVideoTransferNavigation';
import { VideoProcessingContext } from './client/video';
import { AudioProcessingContext } from './client/voiceNotes';
import { WirDesignProvider } from './client/wirDesign';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { AppShell } from './components/AppShell';
import { Brand } from './components/Brand';
import { BrandedStartup } from './components/BrandedStartup';
import { CollectionProductPage } from './components/CollectionProductPage';
import { DemoEntry } from './components/DemoEntry';
import { DevicePushOnboarding } from './components/DevicePushOnboarding';
import { FirstSpaceGate } from './components/FirstSpaceGate';
import { IdentityEntry } from './components/IdentityEntry';
import { LegacyPathRedirect } from './components/LegacyPathRedirect';
import { LegalDocumentPage } from './components/LegalDocumentPage';
import {
  ActivityProductPage,
  NotificationsProductPage,
  SearchProductPage,
} from './components/M4ProductPages';
import { MoreOverviewPage } from './components/MoreOverviewPage';
import { OnceMessagesPage } from './components/OnceMessages';
import { PartnerLocationOnboarding } from './components/PartnerLocationOnboarding';
import { PartnerLocationSync } from './components/PartnerLocationSync';
import { PersonalSettingsSyncRuntime } from './components/PersonalSettingsSyncRuntime';
import { PlanShortLinkRedirect } from './components/PlanShortLinkRedirect';
import {
  type PrimaryTabPanel,
  PrimaryTabPanels,
} from './components/PrimaryTabPanels';
import { ProblemState } from './components/ProblemState';
import { RelationshipStoryPage } from './components/RelationshipStoryPage';
import { SecureSurface } from './components/SecureSurface';
import {
  ServerAdminAccessGate,
  ServerAdminPage,
} from './components/ServerAdminPage';
import { SharedPlanningOverviewPage } from './components/SharedPlanningOverviewPage';
import { Snackbar } from './components/Snackbar';
import { StoryProductPage } from './components/StoryProductPage';
import {
  StoryYearDetailPage,
  StoryYearsIndexPage,
} from './components/StoryYearsPage';
import { ThemeControl } from './components/ThemeControl';
import { TodayPage } from './components/TodayPage';
import { UiState } from './components/UiState';
import { VoiceShareIngress } from './components/VoiceShareIngress';
import { deferredComponent } from './deferredModules';
import { useTranslation } from './i18n';
import { legalDocumentIdForRoute } from './legal/legalDocuments';
import { isCapacitorNative } from './pwa';

const ChapterCreatePage = deferredComponent(() =>
  import('./components/ChapterCreatePage').then(
    (module) => module.ChapterCreatePage,
  ),
);
const ChapterProductPage = deferredComponent(() =>
  import('./components/ChapterProductPage').then(
    (module) => module.ChapterProductPage,
  ),
);
const ChaptersOverviewPage = deferredComponent(() =>
  import('./components/ChaptersOverviewPage').then(
    (module) => module.ChaptersOverviewPage,
  ),
);
const CollectionsOverviewPage = deferredComponent(() =>
  import('./components/CollectionsOverviewPage').then(
    (module) => module.CollectionsOverviewPage,
  ),
);
const CoupleExperiencePage = deferredComponent(() =>
  import('./components/CoupleExperiencePage').then(
    (module) => module.CoupleExperiencePage,
  ),
);
const DailyInsightsPage = deferredComponent(() =>
  import('./components/DailyInsightsPage').then(
    (module) => module.DailyInsightsPage,
  ),
);
const DateIdeasPage = deferredComponent(() =>
  import('./components/DateIdeasPage').then((module) => module.DateIdeasPage),
);
const GardenGamePage = deferredComponent(() =>
  import('./components/GardenGamePage').then((module) => module.GardenGamePage),
);
const HeartHuntGamePage = deferredComponent(() =>
  import('./components/HeartHuntGamePage').then(
    (module) => module.HeartHuntGamePage,
  ),
);
const HeartMomentProductPage = deferredComponent(() =>
  import('./components/HeartMomentProductPage').then(
    (module) => module.HeartMomentProductPage,
  ),
);
const MediaOverviewPage = deferredComponent(() =>
  import('./components/MediaOverviewPage').then(
    (module) => module.MediaOverviewPage,
  ),
);
const MemoryCreatePage = deferredComponent(() =>
  import('./components/MemoryCreatePage').then(
    (module) => module.MemoryCreatePage,
  ),
);
const MemoryMapPage = deferredComponent(() =>
  import('./components/MemoryMapPage').then((module) => module.MemoryMapPage),
);
const MemoryProductPage = deferredComponent(() =>
  import('./components/MemoryProductPage').then(
    (module) => module.MemoryProductPage,
  ),
);
const MilestoneProductPage = deferredComponent(() =>
  import('./components/MilestoneProductPage').then(
    (module) => module.MilestoneProductPage,
  ),
);
const OurMomentsGamePage = deferredComponent(() =>
  import('./components/OurMomentsGamePage').then(
    (module) => module.OurMomentsGamePage,
  ),
);
const PartnerLocationMapPage = deferredComponent(() =>
  import('./components/PartnerLocationMapPage').then(
    (module) => module.PartnerLocationMapPage,
  ),
);
const PartnerLocationSettingsPage = deferredComponent(() =>
  import('./components/PartnerLocationSettingsPage').then(
    (module) => module.PartnerLocationSettingsPage,
  ),
);
const PicturePingPongPage = deferredComponent(() =>
  import('./components/PicturePingPongPage').then(
    (module) => module.PicturePingPongPage,
  ),
);
const PlaceProductPage = deferredComponent(() =>
  import('./components/PlaceProductPage').then(
    (module) => module.PlaceProductPage,
  ),
);
const PlacesOverviewPage = deferredComponent(() =>
  import('./components/PlacesOverviewPage').then(
    (module) => module.PlacesOverviewPage,
  ),
);
const PlanningCreatePage = deferredComponent(() =>
  import('./components/PlanningCreatePage').then(
    (module) => module.PlanningCreatePage,
  ),
);
const PlanProductPage = deferredComponent(() =>
  import('./components/PlanProductPage').then(
    (module) => module.PlanProductPage,
  ),
);
const PrivateAreaProductPage = deferredComponent(() =>
  import('./components/PrivateAreaProductPage').then(
    (module) => module.PrivateAreaProductPage,
  ),
);
const ProfilePage = deferredComponent(() =>
  import('./components/ProfilePage').then((module) => module.ProfilePage),
);
const ProPaywallPage = deferredComponent(() =>
  import('./components/ProPaywallPage').then((module) => module.ProPaywallPage),
);
const RelatedPeoplePage = deferredComponent(() =>
  import('./components/RelatedPeoplePage').then(
    (module) => module.RelatedPeoplePage,
  ),
);
const RelationshipRecapsPage = deferredComponent(() =>
  import('./components/RelationshipRecapsPage').then(
    (module) => module.RelationshipRecapsPage,
  ),
);
const ReminderReadPage = deferredComponent(() =>
  import('./components/ReminderReadPage').then(
    (module) => module.ReminderReadPage,
  ),
);
const SettingsPage = deferredComponent(() =>
  import('./components/SettingsPage').then((module) => module.SettingsPage),
);
const SharedNoteEditorPage = deferredComponent(() =>
  import('./components/SharedNoteEditorPage').then(
    (module) => module.SharedNoteEditorPage,
  ),
);
const SharedNoteReadPage = deferredComponent(() =>
  import('./components/SharedNoteReadPage').then(
    (module) => module.SharedNoteReadPage,
  ),
);
const SharedNotesOverviewPage = deferredComponent(() =>
  import('./components/SharedNotesOverviewPage').then(
    (module) => module.SharedNotesOverviewPage,
  ),
);
const WhoOfUsGamePage = deferredComponent(() =>
  import('./components/WhoOfUsGamePage').then(
    (module) => module.WhoOfUsGamePage,
  ),
);
const WishDetectiveGamePage = deferredComponent(() =>
  import('./components/WishDetectiveGamePage').then(
    (module) => module.WishDetectiveGamePage,
  ),
);
const WishProductPage = deferredComponent(() =>
  import('./components/WishProductPage').then(
    (module) => module.WishProductPage,
  ),
);
const WishSelectionPage = deferredComponent(() =>
  import('./components/WishSelectionPage').then(
    (module) => module.WishSelectionPage,
  ),
);

function DeferredRoutes({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  // Retire the previous page's Back control while its destination loads.
  return (
    <Suspense
      key={pathname}
      fallback={<UiState kind="loading" title={t('states.loading.title')} />}
    >
      <Routes>{children}</Routes>
    </Suspense>
  );
}

/**
 * Panels built in the background once the app is quiet (#2063). Only the
 * phone app, where starting a map needs the GPU and its first data from the
 * network; on the Web the map is built when it is opened.
 */
const PREWARMED_PANELS: readonly string[] = isCapacitorNative()
  ? [MEMORY_MAP_ROUTE]
  : [];

/** A kept panel whose page code loads on first visit. */
function DeferredPanel({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={<UiState kind="loading" title={t('states.loading.title')} />}
    >
      {children}
    </Suspense>
  );
}

function SpaceContextGate({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  if (loading) return <BrandedStartup label={t('states.loading.title')} />;
  return (
    <main className="setup-shell">
      <div className="entry-aura entry-aura-start" aria-hidden="true" />
      <div className="entry-aura entry-aura-end" aria-hidden="true" />
      <section className="setup-card" aria-labelledby="space-context-heading">
        <Brand />
        <div className="setup-content">
          <p className="eyebrow">{t('spaceContext.eyebrow')}</p>
          {loading ? (
            <UiState kind="loading" title={t('spaceContext.loading')} />
          ) : error ? (
            <ProblemState error={error} onRetry={onRetry} />
          ) : (
            <>
              <h1 id="space-context-heading">{t('spaceContext.emptyTitle')}</h1>
              <p>{t('spaceContext.emptyBody')}</p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function SpacePicker({
  spaces,
  onSelect,
}: {
  spaces: SpaceView[];
  onSelect: (spaceId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <main className="setup-shell">
      <div className="entry-aura entry-aura-start" aria-hidden="true" />
      <div className="entry-aura entry-aura-end" aria-hidden="true" />
      <section className="setup-card" aria-labelledby="space-picker-heading">
        <Brand />
        <div className="setup-content">
          <p className="eyebrow">{t('spaceContext.eyebrow')}</p>
          <h1 id="space-picker-heading">{t('spaceContext.pickerTitle')}</h1>
          <p>{t('spaceContext.pickerBody')}</p>
          <fieldset className="form-grid">
            <legend>{t('spaceContext.pickerAria')}</legend>
            {spaces.map((space, index) => {
              const names = space.partners
                .map((partner) => partner.displayName.trim())
                .filter(Boolean)
                .join(' & ');
              return (
                <button
                  key={space.id}
                  type="button"
                  onClick={() => onSelect(space.id)}
                >
                  {names ||
                    t('spaceContext.spaceFallback', { index: index + 1 })}
                </button>
              );
            })}
          </fieldset>
        </div>
      </section>
    </main>
  );
}

function AuthenticatedApp({
  tokens,
  account,
  logout,
  apiBaseUrl,
  spaceId,
  serverAdmin,
  storyStartupReads,
}: {
  tokens: TokenView;
  account: AccountView;
  logout: () => void | Promise<void>;
  apiBaseUrl: string;
  spaceId: string;
  serverAdmin: boolean;
  storyStartupReads?: StoryStartupReads;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const queryClient = useQueryClient();
  const previousSpaceId = useRef(spaceId);
  // The Momente map's session memory: its last camera and its selected
  // Place, kept in memory only and per account and space.
  const memoryMapSession = useRef<MemoryMapSession & { scope: string }>({
    scope: '',
  });
  const mapScope = JSON.stringify([apiBaseUrl, account.id, spaceId]);
  if (memoryMapSession.current.scope !== mapScope)
    memoryMapSession.current = { scope: mapScope };
  const apis = useMemo(
    () => createReferenceApis(apiBaseUrl, tokens.accessToken),
    [apiBaseUrl, tokens.accessToken],
  );
  const peopleApi = useMemo(
    () => createPeopleApi(apiBaseUrl, tokens.accessToken),
    [apiBaseUrl, tokens.accessToken],
  );
  const m4Apis = useMemo(
    () => createM4ProductApis(apiBaseUrl, tokens.accessToken),
    [apiBaseUrl, tokens.accessToken],
  );
  useGentleUse({ account, spaceId, api: m4Apis.notifications });
  useSystemTimeZone(apiBaseUrl, tokens.accessToken, account.id, spaceId);
  useVideoTransferNavigation({
    instance: apiBaseUrl,
    accountId: account.id,
    spaceId,
  });
  const enableOnboardingPrompts = useCallback(
    () => enableGentlePrompts(queryClient, m4Apis.notifications, account.id),
    [queryClient, m4Apis.notifications, account.id],
  );
  // The partner-distance start sheet follows the push start prompt.
  const [pushPromptSettled, setPushPromptSettled] = useState(false);
  const settlePushPrompt = useCallback(() => setPushPromptSettled(true), []);
  const devicePush = useDevicePush({
    accountId: account.id,
    apiBaseUrl,
    notificationsApi: m4Apis.notifications,
    queryClient,
    spaceId,
  });
  const browserPush = useBrowserPush({
    accountId: account.id,
    apiBaseUrl,
    spaceId,
    notificationsApi: m4Apis.notifications,
    queryClient,
    openNotification: devicePush.openNotification,
    settingsOpen: location.pathname === settingsCategoryPath('notifications'),
  });
  const settingsPush = devicePush.available ? devicePush : browserPush;
  const planningApis = useMemo(
    () => createSharedPlanningApis(apiBaseUrl, tokens.accessToken),
    [apiBaseUrl, tokens.accessToken],
  );
  const privateAreaApi = useMemo(
    () => createPrivateAreaApi(apiBaseUrl, tokens.accessToken),
    [apiBaseUrl, tokens.accessToken],
  );
  const profilesApi = useMemo(
    () =>
      new ProfilesApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        }),
      ),
    [apiBaseUrl, tokens.accessToken],
  );
  const appearanceApi = useMemo(
    () =>
      new AppearanceApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        }),
      ),
    [apiBaseUrl, tokens.accessToken],
  );
  const spacesApi = useMemo(
    () =>
      new SpacesApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        }),
      ),
    [apiBaseUrl, tokens.accessToken],
  );
  const partnerLocationApi = useMemo(
    () => createPartnerLocationApi(apiBaseUrl, tokens.accessToken),
    [apiBaseUrl, tokens.accessToken],
  );
  const dailyCheckInsApi = useMemo(
    () =>
      new DailyCheckInsApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        }),
      ),
    [apiBaseUrl, tokens.accessToken],
  );

  const dailyQuoteApi = useMemo(
    () =>
      new DailyQuoteApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        }),
      ),
    [apiBaseUrl, tokens.accessToken],
  );

  const entitlementApi = useMemo(
    () =>
      new EntitlementsApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        }),
      ),
    [apiBaseUrl, tokens.accessToken],
  );
  const gamesApi = useMemo(
    () =>
      new GamesApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        }),
      ),
    [apiBaseUrl, tokens.accessToken],
  );

  useEffect(() => {
    if (previousSpaceId.current === spaceId) return;
    queryClient.clear();
    clearProductReadCacheInBackground();
    clearPublicationMemory();
    previousSpaceId.current = spaceId;
  }, [queryClient, spaceId]);

  // M5 Vault Theme Context Switch
  useEffect(() => {
    const isVault = location.pathname.startsWith('/more/private');
    document.body.classList.toggle('theme-vault', isVault);
    return () => {
      document.body.classList.remove('theme-vault');
    };
  }, [location.pathname]);

  const loadMemoryImage = useCallback(
    (
      memoryId: string,
      attachmentId: string,
      signal?: AbortSignal,
      variant?: 'original' | 'thumbnail',
    ) =>
      loadAuthorizedStoryImageResource(
        apis,
        spaceId,
        'MEMORY',
        memoryId,
        attachmentId,
        { signal, variant },
      ),
    [apis, spaceId],
  );

  const loadHeartMomentAttachment = useCallback(
    (
      heartMomentId: string,
      attachmentId: string,
      signal?: AbortSignal,
      variant?: 'original' | 'thumbnail',
      persist?: boolean,
    ) =>
      loadAuthorizedStoryImageResource(
        apis,
        spaceId,
        AttachmentReadRequestParentTypeEnum.HEART_MOMENT,
        heartMomentId,
        attachmentId,
        { signal, variant, persist },
      ),
    [apis, spaceId],
  );

  async function refreshStory() {
    await Promise.all([
      invalidateStoryProjections(queryClient, spaceId),
      invalidateDashboard(queryClient, spaceId),
    ]);
  }

  const memoryProductProps = {
    apis,
    apiBaseUrl,
    accessToken: tokens.accessToken,
    spaceId,
    currentAccountId: account.id,
    loadMemoryImage,
  };
  const heartMomentProductProps = {
    apis,
    apiBaseUrl,
    accessToken: tokens.accessToken,
    spaceId,
    currentAccountId: account.id,
    loadAttachment: loadHeartMomentAttachment,
  };
  const milestoneProductProps = {
    apis,
    spaceId,
    currentAccountId: account.id,
  };
  const planningProductProps = {
    accountId: account.id,
    apis: planningApis,
    spaceId,
    apiBaseUrl,
    accessToken: tokens.accessToken,
  };

  const routeErrorFallback = (
    <UiState
      kind="error"
      title={t('states.unexpected.title')}
      body={t('states.unexpected.body')}
      action={
        <Link className="button-link secondary-link" to={DEFAULT_APP_ROUTE}>
          {t('navigation.today')}
        </Link>
      }
    />
  );
  // Visited primary tabs stay mounted; their routes above render nothing.
  const primaryTabPanels: PrimaryTabPanel[] = [
    {
      path: appRoutePath('today'),
      element: (
        <TodayPage
          apis={m4Apis}
          recapMediaApis={apis}
          apiBaseUrl={apiBaseUrl}
          spaceId={spaceId}
          spacesApi={spacesApi}
          dailyCheckInsApi={dailyCheckInsApi}
          dailyQuoteApi={dailyQuoteApi}
          entitlementApi={entitlementApi}
          collectionsApi={planningApis.collections}
          sharedNotesApi={planningApis.sharedNotes}
          loadMemoryImage={loadMemoryImage}
          profilesApi={profilesApi}
          account={account}
          partnerLocationApi={partnerLocationApi}
          gamesApi={gamesApi}
        />
      ),
    },
    {
      path: appRoutePath('story'),
      element: (
        <StoryProductPage
          apis={apis}
          mapSession={memoryMapSession.current}
          accountId={account.id}
          spaceId={spaceId}
          loadMemoryImage={loadMemoryImage}
          profilesApi={profilesApi}
          dashboardApi={m4Apis.dashboard}
          recapsApi={m4Apis.recaps}
          startupReads={
            storyStartupReads?.kind === 'diary' ? storyStartupReads : undefined
          }
        />
      ),
    },
    {
      // The Momente map stays mounted once visited (#2063): starting a map
      // needs the GPU and its places' photos, so returning to it reuses the
      // live map instead of building it again.
      path: MEMORY_MAP_ROUTE,
      element: (
        <DeferredPanel>
          <MemoryMapPage
            {...planningProductProps}
            loadMemoryImage={loadMemoryImage}
            sessionViewport={memoryMapSession.current}
          />
        </DeferredPanel>
      ),
    },
    {
      path: appRoutePath('plan'),
      element: (
        <SharedPlanningOverviewPage
          key={JSON.stringify([apiBaseUrl, account.id, spaceId])}
          {...planningProductProps}
          accountId={account.id}
          apiBaseUrl={apiBaseUrl}
          peopleApi={peopleApi}
          profilesApi={profilesApi}
        />
      ),
    },
    {
      path: appRoutePath('more'),
      element: (
        <MoreOverviewPage
          apiBaseUrl={apiBaseUrl}
          accessToken={tokens.accessToken}
          account={account}
          spaceId={spaceId}
        />
      ),
    },
  ];

  const relationshipContent = (
    <PartnerNicknameProvider
      profilesApi={profilesApi}
      spaceId={spaceId}
      accountId={account.id}
    >
      <AppShell
        onLogout={logout}
        apiBaseUrl={apiBaseUrl}
        accessToken={tokens.accessToken}
        account={account}
        spaceId={spaceId}
        serverAdmin={serverAdmin}
        openNotification={devicePush.openNotification}
        primaryTabs={
          <PrimaryTabPanels
            panels={primaryTabPanels}
            fallback={routeErrorFallback}
            prewarm={PREWARMED_PANELS}
          />
        }
      >
        <AppErrorBoundary
          resetKey={location.pathname}
          fallback={routeErrorFallback}
        >
          <DeferredRoutes>
            <Route
              path={ONCE_ROUTE}
              element={
                <SecureSurface announceFailure>
                  <OnceMessagesPage mode="inbox" />
                </SecureSurface>
              }
            />
            <Route
              path={ONCE_CREATE_ROUTE}
              element={
                <SecureSurface announceFailure>
                  <OnceMessagesPage mode="compose" />
                </SecureSurface>
              }
            />
            <Route
              path={`${ONCE_ROUTE}/:messageId`}
              element={
                <SecureSurface announceFailure>
                  <OnceMessagesPage mode="read" />
                </SecureSurface>
              }
            />
            <Route
              path="/"
              element={<Navigate replace to={DEFAULT_APP_ROUTE} />}
            />
            <Route path={appRoutePath('story')} element={null} />
            <Route
              path={STORY_YEARS_ROUTE}
              element={
                <StoryYearsIndexPage
                  apis={apis}
                  accountId={account.id}
                  spaceId={spaceId}
                  loadMemoryImage={loadMemoryImage}
                  profilesApi={profilesApi}
                  startupRead={
                    storyStartupReads?.kind === 'years'
                      ? storyStartupReads.take
                      : undefined
                  }
                />
              }
            />
            <Route
              path={STORY_PHOTOS_ROUTE}
              element={
                <MediaOverviewPage
                  key={`${account.id}:${spaceId}`}
                  apis={apis}
                  accountId={account.id}
                  spaceId={spaceId}
                />
              }
            />
            <Route
              path={STORY_YEAR_ROUTE_PATTERN}
              element={
                <StoryYearDetailPage
                  apis={apis}
                  accountId={account.id}
                  spaceId={spaceId}
                  loadMemoryImage={loadMemoryImage}
                  profilesApi={profilesApi}
                  startupRead={
                    storyStartupReads?.kind === 'year'
                      ? storyStartupReads.take
                      : undefined
                  }
                />
              }
            />
            <Route path={appRoutePath('plan')} element={null} />
            <Route
              path={PLAN_CREATE_ROUTE}
              element={
                <PlanningCreatePage kind="plan" {...planningProductProps} />
              }
            />
            <Route
              path={WISH_SELECTION_ROUTE}
              element={<WishSelectionPage {...planningProductProps} />}
            />
            <Route
              path={DATE_IDEAS_ROUTE}
              element={<DateIdeasPage {...planningProductProps} />}
            />
            <Route path={PRO_PAYWALL_ROUTE} element={<ProPaywallPage />} />
            <Route
              path={WISH_CREATE_ROUTE}
              element={
                <PlanningCreatePage kind="wish" {...planningProductProps} />
              }
            />
            <Route
              path={WISH_DETAIL_ROUTE_PATTERN}
              element={<WishProductPage {...planningProductProps} />}
            />
            <Route
              path={PLAN_DETAIL_ROUTE_PATTERN}
              element={<PlanProductPage {...planningProductProps} />}
            />
            <Route
              path={PLAN_SHORT_LINK_ROUTE_PATTERN}
              element={<PlanShortLinkRedirect />}
            />
            <Route
              path={REMINDER_DETAIL_ROUTE_PATTERN}
              element={
                <ReminderReadPage
                  apiBaseUrl={apiBaseUrl}
                  accessToken={tokens.accessToken}
                  accountId={account.id}
                  spaceId={spaceId}
                />
              }
            />
            <Route
              path={STORY_CHAPTERS_ROUTE}
              element={<ChaptersOverviewPage {...planningProductProps} />}
            />
            <Route
              path="/plan/chapters"
              element={<Navigate replace to={STORY_CHAPTERS_ROUTE} />}
            />
            <Route
              path={CHAPTER_CREATE_ROUTE}
              element={<ChapterCreatePage {...planningProductProps} />}
            />
            <Route
              path={CHAPTER_DETAIL_ROUTE_PATTERN}
              element={<ChapterProductPage {...planningProductProps} />}
            />
            {/* Kept like a primary tab (#2063); see primaryTabPanels. */}
            <Route path={MEMORY_MAP_ROUTE} element={null} />
            <Route
              path={MORE_PLACES_ROUTE}
              element={<PlacesOverviewPage {...planningProductProps} />}
            />
            <Route
              path="/plan/places"
              element={<Navigate replace to={MORE_PLACES_ROUTE} />}
            />
            <Route
              path={PLACE_DETAIL_ROUTE_PATTERN}
              element={<PlaceProductPage {...planningProductProps} />}
            />
            <Route
              path={COLLECTION_CREATE_ROUTE}
              element={
                <CollectionsOverviewPage
                  key="create-list"
                  {...planningProductProps}
                  initialCreate
                />
              }
            />
            <Route
              path={MORE_COLLECTIONS_ROUTE}
              element={<CollectionsOverviewPage {...planningProductProps} />}
            />
            <Route
              path="/plan/collections"
              element={<Navigate replace to={MORE_COLLECTIONS_ROUTE} />}
            />
            <Route
              path={COLLECTION_DETAIL_ROUTE_PATTERN}
              element={
                <CollectionProductPage
                  {...planningProductProps}
                  dashboardApi={m4Apis.dashboard}
                  accountId={account.id}
                />
              }
            />
            <Route
              path={MORE_NOTES_ROUTE}
              element={<SharedNotesOverviewPage {...planningProductProps} />}
            />
            <Route
              path={NOTE_CREATE_ROUTE}
              element={
                <SharedNoteEditorPage {...planningProductProps} mode="create" />
              }
            />
            <Route
              path={NOTE_DETAIL_ROUTE_PATTERN}
              element={<SharedNoteReadPage {...planningProductProps} />}
            />
            <Route
              path={NOTE_EDIT_ROUTE_PATTERN}
              element={
                <SharedNoteEditorPage {...planningProductProps} mode="edit" />
              }
            />
            <Route path={appRoutePath('today')} element={null} />
            <Route
              path={ACTIVITY_ROUTE}
              element={
                <ActivityProductPage
                  apis={m4Apis}
                  spaceId={spaceId}
                  profilesApi={profilesApi}
                  currentAccountId={account.id}
                />
              }
            />
            <Route
              path={SEARCH_ROUTE}
              element={
                <SecureSurface announceFailure>
                  <SearchProductPage apis={m4Apis} spaceId={spaceId} />
                </SecureSurface>
              }
            />
            {(['happiness', 'timeTravel'] as const).flatMap((kind) =>
              ['', '/new'].map((suffix) => (
                <Route
                  key={`${kind}${suffix}`}
                  path={`${kind === 'happiness' ? HAPPINESS_ROUTE : TIME_TRAVEL_ROUTE}${suffix}`}
                  element={
                    <CoupleExperiencePage
                      key={`${account.id}:${spaceId}:${kind}`}
                      kind={kind}
                      onSaved={refreshStory}
                      apiBaseUrl={apiBaseUrl}
                      accessToken={tokens.accessToken}
                      accountId={account.id}
                      spaceId={spaceId}
                      profilesApi={profilesApi}
                    />
                  }
                />
              )),
            )}
            <Route
              path={GAMES_MOMENTS_ROUTE}
              element={
                <OurMomentsGamePage
                  apiBaseUrl={apiBaseUrl}
                  accessToken={tokens.accessToken}
                  spaceId={spaceId}
                  currentAccountId={account.id}
                />
              }
            />
            <Route
              path={GAMES_PICTURE_PING_PONG_ROUTE}
              element={
                <PicturePingPongPage
                  apiBaseUrl={apiBaseUrl}
                  accessToken={tokens.accessToken}
                  spaceId={spaceId}
                  currentAccountId={account.id}
                />
              }
            />
            <Route
              path={GAMES_GARDEN_ROUTE}
              element={
                <GardenGamePage
                  apiBaseUrl={apiBaseUrl}
                  accessToken={tokens.accessToken}
                  spaceId={spaceId}
                  currentAccountId={account.id}
                />
              }
            />
            <Route
              path={GAMES_WHO_OF_US_ROUTE}
              element={
                <WhoOfUsGamePage
                  apiBaseUrl={apiBaseUrl}
                  accessToken={tokens.accessToken}
                  spaceId={spaceId}
                  currentAccountId={account.id}
                />
              }
            />
            <Route
              path={GAMES_WISH_DETECTIVE_ROUTE}
              element={
                <WishDetectiveGamePage
                  apiBaseUrl={apiBaseUrl}
                  accessToken={tokens.accessToken}
                  spaceId={spaceId}
                  currentAccountId={account.id}
                />
              }
            />
            <Route
              path={GAMES_HEART_HUNT_ROUTE}
              element={
                <HeartHuntGamePage
                  apiBaseUrl={apiBaseUrl}
                  accessToken={tokens.accessToken}
                  spaceId={spaceId}
                  currentAccountId={account.id}
                />
              }
            />
            <Route path={appRoutePath('more')} element={null} />
            <Route
              path={MORE_INSIGHTS_RECAP_ROUTE}
              element={
                <Navigate
                  replace
                  to={{
                    pathname: MORE_INSIGHTS_ROUTE,
                    search: location.search,
                    hash: '#wochenrueckblick',
                  }}
                  state={location.state}
                />
              }
            />
            {(
              [
                [MORE_INSIGHTS_ROUTE, 'week'],
                [MORE_INSIGHTS_PATTERNS_ROUTE, 'patterns'],
              ] as const
            ).map(([path, insightView]) => (
              <Route
                key={path}
                path={path}
                element={
                  <DailyInsightsPage
                    apiBaseUrl={apiBaseUrl}
                    key={`${account.id}:${spaceId}`}
                    view={insightView}
                    spaceId={spaceId}
                    account={account}
                    dailyCheckInsApi={dailyCheckInsApi}
                    entitlementApi={entitlementApi}
                    dashboardApi={m4Apis.dashboard}
                    profilesApi={profilesApi}
                  />
                }
              />
            ))}
            <Route
              path={STORY_OURS_ROUTE}
              element={
                <RelationshipStoryPage
                  apiBaseUrl={apiBaseUrl}
                  accessToken={tokens.accessToken}
                  account={account}
                  spaceId={spaceId}
                  loadMemoryImage={loadMemoryImage}
                />
              }
            />
            {[STORY_RECAPS_ROUTE, RECAP_DETAIL_ROUTE_PATTERN].map((path) => (
              <Route
                key={path}
                path={path}
                element={
                  <RelationshipRecapsPage
                    apiBaseUrl={apiBaseUrl}
                    accessToken={tokens.accessToken}
                    account={account}
                    spaceId={spaceId}
                    mediaApis={apis}
                  />
                }
              />
            ))}
            <Route
              path={MORE_NOTIFICATIONS_ROUTE}
              element={
                <NotificationsProductPage
                  apis={m4Apis}
                  spaceId={spaceId}
                  profilesApi={profilesApi}
                  currentAccountId={account.id}
                />
              }
            />
            <Route
              path={`${MORE_PEOPLE_ROUTE}/*`}
              element={
                <RelatedPeoplePage
                  peopleApi={peopleApi}
                  spaceId={spaceId}
                  apiBaseUrl={apiBaseUrl}
                  accessToken={tokens.accessToken}
                  attachmentsApi={apis.attachments}
                  currentAccountId={account.id}
                />
              }
            />
            <Route
              path={MORE_PROFILE_ROUTE}
              element={
                <SecureSurface announceFailure>
                  <ProfilePage
                    apiBaseUrl={apiBaseUrl}
                    accessToken={tokens.accessToken}
                    account={account}
                    spaceId={spaceId}
                  />
                </SecureSurface>
              }
            />
            <Route
              path={MORE_SETTINGS_ROUTE}
              element={
                <SettingsPage
                  apiBaseUrl={apiBaseUrl}
                  accessToken={tokens.accessToken}
                  account={account}
                  spaceId={spaceId}
                  devicePush={settingsPush}
                />
              }
            />
            <Route
              path={PARTNER_LOCATION_MAP_ROUTE}
              element={
                <PartnerLocationMapPage
                  apiBaseUrl={apiBaseUrl}
                  accessToken={tokens.accessToken}
                  account={account}
                  spaceId={spaceId}
                  profilesApi={profilesApi}
                />
              }
            />
            <Route
              path={PARTNER_LOCATION_SETTINGS_ROUTE}
              element={
                <PartnerLocationSettingsPage
                  apiBaseUrl={apiBaseUrl}
                  accessToken={tokens.accessToken}
                  account={account}
                  spaceId={spaceId}
                />
              }
            />
            <Route
              path={MORE_SETTINGS_CATEGORY_ROUTE_PATTERN}
              element={
                <SettingsPage
                  apiBaseUrl={apiBaseUrl}
                  accessToken={tokens.accessToken}
                  account={account}
                  spaceId={spaceId}
                  devicePush={settingsPush}
                />
              }
            />
            <Route
              path="/more/private/*"
              element={
                <SecureSurface announceFailure>
                  <PrivateAreaProductPage
                    api={privateAreaApi}
                    profilesApi={profilesApi}
                    spacesApi={spacesApi}
                    accountId={account.id}
                    spaceId={spaceId}
                  />
                </SecureSurface>
              }
            />
            <Route
              path={MEMORY_CREATE_ROUTE}
              element={
                <MemoryCreatePage
                  key={`${account.id}:${spaceId}:${location.key}`}
                  accessToken={tokens.accessToken}
                  apiBaseUrl={apiBaseUrl}
                  spaceId={spaceId}
                  accountId={account.id}
                  onSaved={refreshStory}
                />
              }
            />
            <Route
              path={MEMORY_EDIT_ROUTE_PATTERN}
              element={
                <MemoryProductPage mode="edit" {...memoryProductProps} />
              }
            />
            <Route
              path={MEMORY_DETAIL_ROUTE_PATTERN}
              element={
                <MemoryProductPage
                  mode="detail"
                  {...memoryProductProps}
                  startupRead={
                    storyStartupReads?.kind === 'memory'
                      ? storyStartupReads.take
                      : undefined
                  }
                />
              }
            />
            <Route
              path={HEART_MOMENT_CREATE_ROUTE}
              element={
                <SecureSurface announceFailure>
                  <HeartMomentProductPage
                    mode="create"
                    {...heartMomentProductProps}
                  />
                </SecureSurface>
              }
            />
            <Route
              path={HEART_MOMENT_EDIT_ROUTE_PATTERN}
              element={
                <SecureSurface announceFailure>
                  <HeartMomentProductPage
                    mode="edit"
                    {...heartMomentProductProps}
                  />
                </SecureSurface>
              }
            />
            <Route
              path={HEART_MOMENT_DETAIL_ROUTE_PATTERN}
              element={
                <HeartMomentProductPage
                  mode="detail"
                  {...heartMomentProductProps}
                  startupRead={
                    storyStartupReads?.kind === 'heartMoment'
                      ? storyStartupReads.take
                      : undefined
                  }
                />
              }
            />
            <Route
              path={MILESTONE_CREATE_ROUTE}
              element={
                <MilestoneProductPage
                  mode="create"
                  {...milestoneProductProps}
                />
              }
            />
            <Route
              path={MILESTONE_EDIT_ROUTE_PATTERN}
              element={
                <MilestoneProductPage mode="edit" {...milestoneProductProps} />
              }
            />
            <Route
              path={MILESTONE_DETAIL_ROUTE_PATTERN}
              element={
                <MilestoneProductPage
                  mode="detail"
                  {...milestoneProductProps}
                  startupRead={
                    storyStartupReads?.kind === 'milestone'
                      ? storyStartupReads.take
                      : undefined
                  }
                />
              }
            />
            {/*
            Paths the client shipped before the route model was decided. Deep
            Links to them are already shared, so they redirect permanently
            instead of falling through to the catch-all.
          */}
            {LEGACY_ROUTE_REWRITES.map(({ from }) => (
              <Route
                key={from}
                path={`${from}/*`}
                element={<LegacyPathRedirect />}
              />
            ))}
            {LEGACY_ROUTE_REWRITES.map(({ from }) => (
              <Route
                key={`${from}-exact`}
                path={from}
                element={<LegacyPathRedirect />}
              />
            ))}
            <Route
              path="*"
              element={<Navigate replace to={DEFAULT_APP_ROUTE} />}
            />
          </DeferredRoutes>
        </AppErrorBoundary>
      </AppShell>
      <PersonalSettingsSyncRuntime
        key={`settings:${apiBaseUrl}:${account.id}:${spaceId}`}
        apiBaseUrl={apiBaseUrl}
        accessToken={tokens.accessToken}
        accountId={account.id}
        spaceId={spaceId}
      />
      <PartnerLocationSync
        key={`${apiBaseUrl}:${account.id}:${spaceId}`}
        apiBaseUrl={apiBaseUrl}
        accessToken={tokens.accessToken}
        accountId={account.id}
        spaceId={spaceId}
      />
      <PartnerLocationOnboarding
        key={`location:${apiBaseUrl}:${account.id}:${spaceId}`}
        apiBaseUrl={apiBaseUrl}
        accessToken={tokens.accessToken}
        accountId={account.id}
        spaceId={spaceId}
        ready={pushPromptSettled}
      />
    </PartnerNicknameProvider>
  );
  return (
    <AppIconProvider
      key={`${apiBaseUrl}:${account.id}:${spaceId}`}
      api={appearanceApi}
      entitlementsApi={entitlementApi}
      instance={apiBaseUrl}
      accountId={account.id}
      spaceId={spaceId}
    >
      <WirDesignProvider
        key={`${apiBaseUrl}:${account.id}:${spaceId}`}
        api={appearanceApi}
        entitlementsApi={entitlementApi}
        instance={apiBaseUrl}
        accountId={account.id}
        spaceId={spaceId}
      >
        <PersonColoursProvider
          key={`${apiBaseUrl}:${account.id}:${spaceId}`}
          api={appearanceApi}
          entitlementsApi={entitlementApi}
          instance={apiBaseUrl}
          accountId={account.id}
          spaceId={spaceId}
        >
          <OnceMessagesProvider
            apiBaseUrl={apiBaseUrl}
            accessToken={tokens.accessToken}
            accountId={account.id}
            spaceId={spaceId}
          >
            {relationshipContent}
          </OnceMessagesProvider>
          <VoiceShareIngress
            key={`${apiBaseUrl}:${account.id}:${spaceId}`}
            scope={JSON.stringify([apiBaseUrl, account.id, spaceId])}
          />

          <DevicePushOnboarding
            key={`${apiBaseUrl}:${account.id}`}
            devicePush={devicePush}
            accountId={account.id}
            apiBaseUrl={apiBaseUrl}
            onEnablePrompts={enableOnboardingPrompts}
            onSettled={settlePushPrompt}
          />
        </PersonColoursProvider>
      </WirDesignProvider>
    </AppIconProvider>
  );
}

export function App({ demoMode = false }: { demoMode?: boolean }) {
  const config = useMemo(loadReferenceClientConfig, []);
  const location = useLocation();
  const navigate = useNavigate();
  useHistoryEntryTracker();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { entryToken, clearEntryToken } = useIdentityEntry(config.apiBaseUrl);
  useCalendarGoogleAppReturn();
  usePlanShortLinkAppOpen(config.apiBaseUrl);
  const [initialStoredSession] = useState(loadStoredSession);
  const [startupLocation] = useState(() => ({
    pathname: location.pathname,
    search: location.search,
  }));
  const onStartupRoute =
    startupLocation.pathname === location.pathname &&
    startupLocation.search === location.search;
  const storyStartupReads = useRef<StoryStartupReads | null>(null);
  const cancelStoryStartupReads = useCallback(() => {
    storyStartupReads.current?.cancel();
    storyStartupReads.current = null;
  }, []);
  const [tokens, setTokens] = useState<TokenView | null>(
    () => initialStoredSession?.tokens ?? null,
  );
  const [account, setAccount] = useState<AccountView | null>(
    () => initialStoredSession?.account ?? null,
  );
  useAccountLanguage(
    config.apiBaseUrl,
    tokens?.accessToken,
    account,
    setAccount,
  );
  const [isRestoring, setIsRestoring] = useState(() =>
    Boolean(initialStoredSession),
  );
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [spaceId, setSpaceId] = useState<string | null>(
    () => initialStoredSession?.spaceId ?? null,
  );
  // Tracks which Account a remembered auth-return target has already been
  // restored for, so the effect that resolves the active Space (below)
  // attempts restoration once per Account rather than on every Space
  // switch (#689).
  const restoredAuthReturnForAccountId = useRef<string | null>(null);

  useEffect(() => {
    // Native hydration finishes before App mounts; absence is now authoritative.
    if (!account && !isRestoring) stopNativePushForSignedOutAccount();
  }, [account, isRestoring]);

  const terminateSession = useCallback(() => {
    cancelStoryStartupReads();
    stopNativePushForSignedOutAccount();
    const outgoing = loadStoredSession();
    if (outgoing)
      stopBrowserPushForSignedOutAccount({
        accountId: outgoing.account.id,
        apiBaseUrl: config.apiBaseUrl,
      });
    const cleared = clearStoredSession();
    setSpaceId(null);
    setAccount(null);
    setTokens(null);
    restoredAuthReturnForAccountId.current = null;
    queryClient.clear();
    clearProductReadCacheInBackground();
    clearPublicationMemory();
    return cleared;
  }, [cancelStoryStartupReads, config.apiBaseUrl, queryClient]);

  useEffect(() => {
    if (!initialStoredSession) {
      setIsRestoring(false);
      return;
    }
    const session = initialStoredSession;

    let cancelled = false;

    async function restore(activeSession: typeof session) {
      let currentTokens = activeSession.tokens;
      try {
        if (!isAccessTokenValid(currentTokens)) {
          currentTokens = await refreshSessionTokens(
            config.apiBaseUrl,
            currentTokens.refreshToken,
          );
        }

        if (
          cancelled ||
          loadStoredSession()?.tokens.refreshToken !==
            currentTokens.refreshToken
        )
          return;
        // A rotated token can authorize membership reads while /me refreshes.
        setTokens(currentTokens);

        const apis = createReferenceApis(
          config.apiBaseUrl,
          currentTokens.accessToken,
        );
        if (activeSession.spaceId) {
          storyStartupReads.current = startStoryReads(
            apis,
            activeSession.account.id,
            activeSession.spaceId,
            startupLocation,
          );
        }
        const verifiedAccount = await apis.auth.meApiV1AuthMeGet();

        if (
          cancelled ||
          loadStoredSession()?.tokens.refreshToken !==
            currentTokens.refreshToken
        )
          return;
        setTokens(currentTokens);
        setAccount(verifiedAccount);
        storeSession({
          account: verifiedAccount,
          tokens: currentTokens,
          // Membership resolution may have selected a Space while /me was pending.
          spaceId: loadStoredSession()?.spaceId ?? null,
        });
      } catch (error) {
        if (cancelled) return;
        const normalized = await normalizeClientError(error);
        if (normalized.status === 401 || normalized.status === 403) {
          const current = loadStoredSession();
          if (
            current &&
            current.tokens.refreshToken !== currentTokens.refreshToken
          )
            return;
          terminateSession();
          rememberCurrentAuthReturnTarget(
            activeSession.account.id,
            activeSession.spaceId ?? null,
          );
        }
        // Transport/server failure must not discard otherwise valid credentials.
      } finally {
        if (!cancelled) {
          setIsRestoring(false);
        }
      }
    }

    void restore(session);

    return () => {
      cancelled = true;
      cancelStoryStartupReads();
    };
  }, [
    cancelStoryStartupReads,
    config.apiBaseUrl,
    initialStoredSession,
    startupLocation,
    terminateSession,
  ]);

  const acceptSessionTokens = useCallback(
    (next: TokenView) => {
      setTokens(next);
      // Recover reads that failed while credentials were unavailable, without
      // refetching healthy data or disturbing an active editor on every rotation.
      void queryClient.invalidateQueries({
        predicate: (query) =>
          query.state.status === 'error' &&
          ['unauthorized', 'offline', 'server'].includes(
            clientProblemKind(query.state.error),
          ),
      });
    },
    [queryClient],
  );

  useSessionRefresh(
    config.apiBaseUrl,
    tokens,
    isRestoring || entryToken !== null,
    acceptSessionTokens,
    terminateSession,
  );

  const serverAdminApis = useMemo(
    () => createServerAdminApis(config.apiBaseUrl, tokens?.accessToken),
    [config.apiBaseUrl, tokens?.accessToken],
  );
  const capabilitiesQuery = useQuery({
    queryKey: ['account-capabilities', account?.id],
    queryFn: async () => {
      try {
        return await serverAdminApis.auth.getAccountCapabilitiesApiV1AuthCapabilitiesGet();
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    enabled: !isRestoring && tokens !== null && account !== null,
    retry: false,
  });

  const instanceStatusQuery = useQuery({
    queryKey: ['instance-status', config.apiBaseUrl],
    queryFn: () => loadInstanceAccessStatus(config.apiBaseUrl),
    staleTime: 60_000,
  });

  const membershipsQuery = useQuery({
    queryKey: ['account-memberships', config.apiBaseUrl, account?.id],
    queryFn: async () => {
      if (!tokens) return [];
      return loadAuthorizedMemberships(config.apiBaseUrl, tokens.accessToken);
    },
    // Validate membership alongside /me when a usable access token exists.
    enabled: tokens !== null && (!isRestoring || isAccessTokenValid(tokens)),
    retry: false,
  });

  useEffect(() => {
    const startup = storyStartupReads.current;
    if (!startup) return;
    if (
      !onStartupRoute ||
      (membershipsQuery.error &&
        !canReuseMembershipsAfterRefreshFailure(
          membershipsQuery.data,
          membershipsQuery.error,
        )) ||
      (membershipsQuery.data &&
        !membershipsQuery.data.some(
          (membership) => membership.spaceId === startup.spaceId,
        ))
    ) {
      cancelStoryStartupReads();
    }
  }, [
    cancelStoryStartupReads,
    membershipsQuery.data,
    membershipsQuery.error,
    onStartupRoute,
  ]);

  const spacesQuery = useQuery({
    queryKey: [
      'authorized-spaces',
      (membershipsQuery.data ?? []).map((membership) => membership.spaceId),
    ],
    queryFn: async () => {
      if (!tokens || !membershipsQuery.data) return [];
      return loadAuthorizedSpaces(
        config.apiBaseUrl,
        tokens.accessToken,
        membershipsQuery.data,
      );
    },
    enabled:
      !isRestoring &&
      tokens !== null &&
      (membershipsQuery.data?.length ?? 0) > 1,
    retry: false,
  });

  useEffect(() => {
    if (!tokens) {
      setSpaceId(null);
      return;
    }
    if (!membershipsQuery.data) return;
    setSpaceId((current) => {
      const resolved = resolveActiveSpaceId(membershipsQuery.data, current);
      if (resolved && account && tokens) {
        storeSession({ account, tokens, spaceId: resolved });
      }
      // Restore a remembered auth-return target only once both the Account
      // and its active Space are known, so a Space-bound route is never
      // blindly restored into the wrong Space (#689). Guarded to fire once
      // per Account so it does not re-run on every unrelated Space switch.
      if (account && restoredAuthReturnForAccountId.current !== account.id) {
        restoredAuthReturnForAccountId.current = account.id;
        restoreAuthReturnTarget(account.id, resolved);
      }
      return resolved;
    });
  }, [account, membershipsQuery.data, tokens]);

  async function logout() {
    clearEntryToken();
    setIsSigningOut(true);
    try {
      await signOutSession(
        config.apiBaseUrl,
        tokens?.accessToken,
        terminateSession,
      );
    } finally {
      setIsSigningOut(false);
    }
  }

  function selectSpace(selectedSpaceId: string) {
    cancelStoryStartupReads();
    queryClient.clear();
    clearProductReadCacheInBackground();
    clearPublicationMemory();
    setSpaceId(selectedSpaceId);
    if (account && tokens) {
      storeSession({ account, tokens, spaceId: selectedSpaceId });
    }
    postSnackbar('snackbar.spaceSwitched');
  }

  // A current authenticated membership response already authorizes this Space.
  // Account metadata may finish in the background without blocking its UI.
  const restoredSpaceAuthorized = Boolean(
    tokens &&
      account &&
      isAccessTokenValid(tokens) &&
      membershipsQuery.isFetchedAfterMount &&
      membershipsQuery.isSuccess &&
      !membershipsQuery.error &&
      resolveActiveSpaceId(membershipsQuery.data, spaceId),
  );
  // Public legal text needs no session; it must stay readable while signed out.
  const publicLegalDocument = legalDocumentIdForRoute(location.pathname);
  if (publicLegalDocument && !entryToken) {
    return (
      <>
        <ThemeControl />
        <LegalDocumentPage
          key={publicLegalDocument}
          documentId={publicLegalDocument}
        />
      </>
    );
  }

  if ((isRestoring && !restoredSpaceAuthorized) || isSigningOut) {
    return (
      <BrandedStartup
        label={t(isSigningOut ? 'header.logout' : 'states.loading.title')}
      />
    );
  }

  if (entryToken || !tokens || !account) {
    const showDemoEntry = Boolean(demoMode && !entryToken);
    return (
      <>
        <ThemeControl />
        {/* The shell's snackbar is not mounted while signed out; a mailed link that cannot be used is reported here. */}
        <Snackbar />
        {showDemoEntry ? (
          <DemoEntry />
        ) : (
          <IdentityEntry
            key={
              entryToken ? `${entryToken.kind}:${entryToken.token}` : 'signIn'
            }
            apiBaseUrl={config.apiBaseUrl}
            entryToken={entryToken}
            onEntryTokenCleared={clearEntryToken}
            onSession={(session) => {
              if (account && session.account.id !== account.id) {
                void revokeUnacceptedSession(config.apiBaseUrl, session);
                throw new ActiveAccountMismatchError();
              }
              storeSession(session);
              clearEntryToken();
              setSpaceId(session.spaceId ?? null);
              setAccount(session.account);
              setTokens(session.tokens);
              queryClient.clear();
              clearProductReadCacheInBackground();
            }}
          />
        )}
      </>
    );
  }

  const serverAdminPath =
    location.pathname === SERVER_ADMIN_ROUTE ||
    location.pathname.startsWith(`${SERVER_ADMIN_ROUTE}/`);

  if (serverAdminPath) {
    if (capabilitiesQuery.isPending || capabilitiesQuery.error) {
      return (
        <ServerAdminAccessGate
          loading={capabilitiesQuery.isPending}
          error={capabilitiesQuery.error}
          onRetry={() => void capabilitiesQuery.refetch()}
        />
      );
    }

    if (!capabilitiesQuery.data?.serverAdmin) {
      return (
        <ServerAdminAccessGate
          loading={false}
          error={null}
          onRetry={() => void capabilitiesQuery.refetch()}
        />
      );
    }

    return (
      <ServerAdminPage
        apiBaseUrl={config.apiBaseUrl}
        accessToken={tokens.accessToken}
        onLogout={logout}
      />
    );
  }

  const memberships = membershipsQuery.data ?? [];
  const membershipErrorBlocksApp =
    membershipsQuery.error !== null &&
    !canReuseMembershipsAfterRefreshFailure(
      membershipsQuery.data,
      membershipsQuery.error,
    );
  if (
    membershipsQuery.isPending ||
    membershipErrorBlocksApp ||
    memberships.length === 0
  ) {
    if (
      !membershipsQuery.isPending &&
      !membershipErrorBlocksApp &&
      memberships.length === 0
    ) {
      if (instanceStatusQuery.isPending) {
        return (
          <>
            <ThemeControl />
            <SpaceContextGate
              loading
              error={null}
              onRetry={() => void membershipsQuery.refetch()}
            />
          </>
        );
      }

      if (instanceStatusQuery.data?.accountCreation === 'self_service') {
        return (
          <>
            <ThemeControl />
            <FirstSpaceGate
              apiBaseUrl={config.apiBaseUrl}
              accessToken={tokens.accessToken}
              onSpaceReady={async () => {
                navigate(`${MORE_SETTINGS_ROUTE}#settings-connection`);
                await membershipsQuery.refetch();
              }}
            />
          </>
        );
      }
    }

    return (
      <>
        <ThemeControl />
        <SpaceContextGate
          loading={membershipsQuery.isPending}
          error={membershipErrorBlocksApp ? membershipsQuery.error : null}
          onRetry={() => void membershipsQuery.refetch()}
        />
      </>
    );
  }

  const activeSpaceId = resolveActiveSpaceId(memberships, spaceId);
  if (!activeSpaceId && memberships.length > 1) {
    if (spacesQuery.isPending || spacesQuery.error || !spacesQuery.data) {
      return (
        <>
          <ThemeControl />
          <SpaceContextGate
            loading={spacesQuery.isPending}
            error={spacesQuery.error}
            onRetry={() => {
              void membershipsQuery.refetch();
              void spacesQuery.refetch();
            }}
          />
        </>
      );
    }

    return (
      <>
        <ThemeControl />
        <SpacePicker spaces={spacesQuery.data} onSelect={selectSpace} />
      </>
    );
  }

  if (!activeSpaceId) {
    return (
      <>
        <ThemeControl />
        <SpaceContextGate loading error={null} onRetry={() => undefined} />
      </>
    );
  }

  // Publish the selected Space before mounting its draft/media owners. The
  // membership effect rotates their local leases when selection changes.
  if (activeSpaceId !== spaceId) {
    return <BrandedStartup label={t('states.loading.title')} />;
  }

  const startup = storyStartupReads.current;
  return (
    <AudioProcessingContext.Provider
      value={capabilitiesQuery.data?.audioProcessingEnabled === true}
    >
      <VideoProcessingContext.Provider
        value={capabilitiesQuery.data?.videoProcessingEnabled === true}
      >
        <AuthenticatedApp
          tokens={tokens}
          account={account}
          logout={logout}
          apiBaseUrl={config.apiBaseUrl}
          spaceId={activeSpaceId}
          serverAdmin={capabilitiesQuery.data?.serverAdmin ?? false}
          storyStartupReads={
            onStartupRoute &&
            startup?.spaceId === activeSpaceId &&
            startup.accountId === account.id
              ? startup
              : undefined
          }
        />
      </VideoProcessingContext.Provider>
    </AudioProcessingContext.Provider>
  );
}
