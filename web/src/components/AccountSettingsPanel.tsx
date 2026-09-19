import {
  type FormEvent,
  type KeyboardEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AccountApi } from '../api/generated/apis/AccountApi';
import type { CapabilitiesView } from '../api/generated/models/CapabilitiesView';
import { AccountDeletionRequestConfirmationEnum } from '../api/generated/models/AccountDeletionRequest';
import { Configuration } from '../api/generated/runtime';
import {
  authenticateRecentOidc,
  authenticateRecentPasskey,
  authenticateRecentPassword,
  loadRecentAuthenticationCapabilities,
} from '../client/recentAuthentication';
import { normalizeClientError } from '../client/problemDetails';
import { clearProductReadCache } from '../client/productReadCache';
import { clearStoredSession } from '../client/sessionPersistence';
import { useTranslation } from '../i18n';
import { ProblemState } from './ProblemState';
import { containModalTabFocus, useModalLifecycle } from './useModalLifecycle';
import './AccountSettingsPanel.css';

type DeletionStep = 'consequences' | 'reauthenticate' | 'confirm' | null;
type RecentAuthenticationMethod =
  | { kind: 'password'; password: string }
  | { kind: 'passkey' }
  | { kind: 'oidc'; connectionId: string };

export interface AccountSettingsPanelProps {
  apiBaseUrl: string;
  accessToken: string;
  demoMode: boolean;
  /** Test/host override. Production uses the existing local logout/cache boundary. */
  onDeletionAccepted?: () => void | Promise<void>;
}

