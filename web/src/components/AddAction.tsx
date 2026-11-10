import type { ComponentProps } from 'react';
import { Link } from 'react-router-dom';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import './AddAction.css';

type AddActionLabel = {
  label: string;
  icon?: EimirIconName;
  pendingLabel?: string;
  pending?: boolean;
};

/** Shared content also supports existing task-origin links and file labels. */
export function AddActionContent({
  label,
  icon = 'hinzufuegen',
  pendingLabel,
  pending = false,
}: AddActionLabel) {
  return (
    <>
      <EimirIcon name={icon} className="button-icon" />
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
  icon,
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
        icon={icon}
        pendingLabel={pendingLabel}
        pending={pending}
      />
    </button>
  );
}

/** Keep navigation, modified clicks, state and focus as native link behavior. */
export function AddActionLink({
  label,
  icon,
  className = '',
  ...props
}: Omit<ComponentProps<typeof Link>, 'children'> &
  Pick<AddActionLabel, 'label' | 'icon'>) {
  return (
    <Link
      {...props}
      className={`button-link add-action ${className}`}
      aria-label={label}
      title={label}
    >
      <AddActionContent label={label} icon={icon} />
    </Link>
  );
}
