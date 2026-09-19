import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import type { AccountView } from './api/generated/models/AccountView';
import { AttachmentReadRequestParentTypeEnum } from './api/generated/models/AttachmentReadRequest';
import type { SpaceView } from './api/generated/models/SpaceView';
import type { TokenView } from './api/generated/models/TokenView';
import { ProfilesApi } from './api/generated/apis/ProfilesApi';
import { Configuration } from './api/generated/runtime';
import { loadReferenceClientConfig } from './client/config';
import {
  readSensitiveEntryToken,
  stripSensitiveEntryToken,
} from './client/entryToken';
import { createM4ProductApis } from './client/m4Product';
import { createPeopleApi } from './client/peopleApi';
import { createPrivateAreaApi } from './client/privateArea';
import { invalidateDashboard } from './client/dashboardQueries';
import { normalizeClientError } from './client/problemDetails';
import { clearProductReadCacheInBackground } from './client/productReadCache';
import { invalidateStoryProjections } from './client/authorSummaryConsumers';
import {
  rememberCurrentAuthReturnTarget,
  restoreAuthReturnTarget,
} from './client/deepLinks';
import {
  clearStoredSession,
  isAccessTokenValid,
  loadStoredSession,
  refreshSessionTokens,
  storeSession,
} from './client/sessionPersistence';
import {
  createReferenceApis,
  loadAuthorizedImage,
  loadAuthorizedMedia,
} from './client/referenceFlow';
import { loadInstanceAccessStatus } from './client/instanceStatus';
import { createServerAdminApis } from './client/serverAdmin';
import {
  ACTIVITY_ROUTE,
  appRoutePath,
  CHAPTER_CREATE_ROUTE,
  CHAPTER_DETAIL_ROUTE_PATTERN,
  COLLECTION_DETAIL_ROUTE_PATTERN,
  DEFAULT_APP_ROUTE,
  GAMES_MOMENTS_ROUTE,
  GAMES_WISH_DETECTIVE_ROUTE,
  HEART_MOMENT_CREATE_ROUTE,
  HEART_MOMENT_DETAIL_ROUTE_PATTERN,
  HEART_MOMENT_EDIT_ROUTE_PATTERN,
  LEGACY_ROUTE_REWRITES,
  MEMORY_CREATE_ROUTE,
  MEMORY_DETAIL_ROUTE_PATTERN,
  MEMORY_EDIT_ROUTE_PATTERN,
  MILESTONE_CREATE_ROUTE,
  MILESTONE_DETAIL_ROUTE_PATTERN,
  MILESTONE_EDIT_ROUTE_PATTERN,
  MORE_NOTIFICATIONS_ROUTE,
  MORE_PEOPLE_ROUTE,
  MORE_PLACES_ROUTE,
  MORE_COLLECTIONS_ROUTE,
  MORE_PROFILE_ROUTE,
  MORE_SETTINGS_CATEGORY_ROUTE_PATTERN,
  MORE_SETTINGS_ROUTE,
  PLAN_CREATE_ROUTE,
  PLAN_DETAIL_ROUTE_PATTERN,
  PLACE_DETAIL_ROUTE_PATTERN,
  SEARCH_ROUTE,
  SERVER_ADMIN_ROUTE,
  STORY_CHAPTERS_ROUTE,
  STORY_YEAR_ROUTE_PATTERN,
  STORY_YEARS_ROUTE,
  WISH_DETAIL_ROUTE_PATTERN,
  WISH_CREATE_ROUTE,
} from './client/routes';
import { createSharedPlanningApis } from './client/sharedPlanning';
import { postSnackbar } from './client/snackbar';
import {
  loadAuthorizedMemberships,
  loadAuthorizedSpaces,
  resolveActiveSpaceId,
} from './client/spaceContext';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { AppShell } from './components/AppShell';
import { Brand } from './components/Brand';
import { ChapterCreatePage } from './components/ChapterCreatePage';
import { ChapterProductPage } from './components/ChapterProductPage';
import { ChaptersOverviewPage } from './components/ChaptersOverviewPage';
import { CollectionProductPage } from './components/CollectionProductPage';
import { CollectionsOverviewPage } from './components/CollectionsOverviewPage';
import { DemoEntry } from './components/DemoEntry';
import { FirstSpaceGate } from './components/FirstSpaceGate';
import { HeartMomentProductPage } from './components/HeartMomentProductPage';
import { IdentityEntry } from './components/IdentityEntry';
import { LegacyPathRedirect } from './components/LegacyPathRedirect';
import {
  ActivityProductPage,
  NotificationsProductPage,
  SearchProductPage,
} from './components/M4ProductPages';
import { MemoryCreatePage } from './components/MemoryCreatePage';
import { MemoryProductPage } from './components/MemoryProductPage';
import { OurMomentsGamePage } from './components/OurMomentsGamePage';
import { WishDetectiveGamePage } from './components/WishDetectiveGamePage';
import { MilestoneProductPage } from './components/MilestoneProductPage';
import { MoreOverviewPage } from './components/MoreOverviewPage';
import { PlaceProductPage } from './components/PlaceProductPage';
import { PlacesOverviewPage } from './components/PlacesOverviewPage';
import { PlanProductPage } from './components/PlanProductPage';
import { PlanningCreatePage } from './components/PlanningCreatePage';
import { PrivateAreaProductPage } from './components/PrivateAreaProductPage';
import { ProblemState } from './components/ProblemState';
import { ProfilePage } from './components/ProfilePage';
import { RelatedPeoplePage } from './components/RelatedPeoplePage';
import {
  ServerAdminAccessGate,
  ServerAdminPage,
} from './components/ServerAdminPage';
import { SettingsPage } from './components/SettingsPage';
import { SharedPlanningOverviewPage } from './components/SharedPlanningOverviewPage';
import { StoryProductPage } from './components/StoryProductPage';
import {
  StoryYearDetailPage,
  StoryYearsIndexPage,
} from './components/StoryYearsPage';
import { ThemeControl } from './components/ThemeControl';
import { TodayPage } from './components/TodayPage';
import { UiState } from './components/UiState';
import { WishProductPage } from './components/WishProductPage';
import { useTranslation } from './i18n';

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
  return (
    <main className="setup-shell">
      <div className="entry-aura entry-aura-start" aria-hidden="true" />
      <div className="entry-aura entry-aura-end" aria-hidden="true" />
      <section className="setup-card" aria-labelledby="space-context-heading">
        <Brand
          suffix={<span className="brand-suffix">{t('brand.suffix')}</span>}
        />
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
        <Brand
          suffix={<span className="brand-suffix">{t('brand.suffix')}</span>}
        />
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
}: {
  tokens: TokenView;
  account: AccountView;
  logout: () => void;
  apiBaseUrl: string;
  spaceId: string;
  serverAdmin: boolean;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const queryClient = useQueryClient();
  const previousSpaceId = useRef(spaceId);
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

  useEffect(() => {
    if (previousSpaceId.current === spaceId) return;
    queryClient.clear();
    clearProductReadCacheInBackground();
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
    (memoryId: string, attachmentId: string, signal?: AbortSignal) =>
      loadAuthorizedImage(
        apis,
        apiBaseUrl,
        tokens.accessToken,
        spaceId,
        memoryId,
        attachmentId,
        fetch,
        signal,
      ),
    [apiBaseUrl, apis, spaceId, tokens.accessToken],
  );

  const loadHeartMomentAttachment = useCallback(
    (heartMomentId: string, attachmentId: string, signal?: AbortSignal) =>
      loadAuthorizedMedia(
        apis,
        apiBaseUrl,
        tokens.accessToken,
        spaceId,
        AttachmentReadRequestParentTypeEnum.HEART_MOMENT,
        heartMomentId,
        attachmentId,
        fetch,
        signal,
      ),
    [apiBaseUrl, apis, spaceId, tokens.accessToken],
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
    apis: planningApis,
    spaceId,
  };

  return (
    <AppShell
      onLogout={logout}
      apiBaseUrl={apiBaseUrl}
      accessToken={tokens.accessToken}
      account={account}
      spaceId={spaceId}
      serverAdmin={serverAdmin}
    >
      <AppErrorBoundary
        resetKey={location.pathname}
        fallback={
          <UiState
            kind="error"
            title={t('states.unexpected.title')}
            body={t('states.unexpected.body')}
            action={
              <Link
                className="button-link secondary-link"
                to={DEFAULT_APP_ROUTE}
              >
                {t('navigation.today')}
              </Link>
            }
          />
        }
      >
        <Routes>
          <Route
            path="/"
            element={<Navigate replace to={DEFAULT_APP_ROUTE} />}
          />
          <Route
            path={appRoutePath('story')}
            element={
              <StoryProductPage
                apis={apis}
                accountId={account.id}
                spaceId={spaceId}
                loadMemoryImage={loadMemoryImage}
                profilesApi={profilesApi}
              />
            }
          />
          <Route
            path={STORY_YEARS_ROUTE}
            element={
              <StoryYearsIndexPage
                apis={apis}
                accountId={account.id}
                spaceId={spaceId}
                loadMemoryImage={loadMemoryImage}
                profilesApi={profilesApi}
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
              />
            }
          />
          <Route
            path={appRoutePath('plan')}
            element={<SharedPlanningOverviewPage {...planningProductProps} />}
          />
          <Route
            path={PLAN_CREATE_ROUTE}
            element={
              <PlanningCreatePage kind="plan" {...planningProductProps} />
            }
          />
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
            path={MORE_COLLECTIONS_ROUTE}
            element={<CollectionsOverviewPage {...planningProductProps} />}
          />
          <Route
            path="/plan/collections"
            element={<Navigate replace to={MORE_COLLECTIONS_ROUTE} />}
          />
          <Route
            path={COLLECTION_DETAIL_ROUTE_PATTERN}
            element={<CollectionProductPage {...planningProductProps} />}
          />
          <Route
            path={appRoutePath('today')}
            element={
              <TodayPage
                apis={m4Apis}
                spaceId={spaceId}
                loadMemoryImage={loadMemoryImage}
                profilesApi={profilesApi}
                account={account}
              />
            }
          />
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
            element={<SearchProductPage apis={m4Apis} spaceId={spaceId} />}
          />
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
            path={appRoutePath('more')}
            element={
              <MoreOverviewPage
                apiBaseUrl={apiBaseUrl}
                accessToken={tokens.accessToken}
                account={account}
                spaceId={spaceId}
              />
            }
          />
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
            path={MORE_PEOPLE_ROUTE}
            element={
              <RelatedPeoplePage
                peopleApi={peopleApi}
                spaceId={spaceId}
                apiBaseUrl={apiBaseUrl}
                accessToken={tokens.accessToken}
                attachmentsApi={apis.attachments}
              />
            }
          />
          <Route
            path={MORE_PROFILE_ROUTE}
            element={
              <ProfilePage
                apiBaseUrl={apiBaseUrl}
                accessToken={tokens.accessToken}
                account={account}
                spaceId={spaceId}
              />
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
              />
            }
          />
          <Route
            path="/more/private/*"
            element={
              <PrivateAreaProductPage
                api={privateAreaApi}
                accountId={account.id}
                spaceId={spaceId}
              />
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
            element={<MemoryProductPage mode="edit" {...memoryProductProps} />}
          />
          <Route
            path={MEMORY_DETAIL_ROUTE_PATTERN}
            element={
              <MemoryProductPage mode="detail" {...memoryProductProps} />
            }
          />
          <Route
            path={HEART_MOMENT_CREATE_ROUTE}
            element={
              <HeartMomentProductPage
                mode="create"
                {...heartMomentProductProps}
              />
            }
          />
          <Route
            path={HEART_MOMENT_EDIT_ROUTE_PATTERN}
            element={
              <HeartMomentProductPage
                mode="edit"
                {...heartMomentProductProps}
              />
            }
          />
          <Route
            path={HEART_MOMENT_DETAIL_ROUTE_PATTERN}
            element={
              <HeartMomentProductPage
                mode="detail"
                {...heartMomentProductProps}
              />
            }
          />
          <Route
            path={MILESTONE_CREATE_ROUTE}
            element={
              <MilestoneProductPage mode="create" {...milestoneProductProps} />
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
              <MilestoneProductPage mode="detail" {...milestoneProductProps} />
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
        </Routes>
      </AppErrorBoundary>
    </AppShell>
  );
}

export function App({ demoMode = false }: { demoMode?: boolean }) {
  const config = useMemo(loadReferenceClientConfig, []);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [entryToken, setEntryToken] = useState(() =>
    readSensitiveEntryToken(window.location.pathname, window.location.search),
  );
  const [initialStoredSession] = useState(() =>
    entryToken ? null : loadStoredSession(),
  );
  const [tokens, setTokens] = useState<TokenView | null>(
    () => initialStoredSession?.tokens ?? null,
  );
  const [account, setAccount] = useState<AccountView | null>(
    () => initialStoredSession?.account ?? null,
  );
  const [isRestoring, setIsRestoring] = useState(() =>
    Boolean(initialStoredSession),
  );
  const [spaceId, setSpaceId] = useState<string | null>(
    () => initialStoredSession?.spaceId ?? null,
  );
  // Tracks which Account a remembered auth-return target has already been
  // restored for, so the effect that resolves the active Space (below)
  // attempts restoration once per Account rather than on every Space
  // switch (#689).
  const restoredAuthReturnForAccountId = useRef<string | null>(null);

  const terminateSession = useCallback(() => {
    clearStoredSession();
    setEntryToken(null);
    setSpaceId(null);
    setAccount(null);
    setTokens(null);
    restoredAuthReturnForAccountId.current = null;
    queryClient.clear();
    clearProductReadCacheInBackground();
  }, [queryClient]);

  useEffect(() => {
    if (!initialStoredSession) {
      setIsRestoring(false);
      return;
    }
    const session = initialStoredSession;

    let cancelled = false;

    async function restore(activeSession: typeof session) {
      try {
        let currentTokens = activeSession.tokens;
        if (!isAccessTokenValid(currentTokens)) {
          currentTokens = await refreshSessionTokens(
            config.apiBaseUrl,
            currentTokens.refreshToken,
          );
        }

        const apis = createReferenceApis(
          config.apiBaseUrl,
          currentTokens.accessToken,
        );
        const verifiedAccount = await apis.auth.meApiV1AuthMeGet();

        if (cancelled) return;
        setTokens(currentTokens);
        setAccount(verifiedAccount);
        storeSession({
          account: verifiedAccount,
          tokens: currentTokens,
          spaceId: activeSession.spaceId ?? null,
        });
      } catch {
        if (cancelled) return;
        terminateSession();
        rememberCurrentAuthReturnTarget(
          activeSession.account.id,
          activeSession.spaceId ?? null,
        );
      } finally {
        if (!cancelled) {
          setIsRestoring(false);
        }
      }
    }

    void restore(session);

    return () => {
      cancelled = true;
    };
  }, [config.apiBaseUrl, initialStoredSession, terminateSession]);

  useEffect(() => {
    if (!tokens) return;
    const expiresAtMs = new Date(tokens.accessExpiresAt).getTime();
    const timeUntilExpiry = expiresAtMs - Date.now();
    const refreshDelayMs = Math.max(0, timeUntilExpiry - 60_000);

    const timer = setTimeout(() => {
      void refreshSessionTokens(config.apiBaseUrl, tokens.refreshToken)
        .then((newTokens) => {
          setTokens(newTokens);
        })
        .catch((error: unknown) => {
          const status = (error as { status?: number })?.status;
          if (status === 401) {
            terminateSession();
          }
        });
    }, refreshDelayMs);

    return () => clearTimeout(timer);
  }, [config.apiBaseUrl, terminateSession, tokens]);

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

  useEffect(() => {
    if (!entryToken) return;
    window.history.replaceState(
      window.history.state,
      '',
      stripSensitiveEntryToken(window.location.search),
    );
  }, [entryToken]);

  const membershipsQuery = useQuery({
    queryKey: ['account-memberships'],
    queryFn: async () => {
      if (!tokens) return [];
      return loadAuthorizedMemberships(config.apiBaseUrl, tokens.accessToken);
    },
    enabled: !isRestoring && tokens !== null,
    retry: false,
  });

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
    if (!tokens || !membershipsQuery.data) {
      setSpaceId(null);
      return;
    }
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

  function logout() {
    if (tokens?.accessToken) {
      try {
        const apis = createReferenceApis(config.apiBaseUrl, tokens.accessToken);
        void apis.auth.signOutApiV1AuthSignOutPost().catch(() => {});
      } catch {
        // Best effort sign-out
      }
    }
    terminateSession();
  }

  function selectSpace(selectedSpaceId: string) {
    queryClient.clear();
    clearProductReadCacheInBackground();
    setSpaceId(selectedSpaceId);
    if (account && tokens) {
      storeSession({ account, tokens, spaceId: selectedSpaceId });
    }
    postSnackbar('snackbar.spaceSwitched');
  }

  if (isRestoring) {
    return (
      <main className="setup-shell">
        <ThemeControl />
        <UiState kind="loading" title={t('spaceContext.loading')} />
      </main>
    );
  }

  if (!tokens || !account) {
    const showDemoEntry = Boolean(demoMode && !entryToken);
    return (
      <>
        <ThemeControl />
        {showDemoEntry ? (
          <DemoEntry />
        ) : (
          <IdentityEntry
            apiBaseUrl={config.apiBaseUrl}
            entryToken={entryToken}
            onEntryTokenCleared={() => setEntryToken(null)}
            onSession={(session) => {
              storeSession(session);
              setEntryToken(null);
              setSpaceId(null);
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
  if (
    membershipsQuery.isPending ||
    membershipsQuery.error ||
    memberships.length === 0
  ) {
    if (
      !membershipsQuery.isPending &&
      !membershipsQuery.error &&
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
          error={membershipsQuery.error}
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

  return (
    <AuthenticatedApp
      tokens={tokens}
      account={account}
      logout={logout}
      apiBaseUrl={config.apiBaseUrl}
      spaceId={activeSpaceId}
      serverAdmin={capabilitiesQuery.data?.serverAdmin ?? false}
    />
  );
}
