import { type ReactNode, useCallback, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  PRIVATE_AREA_ROOT_PATH,
  PRIVATE_COLLECTIONS_PATH,
  PRIVATE_GIFT_IDEAS_PATH,
  PRIVATE_NOTES_PATH,
} from '../client/privateArea';
import { appRoutePath } from '../client/routes';
import { useTaskOrigin } from '../client/taskOrigin';
import { useTaskEditorLifecycle } from '../client/useTaskEditorLifecycle';
import { useTranslation } from '../i18n';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet } from './ShortTaskSheet';

export function PrivateAreaFrame({
  children,
  showNavigation = true,
}: {
  children: ReactNode;
  showNavigation?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="page private-area-page">
      <section
        className="private-area-context"
        aria-label={t('privateArea.privacyLabel')}
      >
        <div className="private-area-header-info">
          <h1 className="private-area-title-row">
            <svg
              className="private-area-lock-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2Zm-7-2a2 2 0 1 1 4 0v2h-4V7Zm7 12H7v-8h10v8Z" />
            </svg>
            {t('privateArea.eyebrow')}
          </h1>
          <p className="private-area-intro-text">{t('privateArea.intro')}</p>
        </div>
      </section>
      {showNavigation ? (
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
        </nav>
      ) : null}
      {children}
    </div>
  );
}

export function PrivateAreaBackToHub() {
  const { t } = useTranslation();
  return (
    <Link className="back-link" to={PRIVATE_AREA_ROOT_PATH}>
      {t('privateArea.backToHub')}
    </Link>
  );
}

export function usePrivateAreaTaskContext(fallbackPath: string) {
  const location = useLocation();
  const { resolveOrigin, requestReturn } = useTaskOrigin();
  const taskOriginKey = (
    location.state as { taskOriginKey?: unknown } | null
  )?.taskOriginKey;
  const origin = resolveOrigin(taskOriginKey);
  const navigationState =
    origin && typeof taskOriginKey === 'string' ? { taskOriginKey } : undefined;
  const returnToOrigin = useCallback(
    () => requestReturn(taskOriginKey, fallbackPath),
    [fallbackPath, requestReturn, taskOriginKey],
  );

  return { navigationState, origin, returnToOrigin, taskOriginKey };
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
  const navigate = useNavigate();
  const taskContext = usePrivateAreaTaskContext(fallbackPath);
  const closeToDetail = useCallback(() => {
    void navigate(fallbackPath, {
      replace: true,
      state: taskContext.navigationState,
    });
  }, [fallbackPath, navigate, taskContext.navigationState]);
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
  const { origin, returnToOrigin } = usePrivateAreaTaskContext(fallbackPath);
  if (!origin) {
    return (
      <Link className="back-link" to={fallbackPath}>
        {fallbackLabel}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className="back-link tertiary"
      onClick={returnToOrigin}
    >
      {origin.to === '/search'
        ? t('privateArea.backToSearch')
        : t('privateArea.backToOrigin')}
    </button>
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
  return (
    <ShortTaskSheet
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
        <button type="button" onClick={onDiscard}>
          {t('taskBoundary.discard')}
        </button>
      </div>
    </ShortTaskSheet>
  );
}

export function PrivateAreaBackToMore() {
  const { t } = useTranslation();
  return (
    <Link className="back-link" to={appRoutePath('more')}>
      {t('privateArea.backToMore')}
    </Link>
  );
}

export function DeleteConfirmation({
  onDelete,
  pending,
  error,
}: {
  onDelete: () => void;
  pending: boolean;
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
            <button type="button" onClick={onDelete} disabled={pending}>
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

export function LoadMoreButton({
  hasMore,
  loading,
  onLoadMore,
}: {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}) {
  const { t } = useTranslation();
  if (!hasMore) return null;
  return (
    <button
      type="button"
      className="secondary"
      onClick={onLoadMore}
      disabled={loading}
    >
      {loading ? t('privateArea.loadingMore') : t('privateArea.loadMore')}
    </button>
  );
}
