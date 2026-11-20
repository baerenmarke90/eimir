import {
  type ReactNode,
  type Ref,
  useCallback,
  useMemo,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { personInitials } from './PersonIdentity';
import './PartnerAvatarPair.css';
import { isMediaShown, markMediaShown } from '../motion/mediaReveal';
import { prefersReducedMotion } from '../motion/reducedMotion';

/*
 * Avatar photos are Enter `media` (Motion Contract 4.1, M5): the layer's
 * media registry remembers, in memory only, which URLs were already shown.
 * A shown or cached photo appears at once; only the first decode of a URL in
 * this session fades in over the initials. A stale entry for a revoked object
 * URL only means one avatar skips its fade, it never shows a wrong photo.
 */

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
  /** Shown under the empty partner place while nobody has joined (#2048). */
  waitingAdornment?: ReactNode;
}

export function SingleAvatar({
  person,
  size,
  className = '',
}: {
  person: PartnerAvatarPerson;
  size: PartnerAvatarSize;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  // A photo this page already showed is in memory: an avatar that remounts
  // (its slot becomes a button once its action is known) shows it at once
  // instead of dropping back to the initials and fading the photo in again.
  const [loadedUrl, setLoadedUrl] = useState<string | null>(() =>
    person.imageUrl && isMediaShown(person.imageUrl) ? person.imageUrl : null,
  );
  // Shown at once (already shown, or decoded from the cache): no fade.
  const [instantUrl, setInstantUrl] = useState<string | null>(() =>
    person.imageUrl && isMediaShown(person.imageUrl) ? person.imageUrl : null,
  );
  const initials = useMemo(
    () => personInitials(person.displayName),
    [person.displayName],
  );
  const imageUrl = person.imageUrl;
  const hasValidImage = Boolean(imageUrl) && !failed;
  const loaded = Boolean(imageUrl) && loadedUrl === imageUrl;
  // An image already in memory may finish before React attaches onLoad.
  const detectCachedImage = useCallback(
    (image: HTMLImageElement | null) => {
      if (image?.complete && image.naturalWidth > 0 && imageUrl) {
        markMediaShown(imageUrl);
        setInstantUrl(imageUrl);
        setLoadedUrl(imageUrl);
      }
    },
    [imageUrl],
  );

  // The initials stay underneath until the photo has decoded, and the photo
  // fades in over them, so a late photo never leaves an empty circle or
  // replaces the initials in a single frame.
  return (
    <span
      className={`partner-avatar partner-avatar-${size} ${className}`}
      title={person.displayName}
    >
      {hasValidImage && imageUrl ? (
        <img
          ref={detectCachedImage}
          src={imageUrl}
          alt={person.displayName}
          className={`partner-avatar-img${loaded ? ' is-loaded' : ''}`}
          data-motion-media={
            instantUrl === imageUrl || prefersReducedMotion()
              ? 'instant'
              : undefined
          }
          onLoad={() => {
            if (isMediaShown(imageUrl)) setInstantUrl(imageUrl);
            markMediaShown(imageUrl);
            setLoadedUrl(imageUrl);
          }}
          onError={() => setFailed(true)}
        />
      ) : null}
      <span className="partner-avatar-initials" aria-hidden="true">
        {initials}
      </span>
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
  waitingAdornment,
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

  const waitingButton = (
    <button
      type="button"
      className={`partner-avatar partner-avatar-${size} partner-avatar-waiting`}
      onClick={onInviteClick}
      aria-label={t('partnerAvatarInvite')}
      title={t('partnerAvatarInvite')}
      disabled={!onInviteClick}
    >
      <span className="partner-avatar-waiting-icon" aria-hidden="true">
        {waitingAdornment ? (
          <svg
            className="partner-avatar-waiting-glyph"
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            focusable="false"
          >
            <circle cx="10" cy="8" r="3.5" />
            <path d="M3.5 19c.8-3.4 3.4-5.5 6.5-5.5 1.6 0 3 .5 4.1 1.4M18 14v6M15 17h6" />
          </svg>
        ) : (
          '+'
        )}
      </span>
    </button>
  );
  const accessibleGroupLabel = statusLabel
    ? `${groupLabel}. ${statusLabel}`
    : groupLabel;

  const content = (
    <>
      <span className="partner-avatar-stack">
        {/* Adornments such as a name belong to their portrait in every
            layout, not only while the portraits are separately tappable. */}
        {primaryAdornment ? (
          <span className="partner-avatar-slot partner-avatar-slot-primary">
            <SingleAvatar
              person={primaryPerson}
              size={size}
              className="partner-avatar-primary"
            />
            {primaryAdornment}
          </span>
        ) : (
          <SingleAvatar
            person={primaryPerson}
            size={size}
            className="partner-avatar-primary"
          />
        )}

        {secondaryPerson ? (
          secondaryAdornment ? (
            <span className="partner-avatar-slot partner-avatar-slot-secondary">
              <SingleAvatar
                person={secondaryPerson}
                size={size}
                className="partner-avatar-secondary"
              />
              {secondaryAdornment}
            </span>
          ) : (
            <SingleAvatar
              person={secondaryPerson}
              size={size}
              className="partner-avatar-secondary"
            />
          )
        ) : waitingAdornment ? (
          <span className="partner-avatar-slot partner-avatar-slot-secondary">
            {waitingButton}
            {waitingAdornment}
          </span>
        ) : (
          waitingButton
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
      <section
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
              role="img"
              aria-label={actionLabel ?? secondaryPerson.displayName}
            >
              {secondaryContent}
            </span>
          )}
        </span>
      </section>
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
