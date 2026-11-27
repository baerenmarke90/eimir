import { useQuery } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  Suspense,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useLocation, useNavigationType } from 'react-router-dom';
import { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import type { AccountView } from '../api/generated/models/AccountView';
import { Configuration } from '../client/apiConfiguration';
import { ApiRuntimeProvider } from '../client/apiRuntimeContext';
import { isAndroidApp } from '../client/config';
import { momentMapOriginKey } from '../client/memoryMapSession';
import { notificationUnreadCountQueryKey } from '../client/notificationQueries';
import {
  PRODUCT_CACHE_FALLBACK_EVENT,
  PRODUCT_CACHE_NETWORK_EVENT,
  type ProductCacheEventDetail,
} from '../client/productReadCache';
import { ProPresentationProvider } from '../client/proPresentation';
import { PUBLIC_START_ROUTE } from '../client/publicStart';
import {
  type AppRouteDefinition,
  type AppRouteId,
  appRoutePath,
  COLLECTION_CREATE_ROUTE,
  DEFAULT_APP_ROUTE,
  MEMORY_CREATE_ROUTE,
  MEMORY_MAP_ROUTE,
  NOTE_CREATE_ROUTE,
  PARTNER_LOCATION_MAP_ROUTE,
  PRIMARY_APP_ROUTES,
  stickyNavigationArea,
} from '../client/routes';
import {
  captureSessionOwner,
  currentSessionTokens,
  loadStoredSession,
} from '../client/sessionPersistence';
import {
  ShellUtilitiesContext,
  useShellUtilities,
} from '../client/shellUtilities';
import { TaskOriginProvider, useTaskOrigin } from '../client/taskOrigin';
import { useDocumentLeaveBlocked } from '../client/useDocumentLeaveGuard';
import { releaseEditorHistoryForDocumentNavigation } from '../client/useEditorHistoryEntry';
import { usePrimaryNavigation } from '../client/usePrimaryNavigation';
import { useAppLayout } from '../client/wirDesign';
import { ChapterNavigation } from './ChapterNavigationLayout';
import { RoomDock, RoomHeader } from './RoomNavigationLayout';
import { scheduleDeferredPrefetch } from '../deferredModules';
import { resolvedLocale, useTranslation } from '../i18n';
import { AppSurfacePullToRefresh } from './AppSurfacePullToRefresh';
import { DestinationIcon } from './DestinationIcon';
import { GamesProductArea } from './GamesProductArea';
import { LogoutDeviceDataSheet } from './LogoutDeviceDataSheet';
import { MomentCreateMenu } from './MomentCreateMenu';
import { ForegroundNotificationHost } from './PartnerGestureReceipt';
import { PresenceHeartbeat } from './PresenceHeartbeat';
import { RouteEntryHandoff } from './RouteEntryHandoff';
import { Snackbar } from './Snackbar';
import { SubpageNavigation } from './SubpageNavigation';
import { SupportReportHost } from './SupportReportHost';
import { ThemeControl } from './ThemeControl';
import { useNavigationMotion } from './useNavigationMotion';

/** The highlighted primary area, resolved once per shell (#2063). */
const ActiveNavigationAreaContext = createContext<AppRouteId | null>(null);

/**
 * Keeps Mehr highlighted on Momente pages that were opened from Mehr; see
 * `stickyNavigationArea`. The previous area is the one shown before this path.
 */
function useActiveNavigationArea(pathname: string): AppRouteId | null {
  const previous = useRef<AppRouteId | null>(null);
  const area = useMemo(
    () => stickyNavigationArea(previous.current, pathname),
    [pathname],
  );
  useEffect(() => {
    previous.current = area;
  }, [area]);
  return area;
}

function NavigationLink({ route }: { route: AppRouteDefinition }) {
  const { t } = useTranslation();
  const { unreadCount } = useShellUtilities();
  const hasUnread = route.id === 'more' && (unreadCount ?? 0) > 0;
  const activeArea = useContext(ActiveNavigationAreaContext);
  const isActive = activeArea === route.id;
  const { destinationFor, navigatePrimary } = usePrimaryNavigation();

  return (
    <Link
      {...destinationFor(route.path)}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        navigatePrimary(route.path);
      }}
      className={`shell-nav-link${isActive ? ' shell-nav-link-active' : ''}`}
      aria-current={isActive ? 'page' : undefined}
      aria-label={
        hasUnread
          ? t('navigation.moreWithUnread', { count: unreadCount })
          : undefined
      }
    >
      <span className="shell-nav-icon">
        <DestinationIcon
          icon={route.icon}
          variant={isActive ? 'filled' : 'outline'}
        />
        {hasUnread ? (
          <span className="notification-dot" aria-hidden="true" />
        ) : null}
      </span>
      <span>{t(route.labelKey)}</span>
    </Link>
  );
}

