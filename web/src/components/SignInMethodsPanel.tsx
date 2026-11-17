import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { rememberCurrentAuthReturnTarget } from '../client/deepLinks';
import { loadInstanceAccessStatus } from '../client/instanceStatus';
import { goToProvider, startOidcLink } from '../client/oidcSignIn';
import {
  PasskeyCancelledError,
  passkeysAvailable,
  registerPasskey,
} from '../client/passkeys';
import { ClientProblemError } from '../client/problemDetails';
import {
  loadSignInMethods,
  removePasskey,
  SIGN_IN_METHODS_QUERY_KEY,
  unlinkProvider,
} from '../client/signInMethods';
import { resolvedLocale, useTranslation } from '../i18n';
import { isCapacitorNative } from '../pwa';
import { AddActionButton } from './AddAction';
import { GoogleMark, IdentityMark, KeyMark, MailMark } from './ProviderChoices';
import './SignInMethodsPanel.css';

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'medium',
  }).format(value);
}

type Notice = { tone: 'status' | 'error'; text: string } | null;

/**
 * Account settings: the ways into this account. Passkeys and linked providers
 * can be added and removed; the server refuses to remove the last way in.
 */
export function SignInMethodsPanel({
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
}: {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string | null;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<Notice>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const methods = useQuery({
    queryKey: [...SIGN_IN_METHODS_QUERY_KEY, apiBaseUrl],
    queryFn: () => loadSignInMethods(apiBaseUrl, accessToken),
  });
  const status = useQuery({
    queryKey: ['instance-access-status', apiBaseUrl],
    queryFn: () => loadInstanceAccessStatus(apiBaseUrl),
    staleTime: 60_000,
  });

  const native = isCapacitorNative();
  const canAddPasskey = passkeysAvailable();
  const connections = native ? [] : (status.data?.oidcConnections ?? []);

  function refresh() {
    return queryClient.invalidateQueries({
      queryKey: SIGN_IN_METHODS_QUERY_KEY,
    });
  }

  function failure(error: unknown): Notice {
    if (error instanceof PasskeyCancelledError) return null;
    const last =
      error instanceof ClientProblemError &&
      error.code === 'SIGN_IN_METHOD_LAST';
    return {
      tone: 'error',
      text: t(
        last ? 'accountSettings.lastMethod' : 'accountSettings.methodFailed',
      ),
    };
  }

  const addPasskey = useMutation({
    mutationFn: () =>
      registerPasskey(
        apiBaseUrl,
        accessToken,
        t('accountSettings.passkeyDefaultName'),
      ),
    onMutate: () => setNotice(null),
    onSuccess: async () => {
      setNotice({
        tone: 'status',
        text: t('accountSettings.passkeyAddedMessage'),
      });
      await refresh();
    },
    onError: (error) => setNotice(failure(error)),
  });

  const removeOne = useMutation({
    mutationFn: (id: string) => removePasskey(apiBaseUrl, accessToken, id),
    onMutate: () => setNotice(null),
    onSuccess: async () => {
      setConfirming(null);
      setNotice({
        tone: 'status',
        text: t('accountSettings.passkeyRemovedMessage'),
      });
      await refresh();
    },
    onError: (error) => {
      setConfirming(null);
      setNotice(failure(error));
    },
  });

  const unlink = useMutation({
    mutationFn: (connectionId: string) =>
      unlinkProvider(apiBaseUrl, accessToken, connectionId),
    onMutate: () => setNotice(null),
    onSuccess: async () => {
      setConfirming(null);
      setNotice({
        tone: 'status',
        text: t('accountSettings.providerUnlinked'),
      });
      await refresh();
    },
    onError: (error) => {
      setConfirming(null);
      setNotice(failure(error));
    },
  });

  const link = useMutation({
    mutationFn: async (connectionId: string) => {
      const url = await startOidcLink(apiBaseUrl, accessToken, connectionId);
      // Bring the person back here after the round trip through the provider.
      rememberCurrentAuthReturnTarget(accountId, spaceId);
      goToProvider(url);
    },
    onMutate: () => setNotice(null),
    onError: (error) => setNotice(failure(error)),
  });

  const data = methods.data;
  if (methods.isError) {
    return (
      <section
        className="form-card sign-in-methods"
        aria-labelledby="sign-in-methods-title"
      >
        <h3 id="sign-in-methods-title">
          {t('accountSettings.signInMethodsTitle')}
        </h3>
        <p role="alert">{t('accountSettings.signInMethodsLoadFailed')}</p>
        <button
          type="button"
          className="secondary"
          onClick={() => void methods.refetch()}
        >
          {t('accountSettings.signInMethodsRetry')}
        </button>
      </section>
    );
  }
  if (!data) return null;

  const linkedIds = new Set(data.oidc.map((item) => item.connectionId));
  const busy =
    addPasskey.isPending ||
    removeOne.isPending ||
    unlink.isPending ||
    link.isPending;

  return (
    <section
      className="form-card sign-in-methods"
      aria-labelledby="sign-in-methods-title"
    >
      <h3 id="sign-in-methods-title">
        {t('accountSettings.signInMethodsTitle')}
      </h3>
      <p className="sign-in-methods-intro">
        {t('accountSettings.signInMethodsIntro')}
      </p>

      <ul className="sign-in-methods-list">
        {data.emailLink ? (
          <li className="sign-in-method">
            <span className="sign-in-method-icon">
              <MailMark />
            </span>
            <span className="sign-in-method-copy">
              <strong>{t('accountSettings.emailLinkTitle')}</strong>
              <span>{t('accountSettings.emailLinkNote')}</span>
            </span>
            <span className="sign-in-method-chip">
              {t('accountSettings.emailLinkVerified')}
            </span>
          </li>
        ) : null}
        {data.localPassword ? (
          <li className="sign-in-method">
            <span className="sign-in-method-icon">
              <IdentityMark />
            </span>
            <span className="sign-in-method-copy">
              <strong>{t('accountSettings.passwordTitle')}</strong>
              <span>{t('accountSettings.passwordNote')}</span>
            </span>
          </li>
        ) : null}

        {connections.map((connection) => {
          const linked = linkedIds.has(connection.id);
          const key = `provider:${connection.id}`;
          const name =
            connection.brand === 'google'
              ? t('accountSettings.googleTitle')
              : connection.label || connection.id;
          return (
            <li className="sign-in-method" key={connection.id}>
              <span className="sign-in-method-icon">
                {connection.brand === 'google' ? (
                  <GoogleMark />
                ) : (
                  <IdentityMark />
                )}
              </span>
              <span className="sign-in-method-copy">
                <strong>{name}</strong>
                <span>
                  {t(
                    linked
                      ? 'accountSettings.providerLinked'
                      : 'accountSettings.providerNotLinked',
                  )}
                </span>
              </span>
              {linked ? (
                <button
                  type="button"
                  className="secondary sign-in-method-action"
                  disabled={busy}
                  onClick={() =>
                    confirming === key
                      ? unlink.mutate(connection.id)
                      : setConfirming(key)
                  }
                >
                  {t(
                    confirming === key
                      ? 'accountSettings.providerUnlinkConfirm'
                      : 'accountSettings.providerUnlink',
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  className="secondary sign-in-method-action"
                  disabled={busy}
                  onClick={() => link.mutate(connection.id)}
                >
                  {t('accountSettings.providerLink')}
                </button>
              )}
            </li>
          );
        })}

        <li className="sign-in-method">
          <span className="sign-in-method-icon">
            <KeyMark />
          </span>
          <span className="sign-in-method-copy">
            <strong>{t('accountSettings.passkeysTitle')}</strong>
            <span>
              {data.passkeys.length === 0
                ? t('accountSettings.passkeysNone')
                : t('accountSettings.passkeysIntro')}
            </span>
          </span>
        </li>
        {data.passkeys.map((passkey) => {
          const key = `passkey:${passkey.id}`;
          return (
            <li
              className="sign-in-method sign-in-method-nested"
              key={passkey.id}
            >
              <span className="sign-in-method-copy">
                <strong>
                  {passkey.name || t('accountSettings.passkeysTitle')}
                </strong>
                <span>
                  {t('accountSettings.passkeyAddedOn', {
                    date: formatDate(passkey.createdAt),
                  })}
                </span>
              </span>
              <button
                type="button"
                className="secondary sign-in-method-action"
                disabled={busy}
                onClick={() =>
                  confirming === key
                    ? removeOne.mutate(passkey.id)
                    : setConfirming(key)
                }
              >
                {t(
                  confirming === key
                    ? 'accountSettings.passkeyRemoveConfirm'
                    : 'accountSettings.passkeyRemove',
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {canAddPasskey ? (
        <AddActionButton
          className="sign-in-methods-add"
          label={t('accountSettings.passkeyAdd')}
          pendingLabel={t('accountSettings.passkeyAdding')}
          pending={addPasskey.isPending}
          disabled={busy}
          onClick={() => addPasskey.mutate()}
        />
      ) : (
        <p className="sign-in-methods-note">
          {t('accountSettings.passkeyNotOnThisDevice')}
        </p>
      )}

      {notice ? (
        <p
          className={`sign-in-methods-notice sign-in-methods-notice-${notice.tone}`}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </p>
      ) : null}
    </section>
  );
}
