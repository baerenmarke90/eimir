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
import { ProblemState } from './ProblemState';
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

export function DeleteConfirmation({
  onDelete,
  pending,
  disabled = false,
  error,
}: {
  onDelete: () => void;
  pending: boolean;
  disabled?: boolean;
  error: Error | null;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  return (
    <section
      className="private-area-danger"
      aria-label={t('privateArea.delete')}
    >
      {!confirming ? (
        <button
          type="button"
          className="secondary"
          onClick={() => setConfirming(true)}
          disabled={disabled || pending}
        >
          {t('privateArea.delete')}
        </button>
      ) : (
        <div className="private-area-delete-confirmation" role="alert">
          <div>
            <h2>{t('privateArea.deleteConfirmTitle')}</h2>
            <p>{t('privateArea.deleteConfirmBody')}</p>
          </div>
          <div className="private-area-actions">
            <button
              type="button"
              className="tertiary"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              {t('privateArea.deleteCancel')}
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={pending || disabled}
            >
              {pending
                ? t('privateArea.deleting')
                : t('privateArea.deleteConfirm')}
            </button>
          </div>
        </div>
      )}
      {error ? <ProblemState error={error} /> : null}
    </section>
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
