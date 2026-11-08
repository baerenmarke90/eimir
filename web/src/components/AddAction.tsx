import type { ComponentProps } from 'react';
import { Link } from 'react-router-dom';
import { AddIcon } from './DestinationIcon';
import './AddAction.css';

type AddActionLabel = {
  label: string;
  pendingLabel?: string;
  pending?: boolean;
};

/** Shared content also supports existing task-origin links and file labels. */
export function AddActionContent({
  label,
  pendingLabel,
  pending = false,
}: AddActionLabel) {
  return (
    <>
      <AddIcon />
      <span
        className="add-action-label"
        data-idle-label={pendingLabel ? label : undefined}
        data-pending-label={pendingLabel}
      >
        <span>{pending && pendingLabel ? pendingLabel : label}</span>
      </span>
    </>
  );
}

/** One labeled add affordance; the consumer owns its action and name. */
export function AddActionButton({
  label,
  pendingLabel,
  pending = false,
  disabled,
  className = '',
  ...props
}: Omit<ComponentProps<'button'>, 'children'> & AddActionLabel) {
  const visibleLabel = pending && pendingLabel ? pendingLabel : label;
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || pending}
      className={`add-action ${className}`}
      aria-label={visibleLabel}
      aria-busy={pending || undefined}
      title={visibleLabel}
    >
      <AddActionContent
        label={label}
        pendingLabel={pendingLabel}
        pending={pending}
      />
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
