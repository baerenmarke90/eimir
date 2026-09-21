import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { AccountView } from '../api/generated/models/AccountView';
import { PRIVATE_AREA_ROOT_PATH } from '../client/privateArea';
import {
  ACTIVITY_ROUTE,
  appRoutePath,
  MORE_COLLECTIONS_ROUTE,
  MORE_NOTIFICATIONS_ROUTE,
  MORE_PEOPLE_ROUTE,
  MORE_PLACES_ROUTE,
  MORE_PROFILE_ROUTE,
  MORE_SETTINGS_ROUTE,
  type AppRouteIcon,
} from '../client/routes';
import { useCurrentProfileIdentity } from '../client/useCurrentProfileIdentity';
import { useTranslation } from '../i18n';
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
    path: MORE_NOTIFICATIONS_ROUTE,
    icon: 'notifications',
    titleKey: 'navigation.notifications',
  },
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
}: {
  destination: MoreDestination;
  leading?: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <li>
      <Link className="more-destination" to={destination.path}>
        <span
          className="more-destination-icon"
          aria-hidden={leading ? undefined : true}
        >
          {leading ?? <DestinationIcon icon={destination.icon} />}
        </span>
        <span className="more-destination-copy">
          <span className="more-destination-title-row">
            <strong>{t(destination.titleKey)}</strong>
            {destination.badgeKey ? (
              <span className="more-destination-badge">
                {t(destination.badgeKey)}
              </span>
            ) : null}
          </span>
        </span>
        <span className="more-destination-chevron" aria-hidden="true">
          ›
        </span>
      </Link>
    </li>
  );
}

function MoreDestinationGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="more-group">
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
      <PageHeader
        eyebrow={t('more.eyebrow')}
        title={t('more.title')}
        variant="primary"
      />

      <div className="more-groups">
        <MoreDestinationGroup title={t('more.groups.personal')}>
          <MoreDestinationRow
            destination={profileDestination}
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
        </MoreDestinationGroup>
      </div>
    </div>
  );
}
