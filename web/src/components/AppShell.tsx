import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import type { AccountView } from '../api/generated/models/AccountView';
import { Configuration } from '../api/generated/runtime';
import { ApiRuntimeProvider } from '../client/apiRuntimeContext';
import { notificationUnreadCountQueryKey } from '../client/notificationQueries';
import {
  PRODUCT_CACHE_FALLBACK_EVENT,
  PRODUCT_CACHE_NETWORK_EVENT,
  type ProductCacheEventDetail,
} from '../client/productReadCache';
import { PUBLIC_START_ROUTE } from '../client/publicStart';
import {
  type AppRouteDefinition,
  activeNavigationArea,
  appRoutePath,
  DEFAULT_APP_ROUTE,
  MEMORY_CREATE_ROUTE,
  PRIMARY_APP_ROUTES,
  SEARCH_ROUTE,
} from '../client/routes';
import { TaskOriginProvider, useTaskOrigin } from '../client/taskOrigin';
import { useHideOnScrollNav } from '../client/useHideOnScrollNav';
import { resolvedLocale, useTranslation } from '../i18n';
import { Brand } from './Brand';
import { DestinationIcon } from './DestinationIcon';
import { GamesProductArea } from './GamesProductArea';
import { HeaderNotificationsMenu } from './HeaderNotificationsMenu';
import { HeaderProfileMenu } from './HeaderProfileMenu';
import { QuickCreateMenu } from './QuickCreateMenu';
import { RouteEntryHandoff } from './RouteEntryHandoff';
import { Snackbar } from './Snackbar';
import { ThemeControl } from './ThemeControl';

function NavigationLink({ route }: { route: AppRouteDefinition }) {
  const { t } = useTranslation();
  const location = useLocation();
  const activeArea = activeNavigationArea(location.pathname);
  const isActive = activeArea === route.id;

  return (
    <Link
      to={route.path}
      className={`shell-nav-link${isActive ? ' shell-nav-link-active' : ''}`}
      aria-current={isActive ? 'page' : undefined}
    >
      <span className="shell-nav-icon">
        <DestinationIcon icon={route.icon} />
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
  onLogout: () => void;
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
        <AuthenticatedAppShell {...props} />
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

  function logout(): void {
    onLogout();
    window.location.assign(PUBLIC_START_ROUTE);
  }

  const location = useLocation();
  const { requestReturn, resolveOrigin } = useTaskOrigin();
  const { isVisible: isBottomNavVisible, shellRef: bottomNavRef } =
    useHideOnScrollNav(location.pathname, location.search);
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
    location.pathname === '/plan/wishes/new';
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
  const unreadCount = unreadQuery.data?.unreadCount ?? 0;

  return (
    <div className="product-shell" data-focused-task={isFocusedTask}>
      <ThemeControl />
      <RouteEntryHandoff />
      <a className="skip-link" href="#main-content">
        {t('navigation.skipToContent')}
      </a>

      {!isFocusedTask ? (
        <header className="app-header product-topbar">
          {isStoryDetail ? (
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
            </button>
          ) : (
            <Brand to={DEFAULT_APP_ROUTE} ariaLabel={t('brand.homeAria')} />
          )}
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
            <NavLink
              to={SEARCH_ROUTE}
              className={({ isActive }) =>
                `shell-utility-link${isActive ? ' shell-utility-link-active' : ''}`
              }
              aria-label={t('navigation.search')}
              title={t('navigation.search')}
            >
              <span className="shell-nav-icon" aria-hidden="true">
                <DestinationIcon icon="search" />
              </span>
            </NavLink>
            <HeaderNotificationsMenu
              apiBaseUrl={apiBaseUrl}
              accessToken={accessToken}
              spaceId={spaceId}
              unreadCount={unreadCount}
              currentAccountId={account.id}
            />
            <HeaderProfileMenu
              apiBaseUrl={apiBaseUrl}
              accessToken={accessToken}
              account={account}
              spaceId={spaceId}
              serverAdmin={serverAdmin}
              onLogout={logout}
            />
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
          key={location.pathname}
          id="main-content"
          className="product-main eimir-motion-reveal"
          tabIndex={-1}
        >
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
        <div
          ref={bottomNavRef}
          className="mobile-bottom-shell"
          data-hidden={!isBottomNavVisible ? 'true' : 'false'}
        >
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
  );
}
