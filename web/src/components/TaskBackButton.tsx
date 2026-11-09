import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n';
import './SubpageNavigation.css';

/** The shell owns placement; each task retains its safe exit handler. */
export const TaskBackSlotContext = createContext<{
  slot: HTMLElement | null;
  register: () => () => void;
} | null>(null);

function BackGlyph({ children }: { children: ReactNode }) {
  return (
    <>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
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
      <BackGlyph>{label}</BackGlyph>
    </button>
  );
  return shellDefault ? (
    button
  ) : (
    <PlaceBackControl inline={inline}>{button}</PlaceBackControl>
  );
}

/** Preserve link semantics, modified clicks and existing editor guards. */
export function TaskBackLink({
  children,
  className = '',
  inline = false,
  ...props
}: ComponentProps<typeof Link> & { inline?: boolean }) {
  const { t } = useTranslation();
  const label = children ?? t('taskBoundary.back');
  return (
    <PlaceBackControl inline={inline}>
      <Link
        title={typeof label === 'string' ? label : t('taskBoundary.back')}
        className={`back-link task-back-control ${className}`}
        data-page-back=""
        {...props}
      >
        <BackGlyph>{label}</BackGlyph>
      </Link>
    </PlaceBackControl>
  );
}
