import {
  type ComponentProps,
  createContext,
  type MouseEvent,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { createPath, Link } from 'react-router-dom';
import { previousEntryIs, useReturnTo } from '../client/historyEntries';
import { useTranslation } from '../i18n';
import './SubpageNavigation.css';

/** The shell owns placement; each task retains its safe exit handler. */
export const TaskBackSlotContext = createContext<{
  slot: HTMLElement | null;
  register: () => () => void;
  /** A page heading offers its leading cell; the first one in the document wins. */
  registerHost?: (host: HTMLElement) => () => void;
  showBackLabel?: boolean;
} | null>(null);

/** True inside a secondary destination, where the shell supplies Back. */
export function useSecondaryPage(): boolean {
  return useContext(TaskBackSlotContext) !== null;
}

/**
 * The leading cell of a secondary page's header row. Back renders here instead
 * of in a separate shell row; it stays empty when another heading hosts Back.
 */
export function BackSlotHost({ className = '' }: { className?: string }) {
  const registerHost = useContext(TaskBackSlotContext)?.registerHost;
  const [host, setHost] = useState<HTMLSpanElement | null>(null);
  useLayoutEffect(
    () => (host && registerHost ? registerHost(host) : undefined),
    [host, registerHost],
  );
  if (!registerHost) return null;
  return (
    <span ref={setHost} className={`page-back-host ${className}`.trim()} />
  );
}

function BackLabel({ children }: { children: ReactNode }) {
  const showBackLabel = useContext(TaskBackSlotContext)?.showBackLabel;
  if (showBackLabel) {
    return <span className="task-back-label">{children}</span>;
  }
  return (
    <>
      <svg
        className="inline-icon"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <path d="m14 5-7 7 7 7" />
      </svg>
      <span className="sr-only">{children}</span>
    </>
  );
}

function PlaceBackControl({
  children,
  inline = false,
}: {
  children: ReactNode;
  inline?: boolean;
}) {
  const placement = useContext(TaskBackSlotContext);
  const register = placement?.register;
  useLayoutEffect(() => register?.(), [register]);
  if (!placement || inline) return children;
  return placement.slot ? createPortal(children, placement.slot) : null;
}

export function TaskBackButton({
  children,
  className = '',
  shellDefault = false,
  inline = false,
  ...props
}: ComponentProps<'button'> & { shellDefault?: boolean; inline?: boolean }) {
  const { t } = useTranslation();
  const label = children ?? t('taskBoundary.back');
  const button = (
    <button
      type="button"
      title={typeof label === 'string' ? label : t('taskBoundary.back')}
      className={`back-link task-back-control tertiary ${className}`}
      data-page-back={shellDefault ? undefined : ''}
      data-default-back={shellDefault ? '' : undefined}
      {...props}
    >
      <BackLabel>{label}</BackLabel>
    </button>
  );
  return shellDefault ? (
    button
  ) : (
    <PlaceBackControl inline={inline}>{button}</PlaceBackControl>
  );
}

function isPlainActivation(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/** Preserve link semantics, modified clicks and existing editor guards. */
export function TaskBackLink({
  children,
  className = '',
  inline = false,
  onClick,
  ...props
}: ComponentProps<typeof Link> & { inline?: boolean }) {
  const { t } = useTranslation();
  const returnTo = useReturnTo();
  const label = children ?? t('taskBoundary.back');
  return (
    <PlaceBackControl inline={inline}>
      <Link
        title={typeof label === 'string' ? label : t('taskBoundary.back')}
        className={`back-link task-back-control ${className}`}
        data-page-back=""
        {...props}
        onClick={(event) => {
          onClick?.(event);
          if (!isPlainActivation(event) || !previousEntryIs(props.to)) return;
          // The parent is the entry directly below: return to it instead of
          // stacking a second copy that system Back would show again.
          event.preventDefault();
          const { state } = props;
          returnTo(
            typeof props.to === 'string' ? props.to : createPath(props.to),
            state && typeof state === 'object'
              ? { restoredState: state as Record<string, unknown> }
              : undefined,
          );
        }}
      >
        <BackLabel>{label}</BackLabel>
      </Link>
    </PlaceBackControl>
  );
}
