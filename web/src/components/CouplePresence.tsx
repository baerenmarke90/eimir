import { useId, type ReactNode, type Ref } from 'react';
import { Link } from 'react-router-dom';
import {
  PartnerAvatarPair,
  type PartnerAvatarPerson,
  type PartnerAvatarSize,
  type PartnerPresenceStatus,
} from './PartnerAvatarPair';
import { firstNameFromDisplayName } from '../client/personalName';
import { useTranslation } from 'react-i18next';
import './CouplePresence.css';

export interface CouplePresenceAvatarAction {
  onActivate: () => void;
  label: string;
  ref?: Ref<HTMLButtonElement>;
  expanded?: boolean;
  controls?: string;
}

export interface CouplePresenceProps {
  spaceTitle: string;
  primaryPerson: PartnerAvatarPerson;
  secondaryPerson?: PartnerAvatarPerson | null;
  status?: PartnerPresenceStatus;
  statusText?: string;
  relationshipDuration?: string;
  durationLinkTo?: string;
  durationTitle?: string;
  onDurationClick?: () => void;
  onInviteClick?: () => void;
  avatarAdornment?: ReactNode;
  avatarOverlay?: ReactNode;
  avatarSize?: PartnerAvatarSize;
  avatarAction?: CouplePresenceAvatarAction;
  actions?: ReactNode;
  headingLevel?: 'h1' | 'h2';
  className?: string;
}

export function CouplePresence({
  spaceTitle,
  primaryPerson,
  secondaryPerson = null,
  status = 'unknown',
  statusText,
  relationshipDuration,
  durationLinkTo,
  durationTitle,
  onDurationClick,
  onInviteClick,
  avatarAdornment,
  avatarOverlay,
  avatarSize = 'large',
  avatarAction,
  actions,
  headingLevel = 'h2',
  className = '',
}: CouplePresenceProps) {
  const { t } = useTranslation();
  const generatedId = useId();
  const titleId = `couple-presence-title-${generatedId}`;

  const primaryFirstName = firstNameFromDisplayName(
    primaryPerson.displayName,
    t('couplePresenceYouFallback'),
  );
  const secondaryFirstName = secondaryPerson
    ? firstNameFromDisplayName(
        secondaryPerson.displayName,
        t('couplePresencePartnerFallback'),
      )
    : null;

  const defaultStatusText =
    status === 'active'
      ? secondaryFirstName
        ? t('couplePresencePartnerActive', { name: secondaryFirstName })
        : t('couplePresenceActive')
      : status === 'recent'
        ? secondaryFirstName
          ? t('couplePresencePartnerRecent', { name: secondaryFirstName })
          : t('couplePresenceRecent')
        : status === 'waiting'
          ? t('couplePresenceWaiting')
          : null;
  const resolvedStatusText = statusText ?? defaultStatusText;
  const presenceTitle = secondaryFirstName
    ? `${primaryFirstName} & ${secondaryFirstName}`
    : spaceTitle;
  const heroPrimaryPerson = {
    ...primaryPerson,
    displayName: primaryFirstName,
  };
  const heroSecondaryPerson = secondaryPerson
    ? {
        ...secondaryPerson,
        displayName: secondaryFirstName || t('couplePresencePartnerFallback'),
      }
    : null;
  const showStatusInMeta = Boolean(resolvedStatusText && !secondaryPerson);

  const HeadingTag = headingLevel;

  return (
    <section
      className={`couple-presence-card ${className}`}
      aria-labelledby={titleId}
    >
      <div className="couple-presence-main">
        <div
          className={`couple-presence-avatar-anchor${avatarAdornment ? ' has-adornment' : ''}`}
        >
          <PartnerAvatarPair
            primaryPerson={heroPrimaryPerson}
            secondaryPerson={heroSecondaryPerson}
            status={status}
            statusLabel={
              secondaryPerson ? (resolvedStatusText ?? undefined) : undefined
            }
            size={avatarSize}
            onInviteClick={onInviteClick}
            onActivate={avatarAction?.onActivate}
            actionLabel={avatarAction?.label}
            actionRef={avatarAction?.ref}
            actionExpanded={avatarAction?.expanded}
            actionControls={avatarAction?.controls}
          />
          {avatarAdornment ? (
            <div className="couple-presence-avatar-adornment">
              {avatarAdornment}
            </div>
          ) : null}
          {avatarOverlay}
        </div>

        <div className="couple-presence-details">
          <HeadingTag id={titleId} className="couple-presence-title">
            {presenceTitle}
          </HeadingTag>

          <div className="couple-presence-meta">
            {showStatusInMeta ? (
              <span className={`couple-presence-indicator status-${status}`}>
                {(status === 'active' || status === 'waiting') && (
                  <span className="couple-presence-dot" aria-hidden="true" />
                )}
                <span className="couple-presence-status-text">
                  {resolvedStatusText}
                </span>
              </span>
            ) : null}

            {relationshipDuration && (
              <>
                {showStatusInMeta ? (
                  <span
                    className="couple-presence-separator"
                    aria-hidden="true"
                  >
                    ·
                  </span>
                ) : null}
                {durationLinkTo ? (
                  <Link
                    to={durationLinkTo}
                    className="couple-presence-duration-btn today-hero-duration-link"
                    title={durationTitle || t('couplePresenceDurationAction')}
                  >
                    <span className="today-hero-pill-icon" aria-hidden="true">
                      <svg
                        viewBox="0 0 24 24"
                        width="12"
                        height="12"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M12 2l2.4 7.4h7.6l-6.1 4.5 2.3 7.1-6.2-4.5-6.2 4.5 2.3-7.1-6.1-4.5h7.6z" />
                      </svg>
                    </span>
                    <span>{relationshipDuration}</span>
                  </Link>
                ) : onDurationClick ? (
                  <button
                    type="button"
                    className="couple-presence-duration-btn"
                    onClick={onDurationClick}
                    title={durationTitle || t('couplePresenceDurationAction')}
                  >
                    {relationshipDuration}
                  </button>
                ) : (
                  <span className="couple-presence-duration-text">
                    {relationshipDuration}
                  </span>
                )}
              </>
            )}
          </div>

          {actions ? (
            <div className="couple-presence-actions">{actions}</div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
