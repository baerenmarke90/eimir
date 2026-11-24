import {
  type ComponentProps,
  type ReactElement,
  useCallback,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useMediaQuery } from '../client/useMediaQuery';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import './AddAction.css';

type AddActionLabel = {
  label: string;
  icon?: EimirIconName;
  pendingLabel?: string;
  pending?: boolean;
  floating?: boolean;
};

/** A fixed action belongs to its tab, outside the page that slides under it. */
function FloatingActionPlacement({ children }: { children: ReactElement }) {
  const compact = useMediaQuery('(max-width: 839px)');
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const locatePanel = useCallback((origin: HTMLSpanElement | null) => {
    setPanel(origin?.closest<HTMLElement>('.primary-tab-panel') ?? null);
  }, []);
  if (!compact) return children;
  return (
    <>
      <span hidden ref={locatePanel} data-floating-create-origin />
      {panel ? createPortal(children, panel) : children}
    </>
  );
}

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
  const button = (
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
  return floating ? (
    <FloatingActionPlacement>{button}</FloatingActionPlacement>
  ) : (
    button
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
  const link = (
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
  return floating ? (
    <FloatingActionPlacement>{link}</FloatingActionPlacement>
  ) : (
    link
  );
}
