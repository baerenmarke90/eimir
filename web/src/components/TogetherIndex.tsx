import { LayoutDestinationLink } from './LayoutDestinationLink';
import {
  type ReactNode,
  type Ref,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { PageHeader } from './PageHeader';
import { TaskBackButton } from './TaskBackButton';

import './TogetherIndex.css';
import './TogetherIndexAreas.css';
import {
  activeNavigationArea,
  appRoutePath,
  DEFAULT_APP_ROUTE,
  MORE_INSIGHTS_ROUTE,
  THREAD_ROUTE,
} from '../client/routes';
import { useShellUtilities } from '../client/shellUtilities';
import { useWirDesign, wirDesignLayout } from '../client/wirDesign';
import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import type { PartnerAvatarAction } from './PartnerAvatarPair';
import { personInitials } from './PersonIdentity';
import { UiState } from './UiState';

type Destination = {
  id: string;
  path: string;
  label: string;
  description: string;
  icon: EimirIconName;
};

const destinations: readonly Destination[] = [
  {
    id: 'today',
    path: DEFAULT_APP_ROUTE,
    label: 'navigation.today',
    description: 'wirDesign.thread.wirSummary',
    icon: 'wir',
  },
  {
    id: 'story',
    path: appRoutePath('story'),
    label: 'navigation.story',
    description: 'wirDesign.thread.storySummary',
    icon: 'momente',
  },
  {
    id: 'plan',
    path: appRoutePath('plan'),
    label: 'navigation.plan',
    description: 'wirDesign.thread.planSummary',
    icon: 'planen',
  },
  {
    id: 'shared',
    path: appRoutePath('shared'),
    label: 'navigation.shared',
    description: 'wirDesign.thread.sharedSummary',
    icon: 'listen',
  },
  {
    id: 'insights',
    path: MORE_INSIGHTS_ROUTE,
    label: 'wirDesign.thread.insights',
    description: 'wirDesign.thread.insightsSummary',
    icon: 'statistiken',
  },
  {
    id: 'games',
    path: appRoutePath('games'),
    label: 'navigation.games',
    description: 'wirDesign.thread.gamesSummary',
    icon: 'spiele',
  },
  {
    id: 'more',
    path: appRoutePath('more'),
    label: 'navigation.more',
    description: 'wirDesign.thread.moreSummary',
    icon: 'mehr',
  },
];

function containsRoute(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

function destinationIndex(pathname: string): number {
  const area =
    destinations.find(
      ({ id, path }) =>
        (id === 'insights' || id === 'games') && containsRoute(pathname, path),
    )?.id ?? activeNavigationArea(pathname);
  const index = destinations.findIndex(({ id }) => id === area);
  return index < 0 ? 0 : index;
}

export function ThreadHeader({ isPrivate }: { isPrivate: boolean }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  return (
    <header className="thread-header">
      <LayoutDestinationLink
        className="thread-mark"
        to={DEFAULT_APP_ROUTE}
        aria-label={t('navigation.today')}
      >
        eimir<span>.</span>
      </LayoutDestinationLink>
      <span className="thread-edition">{t('wirDesign.thread.name')}</span>
      {isPrivate ? (
        <span className="thread-area">
          <EimirIcon name="lock" />
          {t('privateArea.privacyLabel')}
        </span>
      ) : pathname !== THREAD_ROUTE ? (
        <span className="thread-area">
          {t(destinations[destinationIndex(pathname)].label)}
        </span>
      ) : null}
    </header>
  );
}

export function ThreadDock({
  triggerRef,
  onOpen,
}: {
  triggerRef: Ref<HTMLAnchorElement>;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { unreadCount } = useShellUtilities();
  const current = destinationIndex(pathname);
  const previous =
    destinations[(current + destinations.length - 1) % destinations.length];
  const next = destinations[(current + 1) % destinations.length];
  return (
    <nav className="thread-dock" aria-label={t('navigation.primary')}>
      <LayoutDestinationLink
        className="thread-neighbor thread-previous"
        to={previous.path}
      >
        <EimirIcon name="chevron-right" />
        <span>{t(previous.label)}</span>
      </LayoutDestinationLink>
      <Link
        className="thread-index-trigger"
        to={THREAD_ROUTE}
        state={{ threadFrom: current }}
        ref={triggerRef}
        onClick={(event) => {
          if (
            !event.defaultPrevented &&
            event.button === 0 &&
            !event.altKey &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.shiftKey
          )
            onOpen();
        }}
        data-together-index-trigger
      >
        <EimirIcon name="mehr" />
        <span>{t('wirDesign.thread.index')}</span>
        {unreadCount ? (
          <span className="notification-dot" aria-hidden="true" />
        ) : null}
      </Link>
      <LayoutDestinationLink
        className="thread-neighbor thread-next"
        to={next.path}
      >
        <span>{t(next.label)}</span>
        <EimirIcon name="chevron-right" />
      </LayoutDestinationLink>
    </nav>
  );
}

export function ThreadIndexRoute() {
  const { t } = useTranslation();
  const design = useWirDesign();
  if (design?.presentationReady === false) {
    return <UiState kind="loading" title={t('states.loading.title')} />;
  }
  return design && wirDesignLayout(design.current) === 'thread' ? (
    <ThreadIndexPage />
  ) : (
    <Navigate to={DEFAULT_APP_ROUTE} replace />
  );
}

function ThreadIndexPage() {
  const { t } = useTranslation();
  const { state } = useLocation();
  const panelRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);
  const navigate = useNavigate();
  const { unreadCount } = useShellUtilities();
  const candidate: unknown = state?.threadFrom;
  const from =
    typeof candidate === 'number' && Number.isInteger(candidate)
      ? destinations[candidate]
      : undefined;
  const returnLabel = t('wirDesign.thread.return', {
    area: t(from?.label ?? 'navigation.today'),
  });
  return (
    <section
      className="page thread-index"
      aria-labelledby="thread-index-title"
      ref={panelRef}
      tabIndex={-1}
      data-together-index-panel
    >
      <TaskBackButton
        onClick={() =>
          from
            ? void navigate(-1)
            : void navigate(DEFAULT_APP_ROUTE, { replace: true })
        }
      >
        {returnLabel}
      </TaskBackButton>
      <PageHeader
        title={t('wirDesign.thread.title')}
        titleId="thread-index-title"
      />
      <ol className="thread-index-list">
        {destinations.map((destination) => (
          <li key={destination.id}>
            <LayoutDestinationLink
              className="thread-index-entry"
              to={destination.path}
              replace={Boolean(from)}
              aria-current={
                from?.id === destination.id ? 'location' : undefined
              }
              aria-label={
                destination.id === 'more' && unreadCount
                  ? t('navigation.moreWithUnread', { count: unreadCount })
                  : undefined
              }
            >
              <span className="thread-node">
                <EimirIcon name={destination.icon} variant="filled" />
              </span>
              <span className="thread-entry-text">
                <strong>{t(destination.label)}</strong>
                <small>{t(destination.description)}</small>
              </span>
              <EimirIcon className="thread-entry-arrow" name="chevron-right" />
            </LayoutDestinationLink>
          </li>
        ))}
      </ol>
    </section>
  );
}

type ThreadPerson = {
  name: string;
  image?: string | null;
  action?: PartnerAvatarAction;
  badge?: ReactNode;
  label: string;
};

function ThreadPortrait({ person }: { person: ThreadPerson }) {
  const [failed, setFailed] = useState<string | null>(null);
  const { name, image, action, badge, label } = person;
  const portrait = (
    <>
      <span className="thread-avatar" aria-hidden="true">
        {image && image !== failed ? (
          <img src={image} alt="" onError={() => setFailed(image)} />
        ) : (
          personInitials(name)
        )}
      </span>
      <span className="thread-person-name">{name}</span>
      {action && <span className="thread-person-action">{label}</span>}
    </>
  );
  return (
    <div className="thread-person">
      {action ? (
        <button
          className="thread-portrait"
          type="button"
          ref={action.ref}
          aria-label={action.label}
          aria-haspopup={action.hasPopup}
          aria-controls={action.controls}
          aria-expanded={action.expanded}
          onClick={action.onActivate}
        >
          {portrait}
        </button>
      ) : (
        <div className="thread-portrait">{portrait}</div>
      )}
      {badge}
    </div>
  );
}

export function ThreadToday({
  own,
  partner,
  duration,
  overlay,
  day,
}: {
  own: ThreadPerson;
  partner?: ThreadPerson;
  duration?: string;
  overlay?: ReactNode;
  day?: Date | null;
}) {
  const { t } = useTranslation();
  const date = new Intl.DateTimeFormat(resolvedLocale(), {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(day ? { timeZone: 'UTC' } : {}),
  }).format(day ?? new Date());
  return (
    <section className="thread-today">
      <div className="thread-day">
        <p>{date}</p>
        <h1>{t(partner ? 'wirDesign.thread.today' : 'navigation.today')}</h1>
      </div>
      <div className="thread-people" data-paired={Boolean(partner)}>
        <ThreadPortrait person={own} />
        {partner ? <ThreadPortrait person={partner} /> : null}
      </div>
      {duration ? (
        <Link
          className="thread-duration"
          to="/more/profile#relationship-profile-title"
        >
          <EimirIcon name="jahrestag" />
          {duration}
        </Link>
      ) : null}
      {overlay}
    </section>
  );
}
