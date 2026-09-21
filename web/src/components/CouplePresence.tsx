import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  PartnerAvatarPair,
  type PartnerAvatarPerson,
  type PartnerPresenceStatus,
} from './PartnerAvatarPair';
import { firstNameFromDisplayName } from '../client/personalName';
import { useTranslation } from 'react-i18next';
import './CouplePresence.css';

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
  actions,
  headingLevel = 'h2',
  className = '',
}: CouplePresenceProps) {
  const { t } = useTranslation();
  const generatedId = useId();
  const titleId = `couple-presence-title-${generatedId}`;

  const defaultStatusText =
    status === 'active'
      ? t('couplePresenceActive')
      : status === 'recent'
        ? t('couplePresenceRecent')
        : status === 'waiting'
          ? t('couplePresenceWaiting')
          : null;
  const resolvedStatusText = statusText ?? defaultStatusText;

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
            size="large"
            onInviteClick={onInviteClick}
          />
          {avatarAdornment ? (
            <div className="couple-presence-avatar-adornment">
              {avatarAdornment}
            </div>
          ) : null}
        </div>

        <div className="couple-presence-details">
          <HeadingTag id={titleId} className="couple-presence-title">
            {presenceTitle}
          </HeadingTag>

          <div className="couple-presence-meta">
            {resolvedStatusText ? (
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
                {resolvedStatusText ? (
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
        </div>
      </div>

      {actions && <div className="couple-presence-actions">{actions}</div>}
    </section>
  );
}