function PrimaryNavigationLinks() {
  return (
    <>
      {PRIMARY_APP_ROUTES.map((route) => (
        <NavigationLink key={route.id} route={route} />
      ))}
    </>
  );
}

function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}

function useCachedReadTimestamp(): string | null {
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  useEffect(() => {
    const onFallback = (event: Event) => {
      const detail = (event as CustomEvent<ProductCacheEventDetail>).detail;
      if (detail?.refreshedAt) setCachedAt(detail.refreshedAt);
    };
    const onNetwork = () => setCachedAt(null);
    window.addEventListener(PRODUCT_CACHE_FALLBACK_EVENT, onFallback);
    window.addEventListener(PRODUCT_CACHE_NETWORK_EVENT, onNetwork);
    return () => {
      window.removeEventListener(PRODUCT_CACHE_FALLBACK_EVENT, onFallback);
      window.removeEventListener(PRODUCT_CACHE_NETWORK_EVENT, onNetwork);
    };
  }, []);

  return cachedAt;
}

interface AppShellProps {
  children: ReactNode;
  /** Kept primary tabs; rendered outside the subpage frame so they survive detail routes. */
  primaryTabs?: ReactNode;
  onLogout: () => void | Promise<void>;
  apiBaseUrl: string;
  accessToken: string;
  account: AccountView;
  spaceId: string;
  serverAdmin?: boolean;
  openNotification?: (notificationId: string, sourceEventId: string) => void;
}

export function AppShell(props: AppShellProps) {
  // Wir renders first; the rest of the app follows in the background, so later
  // navigations render from memory instead of showing a loading state.
  useEffect(() => scheduleDeferredPrefetch(), []);
  return (
    <ApiRuntimeProvider
      apiBaseUrl={props.apiBaseUrl}
      accessToken={props.accessToken}
      accountId={props.account.id}
      spaceId={props.spaceId}
    >
      <ProPresentationProvider>
        <TaskOriginProvider
          key={`${props.account.id}:${props.spaceId}`}
          accountId={props.account.id}
          spaceId={props.spaceId}
        >
          <AuthenticatedAppShell {...props} />
        </TaskOriginProvider>
      </ProPresentationProvider>
    </ApiRuntimeProvider>
  );
}

