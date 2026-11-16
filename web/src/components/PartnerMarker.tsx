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
}: {
  name: string;
  role: PersonRole;
}) {
  return (
    <span className={`partner-marker person-role-${role}`} aria-hidden="true">
      {name.trim() ? personInitials(name) : '·'}
    </span>
  );
}
