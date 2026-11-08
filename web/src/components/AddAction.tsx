import type { ComponentProps } from 'react';
import { Link } from 'react-router-dom';
import { AddIcon } from './DestinationIcon';
import './AddAction.css';

/** Shared content also supports existing task-origin links and file labels. */
export function AddActionContent({ label }: { label: string }) {
  return (
    <>
      <AddIcon />
      <span className="add-action-label">{label}</span>
    </>
  );
}

/** One labeled add affordance; the consumer owns its action and name. */
export function AddActionButton({
  label,
  className = '',
  ...props
}: Omit<ComponentProps<'button'>, 'children'> & {
  label: string;
}) {
  return (
    <button
      type="button"
      {...props}
      className={`add-action ${className}`}
      aria-label={label}
      title={label}
    >
      <AddActionContent label={label} />
    </button>
  );
}

/** Keep navigation, modified clicks, state and focus as native link behavior. */
export function AddActionLink({
  label,
  className = '',
  ...props
}: Omit<ComponentProps<typeof Link>, 'children'> & {
  label: string;
}) {
  return (
    <Link
      {...props}
      className={`button-link add-action ${className}`}
      aria-label={label}
      title={label}
    >
      <AddActionContent label={label} />
    </Link>
  );
}
