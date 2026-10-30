import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AccountView } from '../api/generated/models/AccountView';
import { PRIVATE_AREA_ROOT_PATH } from '../client/privateArea';
import {
  ACTIVITY_ROUTE,
  appRoutePath,
  MORE_COLLECTIONS_ROUTE,
  MORE_INSIGHTS_ROUTE,
  MORE_NOTIFICATIONS_ROUTE,
  MORE_PEOPLE_ROUTE,
  MORE_PASSPORT_ROUTE,
  MORE_PLACES_ROUTE,
  MORE_PROFILE_ROUTE,
  MORE_SETTINGS_ROUTE,
  SEARCH_ROUTE,
  SERVER_ADMIN_ROUTE,
  type AppRouteIcon,
} from '../client/routes';
import { useCurrentProfileIdentity } from '../client/useCurrentProfileIdentity';
import { useProductTour } from '../client/productTour';
import { resolvedLocale, useTranslation } from '../i18n';
import { useShellUtilities } from '../client/shellUtilities';
import { Brand } from './Brand';
import { EimirIcon } from './EimirIcon';
import { DestinationIcon } from './DestinationIcon';
import { PageHeader } from './PageHeader';
import { PersonIdentity } from './PersonIdentity';
import './MoreOverviewPage.css';

interface MoreDestination {
  path: string;
  icon: AppRouteIcon;
  titleKey: string;
  badgeKey?: string;
}

const PERSONAL_DESTINATIONS: readonly MoreDestination[] = [
  {
    path: PRIVATE_AREA_ROOT_PATH,
    icon: 'private',
    titleKey: 'more.private.title',
  },
];

const SHARED_DESTINATIONS: readonly MoreDestination[] = [
  {
    path: MORE_PASSPORT_ROUTE,
    icon: 'chapter',
    titleKey: 'recaps.shortTitle',
    badgeKey: 'recaps.pro',
  },
  {
    path: MORE_INSIGHTS_ROUTE,
    icon: 'activity',
    titleKey: 'dailyInsights.week.title',
    badgeKey: 'dailyInsights.pro',
  },
  {
    path: MORE_PEOPLE_ROUTE,
    icon: 'people',
    titleKey: 'more.people.title',
  },
  {
    path: MORE_PLACES_ROUTE,
    icon: 'places',
    titleKey: 'more.places.title',
  },
  {
    path: MORE_COLLECTIONS_ROUTE,
    icon: 'collections',
    titleKey: 'more.collections.title',
  },
  {
    path: appRoutePath('games'),
    icon: 'games',
    titleKey: 'navigation.games',
    badgeKey: 'games.status.premium',
  },
];

const UTILITY_DESTINATIONS: readonly MoreDestination[] = [
  {
    path: ACTIVITY_ROUTE,
    icon: 'activity',
    titleKey: 'navigation.activity',
  },
  {
    path: MORE_SETTINGS_ROUTE,
    icon: 'settings',
    titleKey: 'navigation.settings',
  },
];

