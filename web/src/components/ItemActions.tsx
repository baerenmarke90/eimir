import type { ReactNode, RefObject } from 'react';
import { useTranslation } from '../i18n';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import { ListEntryIconButton } from './ListEntryActions';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import './ItemActions.css';

/*
 * One actions menu for every single-item detail page. The three-dot button sits
 * in the page header (PageHeader `titleAction`); its sheet lists, in this order:
 * Edit first, the page's own actions, Delete last in the danger colour. Nothing
 * else on the page edits or deletes the item, so the place is always the same.
 */

/** The three-dot button that opens the item's actions sheet. */
export function ItemMenuTrigger({
  label,
  open,
  onOpen,
  triggerRef,
}: {
  label: string;
  open: boolean;
  onOpen: () => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <ListEntryIconButton
      ref={triggerRef}
      icon="more"
      className="item-menu-trigger"
      label={label}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onOpen}
    />
  );
}

/** One row of the actions sheet: icon, bold title and an optional hint. */
export function ItemMenuOption({
  icon,
  title,
  hint,
  danger = false,
  disabled = false,
  onClick,
}: {
  icon: EimirIconName;
  title: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="item-menu-option"
      data-danger={danger || undefined}
      disabled={disabled}
      onClick={onClick}
    >
      <EimirIcon name={icon} />
      <span className="item-menu-copy">
        <strong>{title}</strong>
        {hint ? <span>{hint}</span> : null}
      </span>
    </button>
  );
}

/** The sheet that holds the rows; rows are the children. */
export function ItemMenuSheet({
  open,
  title,
  onClose,
  restoreFocusRef,
  isCloseBlocked = false,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  isCloseBlocked?: boolean;
  children: ReactNode;
}) {
  return (
    <ShortTaskSheet
      open={open}
      title={title}
      restoreFocusRef={restoreFocusRef}
      isCloseBlocked={isCloseBlocked}
      onClose={onClose}
    >
      <div className="item-menu">{children}</div>
    </ShortTaskSheet>
  );
}

/**
 * The confirmation that follows "Delete" in the menu: an alert dialog that
 * names the consequence, with Cancel and a danger confirm action.
 */
export function ItemDeleteSheet({
  open,
  title,
  body,
  confirmLabel,
  pendingLabel,
  pending,
  error,
  onConfirm,
  onClose,
  restoreFocusRef,
  sheetRef,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  pending: boolean;
  error?: unknown;
  onConfirm: () => void;
  onClose: () => void;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  /** Lets the owner close the sheet as part of navigating away after success. */
  sheetRef?: RefObject<ShortTaskSheetHandle | null>;
}) {
  const { t } = useTranslation();
  const ownRef = sheetRef;
  return (
    <ShortTaskSheet
      ref={ownRef}
      open={open}
      role="alertdialog"
      title={title}
      restoreFocusRef={restoreFocusRef}
      isCloseBlocked={pending}
      onClose={onClose}
    >
      <p>{body}</p>
      {error ? <ProblemState error={error as Error} /> : null}
      <div className="form-actions">
        <button
          type="button"
          className="secondary"
          disabled={pending}
          onClick={() => ownRef?.current?.requestClose() ?? onClose()}
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="danger"
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? pendingLabel : confirmLabel}
        </button>
      </div>
    </ShortTaskSheet>
  );
}
