import { type ReactNode, type Ref, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { personInitials } from './PersonIdentity';
import './PartnerAvatarPair.css';

export interface PartnerAvatarPerson {
  displayName: string;
  imageUrl?: string | null;
}

export type PartnerAvatarSize = 'small' | 'medium' | 'large' | 'hero';
export type PartnerPresenceStatus = 'active' | 'recent' | 'waiting' | 'unknown';

/** One avatar of a split pair that opens its own task (#1790 slice A). */
export interface PartnerAvatarAction {
  onActivate: () => void;
  label: string;
  ref?: Ref<HTMLButtonElement>;
  expanded?: boolean;
  controls?: string;
  hasPopup?: 'dialog' | 'menu';
}

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
  /**
   * Gives the own (primary) avatar its own tap target. With a connected
   * partner the pair then splits into two buttons instead of one shared
   * button, so each person's avatar opens that person's task.
   */
  primaryAction?: PartnerAvatarAction;
  /** Decorations anchored to the outer edge of each avatar. */
  primaryAdornment?: ReactNode;
  secondaryAdornment?: ReactNode;
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
  primaryAction,
  primaryAdornment,
  secondaryAdornment,
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

  if (secondaryPerson && primaryAction) {
    const presence =
      statusLabel && (status === 'active' || status === 'recent') ? (
        <span
          className={`partner-presence-avatar-state status-${status}`}
          aria-hidden="true"
          title={statusLabel}
        />
      ) : null;
    const secondaryContent = (
      <>
        <SingleAvatar
          person={secondaryPerson}
          size={size}
          className="partner-avatar-secondary"
        />
        {presence}
        {secondaryAdornment}
      </>
    );
    return (
      <div
        role="group"
        className={`partner-avatar-pair partner-avatar-pair-split partner-avatar-pair-${size} status-${status} ${className}`}
        aria-label={accessibleGroupLabel}
      >
        <span className="partner-avatar-stack">
          <button
            ref={primaryAction.ref}
            type="button"
            className="partner-avatar-slot partner-avatar-slot-primary"
            aria-label={primaryAction.label}
            aria-expanded={primaryAction.expanded}
            aria-controls={primaryAction.controls}
            aria-haspopup={primaryAction.hasPopup}
            onClick={primaryAction.onActivate}
          >
            <SingleAvatar
              person={primaryPerson}
              size={size}
              className="partner-avatar-primary"
            />
            {primaryAdornment}
          </button>
          {onActivate ? (
            <button
              ref={actionRef}
              type="button"
              className="partner-avatar-slot partner-avatar-slot-secondary"
              aria-label={
                actionLabel
                  ? statusLabel
                    ? `${actionLabel}. ${statusLabel}`
                    : actionLabel
                  : secondaryPerson.displayName
              }
              aria-expanded={actionExpanded}
              aria-controls={actionControls}
              aria-haspopup={actionHasPopup}
              onClick={onActivate}
            >
              {secondaryContent}
            </button>
          ) : (
            <span
              className="partner-avatar-slot partner-avatar-slot-secondary"
              role={actionLabel ? 'img' : undefined}
              aria-label={actionLabel}
            >
              {secondaryContent}
            </span>
          )}
        </span>
      </div>
    );
  }

  if (secondaryPerson && onActivate) {
    return (
      <button
        ref={actionRef}
        type="button"
        className={`partner-avatar-pair partner-avatar-pair-action partner-avatar-pair-${size} status-${status} ${className}`}
        aria-label={
          actionLabel
            ? statusLabel
              ? `${actionLabel}. ${statusLabel}`
              : actionLabel
            : accessibleGroupLabel
        }
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
