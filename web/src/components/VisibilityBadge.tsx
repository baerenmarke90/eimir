import { useTranslation } from 'react-i18next';
import { EimirIcon, type EimirIconName } from './EimirIcon';
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
   * A shorter visible label for tight metadata rows. The accessible
   * name (aria-label/title) always stays the full label, so screen reader
   * users still hear the full sharing status.
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

const VISIBILITY_ICONS: Record<
  ReturnType<typeof normalizeVisibility>,
  EimirIconName
> = {
  shared: 'gemeinsam',
  private: 'lock',
  temporary: 'aktivitaet',
};

/** The metadata, pill or control supplies the visibility label. */
export function VisibilityGlyph({
  visibility,
}: {
  visibility: VisibilityType;
}) {
  return (
    <EimirIcon
      name={VISIBILITY_ICONS[normalizeVisibility(visibility)]}
      className="visibility-glyph"
    />
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
