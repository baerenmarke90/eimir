import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { personInitials } from './PersonIdentity';
import './PartnerAvatarPair.css';

export interface PartnerAvatarPerson {
  displayName: string;
  imageUrl?: string | null;
}

export type PartnerAvatarSize = 'small' | 'medium' | 'large';
export type PartnerPresenceStatus = 'active' | 'recent' | 'waiting' | 'unknown';

export interface PartnerAvatarPairProps {
  primaryPerson: PartnerAvatarPerson;
  secondaryPerson?: PartnerAvatarPerson | null;
  size?: PartnerAvatarSize;
  status?: PartnerPresenceStatus;
  statusLabel?: string;
  className?: string;
  onInviteClick?: () => void;
}

function SingleAvatar({
  person,
  size,
  className = '',
}: {
  person: PartnerAvatarPerson;
  size: PartnerAvatarSize;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initials = useMemo(
    () => personInitials(person.displayName),
    [person.displayName],
  );
  const imageUrl = person.imageUrl;
  const hasValidImage = Boolean(imageUrl) && !failed;

  return (
    <span
      className={`partner-avatar partner-avatar-${size} ${className}`}
      title={person.displayName}
    >
      {hasValidImage && imageUrl ? (
        <img
          src={imageUrl}
          alt={person.displayName}
          className="partner-avatar-img"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="partner-avatar-initials" aria-hidden="true">
          {initials}
        </span>
      )}
    </span>
  );
}

export function PartnerAvatarPair({
  primaryPerson,
  secondaryPerson = null,
  size = 'medium',
  status = 'unknown',
  statusLabel,
  className = '',
  onInviteClick,
}: PartnerAvatarPairProps) {
  const { t } = useTranslation();
  const groupLabel = useMemo(() => {
    if (secondaryPerson) {
      return t('partnerAvatarConnected')
        .replace('{{user}}', primaryPerson.displayName)
        .replace('{{partner}}', secondaryPerson.displayName);
    }
    return t('partnerAvatarWaiting').replace(
      '{{user}}',
      primaryPerson.displayName,
    );
  }, [primaryPerson.displayName, secondaryPerson, t]);

  return (
    <section
      className={`partner-avatar-pair partner-avatar-pair-${size} status-${status} ${className}`}
      aria-label={groupLabel}
    >
      <div className="partner-avatar-stack">
        <SingleAvatar
          person={primaryPerson}
          size={size}
          className="partner-avatar-primary"
        />

        {secondaryPerson ? (
          <SingleAvatar
            person={secondaryPerson}
            size={size}
            className="partner-avatar-secondary"
          />
        ) : (
          <button
            type="button"
            className={`partner-avatar partner-avatar-${size} partner-avatar-waiting`}
            onClick={onInviteClick}
            aria-label={t('partnerAvatarInvite')}
            title={t('partnerAvatarInvite')}
            disabled={!onInviteClick}
          >
            <span className="partner-avatar-waiting-icon" aria-hidden="true">
              +
            </span>
          </button>
        )}
      </div>

      {secondaryPerson && statusLabel ? (
        <span
          className={`partner-presence-badge status-${status}`}
          title={statusLabel}
        >
          {status === 'active' ? (
            <span
              className="partner-presence-pip partner-presence-badge-dot"
              aria-hidden="true"
            />
          ) : null}
          <span className="partner-presence-badge-label">{statusLabel}</span>
        </span>
      ) : status === 'active' ? (
        <span
          className="partner-presence-pip"
          aria-hidden="true"
          title={t('couplePresenceActive')}
        />
      ) : null}
    </section>
  );
}
