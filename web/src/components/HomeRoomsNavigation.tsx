import {
  type MouseEvent,
  type ReactNode,
  type Ref,
  useId,
  useRef,
  useState,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  type AppRouteId,
  activeNavigationArea,
  appRoutePath,
  DEFAULT_APP_ROUTE,
  MORE_INSIGHTS_ROUTE,
  MORE_PROFILE_ROUTE,
} from '../client/routes';
import { useShellUtilities } from '../client/shellUtilities';
import { usePrimaryNavigation } from '../client/usePrimaryNavigation';
import { useTranslation } from '../i18n';
import { DestinationIcon } from './DestinationIcon';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import { ProMark } from './ProMark';
import { SHARED_TARGETS, useQuickCreateNavigation } from './QuickCreateMenu';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import './HomeRooms.css';
import './HomeRoomsUtilities.css';

export const HOME_ROOMS_WIR_ROUTE = '/today?view=wir';

const HOME = {
  id: 'today',
  path: DEFAULT_APP_ROUTE,
  label: 'wirDesign.names.home_rooms',
  icon: 'wir',
} as const;
type Room = {
  id: AppRouteId | 'insights';
  path: string;
  label: string;
  description?: string;
  icon: EimirIconName;
};
export const HOME_ROOMS: readonly Room[] = [
  HOME,
  {
    id: 'story',
    path: appRoutePath('story'),
    label: 'wirDesign.homeRooms.remember',
    description: 'wirDesign.homeRooms.rememberSummary',
    icon: 'momente',
  },
  {
    id: 'plan',
    path: appRoutePath('plan'),
    label: 'wirDesign.homeRooms.plans',
    description: 'wirDesign.homeRooms.plansSummary',
    icon: 'planen',
  },
  {
    id: 'insights',
    path: MORE_INSIGHTS_ROUTE,
    label: 'wirDesign.homeRooms.insights',
    description: 'wirDesign.homeRooms.insightsSummary',
    icon: 'statistiken',
  },
  {
    id: 'games',
    path: appRoutePath('games'),
    label: 'wirDesign.homeRooms.games',
    description: 'wirDesign.homeRooms.gamesSummary',
    icon: 'spiele',
  },
  {
    id: 'more',
    path: appRoutePath('more'),
    label: 'navigation.more',
    description: 'wirDesign.homeRooms.moreSummary',
    icon: 'mehr',
  },
];

