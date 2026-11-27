import {
  type ComponentProps,
  createContext,
  type ReactElement,
  useCallback,
  useContext,
  useEffect,
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

/**
 * Where an Expanded page's own create action goes: the end of the top bar. The
 * shell provides the slot element; without one (no top bar) the action stays
 * where the page rendered it.
 */
export const TopbarCreateSlotContext = createContext<HTMLElement | null>(null);

/**
 * Compact: a fixed action belongs to its tab, outside the page that slides
 * under it. Expanded: it moves into the top bar while its tab is the visible
 * one (a parked tab keeps its action hidden in place).
 */
function FloatingActionPlacement({ children }: { children: ReactElement }) {
  const compact = useMediaQuery('(max-width: 839px)');
  const slot = useContext(TopbarCreateSlotContext);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [panelShown, setPanelShown] = useState(true);
  const locatePanel = useCallback((origin: HTMLSpanElement | null) => {
    setPanel(origin?.closest<HTMLElement>('.primary-tab-panel') ?? null);
  }, []);
  useEffect(() => {
    if (!panel) {
      setPanelShown(true);
      return;
    }
    const read = () =>
      setPanelShown(
        !panel.hidden && panel.getAttribute('aria-hidden') !== 'true',
      );
    read();
    const observer = new MutationObserver(read);
    observer.observe(panel, {
      attributes: true,
      attributeFilter: ['hidden', 'aria-hidden'],
    });
    return () => observer.disconnect();
  }, [panel]);
  if (compact)
    return (
      <>
        <span hidden ref={locatePanel} data-floating-create-origin />
        {panel ? createPortal(children, panel) : children}
      </>
    );
  return (
    <>
      <span
        style={{ display: 'none' }}
        ref={locatePanel}
        data-floating-create-origin
      />
      {slot ? (
        <>
          {panelShown ? createPortal(children, slot) : null}
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              blockSize: 'var(--touch-target-comfortable)',
            }}
          />
        </>
      ) : (
        children
      )}
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
