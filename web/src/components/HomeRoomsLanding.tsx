import { LayoutDestinationLink } from './LayoutDestinationLink';
import { type ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { resolvedLocale, useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import {
  HOME_ROOMS,
  HOME_ROOMS_WIR_ROUTE,
  HomeRoomContents,
  HomeRoomEntry,
} from './HomeRoomsNavigation';
import type { PartnerAvatarAction } from './PartnerAvatarPair';
import { personInitials } from './PersonIdentity';
import { TodayDestinationLink } from './TodayDestinationLink';

type Resident = { name: string; photo?: string | null };

function HomePortrait({ resident }: { resident: Resident }) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  return (
    <span className="home-portrait">
      {resident.photo && resident.photo !== failedPhoto ? (
        <img
          src={resident.photo}
          alt=""
          onError={() => setFailedPhoto(resident.photo ?? null)}
        />
      ) : (
        personInitials(resident.name)
      )}
    </span>
  );
}

function HomePresenceButton({
  action,
  children,
}: {
  action: PartnerAvatarAction;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      ref={action.ref}
      aria-label={action.label}
      aria-controls={action.controls}
      aria-expanded={action.expanded}
      aria-haspopup={action.hasPopup}
      onClick={action.onActivate}
    >
      {children}
    </button>
  );
}

export function HomeRoomsLanding({
  own,
  partner,
  ownAction,
  partnerAction,
  overlay,
  note,
}: {
  own?: Resident;
  partner?: Resident;
  ownAction?: PartnerAvatarAction;
  partnerAction?: PartnerAvatarAction;
  overlay?: ReactNode;
  note?: { to: string; text: string; id: string };
}) {
  const { t } = useTranslation();
  const date = new Intl.DateTimeFormat(resolvedLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
  const names =
    own && partner
      ? `${own.name} ${t('wirDesign.nameJoiner')} ${partner.name}`
      : own?.name;

  return (
    <div className="home-landing">
      <div className="home-intro">
        <h1>{t('wirDesign.names.home_rooms')}</h1>
        <p>{date}</p>
      </div>
      <Link to={HOME_ROOMS_WIR_ROUTE} className="home-people">
        {own ? (
          <span className="home-portraits" aria-hidden="true">
            <HomePortrait resident={own} />
            {partner ? <HomePortrait resident={partner} /> : null}
          </span>
        ) : (
          <EimirIcon name="wir" variant="filled" />
        )}
        <span className="home-person-copy">
          {names ? (
            <>
              <span>{t('navigation.today')}</span>
              <strong>{names}</strong>
            </>
          ) : (
            <strong>{t('wirDesign.homeRooms.openWir')}</strong>
          )}
        </span>
        <EimirIcon name="chevron-right" className="home-entry-arrow" />
      </Link>
      {ownAction || partnerAction ? (
        <div className="home-access">
          {ownAction ? (
            <HomePresenceButton action={ownAction}>
              {t('wirDesign.compact.own')}
            </HomePresenceButton>
          ) : null}
          {partnerAction ? (
            <HomePresenceButton action={partnerAction}>
              {partner?.name ?? t('wirDesign.homeRooms.partner')}
            </HomePresenceButton>
          ) : null}
        </div>
      ) : null}
      {overlay}
      <div className="home-hub-content">
        <div className="home-doors">
          {HOME_ROOMS.slice(1, 3).map((room) => (
            <LayoutDestinationLink
              key={room.id}
              to={room.path}
              className="home-door"
            >
              <HomeRoomContents room={room} />
            </LayoutDestinationLink>
          ))}
        </div>
        {note ? (
          <TodayDestinationLink
            to={note.to}
            selectedKey={note.id}
            className="home-recent-item"
          >
            <HomeRoomEntry
              title={note.text}
              description={t('story.kind.heartMoment')}
              icon={<EimirIcon name="momente" variant="filled" />}
            />
          </TodayDestinationLink>
        ) : null}
        <div className="home-destinations">
          {HOME_ROOMS.slice(3).map((room) => (
            <LayoutDestinationLink
              key={room.id}
              to={room.path}
              className="home-destination"
            >
              <HomeRoomContents room={room} showDescription={false} />
            </LayoutDestinationLink>
          ))}
        </div>
      </div>
    </div>
  );
}
