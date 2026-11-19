import { type ReactNode, useCallback, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useReturnTo } from '../client/historyEntries';
import {
  PRIVATE_AREA_ROOT_PATH,
  PRIVATE_COLLECTIONS_PATH,
  PRIVATE_GIFT_IDEAS_PATH,
  PRIVATE_NOTES_PATH,
  PRIVATE_PARTNER_NOTES_PATH,
} from '../client/privateArea';
import { useTaskOrigin } from '../client/taskOrigin';
import { useTaskEditorLifecycle } from '../client/useTaskEditorLifecycle';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import {
  ItemDeleteSheet,
  ItemMenuOption,
  ItemMenuSheet,
  ItemMenuTrigger,
  leaveItemMenu,
} from './ItemActions';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import { BackSlotHost, TaskBackButton, TaskBackLink } from './TaskBackButton';

export function PrivateAreaFrame({
  children,
  editorFirst = false,
  itemFirst = false,
}: {
  children: ReactNode;
  editorFirst?: boolean;
  /** One note, list or gift idea: its own header row leads; no card or tabs. */
  itemFirst?: boolean;
}) {
  const { t } = useTranslation();
  const navigation = itemFirst ? null : (
    <nav
      className="private-area-nav"
      aria-label={t('privateArea.navigation.aria')}
    >
      <NavLink to={PRIVATE_NOTES_PATH}>
        {t('privateArea.navigation.notes')}
      </NavLink>
      <NavLink to={PRIVATE_GIFT_IDEAS_PATH}>
        {t('privateArea.navigation.gifts')}
      </NavLink>
      <NavLink to={PRIVATE_COLLECTIONS_PATH}>
        {t('privateArea.navigation.collections')}
      </NavLink>
      <NavLink to={PRIVATE_PARTNER_NOTES_PATH}>
        {t('privateArea.partnerNotes.shortTitle')}
      </NavLink>
    </nav>
  );
  return (
    <div className="page private-area-page">
      {editorFirst || itemFirst ? null : (
        // Back sits beside the area card, the page's title (#1907 C4).
        <div className="private-area-head">
          <BackSlotHost className="private-area-back" />
          <section
            className="private-area-context"
            aria-label={t('privateArea.privacyLabel')}
          >
            <div className="private-area-header-info">
              <h1 className="private-area-title-row">
                <EimirIcon name="nurfuer" className="private-area-lock-icon" />
                {t('privateArea.eyebrow')}
              </h1>
              <p className="private-area-intro-text">
                {t('privateArea.intro')}
              </p>
            </div>
          </section>
        </div>
      )}
      {!editorFirst && navigation}
      {children}
      {editorFirst && navigation}
    </div>
  );
}

export function usePrivateAreaTaskContext(fallbackPath: string) {
  const location = useLocation();
  const { resolveOrigin, requestReturn } = useTaskOrigin();
  const taskOriginKey = (location.state as { taskOriginKey?: unknown } | null)
    ?.taskOriginKey;
  const origin = resolveOrigin(taskOriginKey);
  const navigationState =
    origin && typeof taskOriginKey === 'string' ? { taskOriginKey } : undefined;
  const returnToOrigin = useCallback(
    () => requestReturn(taskOriginKey, fallbackPath),
    [fallbackPath, requestReturn, taskOriginKey],
  );

  return {
    navigationState,
    origin,
    fromOverview: origin?.to === PRIVATE_AREA_ROOT_PATH,
    returnToOrigin,
    taskOriginKey,
  };
}

export function usePrivateTaskEditorLifecycle({
  fallbackPath,
  isDirty,
  isCloseBlocked = false,
  closeToFallback = false,
}: {
  fallbackPath: string;
  isDirty: boolean;
  isCloseBlocked?: boolean;
  closeToFallback?: boolean;
}) {
  const returnTo = useReturnTo();
  const taskContext = usePrivateAreaTaskContext(fallbackPath);
  const closeToDetail = useCallback(() => {
    returnTo(fallbackPath, { state: taskContext.navigationState });
  }, [fallbackPath, returnTo, taskContext.navigationState]);
  const lifecycle = useTaskEditorLifecycle({
    isDirty,
    isCloseBlocked,
    onClose: closeToFallback ? closeToDetail : taskContext.returnToOrigin,
  });
  return { ...taskContext, ...lifecycle };
}

export function PrivateAreaDetailBack({
  fallbackPath,
  fallbackLabel,
}: {
  fallbackPath: string;
  fallbackLabel: string;
}) {
  const { t } = useTranslation();
  const { origin, fromOverview, returnToOrigin } =
    usePrivateAreaTaskContext(fallbackPath);
  if (!origin) {
    return <TaskBackLink to={fallbackPath}>{fallbackLabel}</TaskBackLink>;
  }
  const backLabel = fromOverview
    ? 'privateArea.backToHub'
    : 'privateArea.backToOrigin';
  return (
    <TaskBackButton type="button" onClick={returnToOrigin}>
      {origin.to === '/search' ? t('privateArea.backToSearch') : t(backLabel)}
    </TaskBackButton>
  );
}