export function AccountSettingsPanel({
  apiBaseUrl,
  accessToken,
  demoMode,
  onDeletionAccepted,
}: AccountSettingsPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<DeletionStep>(null);
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [capabilities, setCapabilities] = useState<CapabilitiesView | null>(
    null,
  );
  const dialogRef = useRef<HTMLElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const accountApi = useMemo(
    () =>
      new AccountApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ),
    [accessToken, apiBaseUrl],
  );

  const deletionMutation = useMutation({
    mutationFn: async () => {
      try {
        return await accountApi.deleteOwnAccountApiV1AccountDeletionPost({
          accountDeletionRequest: {
            confirmation: AccountDeletionRequestConfirmationEnum.DELETE_ACCOUNT,
          },
        });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: async () => {
      setStep(null);
      setConfirmation('');
      setPassword('');
      setCapabilities(null);

      if (onDeletionAccepted) {
        await onDeletionAccepted();
        return;
      }

      // The server has already crossed the irreversible tombstone boundary and
      // revoked the session. Reuse the normal Web logout/cache primitives, then
      // force a clean signed-out navigation so no stale in-memory mutation can
      // continue as the deleted Account.
      clearStoredSession();
      queryClient.clear();
      try {
        await clearProductReadCache();
      } finally {
        window.location.replace('/');
      }
    },
  });

  const capabilitiesMutation = useMutation({
    mutationFn: () =>
      loadRecentAuthenticationCapabilities(apiBaseUrl, accessToken),
    onSuccess: (available) => setCapabilities(available),
  });

  const recentAuthenticationMutation = useMutation({
    mutationFn: async (method: RecentAuthenticationMethod) => {
      if (method.kind === 'password') {
        return authenticateRecentPassword(
          apiBaseUrl,
          accessToken,
          method.password,
        );
      }
      if (method.kind === 'passkey') {
        return authenticateRecentPasskey(apiBaseUrl, accessToken);
      }
      return authenticateRecentOidc(
        apiBaseUrl,
        accessToken,
        method.connectionId,
      );
    },
    onSuccess: () => {
      setPassword('');
      setConfirmation('');
      deletionMutation.reset();
      setStep('confirm');
    },
  });

  const busy =
    deletionMutation.isPending ||
    capabilitiesMutation.isPending ||
    recentAuthenticationMutation.isPending;

  useModalLifecycle({
    active: Boolean(step),
    initialFocusRef: cancelButtonRef,
  });

  function resetRecentAuthentication() {
    setPassword('');
    setCapabilities(null);
    capabilitiesMutation.reset();
    recentAuthenticationMutation.reset();
  }

  function closeDialog() {
    if (busy) return;
    setStep(null);
    setConfirmation('');
    resetRecentAuthentication();
    deletionMutation.reset();
  }

  function goToDataExport() {
    if (busy) return;
    closeDialog();
    window.location.hash = 'settings-data';
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault();
      closeDialog();
      return;
    }
    containModalTabFocus(event, dialogRef.current);
  }

  function beginRecentAuthentication() {
    setConfirmation('');
    resetRecentAuthentication();
    deletionMutation.reset();
    setStep('reauthenticate');
    capabilitiesMutation.mutate();
  }

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || recentAuthenticationMutation.isPending) return;
    recentAuthenticationMutation.mutate({ kind: 'password', password });
  }

  function submitDeletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const phrase = t('accountSettings.confirmPhrase');
    if (confirmation !== phrase || deletionMutation.isPending || demoMode)
      return;
    deletionMutation.mutate();
  }

  const confirmationPhrase = t('accountSettings.confirmPhrase');
  const confirmationMatches = confirmation === confirmationPhrase;
  const hasRecentAuthenticationMethod = Boolean(
    capabilities &&
      (capabilities.localPassword ||
        capabilities.passkey ||
        capabilities.oidcConnections.length > 0),
  );

  return (
    <>
      <section
        className="form-card account-settings-panel"
        aria-labelledby="account-settings-title"
      >
        <p className="eyebrow">{t('accountSettings.title')}</p>
        <h3 id="account-settings-title">{t('accountSettings.title')}</h3>
        <p>{t('accountSettings.intro')}</p>

        <div className="account-danger-zone">
          <div className="account-danger-copy">
            <p className="eyebrow">{t('accountSettings.dangerEyebrow')}</p>
            <h4>{t('accountSettings.dangerTitle')}</h4>
            <p>{t('accountSettings.dangerIntro')}</p>
          </div>

          {demoMode ? (
            <div className="account-demo-delete-note" role="note">
              <strong>{t('accountSettings.demoTitle')}</strong>
              <span>{t('accountSettings.demoBody')}</span>
              <button type="button" className="account-delete-button" disabled>
                {t('accountSettings.deleteAction')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="account-delete-button"
              onClick={() => {
                deletionMutation.reset();
                resetRecentAuthentication();
                setStep('consequences');
              }}
            >
              {t('accountSettings.deleteAction')}
            </button>
          )}
        </div>
      </section>

      {step ? (
        <div className="account-deletion-backdrop" role="presentation">
          <section
            ref={dialogRef}
            className="modal-card account-deletion-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-deletion-dialog-title"
            aria-describedby="account-deletion-dialog-description"
            onKeyDown={handleDialogKeyDown}
          >
            {step === 'consequences' ? (
              <>
                <div className="account-deletion-dialog-head">
                  <div>
                    <p className="eyebrow">
                      {t('accountSettings.dangerEyebrow')}
                    </p>
                    <h2 id="account-deletion-dialog-title">
                      {t('accountSettings.consequencesTitle')}
                    </h2>
                  </div>
                </div>
                <p id="account-deletion-dialog-description">
                  {t('accountSettings.consequencesIntro')}
                </p>
                <ul className="account-deletion-consequences">
                  <li>{t('accountSettings.consequenceAccess')}</li>
                  <li>{t('accountSettings.consequencePrivate')}</li>
                  <li>{t('accountSettings.consequenceShared')}</li>
                  <li>{t('accountSettings.consequenceIrreversible')}</li>
                </ul>
                <div className="form-actions account-deletion-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={goToDataExport}
                  >
                    {t('accountSettings.exportBefore')}
                  </button>
                  <button
                    ref={cancelButtonRef}
                    type="button"
                    className="secondary"
                    onClick={closeDialog}
                  >
                    {t('accountSettings.cancelAction')}
                  </button>
                  <button
                    type="button"
                    className="account-delete-button"
                    onClick={beginRecentAuthentication}
                  >
                    {t('accountSettings.continueAction')}
                  </button>
                </div>
              </>
            ) : step === 'reauthenticate' ? (
              <div className="form-grid">
                <div className="account-deletion-dialog-head">
                  <div>
                    <p className="eyebrow">
                      {t('accountSettings.reauthEyebrow')}
                    </p>
                    <h2 id="account-deletion-dialog-title">
                      {t('accountSettings.reauthTitle')}
                    </h2>
                  </div>
                </div>
                <p id="account-deletion-dialog-description">
                  {t('accountSettings.reauthIntro')}
                </p>

                {capabilitiesMutation.isPending ? (
                  <p className="status" role="status" aria-live="polite">
                    {t('accountSettings.reauthLoading')}
                  </p>
                ) : null}
                {capabilitiesMutation.error ? (
                  <ProblemState error={capabilitiesMutation.error} />
                ) : null}

                {capabilities?.localPassword ? (
                  <form onSubmit={submitPassword} className="form-grid">
                    <div className="field-group">
                      <label htmlFor="account-deletion-password">
                        {t('accountSettings.reauthPasswordLabel')}
                      </label>
                      <input
                        id="account-deletion-password"
                        type="password"
                        value={password}
                        onChange={(event) =>
                          setPassword(event.currentTarget.value)
                        }
                        autoComplete="current-password"
                        disabled={recentAuthenticationMutation.isPending}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={
                        !password || recentAuthenticationMutation.isPending
                      }
                    >
                      {t('accountSettings.reauthPasswordAction')}
                    </button>
                  </form>
                ) : null}

                {capabilities?.passkey ? (
                  <button
                    type="button"
                    onClick={() =>
                      recentAuthenticationMutation.mutate({ kind: 'passkey' })
                    }
                    disabled={recentAuthenticationMutation.isPending}
                  >
                    {t('accountSettings.reauthPasskeyAction')}
                  </button>
                ) : null}

                {capabilities?.oidcConnections.map((connectionId) => (
                  <button
                    key={connectionId}
                    type="button"
                    onClick={() =>
                      recentAuthenticationMutation.mutate({
                        kind: 'oidc',
                        connectionId,
                      })
                    }
                    disabled={recentAuthenticationMutation.isPending}
                  >
                    {t('accountSettings.reauthOidcAction', {
                      provider: connectionId,
                    })}
                  </button>
                ))}

                {capabilities && !hasRecentAuthenticationMethod ? (
                  <div className="inline-message" role="alert">
                    <strong>
                      {t('accountSettings.reauthUnavailableTitle')}
                    </strong>
                    <span>{t('accountSettings.reauthUnavailableBody')}</span>
                  </div>
                ) : null}

                {recentAuthenticationMutation.error ? (
                  <ProblemState error={recentAuthenticationMutation.error} />
                ) : null}
                {recentAuthenticationMutation.isPending ? (
                  <p className="status" role="status" aria-live="polite">
                    {t('accountSettings.reauthPending')}
                  </p>
                ) : null}

                <div className="form-actions account-deletion-actions">
                  <button
                    ref={cancelButtonRef}
                    type="button"
                    className="secondary"
                    onClick={() => {
                      if (busy) return;
                      resetRecentAuthentication();
                      setStep('consequences');
                    }}
                    disabled={busy}
                  >
                    {t('accountSettings.backAction')}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={closeDialog}
                    disabled={busy}
                  >
                    {t('accountSettings.cancelAction')}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submitDeletion} className="form-grid">
                <div className="account-deletion-dialog-head">
                  <div>
                    <p className="eyebrow">
                      {t('accountSettings.dangerEyebrow')}
                    </p>
                    <h2 id="account-deletion-dialog-title">
                      {t('accountSettings.finalTitle')}
                    </h2>
                  </div>
                </div>
                <p id="account-deletion-dialog-description">
                  {t('accountSettings.finalIntro')}
                </p>
                <p>
                  {t('accountSettings.confirmInstruction', {
                    phrase: confirmationPhrase,
                  })}
                </p>
                <p className="account-confirmation-phrase" aria-hidden="true">
                  <code>{confirmationPhrase}</code>
                </p>
                <div className="field-group">
                  <label htmlFor="account-deletion-confirmation">
                    {t('accountSettings.confirmLabel')}
                  </label>
                  <input
                    id="account-deletion-confirmation"
                    value={confirmation}
                    onChange={(event) =>
                      setConfirmation(event.currentTarget.value)
                    }
                    autoComplete="off"
                    spellCheck={false}
                    disabled={deletionMutation.isPending}
                    aria-describedby="account-deletion-confirmation-help"
                  />
                  <p
                    id="account-deletion-confirmation-help"
                    className="field-help"
                  >
                    {t('accountSettings.confirmHelp')}
                  </p>
                </div>

                {deletionMutation.error ? (
                  <ProblemState error={deletionMutation.error} />
                ) : null}
                {deletionMutation.isPending ? (
                  <p className="status" role="status" aria-live="polite">
                    {t('accountSettings.submitting')}
                  </p>
                ) : null}

                <div className="form-actions account-deletion-actions">
                  <button
                    ref={cancelButtonRef}
                    type="button"
                    className="secondary"
                    onClick={() => {
                      if (deletionMutation.isPending) return;
                      setConfirmation('');
                      deletionMutation.reset();
                      resetRecentAuthentication();
                      setStep('consequences');
                    }}
                    disabled={deletionMutation.isPending}
                  >
                    {t('accountSettings.backAction')}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={closeDialog}
                    disabled={deletionMutation.isPending}
                  >
                    {t('accountSettings.cancelAction')}
                  </button>
                  <button
                    type="submit"
                    className="account-delete-button"
                    disabled={
                      !confirmationMatches || deletionMutation.isPending
                    }
                  >
                    {deletionMutation.isPending
                      ? t('accountSettings.submitting')
                      : t('accountSettings.submitAction')}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
