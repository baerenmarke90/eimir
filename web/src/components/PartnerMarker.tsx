import { useState } from 'react';
import type { PersonRole } from '../client/personColours';
import { personInitials } from './PersonIdentity';
import './PartnerMarker.css';

/**
 * A person's initials on their colour (#1808, personal pairs since 2026-11-16). It is decoration for
 * sighted users: the person is always named in text next to it, so the colour
 * and the letters never carry the meaning alone.
 */
export function PartnerMarker({
  name,
  role,
  imageUrl = null,
}: {
  name: string;
  role: PersonRole;
  /** The person's profile picture; the initials stay as the fallback. */
  imageUrl?: string | null;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(imageUrl) && imageUrl !== failedUrl;
  return (
    <span
      className={`partner-marker person-role-${role}${showImage ? ' has-image' : ''}`}
      aria-hidden="true"
    >
      {showImage && imageUrl ? (
        <img
          className="partner-marker-image"
          src={imageUrl}
          alt=""
          draggable={false}
          onError={() => setFailedUrl(imageUrl)}
        />
      ) : name.trim() ? (
        personInitials(name)
      ) : (
        '·'
      )}
    </span>
  );
}
