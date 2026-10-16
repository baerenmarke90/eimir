import { type FormEvent, type KeyboardEvent, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  authenticateServerAdminRecentOidc,
  authenticateServerAdminRecentPasskey,
  authenticateServerAdminRecentPassword,
  loadServerAdminRecentAuthenticationCapabilities,
} from '../client/recentAuthentication';
import { useTranslation } from '../i18n';
import { ProblemState } from './ProblemState';
import { containModalTabFocus, useModalLifecycle } from './useModalLifecycle';
import './ServerAdminRecentAuthModal.css';

export interface ServerAdminRecentAuthModalProps {
  apiBaseUrl: string;
  accessToken: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function ServerAdminRecentAuthModal({
  apiBaseUrl,
  accessToken,
  onSuccess,
  onCancel,
}: ServerAdminRecentAuthModalProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const dialogRef = useRef<HTMLElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const capabilitiesQuery = useQuery({
    queryKey: [
      'server-admin',
      'recent-authentication',
      'capabilities',
      apiBaseUrl,
    ],
    queryFn: () =>
      loadServerAdminRecentAuthenticationCapabilities(apiBaseUrl, accessToken),
    retry: false,
    staleTime: 0,
  });

  const authenticationMutation = useMutation({
    mutationFn: async (
      method:
        | { kind: 'password'; password: string }
        | { kind: 'passkey' }
        | { kind: 'oidc'; connectionId: string },
    ) => {
      if (method.kind === 'password') {
        return authenticateServerAdminRecentPassword(
          apiBaseUrl,
          accessToken,
          method.password,
        );
      }
      if (method.kind === 'passkey') {
        return authenticateServerAdminRecentPasskey(apiBaseUrl, accessToken);
      }
      return authenticateServerAdminRecentOidc(
        apiBaseUrl,
        accessToken,
        method.connectionId,
      );
    },
    onSuccess: () => {
      setPassword('');
      onSuccess();
    },
  });

  const busy = authenticationMutation.isPending;

  useModalLifecycle({
    active: true,
    initialFocusRef: cancelButtonRef,
  });

  function close() {
    if (!busy) onCancel();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault();
      close();
      return;
    }
    containModalTabFocus(event, dialogRef.current);
  }

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || busy) return;
    authenticationMutation.mutate({ kind: 'password', password });
  }

  const capabilities = capabilitiesQuery.data;
  const methodAvailable = Boolean(
    capabilities?.localPassword ||
      capabilities?.passkey ||
      capabilities?.oidcConnections.length,
  );

  return (
    <div className="server-admin-recent-auth-backdrop">
      <section
        ref={dialogRef}
        className="form-card server-admin-recent-auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="server-admin-step-up-title"
        aria-describedby="server-admin-step-up-description"
        onKeyDown={handleKeyDown}
      >
        <header className="server-admin-recent-auth-head">
          <div>
            <p className="eyebrow">{t('serverAdmin.stepUp.eyebrow')}</p>
            <h2 id="server-admin-step-up-title">
              {t('serverAdmin.stepUp.title')}
            </h2>
          </div>
          <button
            ref={cancelButtonRef}
            type="button"
            className="text-button"
            disabled={busy}
            onClick={close}
          >
            {t('serverAdmin.stepUp.cancel')}
          </button>
        </header>

        <p id="server-admin-step-up-description" className="server-admin-muted">
          {t('serverAdmin.stepUp.intro')}
        </p>

        {capabilitiesQuery.isPending ? (
          <p className="server-admin-muted" role="status">
            {t('serverAdmin.stepUp.loading')}
          </p>
        ) : capabilitiesQuery.error ? (
          <ProblemState error={capabilitiesQuery.error} />
        ) : !methodAvailable ? (
          <p className="status status-error" role="alert">
            {t('serverAdmin.stepUp.unavailable')}
          </p>
        ) : (
          <div className="server-admin-recent-auth-methods">
            {capabilities?.localPassword ? (
              <form
                className="server-admin-recent-auth-password"
                onSubmit={submitPassword}
              >
                <label htmlFor="server-admin-step-up-password">
                  {t('serverAdmin.stepUp.passwordLabel')}
                </label>
                <input
                  id="server-admin-step-up-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  disabled={busy}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button type="submit" disabled={busy || !password}>
                  {t('serverAdmin.stepUp.passwordAction')}
                </button>
              </form>
            ) : null}

            {capabilities?.passkey ? (
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() =>
                  authenticationMutation.mutate({ kind: 'passkey' })
                }
              >
                {t('serverAdmin.stepUp.passkeyAction')}
              </button>
            ) : null}

            {capabilities?.oidcConnections.map((connectionId) => (
              <button
                key={connectionId}
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() =>
                  authenticationMutation.mutate({
                    kind: 'oidc',
                    connectionId,
                  })
                }
              >
                {t('serverAdmin.stepUp.oidcAction')} · {connectionId}
              </button>
            ))}
          </div>
        )}

        {busy ? (
          <p className="server-admin-muted" role="status">
            {t('serverAdmin.stepUp.pending')}
          </p>
        ) : null}

        {authenticationMutation.error ? (
          <ProblemState error={authenticationMutation.error} />
        ) : null}
      </section>
    </div>
  );
}
