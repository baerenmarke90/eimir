import type { MouseEvent, ReactNode } from 'react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  activeNavigationArea,
  appRoutePath,
  MORE_INSIGHTS_ROUTE,
} from '../client/routes';
import { useShellUtilities } from '../client/shellUtilities';
import { usePrimaryNavigation } from '../client/usePrimaryNavigation';
import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import type { PartnerAvatarAction } from './PartnerAvatarPair';
import { personInitials } from './PersonIdentity';

import './SharedRhythm.css';
import './SharedRhythmAreas.css';

const SECTIONS = [
  { id: 'today', label: 'navigation.today', icon: 'wir' },
  { id: 'story', label: 'wirDesign.rhythm.history', icon: 'momente' },
  { id: 'plan', label: 'wirDesign.rhythm.ahead', icon: 'planen' },
  { id: 'shared', label: 'navigation.shared', icon: 'listen' },
] as const;

export function SharedRhythmRail({ privateArea }: { privateArea: boolean }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { navigatePrimary, destinationFor } = usePrimaryNavigation();
  const { unreadCount } = useShellUtilities();
  const area = activeNavigationArea(pathname);
  const gamesPath = appRoutePath('games');
  const inGames =
    pathname === gamesPath || pathname.startsWith(`${gamesPath}/`);
  const inInsights =
    pathname === MORE_INSIGHTS_ROUTE ||
    pathname.startsWith(`${MORE_INSIGHTS_ROUTE}/`);
  const hasUnread = Boolean(unreadCount);

  function follow(event: MouseEvent<HTMLAnchorElement>, path: string) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey
    )
      return;
    event.preventDefault();
    navigatePrimary(path);
  }

  return (
    <header className="rhythm-rail">
      <div className="rhythm-id">
        <span className="rhythm-logo">
          eimir<span>.</span>
        </span>
        <span className="rhythm-edition">{t('wirDesign.rhythm.title')}</span>
        {privateArea ? (
          <span className="rhythm-private">
            <EimirIcon name="lock" />
            {t('privateArea.privacyLabel')}
          </span>
        ) : null}
      </div>
      <nav className="rhythm-index" aria-label={t('navigation.primary')}>
        {SECTIONS.map(({ id, label, icon }) => {
          const path = appRoutePath(id);
          return (
            <Link
              {...destinationFor(path)}
              onClick={(event) => follow(event, path)}
              className="rhythm-index-link"
              key={id}
              aria-current={area === id ? 'location' : undefined}
            >
              <EimirIcon name={icon} variant="filled" />
              <span>{t(label)}</span>
            </Link>
          );
        })}
        <Link
          to={appRoutePath('more')}
          className="rhythm-index-link rhythm-more-link"
          aria-current={
            area === 'more' || inGames || inInsights ? 'location' : undefined
          }
          aria-label={
            hasUnread
              ? t('navigation.moreWithUnread', { count: unreadCount })
              : t('navigation.more')
          }
        >
          <span className="rhythm-more-icon">
            <EimirIcon name="mehr" />
            {hasUnread ? (
              <span className="notification-dot" aria-hidden="true" />
            ) : null}
          </span>
          <span>{t('navigation.more')}</span>
        </Link>
      </nav>
      <nav
        className="rhythm-side-links"
        aria-label={t('wirDesign.rhythm.moreNavigation')}
      >
        <Link
          to={MORE_INSIGHTS_ROUTE}
          aria-current={inInsights ? 'location' : undefined}
        >
          <EimirIcon name="statistiken" />
          {t('wirDesign.rhythm.insights')}
        </Link>
        <Link
          to={appRoutePath('games')}
          aria-current={inGames ? 'location' : undefined}
        >
          <EimirIcon name="spiele" variant="filled" />
          {t('wirDesign.rhythm.games')}
        </Link>
      </nav>
    </header>
  );
}

type RhythmPerson = {
  name: string;
  image?: string | null;
  action?: PartnerAvatarAction;
  badge?: ReactNode;
};

function Portrait({ name, image }: RhythmPerson) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span className="rhythm-disc" aria-hidden="true">
      {image && image !== failed ? (
        <img src={image} alt="" onError={() => setFailed(image)} />
      ) : (
        <span>{personInitials(name)}</span>
      )}
    </span>
  );
}

function RhythmPortrait({
  person,
  icon,
  label,
}: {
  person: RhythmPerson;
  icon: EimirIconName;
  label: string;
}) {
  const { action } = person;
  const presentation = (
    <>
      <Portrait {...person} />
      <span className="rhythm-name">{person.name}</span>
      {action ? (
        <span className="rhythm-portrait-action">
          <EimirIcon name={icon} />
          {label}
        </span>
      ) : null}
    </>
  );
  return (
    <div className="rhythm-person">
      {action ? (
        <button
          className="rhythm-portrait"
          type="button"
          ref={action.ref}
          aria-label={action.label}
          aria-haspopup={action.hasPopup}
          aria-expanded={action.expanded}
          aria-controls={action.controls}
          onClick={action.onActivate}
        >
          {presentation}
        </button>
      ) : (
        <div className="rhythm-portrait">{presentation}</div>
      )}
      {person.badge}
    </div>
  );
}

export function SharedRhythmToday({
  own,
  partner,
  date,
  duration,
  overlay,
}: {
  own: RhythmPerson;
  partner?: RhythmPerson;
  date?: Date;
  duration?: string;
  overlay?: ReactNode;
}) {
  const { t } = useTranslation();
  const day = date ?? new Date();
  const dayLabel = new Intl.DateTimeFormat(resolvedLocale(), {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(date ? { timeZone: 'UTC' } : {}),
  }).format(day);

  return (
    <div className="rhythm-today-lead">
      <div className="rhythm-day">
        <p>{dayLabel}</p>
        <h1>{t('wirDesign.rhythm.today')}</h1>
      </div>
      <div className="rhythm-portraits" data-paired={Boolean(partner)}>
        <RhythmPortrait
          person={own}
          icon="vibe"
          label={t('wirDesign.rhythm.ownVibe')}
        />
        {partner ? (
          <>
            <span className="rhythm-union" aria-hidden="true">
              <EimirIcon name="momente" variant="filled" />
            </span>
            <RhythmPortrait
              person={partner}
              icon="denken"
              label={t('wirDesign.rhythm.partnerToday')}
            />
          </>
        ) : null}
      </div>
      {overlay}
      {duration ? (
        <Link
          className="rhythm-duration"
          to="/more/profile#relationship-profile-title"
        >
          <EimirIcon name="jahrestag" />
          {duration}
          <EimirIcon name="chevron-right" />
        </Link>
      ) : null}
    </div>
  );
}
