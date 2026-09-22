import { type Ref, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { personInitials } from './PersonIdentity';
import './PartnerAvatarPair.css';

export interface PartnerAvatarPerson {
  displayName: string;
  imageUrl?: string | null;
}

export type PartnerAvatarSize = 'small' | 'medium' | 'large' | 'hero';
export type PartnerPresenceStatus = 'active' | 'recent' | 'waiting' | 'unknown';

export interface PartnerAvatarPairProps {
  primaryPerson: PartnerAvatarPerson;
  secondaryPerson?: PartnerAvatarPerson | null;
  size?: PartnerAvatarSize;
  status?: PartnerPresenceStatus;
  statusLabel?: string;
  className?: string;
  onInviteClick?: () => void;
  onActivate?: () => void;
  actionLabel?: string;
  actionRef?: Ref<HTMLButtonElement>;
  actionExpanded?: boolean;
  actionControls?: string;
  actionHasPopup?: 'dialog' | 'menu';
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
  onActivate,
  actionLabel,
  actionRef,
  actionExpanded,
  actionControls,
  actionHasPopup,
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
  const accessibleGroupLabel = statusLabel
    ? `${groupLabel}. ${statusLabel}`
    : groupLabel;

  const content = (
    <>
      <span className="partner-avatar-stack">
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
      </span>

      {secondaryPerson &&
      statusLabel &&
      (status === 'active' || status === 'recent') ? (
        <span
          className={`partner-presence-avatar-state status-${status}`}
          aria-hidden="true"
          title={statusLabel}
        />
      ) : status === 'active' ? (
        <span
          className="partner-presence-pip"
          aria-hidden="true"
          title={t('couplePresenceActive')}
        />
      ) : null}
    </>
  );

  if (secondaryPerson && onActivate) {
    return (
      <button
        ref={actionRef}
        type="button"
        className={`partner-avatar-pair partner-avatar-pair-action partner-avatar-pair-${size} status-${status} ${className}`}
        aria-label={actionLabel || accessibleGroupLabel}
        aria-expanded={actionExpanded}
        aria-controls={actionControls}
        aria-haspopup={actionHasPopup}
        onClick={onActivate}
      >
        {content}
      </button>
    );
  }

  return (
    <section
      className={`partner-avatar-pair partner-avatar-pair-${size} status-${status} ${className}`}
      aria-label={accessibleGroupLabel}
    >
      {content}
    </section>
  );
}
