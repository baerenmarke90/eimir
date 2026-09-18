import { useTranslation } from 'react-i18next';
import './VisibilityBadge.css';

export type VisibilityType =
  | 'SPACE_SHARED'
  | 'OWNER_ONLY'
  | 'TEMPORARY_SHARED'
  | 'SHARED'
  | 'PRIVATE';

export interface VisibilityBadgeProps {
  visibility: VisibilityType;
  size?: 'small' | 'medium';
  showLabel?: boolean;
  customLabel?: string;
  className?: string;
  /**
   * 'badge' (default) is the outlined pill for places that need the status
   * to stand out. 'subtle' drops the pill chrome for quiet metadata rows
   * (e.g. beside a Story title) where the status must not compete with
   * content.
   */
  variant?: 'badge' | 'subtle';
  /**
   * A shorter visible word (e.g. "Geteilt") for tight metadata rows. The
   * accessible name (aria-label/title) always stays the full label, so
   * screen reader users still hear "Mit Partner geteilt".
   */
  compactLabel?: string;
}

function normalizeVisibility(
  visibility: VisibilityType,
): 'shared' | 'private' | 'temporary' {
  if (visibility === 'SPACE_SHARED' || visibility === 'SHARED') return 'shared';
  if (visibility === 'OWNER_ONLY' || visibility === 'PRIVATE') return 'private';
  return 'temporary';
}

/**
 * The bare visibility symbol (eimir. rings, lock or clock) without the pill.
 * Compact metadata rows reuse it where a full badge would compete with the
 * content; it is decorative, so the caller owns the accessible name.
 */
export function VisibilityGlyph({
  visibility,
}: {
  visibility: VisibilityType;
}) {
  const normalized = normalizeVisibility(visibility);
  return (
    <>
      {normalized === 'shared' ? (
        // Two people (shared with partner) - an established "shared" glyph,
        // not a link/share-action icon, so it reads as status, not a control.
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M15 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ) : normalized === 'private' ? (
        // Subtle lock icon
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 018 0v4" />
        </svg>
      ) : (
        // Hourglass / clock icon
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      )}
    </>
  );
}

export function VisibilityBadge({
  visibility,
  size = 'medium',
  showLabel = true,
  customLabel,
  className = '',
  variant = 'badge',
  compactLabel,
}: VisibilityBadgeProps) {
  const { t } = useTranslation();
  const normalized = normalizeVisibility(visibility);

  const defaultLabel =
    normalized === 'shared'
      ? t('visibilityShared')
      : normalized === 'private'
        ? t('visibilityPrivate')
        : t('visibilityTemporary');

  const label = customLabel || defaultLabel;
  const visibleText = compactLabel ?? label;

  return (
    <span
      className={`visibility-badge visibility-${normalized} visibility-size-${size} visibility-badge-${variant} ${className}`}
      role="status"
      aria-label={label}
      title={label}
    >
      <span className="visibility-badge-icon" aria-hidden="true">
        <VisibilityGlyph visibility={visibility} />
      </span>

      {showLabel && (
        <span className="visibility-badge-label">{visibleText}</span>
      )}
    </span>
  );
}