function MoreDestinationRow({
  destination,
  leading,
  label,
  subtitle,
  unreadCount,
}: {
  destination: MoreDestination;
  leading?: ReactNode;
  label?: string;
  subtitle?: string;
  unreadCount?: number;
}) {
  const { t } = useTranslation();

  return (
    <li>
      <Link
        className="more-destination"
        to={destination.path}
        aria-label={
          (unreadCount ?? 0) > 0
            ? t('navigation.notificationsWithUnread', { count: unreadCount })
            : undefined
        }
      >
        <span className="more-destination-icon" aria-hidden="true">
          {leading ?? <DestinationIcon icon={destination.icon} />}
        </span>
        <span className="more-destination-copy">
          <span className="more-destination-title-row">
            <strong>{label ?? t(destination.titleKey)}</strong>
            {destination.badgeKey ? (
              <span className="more-destination-badge">
                {t(destination.badgeKey)}
              </span>
            ) : null}
          </span>
          {subtitle ? (
            <span className="more-profile-label">{subtitle}</span>
          ) : null}
        </span>
        <span className="more-destination-trailing">
          {(unreadCount ?? 0) > 0 ? (
            <span className="more-unread-count" aria-hidden="true">
              {new Intl.NumberFormat(resolvedLocale()).format(unreadCount ?? 0)}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

function MoreDestinationGroup({
  title,
  children,
  separate = false,
}: {
  title: string;
  children: ReactNode;
  separate?: boolean;
}) {
  return (
    <section className={`more-group${separate ? ' more-group-separated' : ''}`}>
      <h2 className="more-group-title">{title}</h2>
      <ul className="more-destinations">{children}</ul>
    </section>
  );
}

export function MoreOverviewPage({
  apiBaseUrl,
  accessToken,
  account,
  spaceId,
}: {
  apiBaseUrl: string;
  accessToken: string;
  account: AccountView;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const { replay } = useProductTour();
  const { unreadCount, serverAdmin, onLogout } = useShellUtilities();
  const { displayName, avatarUrl } = useCurrentProfileIdentity({
    apiBaseUrl,
    accessToken,
    account,
    spaceId,
  });

  const profileDestination: MoreDestination = {
    path: MORE_PROFILE_ROUTE,
    icon: 'profile',
    titleKey: 'navigation.profile',
  };

  return (
    <div className="page more-page">
      <PageHeader variant="root" title={t('more.title')} />

      <Link className="more-search-entry" to={SEARCH_ROUTE}>
        <span className="shell-nav-icon" aria-hidden="true">
          <DestinationIcon icon="search" />
        </span>
        <span>{t('navigation.searchAll')}</span>
      </Link>

      <div className="more-groups">
        <MoreDestinationGroup title={t('more.groups.personal')} separate>
          <MoreDestinationRow
            destination={profileDestination}
            label={displayName}
            subtitle={t('navigation.profile')}
            leading={
              <PersonIdentity
                displayName={displayName}
                imageUrl={avatarUrl}
                size="small"
                showName={false}
                imageAlt={t('profileIdentity.imageAlt', { name: displayName })}
                fallbackAlt={t('profileIdentity.fallbackAlt', {
                  name: displayName,
                })}
              />
            }
          />
          <MoreDestinationRow
            destination={{
              path: MORE_NOTIFICATIONS_ROUTE,
              icon: 'notifications',
              titleKey: 'navigation.notifications',
            }}
            unreadCount={unreadCount}
          />
          {PERSONAL_DESTINATIONS.map((destination) => (
            <MoreDestinationRow
              key={destination.path}
              destination={destination}
            />
          ))}
        </MoreDestinationGroup>

        <MoreDestinationGroup title={t('more.groups.shared')}>
          {SHARED_DESTINATIONS.map((destination) => (
            <MoreDestinationRow
              key={destination.path}
              destination={destination}
            />
          ))}
        </MoreDestinationGroup>

        <MoreDestinationGroup title={t('more.groups.utility')}>
          {UTILITY_DESTINATIONS.map((destination) => (
            <MoreDestinationRow
              key={destination.path}
              destination={destination}
            />
          ))}
          <li>
            <button
              type="button"
              className="more-destination more-destination-button"
              onClick={replay}
            >
              <span className="more-destination-icon" aria-hidden="true">
                <DestinationIcon icon="story" />
              </span>
              <span className="more-destination-copy">
                <strong>{t('productTour.replay')}</strong>
              </span>
            </button>
          </li>
        </MoreDestinationGroup>
        {serverAdmin ? (
          <MoreDestinationGroup title={t('navigation.operatorArea')}>
            <MoreDestinationRow
              destination={{
                path: SERVER_ADMIN_ROUTE,
                icon: 'settings',
                titleKey: 'serverAdmin.title',
              }}
            />
          </MoreDestinationGroup>
        ) : null}
      </div>
      <footer className="more-footer">
        {onLogout ? (
          <button type="button" className="more-logout" onClick={onLogout}>
            <EimirIcon name="logout" />
            <span>{t('header.logout')}</span>
          </button>
        ) : null}
        <div className="more-brand-signature">
          <Brand />
        </div>
      </footer>
    </div>
  );
}
