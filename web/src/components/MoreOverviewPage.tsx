import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useId } from 'react';
import { Link } from 'react-router-dom';
import type { AccountView } from '../api/generated/models/AccountView';
import { loadInstanceAccessStatus } from '../client/instanceStatus';
import { PRIVATE_AREA_ROOT_PATH } from '../client/privateArea';
import { useProductTour } from '../client/productTour';
import { useHideProFeatureMarks } from '../client/proPresentation';
import {
  ACTIVITY_ROUTE,
  type AppRouteIcon,
  appRoutePath,
  LEGAL_TERMS_ROUTE,
  MORE_COLLECTIONS_ROUTE,
  MORE_INSIGHTS_ROUTE,
  MORE_NOTIFICATIONS_ROUTE,
  MORE_PEOPLE_ROUTE,
  MORE_PLACES_ROUTE,
  MORE_PROFILE_ROUTE,
  MORE_SETTINGS_ROUTE,
  SEARCH_ROUTE,
  SERVER_ADMIN_ROUTE,
  STORY_CHAPTERS_ROUTE,
  STORY_PHOTOS_ROUTE,
  STORY_YEARS_ROUTE,
} from '../client/routes';
import { useShellUtilities } from '../client/shellUtilities';
import { useCurrentProfileIdentity } from '../client/useCurrentProfileIdentity';
import { resolvedLocale, useTranslation } from '../i18n';
import { Brand } from './Brand';
import { DestinationIcon } from './DestinationIcon';
import { EimirIcon } from './EimirIcon';
import { PageHeader } from './PageHeader';
import { PersonIdentity } from './PersonIdentity';
import { TaskOriginLink } from './TodayDestinationLink';
import './MoreOverviewPage.css';

interface MoreDestination {
  path: string;
  icon: AppRouteIcon;
  titleKey: string;
  /** Short localized line that tells what the destination holds. */
  subtitleKey?: string;
  badgeKey?: string;
}

const PRIVATE_DESTINATION: MoreDestination = {
  path: PRIVATE_AREA_ROOT_PATH,
  icon: 'private',
  titleKey: 'more.private.title',
};

/**
 * #1790 E1: years and recaps share one destination. It opens the Free years
 * index, whose quiet entry leads on to the recaps, so no route is lost.
 */
const STORY_DESTINATIONS: readonly MoreDestination[] = [
  {
    path: STORY_PHOTOS_ROUTE,
    icon: 'media',
    titleKey: 'more.destinations.media',
    subtitleKey: 'more.subtitles.media',
  },
  {
    path: STORY_CHAPTERS_ROUTE,
    icon: 'chapter',
    titleKey: 'more.destinations.chapters',
    subtitleKey: 'more.subtitles.chapters',
  },
  {
    path: STORY_YEARS_ROUTE,
    icon: 'plan',
    titleKey: 'more.destinations.yearsAndRecaps',
    subtitleKey: 'more.subtitles.yearsAndRecaps',
  },
  {
    path: MORE_INSIGHTS_ROUTE,
    icon: 'activity',
    titleKey: 'more.destinations.insights',
    subtitleKey: 'more.subtitles.insights',
    badgeKey: 'dailyInsights.pro',
  },
];

const EVERYDAY_DESTINATIONS: readonly MoreDestination[] = [
  {
    path: MORE_COLLECTIONS_ROUTE,
    icon: 'collections',
    titleKey: 'more.destinations.lists',
    subtitleKey: 'more.subtitles.lists',
  },
  {
    path: MORE_PLACES_ROUTE,
    icon: 'places',
    titleKey: 'more.places.title',
    subtitleKey: 'more.subtitles.places',
  },
  {
    path: MORE_PEOPLE_ROUTE,
    icon: 'people',
    titleKey: 'more.people.title',
    subtitleKey: 'more.subtitles.people',
  },
  {
    path: appRoutePath('games'),
    icon: 'games',
    titleKey: 'navigation.games',
    subtitleKey: 'more.subtitles.games',
    badgeKey: 'games.status.premium',
  },
];