function AuthenticatedAppShell({
  children,
  onLogout,
  apiBaseUrl,
  accessToken,
  account,
  spaceId,
  serverAdmin = false,
  openNotification,
  primaryTabs,
}: AppShellProps) {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  const cachedAt = useCachedReadTimestamp();
  const cachedAtLabel = cachedAt
    ? new Intl.DateTimeFormat(resolvedLocale(), {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(cachedAt))
    : null;

  const signingOut = useRef(false);
  function logout(): void {
    if (signingOut.current) return;
    signingOut.current = true;
    const owner = captureSessionOwner(accessToken);
    const historySettled = releaseEditorHistoryForDocumentNavigation();
    const sessionSettled = Promise.resolve().then(onLogout);
    void Promise.allSettled([historySettled, sessionSettled]).then(() => {
      if (owner && loadStoredSession() && !currentSessionTokens(owner)) return;
      window.location.assign(PUBLIC_START_ROUTE);
    });
  }

  // The Android app names what leaves the phone before signing out.
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  function requestLogout(): void {
    if (isAndroidApp()) setConfirmingLogout(true);
    else logout();
  }

  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const pathname = location.pathname.replace(/\/$/, '');
  const activeArea = useActiveNavigationArea(pathname);
  const navigationType = useNavigationType();
  const { navigatePrimary } = usePrimaryNavigation();
  const { resolveOrigin } = useTaskOrigin();
  useNavigationMotion({
    surfaceRef: mainRef,
    pathname,
    routeKey: location.key,
    swipeEnabled:
      pathname !== MEMORY_MAP_ROUTE ||
      !momentMapOriginKey(location.state, resolveOrigin),
    skipEntry: Boolean(location.hash) || pathname === COLLECTION_CREATE_ROUTE,
    createEntry: navigationType === 'PUSH' && pathname.endsWith('/new'),
    // History Back (button, gesture, system Back) and explicit task returns.
    returning:
      navigationType === 'POP' ||
      Boolean(
        (location.state as { taskReturnKey?: unknown } | null)?.taskReturnKey,
      ),
    onNavigate: navigatePrimary,
  });
  const isPrivateArea = location.pathname.startsWith('/more/private');
  const protectedDraft = useDocumentLeaveBlocked();
  const layout = useAppLayout();
  const rooms = layout === 'rooms';
  const chapters = layout === 'chapters';
  const customNavigation = rooms || chapters;
  const isFocusedTask =
    (customNavigation &&
      (protectedDraft ||
        pathname.endsWith('/new') ||
        pathname.endsWith('/edit'))) ||
    /^\/more\/people\/(?:new|[^/]+\/edit)$/.test(location.pathname) ||
    /^\/story\/recaps\/[^/]+$/.test(location.pathname) ||
    location.pathname.startsWith('/today/only-you') ||
    location.pathname === MEMORY_CREATE_ROUTE ||
    location.pathname === PARTNER_LOCATION_MAP_ROUTE ||
    location.pathname === '/story/heart-moments/new' ||
    /^\/story\/(?:happiness|time-travel)\/new$/.test(location.pathname) ||
    location.pathname === NOTE_CREATE_ROUTE ||
    /^\/more\/notes\/[^/]+\/edit$/.test(location.pathname) ||
    location.pathname === '/plan/plans/new' ||
    location.pathname === '/plan/wishes/new' ||
    location.pathname === '/plan/chapters/new' ||
    (protectedDraft && /^\/plan\/chapters\/[^/]+$/.test(location.pathname)) ||
    location.pathname === '/plan/choose';
  const [bottomNavigation, setBottomNavigation] = useState<HTMLElement | null>(
    null,
  );
  useLayoutEffect(() => {
    if (isFocusedTask) return;
    const navigation = bottomNavigation;
    if (!navigation || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const measure = (entry?: ResizeObserverEntry) => {
      // Reserve layout CSS pixels; root zoom already scales the consumer.
      const height =
        entry?.borderBoxSize?.[0]?.blockSize ?? navigation.offsetHeight;
      if (height > 0)
        root.style.setProperty(
          '--shell-bottom-nav-measured-height',
          `${height}px`,
        );
      else root.style.removeProperty('--shell-bottom-nav-measured-height');
    };
    const observer = new ResizeObserver(([entry]) => measure(entry));
    observer.observe(navigation, { box: 'border-box' });
    measure();
    return () => {
      observer.disconnect();
      root.style.removeProperty('--shell-bottom-nav-measured-height');
    };
  }, [isFocusedTask, bottomNavigation]);
  const gamesPath = appRoutePath('games');
  const isGamesHub = location.pathname === gamesPath;

  useEffect(
    () => () => {
      document.body.classList.remove('theme-vault');
    },
    [],
  );

  const notificationsApi = useMemo(
    () =>
      new NotificationsApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ),
    [apiBaseUrl, accessToken],
  );

  const unreadQuery = useQuery({
    queryKey: notificationUnreadCountQueryKey(spaceId),
    queryFn: () => notificationsApi.getNotificationUnreadCount({ spaceId }),
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: 'always',
    enabled: Boolean(spaceId && accessToken),
  });
  const unreadCount = unreadQuery.data?.unreadCount;

  return (
    <ShellUtilitiesContext.Provider
      value={{ unreadCount, serverAdmin, onLogout: requestLogout }}
    >
      <ActiveNavigationAreaContext.Provider value={activeArea}>
        <LogoutDeviceDataSheet
          open={confirmingLogout}
          onCancel={() => setConfirmingLogout(false)}
          onConfirm={() => {
            setConfirmingLogout(false);
            logout();
          }}
        />
        <div
          className="product-shell"
          data-wir-layout={layout}
          data-focused-task={isFocusedTask}
          data-top-surface={
            !customNavigation && location.pathname === DEFAULT_APP_ROUTE
              ? 'today'
              : undefined
          }
        >
          <ThemeControl />
          <RouteEntryHandoff />
          <PresenceHeartbeat accountId={account.id} spaceId={spaceId} />
          <a className="skip-link" href="#main-content">
            {t('navigation.skipToContent')}
          </a>

          {!isFocusedTask && chapters ? (
            <Suspense fallback={null}>
              <ChapterNavigation privateArea={isPrivateArea} />
            </Suspense>
          ) : !isFocusedTask && rooms ? (
            <Suspense fallback={null}>
              <RoomHeader privateArea={isPrivateArea} />
            </Suspense>
          ) : !isFocusedTask ? (
            <header className="app-header product-topbar">
              <nav className="shell-nav" aria-label={t('navigation.primary')}>
                <PrimaryNavigationLinks />
              </nav>
              <div className="header-actions">
                <span
                  className={`shared-context ${isPrivateArea ? 'private-context' : ''}`}
                >
                  {isPrivateArea ? (
                    <>
                      <span aria-hidden="true">🔒</span>{' '}
                      {t('privateArea.privacyLabel')}
                    </>
                  ) : (
                    <>
                      <span aria-hidden="true">♥</span> {t('header.sharedArea')}
                    </>
                  )}
                </span>
                {isPrivateArea ? null : (
                  <span className="topbar-create">
                    <span className="topbar-create-global">
                      <MomentCreateMenu everything />
                    </span>
                  </span>
                )}
              </div>
            </header>
          ) : null}

          {cachedAtLabel ? (
            <div className="offline-banner" role="status">
              <span aria-hidden="true">↯</span>
              <span>
                {t('cacheRuntime.cachedBanner', { timestamp: cachedAtLabel })}
              </span>
            </div>
          ) : !online ? (
            <div className="offline-banner" role="status">
              <span aria-hidden="true">↯</span>
              <span>{t('states.offline.banner')}</span>
            </div>
          ) : null}

          <div className="product-shell-body">
            <main
              ref={mainRef}
              id="main-content"
              className="product-main"
              data-area={
                activeArea === 'more' && location.pathname.startsWith('/more')
                  ? 'more'
                  : undefined
              }
              tabIndex={-1}
            >
              <AppSurfacePullToRefresh pathname={location.pathname} />
              {primaryTabs}
              <SubpageNavigation>
                {isGamesHub ? (
                  <GamesProductArea
                    apiBaseUrl={apiBaseUrl}
                    accessToken={accessToken}
                    accountId={account.id}
                    spaceId={spaceId}
                  />
                ) : (
                  children
                )}
              </SubpageNavigation>
            </main>
          </div>

          {!isFocusedTask && rooms ? (
            <Suspense fallback={null}>
              <RoomDock
                canCreate={!isPrivateArea}
                navigationRef={setBottomNavigation}
              />
            </Suspense>
          ) : !isFocusedTask && !chapters ? (
            <div className="mobile-bottom-shell" ref={setBottomNavigation}>
              <nav
                className="mobile-bottom-nav"
                aria-label={t('navigation.primary')}
              >
                <PrimaryNavigationLinks />
              </nav>
            </div>
          ) : null}

          {spaceId && accessToken ? (
            <ForegroundNotificationHost
              key={JSON.stringify([apiBaseUrl, account.id, spaceId])}
              apiBaseUrl={apiBaseUrl}
              accessToken={accessToken}
              accountId={account.id}
              spaceId={spaceId}
              unreadCount={unreadCount}
              suppressed={isFocusedTask}
              openNotification={openNotification}
            />
          ) : null}
          <Snackbar />
          {/* The one support report sheet; it outlives the screen opening it. */}
          <SupportReportHost />
        </div>
      </ActiveNavigationAreaContext.Provider>
    </ShellUtilitiesContext.Provider>
  );
}
