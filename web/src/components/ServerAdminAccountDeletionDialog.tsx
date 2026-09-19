import { type FormEvent, type KeyboardEvent, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { ServerAdminApi } from '../api/generated/apis/ServerAdminApi';
import type { ServerAdminAccountDetail } from '../api/generated/models/ServerAdminAccountDetail';
import { normalizeClientError } from '../client/problemDetails';
import { isRecentAuthRequired } from '../client/recentAuthentication';
import { useTranslation } from '../i18n';
import { ServerAdminRecentAuthModal } from './ServerAdminRecentAuthModal';
import { containModalTabFocus, useModalLifecycle } from './useModalLifecycle';
import './ServerAdminAccountDeletionDialog.css';

export interface ServerAdminAccountDeletionDialogProps {
  account: ServerAdminAccountDetail;
  api: ServerAdminApi;
  apiBaseUrl: string;
  accessToken: string;
  onSuccess: () => void;
  onClose: () => void;
}

export function ServerAdminAccountDeletionDialog({
  account,
  api,
  apiBaseUrl,
  accessToken,
  onSuccess,
  onClose,
}: ServerAdminAccountDeletionDialogProps) {
  const { t } = useTranslation();
  const [stage, setStage] = useState<1 | 2 | 3>(1);
  const [confirmationInput, setConfirmationInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const dialogRef = useRef<HTMLElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmationInputRef = useRef<HTMLInputElement>(null);

  const expectedConfirmation = account.primaryEmail
    ? `DELETE ${account.primaryEmail}`
    : `DELETE ${account.id}`;

  const isConfirmationMatching =
    confirmationInput.trim() === expectedConfirmation ||
    confirmationInput.trim() === `DELETE ${account.id}`;

  const deleteMutation = useMutation({
    mutationFn: async (confirmation: string) => {
      try {
        return await api.deleteServerAdminAccountApiV1ServerAdminAccountsAccountIdDeletionPost(
          {
            accountId: account.id,
            serverAdminAccountDeletionRequest: { confirmation },
          },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: () => {
      setErrorMessage(null);
      onSuccess();
    },
    onError: (error) => {
      if (isRecentAuthRequired(error)) {
        setStage(2);
        return;
      }
      const problem = error as { code?: string; message?: string };
      switch (problem.code) {
        case 'SERVER_ADMIN_SELF_LOCKOUT_BLOCKED':
          setErrorMessage(t('serverAdmin.accounts.deletionDialog.lockoutSelf'));
          break;
        case 'SERVER_ADMIN_LAST_ADMIN_LOCKOUT_BLOCKED':
          setErrorMessage(
            t('serverAdmin.accounts.deletionDialog.lockoutLastAdmin'),
          );
          break;
        case 'ACCOUNT_DELETION_DEMO_FORBIDDEN':
          setErrorMessage(
            t('serverAdmin.accounts.deletionDialog.demoForbidden'),
          );
          break;
        case 'SERVER_ADMIN_CONFIRMATION_MISMATCH':
          setErrorMessage(
            t('serverAdmin.accounts.deletionDialog.mismatchError'),
          );
          break;
        default:
          setErrorMessage(
            problem.message ||
              t('serverAdmin.accounts.deletionDialog.genericError'),
          );
          break;
      }
    },
  });

  const busy = deleteMutation.isPending;

  useModalLifecycle({
    active: stage !== 2,
    initialFocusRef: stage === 3 ? confirmationInputRef : cancelButtonRef,
  });

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault();
      onClose();
      return;
    }
    containModalTabFocus(event, dialogRef.current);
  }

  function handleSubmitStage3(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isConfirmationMatching || busy) return;
    setErrorMessage(null);
    deleteMutation.mutate(confirmationInput.trim());
  }

  if (stage === 2) {
    return (
      <ServerAdminRecentAuthModal
        apiBaseUrl={apiBaseUrl}
        accessToken={accessToken}
        onCancel={() => setStage(1)}
        onSuccess={() => setStage(3)}
      />
    );
  }

  return (
    <div className="server-admin-deletion-backdrop">
      <section
        ref={dialogRef}
        className="surface-panel server-admin-deletion-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="server-admin-deletion-title"
        onKeyDown={handleKeyDown}
      >
        <div className="server-admin-deletion-head">
          <div>
            <p className="eyebrow">
              {stage === 1
                ? t('serverAdmin.accounts.deletionDialog.stage1Eyebrow')
                : t('serverAdmin.accounts.deletionDialog.stage3Eyebrow')}
            </p>
            <h2 id="server-admin-deletion-title">
              {stage === 1
                ? t('serverAdmin.accounts.deletionDialog.stage1Title')
                : t('serverAdmin.accounts.deletionDialog.stage3Title')}
            </h2>
          </div>
          <button
            ref={cancelButtonRef}
            type="button"
            className="text-button"
            disabled={busy}
            onClick={onClose}
          >
            {t('serverAdmin.accounts.deletionDialog.cancel')}
          </button>
        </div>

        <div className="server-admin-deletion-target">
          <strong>{account.displayName}</strong>
          <span className="server-admin-row-meta">
            {account.primaryEmail ?? account.id}
          </span>
        </div>

        {stage === 1 ? (
          <>
            <p className="server-admin-muted">
              {t('serverAdmin.accounts.deletionDialog.stage1Intro')}
            </p>
            <ul className="server-admin-deletion-consequences">
              <li>
                {t('serverAdmin.accounts.deletionDialog.consequenceAccess')}
              </li>
              <li>
                {t('serverAdmin.accounts.deletionDialog.consequenceSessions')}
              </li>
              <li>
                {t('serverAdmin.accounts.deletionDialog.consequenceOwnerData')}
              </li>
              <li>
                {t(
                  'serverAdmin.accounts.deletionDialog.consequenceSharedHistory',
                )}
              </li>
              <li>
                {t('serverAdmin.accounts.deletionDialog.consequenceAsync')}
              </li>
              <li>
                <strong>
                  {t(
                    'serverAdmin.accounts.deletionDialog.consequenceIrreversible',
                  )}
                </strong>
              </li>
            </ul>

            <div className="server-admin-deletion-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={onClose}
              >
                {t('serverAdmin.accounts.deletionDialog.cancel')}
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => setStage(2)}
              >
                {t('serverAdmin.accounts.deletionDialog.proceedToAuth')}
              </button>
            </div>
          </>
        ) : (
          <form
            className="server-admin-deletion-form"
            onSubmit={handleSubmitStage3}
          >
            <p className="server-admin-muted">
              {t('serverAdmin.accounts.deletionDialog.stage3Instruction')}
            </p>
            <code className="server-admin-deletion-expected">
              {expectedConfirmation}
            </code>

            <label htmlFor="deletion-confirmation-input">
              <span>
                {t('serverAdmin.accounts.deletionDialog.stage3InputLabel')}
              </span>
              <input
                id="deletion-confirmation-input"
                ref={confirmationInputRef}
                type="text"
                autoComplete="off"
                disabled={busy}
                value={confirmationInput}
                onChange={(event) => setConfirmationInput(event.target.value)}
                placeholder={t(
                  'serverAdmin.accounts.deletionDialog.stage3Placeholder',
                )}
              />
            </label>

            {errorMessage ? (
              <p className="status status-error" role="alert">
                {errorMessage}
              </p>
            ) : null}

            <div className="server-admin-deletion-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => setStage(1)}
              >
                {t('serverAdmin.accounts.deletionDialog.back')}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={onClose}
              >
                {t('serverAdmin.accounts.deletionDialog.cancel')}
              </button>
              <button
                type="submit"
                className="server-admin-deletion-danger-btn"
                disabled={!isConfirmationMatching || busy}
              >
                {busy
                  ? t('serverAdmin.accounts.deletionDialog.pending')
                  : t('serverAdmin.accounts.deletionDialog.stage3Submit')}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
