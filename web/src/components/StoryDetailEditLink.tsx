import { Link } from 'react-router-dom';
import { EditPencilIcon } from './ListEntryActions';

/**
 * Canonical edit navigation for Story and private read details. The shared
 * pencil style also serves inline edit buttons, at the trailing title edge.
 */
export function StoryDetailEditLink({
  to,
  label,
  state,
  text = false,
}: {
  to: string;
  label: string;
  state?: unknown;
  text?: boolean;
}) {
  return (
    <Link
      className="list-entry-icon-button content-edit-action story-detail-edit-link"
      to={to}
      state={state}
      aria-label={label}
      title={label}
    >
      <EditPencilIcon className="list-entry-icon" />
      {text ? <span className="story-detail-edit-label">{label}</span> : null}
    </Link>
  );
}
