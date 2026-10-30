import { useQuery } from '@tanstack/react-query';
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import type { AccountView } from '../api/generated/models/AccountView';
import { Configuration } from '../client/apiConfiguration';
import { ApiRuntimeProvider } from '../client/apiRuntimeContext';
import { notificationUnreadCountQueryKey } from '../client/notificationQueries';
import {
  PRODUCT_CACHE_FALLBACK_EVENT,
  PRODUCT_CACHE_NETWORK_EVENT,
  type ProductCacheEventDetail,
} from '../client/productReadCache';
import { ProductTourProvider } from '../client/productTour';
import { PUBLIC_START_ROUTE } from '../client/publicStart';
import {
  type AppRouteDefinition,
  activeNavigationArea,
  appRoutePath,
  DEFAULT_APP_ROUTE,
  MEMORY_CREATE_ROUTE,
  PRIMARY_APP_ROUTES,
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
import { releaseEditorHistoryForDocumentNavigation } from '../client/useEditorHistoryEntry';
import { usePrimaryNavigation } from '../client/usePrimaryNavigation';
import { resolvedLocale, useTranslation } from '../i18n';
import { AppSurfacePullToRefresh } from './AppSurfacePullToRefresh';
import { DestinationIcon } from './DestinationIcon';
import { GamesProductArea } from './GamesProductArea';
import { PresenceHeartbeat } from './PresenceHeartbeat';
import { QuickCreateMenu } from './QuickCreateMenu';
import { RouteEntryHandoff } from './RouteEntryHandoff';
import { Snackbar } from './Snackbar';
import { ThemeControl } from './ThemeControl';
import { usePrimaryTabSwipe } from './usePrimaryTabSwipe';

function NavigationLink({ route }: { route: AppRouteDefinition }) {
  const { t } = useTranslation();
  const location = useLocation();
  const { unreadCount } = useShellUtilities();
  const hasUnread = route.id === 'more' && (unreadCount ?? 0) > 0;
  const activeArea = activeNavigationArea(location.pathname);
  const isActive = activeArea === route.id;
  const { destinationFor, captureCurrent } = usePrimaryNavigation();

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
        if (location.pathname === route.path) {
          event.preventDefault();
          window.scrollTo({
            top: 0,
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
              .matches
              ? 'instant'
              : 'smooth',
          });
          return;
        }
        captureCurrent();
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
  onLogout: () => void | Promise<void>;
  apiBaseUrl: string;
  accessToken: string;
  account: AccountView;
  spaceId: string;
  serverAdmin?: boolean;
}

export function AppShell(props: AppShellProps) {
  return (
    <ApiRuntimeProvider
      apiBaseUrl={props.apiBaseUrl}
      accessToken={props.accessToken}
    >
      <TaskOriginProvider
        key={`${props.account.id}:${props.spaceId}`}
        accountId={props.account.id}
        spaceId={props.spaceId}
      >
        <ProductTourProvider
          accountId={props.account.id}
          spaceId={props.spaceId}
        >
          <AuthenticatedAppShell {...props} />
        </ProductTourProvider>
      </TaskOriginProvider>
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

  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const { navigatePrimary } = usePrimaryNavigation();
  usePrimaryTabSwipe({
    surfaceRef: mainRef,
    pathname: location.pathname,
    routeKey: location.key,
    onNavigate: navigatePrimary,
  });
  const { requestReturn, resolveOrigin } = useTaskOrigin();
  const isPrivateArea = location.pathname.startsWith('/more/private');
  const storyDetailMatch =
    /^\/story\/(?:memories|heart-moments|milestones)\/([^/]+)$/.exec(
      location.pathname,
    );
  const isStoryDetail = Boolean(
    storyDetailMatch && storyDetailMatch[1] !== 'new',
  );
  const taskOriginKey = (location.state as { taskOriginKey?: unknown } | null)
    ?.taskOriginKey;
  const storyDetailBackLabel = t(
    resolveOrigin(taskOriginKey)
      ? 'taskBoundary.back'
      : 'memoryProduct.backToStory',
  );
  const isFocusedTask =
    location.pathname === MEMORY_CREATE_ROUTE ||
    location.pathname === '/plan/plans/new' ||
    location.pathname === '/plan/wishes/new' ||
    location.pathname === '/plan/choose';
  const bottomNavigationRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (isFocusedTask) return;
    const navigation = bottomNavigationRef.current;
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
  }, [isFocusedTask]);
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

  const detailBackButton = (
    <button
      type="button"
      className="shell-utility-link shell-detail-back"
      onClick={() => requestReturn(taskOriginKey)}
      aria-label={storyDetailBackLabel}
      title={storyDetailBackLabel}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
      {location.pathname.startsWith('/story/memories/') ? (
        <span>{t('navigation.story')}</span>
      ) : null}
    </button>
  );

  return (
    <ShellUtilitiesContext.Provider
      value={{ unreadCount, serverAdmin, onLogout: logout }}
    >
      <div
        className="product-shell"
        data-focused-task={isFocusedTask}
        data-top-surface={
          location.pathname === DEFAULT_APP_ROUTE ? 'today' : undefined
        }
      >
        <ThemeControl />
        <RouteEntryHandoff />
        <PresenceHeartbeat accountId={account.id} spaceId={spaceId} />
        <a className="skip-link" href="#main-content">
          {t('navigation.skipToContent')}
        </a>

        {!isFocusedTask ? (
          <header className="app-header product-topbar">
            <nav className="shell-nav" aria-label={t('navigation.primary')}>
              <PrimaryNavigationLinks />
            </nav>
            <div className="header-actions">
              <div className="shell-primary-action">
                <QuickCreateMenu variant="desktop" />
              </div>
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
              location.pathname.startsWith('/more') ? 'more' : undefined
            }
            tabIndex={-1}
          >
            <AppSurfacePullToRefresh pathname={location.pathname} />
            {isStoryDetail ? (
              <div className="shell-detail-context">{detailBackButton}</div>
            ) : null}
            {isGamesHub ? (
              <GamesProductArea
                apiBaseUrl={apiBaseUrl}
                accessToken={accessToken}
                spaceId={spaceId}
              />
            ) : (
              children
            )}
          </main>
        </div>

        {!isFocusedTask ? (
          <div className="mobile-bottom-shell" ref={bottomNavigationRef}>
            <nav
              className="mobile-bottom-nav"
              aria-label={t('navigation.primary')}
            >
              <PrimaryNavigationLinks />
            </nav>
            <div className="mobile-quick-create">
              <QuickCreateMenu variant="mobile" />
            </div>
          </div>
        ) : null}

        <Snackbar />
      </div>
    </ShellUtilitiesContext.Provider>
  );
}
