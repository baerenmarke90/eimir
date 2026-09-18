import { Link } from 'react-router-dom';
import { EditPencilIcon } from './ListEntryActions';
import './StoryDetailEditLink.css';

/**
 * The one compact edit action shared by Story detail pages (Memory,
 * Milestone, Heart Moment - #1014). Icon-only, placed beside the title via
 * PageHeader's `titleAction`, so it stays secondary to title and content
 * instead of a full-width text button between them.
 */
export function StoryDetailEditLink({
  to,
  label,
  state,
}: {
  to: string;
  label: string;
  state?: unknown;
}) {
  return (
    <Link
      className="list-entry-icon-button story-detail-edit-link"
      to={to}
      state={state}
      aria-label={label}
      title={label}
    >
      <EditPencilIcon className="list-entry-icon" />
    </Link>
  );
}
