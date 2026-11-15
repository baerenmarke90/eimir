import { personInitials } from './PersonIdentity';
import type { PartnerTone } from '../client/sharedListSummary';
import './PartnerMarker.css';

/**
 * A person's initials on their partner colour (#1808). It is decoration for
 * sighted users: the person is always named in text next to it, so the colour
 * and the letters never carry the meaning alone.
 */
export function PartnerMarker({
  name,
  tone,
}: {
  name: string;
  tone: PartnerTone;
}) {
  return (
    <span
      className={`partner-marker partner-marker-${tone}`}
      aria-hidden="true"
    >
      {name.trim() ? personInitials(name) : '·'}
    </span>
  );
}