function isWithin(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

function isRegularClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

export function HomeRoomEntry({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: string;
}) {
  return (
    <>
      <span className="home-entry-icon">{icon}</span>
      <span className="home-entry-copy">
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </span>
      <EimirIcon name="chevron-right" className="home-entry-arrow" />
    </>
  );
}

export function HomeRoomContents({
  room,
  showDescription = true,
}: {
  room: Room;
  showDescription?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <HomeRoomEntry
      icon={<EimirIcon name={room.icon} variant="filled" />}
      title={t(room.label)}
      description={
        showDescription && room.description ? t(room.description) : undefined
      }
    />
  );
}

function useCurrentRoom() {
  const { pathname, search } = useLocation();
  const exactRoom = HOME_ROOMS.find(
    (room) =>
      (room.id === 'games' || room.id === 'insights') &&
      isWithin(pathname, room.path),
  );
  const area = activeNavigationArea(pathname);
  return {
    room: exactRoom ?? HOME_ROOMS.find((room) => room.id === area),
    atHome:
      pathname === HOME.path &&
      new URLSearchParams(search).get('view') !== 'wir',
  };
}

export function HomeRoomsHeader({ privateArea }: { privateArea: boolean }) {
  const { t } = useTranslation();
  const { room, atHome } = useCurrentRoom();

  return (
    <header className="home-top">
      <Link to={HOME.path} className="home-brand" aria-label={t(HOME.label)}>
        eimir<span>.</span>
      </Link>
      <span className="home-location">
        {privateArea ? (
          <>
            <EimirIcon name="lock" />
            {t('privateArea.privacyLabel')}
          </>
        ) : (
          t(
            room?.id === 'today' && !atHome
              ? 'navigation.today'
              : (room?.label ?? HOME.label),
          )
        )}
      </span>
      <Link
        to={MORE_PROFILE_ROUTE}
        className="home-profile-link"
        aria-label={t('navigation.profile')}
      >
        <span>{t('wirDesign.homeRooms.profileShort')}</span>
      </Link>
    </header>
  );
}

export function HomeRoomsDock({
  canCreate,
  navigationRef,
}: {
  canCreate: boolean;
  navigationRef: Ref<HTMLElement>;
}) {
  const { t } = useTranslation();
  const { unreadCount } = useShellUtilities();
  const { room: currentRoom, atHome } = useCurrentRoom();
  const { key: locationKey } = useLocation();
  const { navigatePrimary } = usePrimaryNavigation();
  const navigate = useNavigate();
  const navigateToTarget = useQuickCreateNavigation();
  const sheetId = useId();
  const sheetRef = useRef<ShortTaskSheetHandle>(null);
  const [picker, setPicker] = useState<{
    kind: 'rooms' | 'create';
    locationKey: string;
  } | null>(null);
  const activePicker = picker?.locationKey === locationKey ? picker.kind : null;
  const hasUnread = (unreadCount ?? 0) > 0;

  function follow(event: MouseEvent<HTMLAnchorElement>, action: () => void) {
    if (!isRegularClick(event)) return;
    event.preventDefault();
    sheetRef.current?.closeForNavigation(action, { animateExit: false });
  }

  return (
    <>
      <nav
        ref={navigationRef}
        className="home-dock"
        aria-label={t('navigation.primary')}
      >
        <Link
          to={HOME.path}
          className="home-dock-link"
          aria-current={atHome ? 'page' : undefined}
        >
          <EimirIcon name="wir" variant={atHome ? 'filled' : 'outline'} />
          {t(HOME.label)}
        </Link>
        {canCreate ? (
          <button
            type="button"
            className="home-create quick-create-trigger"
            aria-label={t('wirDesign.homeRooms.create')}
            aria-haspopup="dialog"
            aria-expanded={activePicker === 'create'}
            aria-controls={activePicker === 'create' ? sheetId : undefined}
            onClick={() => setPicker({ kind: 'create', locationKey })}
          >
            <EimirIcon name="hinzufuegen" />
          </button>
        ) : null}
        <button
          type="button"
          className="home-room-toggle"
          aria-haspopup="dialog"
          aria-expanded={activePicker === 'rooms'}
          aria-controls={activePicker === 'rooms' ? sheetId : undefined}
          onClick={() => setPicker({ kind: 'rooms', locationKey })}
        >
          <span className="home-room-toggle-mark">
            <EimirIcon name="mehr" />
            {hasUnread ? (
              <span className="notification-dot" aria-hidden="true" />
            ) : null}
          </span>
          {t('wirDesign.homeRooms.rooms')}
        </button>
      </nav>
      <ShortTaskSheet
        id={sheetId}
        ref={sheetRef}
        open={activePicker !== null}
        title={t(
          picker?.kind === 'create'
            ? 'navigation.quickCreateTitle'
            : 'wirDesign.homeRooms.rooms',
        )}
        className="home-room-sheet"
        onClose={() => setPicker(null)}
      >
        {picker?.kind === 'create' ? (
          <div className="home-dialog-links">
            {SHARED_TARGETS.map((target) => (
              <Link
                key={target.id}
                className="home-dialog-entry"
                to={target.to}
                onClick={(event) =>
                  follow(event, () => navigateToTarget(target))
                }
              >
                <HomeRoomEntry
                  icon={<DestinationIcon icon={target.icon} variant="filled" />}
                  title={
                    target.id === 'only-you' ? (
                      <>
                        {t(target.labelKey)} <ProMark label="Pro" />
                      </>
                    ) : (
                      t(target.labelKey)
                    )
                  }
                  description={t(target.sublineKey)}
                />
              </Link>
            ))}
          </div>
        ) : (
          <nav
            className="home-dialog-links"
            aria-label={t('wirDesign.homeRooms.rooms')}
          >
            {HOME_ROOMS.map((room) => (
              <Link
                key={room.id}
                className="home-dialog-entry"
                to={room.path}
                aria-current={
                  currentRoom?.id === room.id && (room.id !== 'today' || atHome)
                    ? 'location'
                    : undefined
                }
                aria-label={
                  room.id === 'more' && hasUnread
                    ? t('navigation.moreWithUnread', { count: unreadCount })
                    : undefined
                }
                onClick={(event) =>
                  follow(event, () => {
                    if (
                      room.id === 'today' ||
                      room.id === 'games' ||
                      room.id === 'insights'
                    ) {
                      void navigate(room.path);
                    } else {
                      navigatePrimary(room.path);
                    }
                  })
                }
              >
                <HomeRoomContents room={room} />
              </Link>
            ))}
          </nav>
        )}
      </ShortTaskSheet>
    </>
  );
}
