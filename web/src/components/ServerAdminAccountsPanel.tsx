import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ServerAdminApi } from '../api/generated/apis/ServerAdminApi';
import type { ServerAdminAccountDetail } from '../api/generated/models/ServerAdminAccountDetail';
import type { ServerAdminActionActivityItem } from '../api/generated/models/ServerAdminActionActivityItem';
import { normalizeClientError } from '../client/problemDetails';
import { isRecentAuthRequired } from '../client/recentAuthentication';
import { resolvedLocale, useTranslation } from '../i18n';
import { ServerAdminAccountDeletionDialog } from './ServerAdminAccountDeletionDialog';
import { ServerAdminRecentAuthModal } from './ServerAdminRecentAuthModal';

const PAGE_SIZE = 25;

function formatDate(value: Date | null): string {
  if (!value) return '–';
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

function authMethodLabel(method: string): string {
  switch (method) {
    case 'LOCAL_PASSWORD':
      return 'Passwort';
    case 'OIDC':
      return 'OIDC';
    case 'PASSKEY':
      return 'Passkey';
    case 'MAGIC_LINK':
      return 'Magic Link';
    default:
      return method;
  }
}

function actionLabel(action: string, t: (key: string) => string): string {
  switch (action) {
    case 'account_suspended':
      return t('serverAdmin.accounts.audit.suspended');
    case 'account_unsuspended':
      return t('serverAdmin.accounts.audit.unsuspended');
    case 'account_sessions_revoked':
      return t('serverAdmin.accounts.audit.sessionsRevoked');
    case 'account_email_verified':
      return t('serverAdmin.accounts.audit.emailVerified');
    case 'account_recovery_email_requested':
      return t('serverAdmin.accounts.audit.recoveryEmail');
    case 'account_recovery_issued':
      return t('serverAdmin.accounts.audit.operatorRecovery');
    case 'account_deletion_requested':
      return t('serverAdmin.accounts.audit.deletionRequested');
    default:
      return t('serverAdmin.accounts.audit.unknown');
  }
}

function ActionAudit({ items }: { items: ServerAdminActionActivityItem[] }) {
  const { t } = useTranslation();
  return (
    <section
      className="server-admin-panel server-admin-panel-wide"
      aria-labelledby="server-account-audit-title"
    >
      <h2 id="server-account-audit-title">
        {t('serverAdmin.accounts.audit.title')}
      </h2>
      <p className="server-admin-muted">
        {t('serverAdmin.accounts.audit.body')}
      </p>
      {items.length === 0 ? (
        <p className="server-admin-muted">
          {t('serverAdmin.accounts.audit.empty')}
        </p>
      ) : (
        <div className="server-admin-table-scroll">
          <table className="server-admin-table">
            <thead>
              <tr>
                <th scope="col">{t('serverAdmin.accounts.audit.action')}</th>
                <th scope="col">{t('serverAdmin.accounts.audit.target')}</th>
                <th scope="col">{t('serverAdmin.accounts.audit.actor')}</th>
                <th scope="col">{t('serverAdmin.accounts.audit.effect')}</th>
                <th scope="col">{t('serverAdmin.accounts.audit.time')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{actionLabel(item.action, t)}</td>
                  <td className="server-admin-actor-id">
                    {item.targetAccountId ?? '–'}
                  </td>
                  <td className="server-admin-actor-id">
                    {item.actorId ?? t('serverAdmin.activity.systemActor')}
                  </td>
                  <td>{item.effectCount ?? '–'}</td>
                  <td>{formatDate(item.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type PendingPrivilegedAction =
  | { kind: 'verify-email'; emailId: string; email: string }
  | { kind: 'operator-recovery' };

function AccountDetail({
  account,
  api,
  apiBaseUrl,
  accessToken,
  onChanged,
}: {
  account: ServerAdminAccountDetail;
  api: ServerAdminApi;
  apiBaseUrl: string;
  accessToken: string;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [verificationText, setVerificationText] = useState('');
  const [recoveryUrl, setRecoveryUrl] = useState<string | null>(null);
  const [recoveryExpiry, setRecoveryExpiry] = useState<Date | null>(null);
  const [pendingPrivilegedAction, setPendingPrivilegedAction] =
    useState<PendingPrivilegedAction | null>(null);
  const [deletionDialogOpen, setDeletionDialogOpen] = useState(false);

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ['server-admin', 'accounts'],
    });
    void queryClient.invalidateQueries({
      queryKey: ['server-admin', 'account', account.id],
    });
    void queryClient.invalidateQueries({
      queryKey: ['server-admin', 'overview'],
    });
    void queryClient.invalidateQueries({
      queryKey: ['server-admin', 'action-activity'],
    });
    onChanged();
  };

  const suspensionMutation = useMutation({
    mutationFn: (suspended: boolean) =>
      api.updateServerAdminAccountSuspensionApiV1ServerAdminAccountsAccountIdSuspensionPut(
        {
          accountId: account.id,
          serverAdminAccountSuspensionUpdate: { suspended },
        },
      ),
    onSuccess: invalidate,
  });
  const revokeSessionsMutation = useMutation({
    mutationFn: () =>
      api.revokeServerAdminAccountSessionsApiV1ServerAdminAccountsAccountIdSessionsRevokePost(
        { accountId: account.id },
      ),
    onSuccess: invalidate,
  });
  const verificationMutation = useMutation({
    mutationFn: async ({
      emailId,
      email,
    }: {
      emailId: string;
      email: string;
    }) => {
      try {
        return await api.verifyServerAdminAccountEmailApiV1ServerAdminAccountsAccountIdEmailsAccountEmailIdVerifyPost(
          {
            accountId: account.id,
            accountEmailId: emailId,
            serverAdminEmailVerificationRequest: { confirmationEmail: email },
          },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: () => {
      setVerificationText('');
      invalidate();
    },
    onError: (error, variables) => {
      if (isRecentAuthRequired(error)) {
        setPendingPrivilegedAction({ kind: 'verify-email', ...variables });
      }
    },
  });
  const recoveryEmailMutation = useMutation({
    mutationFn: () =>
      api.requestServerAdminAccountRecoveryEmailApiV1ServerAdminAccountsAccountIdRecoveryEmailPost(
        { accountId: account.id },
      ),
    onSuccess: invalidate,
  });
  const operatorRecoveryMutation = useMutation({
    mutationFn: async () => {
      try {
        return await api.issueServerAdminOperatorRecoveryApiV1ServerAdminAccountsAccountIdRecoveryOperatorPost(
          { accountId: account.id },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: (proof) => {
      setRecoveryUrl(proof.recoveryUrl);
      setRecoveryExpiry(proof.expiresAt);
      invalidate();
    },
    onError: (error) => {
      if (isRecentAuthRequired(error)) {
        setPendingPrivilegedAction({ kind: 'operator-recovery' });
      }
    },
  });

  const actionError =
    suspensionMutation.error ??
    revokeSessionsMutation.error ??
    (verificationMutation.error &&
    !isRecentAuthRequired(verificationMutation.error)
      ? verificationMutation.error
      : null) ??
    recoveryEmailMutation.error ??
    (operatorRecoveryMutation.error &&
    !isRecentAuthRequired(operatorRecoveryMutation.error)
      ? operatorRecoveryMutation.error
      : null);
  const pending =
    suspensionMutation.isPending ||
    revokeSessionsMutation.isPending ||
    verificationMutation.isPending ||
    recoveryEmailMutation.isPending ||
    operatorRecoveryMutation.isPending;

  function updateSuspension() {
    const suspending = account.disabledAt === null;
    const message = suspending
      ? t('serverAdmin.accounts.detail.confirmSuspend')
      : t('serverAdmin.accounts.detail.confirmUnsuspend');
    if (window.confirm(message)) suspensionMutation.mutate(suspending);
  }

  function revokeSessions() {
    if (
      window.confirm(t('serverAdmin.accounts.detail.confirmRevokeSessions'))
    ) {
      revokeSessionsMutation.mutate();
    }
  }

  function issueOperatorRecovery() {
    if (
      window.confirm(t('serverAdmin.accounts.detail.confirmOperatorRecovery'))
    ) {
      setRecoveryUrl(null);
      setRecoveryExpiry(null);
      operatorRecoveryMutation.mutate();
    }
  }

  function retryPrivilegedAction() {
    const action = pendingPrivilegedAction;
    setPendingPrivilegedAction(null);
    if (!action) return;
    if (action.kind === 'verify-email') {
      verificationMutation.reset();
      verificationMutation.mutate({
        emailId: action.emailId,
        email: action.email,
      });
      return;
    }
    operatorRecoveryMutation.reset();
    operatorRecoveryMutation.mutate();
  }

  return (
    <div className="server-admin-account-detail">
      <div className="server-admin-account-detail-heading">
        <div>
          <p className="eyebrow">{t('serverAdmin.accounts.detail.eyebrow')}</p>
          <h3>{account.displayName}</h3>
          <p className="server-admin-muted server-admin-actor-id">
            {account.id}
          </p>
        </div>
        <span
          className={`server-admin-badge ${
            account.deletionStatus === 'PENDING' ||
            account.deletionStatus === 'COMPLETED'
              ? 'is-danger'
              : account.disabledAt
                ? 'is-warning'
                : 'is-ok'
          }`}
        >
          {account.deletionStatus === 'PENDING'
            ? t('serverAdmin.accounts.status.pendingDeletion')
            : account.deletionStatus === 'COMPLETED'
              ? t('serverAdmin.accounts.status.deleted')
              : t(
                  account.disabledAt
                    ? 'serverAdmin.accounts.status.suspended'
                    : 'serverAdmin.accounts.status.active',
                )}
        </span>
      </div>

      <dl className="server-admin-metrics server-admin-account-detail-metrics">
        <div className="server-admin-metric">
          <dt>{t('serverAdmin.accounts.detail.createdAt')}</dt>
          <dd>{formatDate(account.createdAt)}</dd>
        </div>
        <div className="server-admin-metric">
          <dt>{t('serverAdmin.accounts.detail.lastSession')}</dt>
          <dd>{formatDate(account.lastSessionActivityAt)}</dd>
        </div>
        <div className="server-admin-metric">
          <dt>{t('serverAdmin.accounts.detail.sessions')}</dt>
          <dd>{account.activeSessionCount}</dd>
        </div>
        <div className="server-admin-metric">
          <dt>{t('serverAdmin.accounts.detail.memberships')}</dt>
          <dd>
            {account.activeMembershipCount} /{' '}
            {account.historicalMembershipCount}
          </dd>
        </div>
        <div className="server-admin-metric">
          <dt>{t('serverAdmin.accounts.detail.authMethods')}</dt>
          <dd>{account.authMethods.map(authMethodLabel).join(', ') || '–'}</dd>
        </div>
        <div className="server-admin-metric">
          <dt>{t('serverAdmin.accounts.detail.passkeys')}</dt>
          <dd>{account.passkeyCount}</dd>
        </div>
      </dl>

      <h4>{t('serverAdmin.accounts.detail.emailTitle')}</h4>
      <div className="server-admin-account-email-list">
        {account.emails.map((email) => (
          <div className="server-admin-account-email-row" key={email.id}>
            <div>
              <strong>{email.email}</strong>
              <p className="server-admin-muted">
                {email.isPrimary
                  ? t('serverAdmin.accounts.detail.primaryEmail')
                  : t('serverAdmin.accounts.detail.additionalEmail')}{' '}
                ·{' '}
                {t(
                  email.verifiedAt
                    ? 'serverAdmin.accounts.verification.verified'
                    : 'serverAdmin.accounts.verification.unverified',
                )}
              </p>
            </div>
            {email.verifiedAt === null ? (
              <div className="server-admin-inline-confirmation">
                <label htmlFor={`verify-${email.id}`}>
                  {t('serverAdmin.accounts.detail.typeEmailToVerify')}
                </label>
                <input
                  id={`verify-${email.id}`}
                  type="email"
                  autoComplete="off"
                  value={verificationText}
                  onChange={(event) => setVerificationText(event.target.value)}
                  placeholder={email.email}
                />
                <button
                  type="button"
                  disabled={
                    pending ||
                    verificationText.trim().toLowerCase() !==
                      email.email.toLowerCase()
                  }
                  onClick={() =>
                    verificationMutation.mutate({
                      emailId: email.id,
                      email: verificationText,
                    })
                  }
                >
                  {t('serverAdmin.accounts.detail.verifyEmail')}
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <h4>{t('serverAdmin.accounts.detail.actionsTitle')}</h4>
      <div className="server-admin-account-actions">
        <button type="button" disabled={pending} onClick={updateSuspension}>
          {t(
            account.disabledAt
              ? 'serverAdmin.accounts.detail.unsuspend'
              : 'serverAdmin.accounts.detail.suspend',
          )}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={pending || account.activeSessionCount === 0}
          onClick={revokeSessions}
        >
          {t('serverAdmin.accounts.detail.revokeSessions')}
        </button>
        {account.localPasswordAvailable ? (
          account.mailRecoveryAvailable ? (
            <button
              type="button"
              className="secondary-button"
              disabled={pending || account.disabledAt !== null}
              onClick={() => recoveryEmailMutation.mutate()}
            >
              {t('serverAdmin.accounts.detail.sendRecovery')}
            </button>
          ) : (
            <button
              type="button"
              className="secondary-button"
              disabled={pending || account.disabledAt !== null}
              onClick={issueOperatorRecovery}
            >
              {t('serverAdmin.accounts.detail.operatorRecovery')}
            </button>
          )
        ) : null}
      </div>

      {recoveryEmailMutation.isSuccess ? (
        <p className="status status-success" role="status">
          {t('serverAdmin.accounts.detail.recoverySent')}
        </p>
      ) : null}

      {recoveryUrl ? (
        <div className="server-admin-recovery-proof" role="status">
          <strong>{t('serverAdmin.accounts.detail.recoveryProofTitle')}</strong>
          <p>{t('serverAdmin.accounts.detail.recoveryProofBody')}</p>
          <input
            type="text"
            readOnly
            value={recoveryUrl}
            aria-label={t('serverAdmin.accounts.detail.recoveryProofLabel')}
            onFocus={(event) => event.currentTarget.select()}
          />
          <p className="server-admin-muted">
            {t('serverAdmin.accounts.detail.recoveryProofExpires')}:{' '}
            {formatDate(recoveryExpiry)}
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void navigator.clipboard?.writeText(recoveryUrl)}
          >
            {t('serverAdmin.accounts.detail.copyRecoveryProof')}
          </button>
        </div>
      ) : null}

      {actionError ? (
        <p className="status status-error" role="alert">
          {t('serverAdmin.accounts.detail.actionError')}
        </p>
      ) : null}

      <div className="server-admin-danger-zone">
        <strong>{t('serverAdmin.accounts.detail.deletionTitle')}</strong>
        {account.deletionStatus === 'PENDING' ||
        account.deletionStatus === 'COMPLETED' ? (
          <p className="status status-warning" role="status">
            {t('serverAdmin.accounts.detail.deletionNotice')}
          </p>
        ) : (
          <>
            <p className="server-admin-muted">
              {t('serverAdmin.accounts.detail.deletionWarning')}
            </p>
            <button
              type="button"
              className="danger-button"
              disabled={pending}
              onClick={() => setDeletionDialogOpen(true)}
            >
              {t('serverAdmin.accounts.detail.deleteAccount')}
            </button>
          </>
        )}
      </div>

      {deletionDialogOpen ? (
        <ServerAdminAccountDeletionDialog
          api={api}
          apiBaseUrl={apiBaseUrl}
          accessToken={accessToken}
          account={account}
          onClose={() => setDeletionDialogOpen(false)}
          onSuccess={() => {
            setDeletionDialogOpen(false);
            invalidate();
          }}
        />
      ) : null}

      {pendingPrivilegedAction ? (
        <ServerAdminRecentAuthModal
          apiBaseUrl={apiBaseUrl}
          accessToken={accessToken}
          onCancel={() => setPendingPrivilegedAction(null)}
          onSuccess={retryPrivilegedAction}
        />
      ) : null}
    </div>
  );
}

export function ServerAdminAccountsPanel({
  api,
  apiBaseUrl,
  accessToken,
  onOverviewChanged,
}: {
  api: ServerAdminApi;
  apiBaseUrl: string;
  accessToken: string;
  onOverviewChanged: () => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'suspended'>('all');
  const [verification, setVerification] = useState<
    'all' | 'verified' | 'unverified'
  >('all');
  const [offset, setOffset] = useState(0);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null,
  );

  const accountRequest = useMemo(
    () => ({
      query: search.trim() || undefined,
      status,
      verification,
      limit: PAGE_SIZE,
      offset,
    }),
    [offset, search, status, verification],
  );
  const accountsQuery = useQuery({
    queryKey: ['server-admin', 'accounts', accountRequest],
    queryFn: () =>
      api.listServerAdminAccountsApiV1ServerAdminAccountsGet(accountRequest),
    retry: false,
  });
  const detailQuery = useQuery({
    queryKey: ['server-admin', 'account', selectedAccountId],
    queryFn: () =>
      api.getServerAdminAccountApiV1ServerAdminAccountsAccountIdGet({
        accountId: selectedAccountId as string,
      }),
    enabled: selectedAccountId !== null,
    retry: false,
  });
  const actionActivityQuery = useQuery({
    queryKey: ['server-admin', 'action-activity'],
    queryFn: () =>
      api.getServerAdminActionActivityApiV1ServerAdminActivityActionsGet(),
    retry: false,
  });

  function changeFilter(setter: (value: never) => void, value: string): void {
    setOffset(0);
    setter(value as never);
  }

  const data = accountsQuery.data;
  const canGoBack = offset > 0;
  const canGoForward = data ? offset + data.items.length < data.total : false;

  return (
    <>
      <section
        className="server-admin-panel server-admin-panel-wide"
        aria-labelledby="server-accounts-title"
      >
        <div className="server-admin-section-heading">
          <div>
            <h2 id="server-accounts-title">
              {t('serverAdmin.accounts.title')}
            </h2>
            <p className="server-admin-muted">
              {t('serverAdmin.accounts.body')}
            </p>
          </div>
          {data ? (
            <span className="server-admin-count">
              {data.total} {t('serverAdmin.accounts.totalSuffix')}
            </span>
          ) : null}
        </div>

        <div className="server-admin-account-filters">
          <label>
            <span>{t('serverAdmin.accounts.search')}</span>
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setOffset(0);
                setSearch(event.target.value);
              }}
              placeholder={t('serverAdmin.accounts.searchPlaceholder')}
            />
          </label>
          <label>
            <span>{t('serverAdmin.accounts.status.label')}</span>
            <select
              value={status}
              onChange={(event) =>
                changeFilter(
                  setStatus as (value: never) => void,
                  event.target.value,
                )
              }
            >
              <option value="all">
                {t('serverAdmin.accounts.status.all')}
              </option>
              <option value="active">
                {t('serverAdmin.accounts.status.active')}
              </option>
              <option value="suspended">
                {t('serverAdmin.accounts.status.suspended')}
              </option>
            </select>
          </label>
          <label>
            <span>{t('serverAdmin.accounts.verification.label')}</span>
            <select
              value={verification}
              onChange={(event) =>
                changeFilter(
                  setVerification as (value: never) => void,
                  event.target.value,
                )
              }
            >
              <option value="all">
                {t('serverAdmin.accounts.verification.all')}
              </option>
              <option value="verified">
                {t('serverAdmin.accounts.verification.verified')}
              </option>
              <option value="unverified">
                {t('serverAdmin.accounts.verification.unverified')}
              </option>
            </select>
          </label>
        </div>

        {accountsQuery.isPending ? (
          <p className="server-admin-muted">
            {t('serverAdmin.accounts.loading')}
          </p>
        ) : accountsQuery.error ? (
          <p className="status status-error" role="alert">
            {t('serverAdmin.accounts.error')}
          </p>
        ) : data && data.items.length === 0 ? (
          <p className="server-admin-muted">
            {t('serverAdmin.accounts.empty')}
          </p>
        ) : data ? (
          <>
            <div className="server-admin-table-scroll">
              <table className="server-admin-table server-admin-account-table">
                <thead>
                  <tr>
                    <th scope="col">{t('serverAdmin.accounts.name')}</th>
                    <th scope="col">{t('serverAdmin.accounts.email')}</th>
                    <th scope="col">
                      {t('serverAdmin.accounts.status.label')}
                    </th>
                    <th scope="col">
                      {t('serverAdmin.accounts.verification.label')}
                    </th>
                    <th scope="col">{t('serverAdmin.accounts.sessions')}</th>
                    <th scope="col">{t('serverAdmin.accounts.auth')}</th>
                    <th scope="col">{t('serverAdmin.accounts.open')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((account) => (
                    <tr key={account.id}>
                      <td>
                        <strong>{account.displayName}</strong>
                        <span className="server-admin-row-meta">
                          {account.id}
                        </span>
                      </td>
                      <td>{account.primaryEmail ?? '–'}</td>
                      <td>
                        {account.deletionStatus === 'PENDING'
                          ? t('serverAdmin.accounts.status.pendingDeletion')
                          : account.deletionStatus === 'COMPLETED'
                            ? t('serverAdmin.accounts.status.deleted')
                            : t(
                                account.disabledAt
                                  ? 'serverAdmin.accounts.status.suspended'
                                  : 'serverAdmin.accounts.status.active',
                              )}
                      </td>
                      <td>
                        {t(
                          account.emailVerified
                            ? 'serverAdmin.accounts.verification.verified'
                            : 'serverAdmin.accounts.verification.unverified',
                        )}
                      </td>
                      <td>{account.activeSessionCount}</td>
                      <td>
                        {account.authMethods.map(authMethodLabel).join(', ') ||
                          '–'}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => setSelectedAccountId(account.id)}
                        >
                          {t('serverAdmin.accounts.open')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="server-admin-pagination">
              <button
                type="button"
                className="secondary-button"
                disabled={!canGoBack}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                {t('serverAdmin.accounts.previous')}
              </button>
              <span>
                {offset + 1}–{offset + data.items.length} / {data.total}
              </span>
              <button
                type="button"
                className="secondary-button"
                disabled={!canGoForward}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                {t('serverAdmin.accounts.next')}
              </button>
            </div>
          </>
        ) : null}

        {selectedAccountId ? (
          <div className="server-admin-selected-account">
            <div className="server-admin-selected-account-toolbar">
              <h3>{t('serverAdmin.accounts.detail.title')}</h3>
              <button
                type="button"
                className="text-button"
                onClick={() => setSelectedAccountId(null)}
              >
                {t('serverAdmin.accounts.detail.close')}
              </button>
            </div>
            {detailQuery.isPending ? (
              <p className="server-admin-muted">
                {t('serverAdmin.accounts.detail.loading')}
              </p>
            ) : detailQuery.error ? (
              <p className="status status-error" role="alert">
                {t('serverAdmin.accounts.detail.error')}
              </p>
            ) : detailQuery.data ? (
              <AccountDetail
                account={detailQuery.data}
                api={api}
                apiBaseUrl={apiBaseUrl}
                accessToken={accessToken}
                onChanged={() => {
                  void detailQuery.refetch();
                  onOverviewChanged();
                }}
              />
            ) : null}
          </div>
        ) : null}
      </section>

      {actionActivityQuery.isPending ? (
        <section className="server-admin-panel server-admin-panel-wide">
          <p className="server-admin-muted">
            {t('serverAdmin.accounts.audit.loading')}
          </p>
        </section>
      ) : actionActivityQuery.error ? (
        <section className="server-admin-panel server-admin-panel-wide">
          <p className="status status-error" role="alert">
            {t('serverAdmin.accounts.audit.error')}
          </p>
        </section>
      ) : actionActivityQuery.data ? (
        <ActionAudit items={actionActivityQuery.data} />
      ) : null}
    </>
  );
}
