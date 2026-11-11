import type { ComponentProps } from 'react';
import { Link } from 'react-router-dom';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import './AddAction.css';

type AddActionLabel = {
  label: string;
  icon?: EimirIconName;
  pendingLabel?: string;
  pending?: boolean;
  floating?: boolean;
};

/** Shared content also supports existing task-origin links and file labels. */
export function AddActionContent({
  label,
  icon = 'hinzufuegen',
  pendingLabel,
  pending = false,
  floating = false,
}: AddActionLabel) {
  const useFloatingPlus = floating && icon !== 'hinzufuegen';
  return (
    <>
      <EimirIcon
        name={icon}
        className={
          useFloatingPlus
            ? 'button-icon add-action-heading-icon'
            : 'button-icon'
        }
      />
      {useFloatingPlus ? (
        <EimirIcon
          name="hinzufuegen"
          className="button-icon add-action-floating-icon"
        />
      ) : null}
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
  floating = false,
  ...props
}: Omit<ComponentProps<'button'>, 'children'> & AddActionLabel) {
  const visibleLabel = pending && pendingLabel ? pendingLabel : label;
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || pending}
      className={`add-action ${className}`}
      data-floating-create={floating || undefined}
      aria-label={visibleLabel}
      aria-busy={pending || undefined}
      title={visibleLabel}
    >
      <AddActionContent
        label={label}
        icon={icon}
        pendingLabel={pendingLabel}
        pending={pending}
        floating={floating}
      />
    </button>
  );
}

/** Keep navigation, modified clicks, state and focus as native link behavior. */
export function AddActionLink({
  label,
  icon,
  className = '',
  floating = false,
  ...props
}: Omit<ComponentProps<typeof Link>, 'children'> &
  Pick<AddActionLabel, 'label' | 'icon' | 'floating'>) {
  return (
    <Link
      {...props}
      className={`button-link add-action ${className}`}
      data-floating-create={floating || undefined}
      aria-label={label}
      title={label}
    >
      <AddActionContent label={label} icon={icon} floating={floating} />
    </Link>
  );
}