export function PrivateEditorDiscardSheet({
  open,
  onKeep,
  onDiscard,
}: {
  open: boolean;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  const sheetRef = useRef<ShortTaskSheetHandle>(null);
  return (
    <ShortTaskSheet
      ref={sheetRef}
      open={open}
      role="alertdialog"
      title={t('taskBoundary.discardTitle')}
      onClose={onKeep}
    >
      <p>{t('taskBoundary.discardBody')}</p>
      <div className="form-actions">
        <button type="button" className="secondary" onClick={onKeep}>
          {t('taskBoundary.keepEditing')}
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => sheetRef.current?.closeForNavigation(onDiscard)}
        >
          {t('taskBoundary.discard')}
        </button>
      </div>
    </ShortTaskSheet>
  );
}

/**
 * State of the item-actions menu of one private item (note, gift idea or
 * list): the three-dot sheet, the delete confirmation and their focus anchors.
 * Call it before any early return of the detail page.
 */
export function usePrivateItemMenu() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const deleteSheet = useRef<ShortTaskSheetHandle>(null);
  const menuSheet = useRef<ShortTaskSheetHandle>(null);
  return {
    menuOpen,
    setMenuOpen,
    deleteOpen,
    setDeleteOpen,
    trigger,
    deleteSheet,
    menuSheet,
  };
}

export type PrivateItemMenu = ReturnType<typeof usePrivateItemMenu>;

/** The three-dot button of a private item, named after the item. */
export function PrivateItemMenuTrigger({
  menu,
  name,
}: {
  menu: PrivateItemMenu;
  name: string;
}) {
  const { t } = useTranslation();
  return (
    <ItemMenuTrigger
      triggerRef={menu.trigger}
      label={t('privateArea.menuLabel', { name })}
      open={menu.menuOpen}
      onOpen={() => menu.setMenuOpen(true)}
    />
  );
}

/**
 * The sheets behind the trigger: Edit first (when allowed), Delete last (when
 * allowed) with its confirmation. Neither belongs to the editor itself.
 */
export function PrivateItemMenuSheets({
  menu,
  title,
  canEdit,
  canDelete,
  onEdit,
  disabled = false,
  deletePending,
  deleteError,
  onDeleteRequested,
  onConfirmDelete,
}: {
  menu: PrivateItemMenu;
  title: string;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  disabled?: boolean;
  deletePending: boolean;
  deleteError: unknown;
  /** Lets the page clear an earlier delete error before the confirmation. */
  onDeleteRequested: () => void;
  onConfirmDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <ItemMenuSheet
        open={menu.menuOpen}
        title={title}
        restoreFocusRef={menu.trigger}
        sheetRef={menu.menuSheet}
        onClose={() => menu.setMenuOpen(false)}
      >
        {canEdit ? (
          <ItemMenuOption
            icon="pen"
            title={t('privateArea.edit')}
            disabled={disabled}
            onClick={() =>
              leaveItemMenu(menu.menuSheet, onEdit, () =>
                menu.setMenuOpen(false),
              )
            }
          />
        ) : null}
        {canDelete ? (
          <ItemMenuOption
            icon="trash"
            danger
            title={t('privateArea.delete')}
            disabled={disabled}
            onClick={() => {
              menu.setMenuOpen(false);
              onDeleteRequested();
              menu.setDeleteOpen(true);
            }}
          />
        ) : null}
      </ItemMenuSheet>
      <ItemDeleteSheet
        sheetRef={menu.deleteSheet}
        open={menu.deleteOpen}
        title={t('privateArea.deleteConfirmTitle')}
        body={t('privateArea.deleteConfirmBody')}
        confirmLabel={t('privateArea.deleteConfirm')}
        pendingLabel={t('privateArea.deleting')}
        pending={deletePending}
        error={deleteError}
        restoreFocusRef={menu.trigger}
        onClose={() => menu.setDeleteOpen(false)}
        onConfirm={onConfirmDelete}
      />
    </>
  );
}

/** The type label of one private item, marked with the area lock. */
export function PrivateItemLabel({ children }: { children: ReactNode }) {
  return (
    <>
      <EimirIcon name="nurfuer" className="private-item-lock-icon" />
      {children}
    </>
  );
}

/** The quiet privacy line below a private item's name. */
export function PrivateItemPrivacy() {
  const { t } = useTranslation();
  return (
    <p className="private-item-privacy">{t('privateArea.entry.privacy')}</p>
  );
}