const UTILITY_DESTINATIONS: readonly MoreDestination[] = [
  {
    path: MORE_SETTINGS_ROUTE,
    icon: 'settings',
    titleKey: 'navigation.settings',
  },
  {
    path: ACTIVITY_ROUTE,
    icon: 'activity',
    titleKey: 'navigation.activity',
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
  const hideProMarks = useHideProFeatureMarks();
  const secondaryLine =
    subtitle ??
    (destination.subtitleKey ? t(destination.subtitleKey) : undefined);
  const rowId = useId();
  const showBadge = Boolean(destination.badgeKey) && !hideProMarks;
  // The title (and Pro mark) stay the accessible name; the secondary line
  // describes the destination instead of lengthening its name (#1790 E1).
  const describeSecondary = Boolean(secondaryLine) && !leading;
  const titleId = `${rowId}-title`;
  const badgeId = `${rowId}-badge`;
  const subtitleId = `${rowId}-subtitle`;

  return (
    <li>
      <TaskOriginLink
        className={`more-destination${leading ? ' more-profile-destination' : ''}`}
        to={destination.path}
        ariaLabel={
          (unreadCount ?? 0) > 0
            ? t('navigation.notificationsWithUnread', { count: unreadCount })
            : undefined
        }
        ariaLabelledBy={
          describeSecondary
            ? showBadge
              ? `${titleId} ${badgeId}`
              : titleId
            : undefined
        }
        ariaDescribedBy={describeSecondary ? subtitleId : undefined}
      >
        <span
          className={leading ? 'more-profile-avatar' : 'more-destination-icon'}
          aria-hidden="true"
        >
          {leading ?? <DestinationIcon icon={destination.icon} />}
        </span>
        <span className="more-destination-copy">
          <span className="more-destination-title-row">
            <strong id={titleId}>{label ?? t(destination.titleKey)}</strong>
            {showBadge && destination.badgeKey ? (
              <span id={badgeId} className="more-destination-badge">
                {t(destination.badgeKey)}
              </span>
            ) : null}
          </span>
          {secondaryLine ? (
            <span
              id={subtitleId}
              className={
                leading ? 'more-profile-label' : 'more-destination-subtitle'
              }
            >
              {secondaryLine}
            </span>
          ) : null}
        </span>
        <span className="more-destination-trailing">
          {(unreadCount ?? 0) > 0 ? (
            <span className="more-unread-count" aria-hidden="true">
              {new Intl.NumberFormat(resolvedLocale()).format(unreadCount ?? 0)}
            </span>
          ) : null}
        </span>
      </TaskOriginLink>
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
  // Shares App's cached public instance status; Self-Hosted publishes no terms.
  const instanceStatus = useQuery({
    queryKey: ['instance-status', apiBaseUrl],
    queryFn: () => loadInstanceAccessStatus(apiBaseUrl),
    staleTime: 60_000,
  });
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
        variant="root"
        className="content-overview-heading"
        title={t('more.title')}
      />

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
                size="medium"
                showName={false}
                imageAlt={t('profileIdentity.imageAlt', { name: displayName })}
                fallbackAlt={t('profileIdentity.fallbackAlt', {
                  name: displayName,
                })}
              />
            }
          />
          <MoreDestinationRow
            destination={PRIVATE_DESTINATION}
            subtitle={t('more.subtitles.private', {
              visibility: t('more.visibility.onlyYou'),
            })}
          />
          <MoreDestinationRow
            destination={{
              path: MORE_NOTIFICATIONS_ROUTE,
              icon: 'notifications',
              titleKey: 'navigation.notifications',
            }}
            unreadCount={unreadCount}
          />
        </MoreDestinationGroup>

        <MoreDestinationGroup title={t('more.groups.moments')}>
          {STORY_DESTINATIONS.map((destination) => (
            <MoreDestinationRow
              key={destination.path}
              destination={destination}
            />
          ))}
        </MoreDestinationGroup>

        <MoreDestinationGroup title={t('more.groups.shared')}>
          {EVERYDAY_DESTINATIONS.map((destination) => (
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
        {instanceStatus.data?.termsOfUseVersion ? (
          <nav className="more-legal" aria-label={t('legal.eyebrow')}>
            <Link to={LEGAL_TERMS_ROUTE}>{t('legal.termsLink')}</Link>
          </nav>
        ) : null}
        <div className="more-brand-signature">
          <Brand />
        </div>
      </footer>
    </div>
  );
}
