import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  useNavigate,
  useNavigationType,
  useSearchParams,
} from 'react-router-dom';
import type { ServerAdminApi } from '../api/generated/apis/ServerAdminApi';
import type { ServerAdminOverview } from '../api/generated/models/ServerAdminOverview';
import type { ServerAdminPrivilegedAuditItem } from '../api/generated/models/ServerAdminPrivilegedAuditItem';
import type { ServerAdminSettings } from '../api/generated/models/ServerAdminSettings';
import { formatBytes } from '../client/formatBytes';
import { PUBLIC_START_ROUTE } from '../client/publicStart';
import { DEFAULT_APP_ROUTE } from '../client/routes';
import { createServerAdminApis } from '../client/serverAdmin';
import { resolvedLocale, useTranslation } from '../i18n';
import { Brand } from './Brand';
import { ServerAdminAccountsPanel } from './ServerAdminAccountsPanel';
import {
  ServerAdminAreaNavigation,
  ServerAdminSubNavigation,
} from './ServerAdminAreaNavigation';
import { ServerAdminJobsPanel } from './ServerAdminJobsPanel';
import { ServerAdminMonitoringPanel } from './ServerAdminMonitoringPanel';
import { ServerAdminPeopleSearch } from './ServerAdminPeopleSearch';
import { ServerAdminSituation } from './ServerAdminSituation';
import { ServerAdminSpacesPanel } from './ServerAdminSpacesPanel';
import { ServerAdminStoragePanel } from './ServerAdminStoragePanel';
import { Snackbar } from './Snackbar';
import {
  availableSection,
  resolveServerAdminSection,
  type ServerAdminSection,
  sectionHref,
} from './serverAdminAreas';
import { TaskBackLink } from './TaskBackButton';
import { ThemeControl } from './ThemeControl';
import { UiState } from './UiState';
import './ServerAdminPage.css';

// Only installations with the operator plugin show the section, so its code
// loads on first use (#2189).
const ServerAdminSupportReportsPanel = lazy(() =>
  import('./ServerAdminSupportReportsPanel').then(
    ({ ServerAdminSupportReportsPanel }) => ({
      default: ServerAdminSupportReportsPanel,
    }),
  ),
);
const ServerAdminReplyTemplatesPanel = lazy(() =>
  import('./ServerAdminReplyTemplatesPanel').then(
    ({ ServerAdminReplyTemplatesPanel }) => ({
      default: ServerAdminReplyTemplatesPanel,
    }),
  ),
);

// Pro exists only on eimir. Cloud with the Pro plugin (part 5).
const ServerAdminProPanel = lazy(() =>
  import('./ServerAdminProPanel').then(({ ServerAdminProPanel }) => ({
    default: ServerAdminProPanel,
  })),
);

export {
  resolveServerAdminSection,
  type ServerAdminSection,
} from './serverAdminAreas';

export function ServerAdminAccessGate({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="server-admin-shell server-admin-gate-shell">
      <ThemeControl />
      <header className="server-admin-topbar">
        <TaskBackLink to={DEFAULT_APP_ROUTE}>
          {t('serverAdmin.backToApp')}
        </TaskBackLink>
        <Brand to={DEFAULT_APP_ROUTE} ariaLabel={t('brand.homeAria')} />
      </header>
      <main className="server-admin-main">
        <UiState
          kind={loading ? 'loading' : error ? 'error' : 'permission'}
          title={
            loading
              ? t('serverAdmin.access.loading')
              : error
                ? t('serverAdmin.access.errorTitle')
                : t('serverAdmin.access.deniedTitle')
          }
          body={
            error
              ? t('serverAdmin.access.errorBody')
              : loading
                ? undefined
                : t('serverAdmin.access.deniedBody')
          }
          action={
            <div className="server-admin-gate-actions">
              {error ? (
                <button type="button" onClick={onRetry}>
                  {t('serverAdmin.access.retry')}
                </button>
              ) : null}
            </div>
          }
        />
      </main>
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(resolvedLocale()).format(value);
}

function formatDate(value: Date | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="server-admin-metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function ServerAdminSettingsPanel({
  settings,
  registrationPending,
  maintenancePending,
  mutationError,
  onRegistrationChange,
  onMaintenanceChange,
}: {
  settings: ServerAdminSettings;
  registrationPending: boolean;
  maintenancePending: boolean;
  mutationError: Error | null;
  onRegistrationChange: (enabled: boolean) => void;
  onMaintenanceChange: (enabled: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <section
      className="server-admin-panel server-admin-panel-wide"
      aria-labelledby="server-settings-title"
    >
      <h2 id="server-settings-title">{t('serverAdmin.settings.title')}</h2>
      <p className="server-admin-muted">{t('serverAdmin.settings.body')}</p>
      <div className="server-admin-setting-list">
        <div className="server-admin-setting-row">
          <div>
            <strong>{t('serverAdmin.settings.registrationTitle')}</strong>
            <p id="server-registration-help" className="server-admin-muted">
              {t('serverAdmin.settings.registrationBody')}
            </p>
          </div>
          <button
            type="button"
            className="server-admin-toggle"
            aria-pressed={settings.registrationEnabled}
            aria-describedby="server-registration-help"
            disabled={registrationPending}
            onClick={() => onRegistrationChange(!settings.registrationEnabled)}
          >
            {t(
              settings.registrationEnabled
                ? 'serverAdmin.settings.enabled'
                : 'serverAdmin.settings.disabled',
            )}
          </button>
        </div>

        <div className="server-admin-setting-row">
          <div>
            <strong>{t('serverAdmin.settings.maintenanceTitle')}</strong>
            <p id="server-maintenance-help" className="server-admin-muted">
              {t('serverAdmin.settings.maintenanceBody')}
            </p>
          </div>
          <button
            type="button"
            className="server-admin-toggle"
            aria-pressed={settings.maintenanceMode}
            aria-describedby="server-maintenance-help"
            disabled={maintenancePending}
            onClick={() => onMaintenanceChange(!settings.maintenanceMode)}
          >
            {t(
              settings.maintenanceMode
                ? 'serverAdmin.settings.enabled'
                : 'serverAdmin.settings.disabled',
            )}
          </button>
        </div>
      </div>

      <div className="server-admin-effective-state" role="status">
        <span>{t('serverAdmin.settings.effectiveRegistration')}</span>
        <strong>
          {t(
            settings.effectiveRegistrationEnabled
              ? 'serverAdmin.settings.available'
              : 'serverAdmin.settings.unavailable',
          )}
        </strong>
      </div>
      <p className="server-admin-muted">
        {settings.maintenanceMode
          ? t('serverAdmin.settings.effectiveMaintenanceHint')
          : t('serverAdmin.settings.effectivePolicyHint')}
      </p>
      {mutationError ? (
        <p className="status status-error" role="alert">
          {t('serverAdmin.settings.updateError')}
        </p>
      ) : null}
    </section>
  );
}

const AUDIT_ACTIONS = [
  'registration_enabled',
  'maintenance_mode',
  'account_suspended',
  'account_unsuspended',
  'account_sessions_revoked',
  'account_email_verified',
  'account_recovery_email_requested',
  'account_recovery_issued',
  'account_deletion_requested',
  'account_deletion_completed',
  'account_deletion_failed',
  'space_entitlement_granted',
  'space_entitlement_revoked',
  'support_report.state_set',
  'support_report.reply_sent',
  'support_report.ticket_created',
  'support_report.ticket_cleared',
] as const;

type AuditCategory = 'all' | 'settings' | 'accounts' | 'spaces' | 'destructive';

function auditActionLabel(action: string, t: (key: string) => string): string {
  const key = `serverAdmin.activity.actions.${action}`;
  return AUDIT_ACTIONS.includes(action as (typeof AUDIT_ACTIONS)[number])
    ? t(key)
    : action;
}

function auditCategoryLabel(
  category: string,
  t: (key: string) => string,
): string {
  switch (category) {
    case 'settings':
    case 'accounts':
    case 'spaces':
    case 'destructive':
      return t(`serverAdmin.activity.categories.${category}`);
    default:
      return category;
  }
}

function auditEffectLabel(
  item: ServerAdminPrivilegedAuditItem,
  t: (key: string) => string,
): string {
  if (item.previousValue !== null && item.newValue !== null) {
    return `${t(item.previousValue ? 'serverAdmin.activity.enabled' : 'serverAdmin.activity.disabled')} → ${t(item.newValue ? 'serverAdmin.activity.enabled' : 'serverAdmin.activity.disabled')}`;
  }
  if (item.effectCount !== null) {
    return `${item.effectCount} ${t('serverAdmin.activity.effectCount')}`;
  }
  return '–';
}

function validOptionalUuid(value: string): boolean {
  return (
    value.trim() === '' ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

export function ServerAdminActivityPanel({
  api,
  initialCategory = 'all',
}: {
  api: ServerAdminApi;
  initialCategory?: AuditCategory;
}) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<AuditCategory>(initialCategory);
  const [action, setAction] = useState('all');
  const [actorDraft, setActorDraft] = useState('');
  const [targetDraft, setTargetDraft] = useState('');
  const [actorId, setActorId] = useState<string | undefined>();
  const [targetId, setTargetId] = useState<string | undefined>();
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);

  const request = useMemo(
    () => ({
      category,
      action: action === 'all' ? undefined : action,
      actorId,
      targetId,
      limit,
      offset,
    }),
    [action, actorId, category, limit, offset, targetId],
  );
  const query = useQuery({
    queryKey: ['server-admin', 'privileged-activity', request],
    queryFn: () =>
      api.getServerAdminPrivilegedActivityApiV1ServerAdminActivityPrivilegedGet(
        request,
      ),
    retry: false,
  });
  const data = query.data;
  const filterIdsValid =
    validOptionalUuid(actorDraft) && validOptionalUuid(targetDraft);
  const canGoBack = offset > 0;
  const canGoForward = data ? offset + data.items.length < data.total : false;

  function applyIdFilters() {
    if (!filterIdsValid) return;
    setOffset(0);
    setActorId(actorDraft.trim() || undefined);
    setTargetId(targetDraft.trim() || undefined);
  }

  return (
    <section
      className="server-admin-panel server-admin-panel-wide"
      aria-labelledby="server-activity-title"
    >
      <div className="server-admin-section-heading">
        <div>
          <h2 id="server-activity-title">{t('serverAdmin.activity.title')}</h2>
          <p className="server-admin-muted">{t('serverAdmin.activity.body')}</p>
        </div>
        {data ? (
          <span className="server-admin-count">
            {data.total} {t('serverAdmin.activity.totalSuffix')}
          </span>
        ) : null}
      </div>

      <div className="server-admin-audit-filters">
        <label>
          <span>{t('serverAdmin.activity.category')}</span>
          <select
            value={category}
            onChange={(event) => {
              setOffset(0);
              setCategory(event.target.value as AuditCategory);
            }}
          >
            {(
              ['all', 'settings', 'accounts', 'spaces', 'destructive'] as const
            ).map((value) => (
              <option key={value} value={value}>
                {t(`serverAdmin.activity.categories.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('serverAdmin.activity.action')}</span>
          <select
            value={action}
            onChange={(event) => {
              setOffset(0);
              setAction(event.target.value);
            }}
          >
            <option value="all">{t('serverAdmin.activity.allActions')}</option>
            {AUDIT_ACTIONS.map((value) => (
              <option key={value} value={value}>
                {auditActionLabel(value, t)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('serverAdmin.activity.actor')}</span>
          <input
            type="search"
            value={actorDraft}
            onChange={(event) => setActorDraft(event.target.value)}
            placeholder={t('serverAdmin.activity.actorPlaceholder')}
            aria-invalid={!validOptionalUuid(actorDraft) || undefined}
          />
        </label>
        <label>
          <span>{t('serverAdmin.activity.target')}</span>
          <input
            type="search"
            value={targetDraft}
            onChange={(event) => setTargetDraft(event.target.value)}
            placeholder={t('serverAdmin.activity.targetPlaceholder')}
            aria-invalid={!validOptionalUuid(targetDraft) || undefined}
          />
        </label>
        <button
          type="button"
          className="secondary-button"
          disabled={!filterIdsValid}
          onClick={applyIdFilters}
        >
          {t('serverAdmin.activity.applyFilters')}
        </button>
      </div>

      {!filterIdsValid ? (
        <p className="status status-error" role="alert">
          {t('serverAdmin.activity.invalidId')}
        </p>
      ) : null}

      {query.isPending ? (
        <p className="server-admin-muted">
          {t('serverAdmin.activity.loadingBody')}
        </p>
      ) : query.error ? (
        <p className="status status-error" role="alert">
          {t('serverAdmin.activity.errorBody')}
        </p>
      ) : data && data.items.length === 0 ? (
        <p className="server-admin-muted">{t('serverAdmin.activity.empty')}</p>
      ) : data ? (
        <>
          <div className="server-admin-table-scroll">
            <table className="server-admin-table">
              <thead>
                <tr>
                  <th scope="col">{t('serverAdmin.activity.changedAt')}</th>
                  <th scope="col">{t('serverAdmin.activity.action')}</th>
                  <th scope="col">{t('serverAdmin.activity.actor')}</th>
                  <th scope="col">{t('serverAdmin.activity.target')}</th>
                  <th scope="col">{t('serverAdmin.activity.effect')}</th>
                  <th scope="col">{t('serverAdmin.activity.status')}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDate(item.createdAt) ?? '–'}</td>
                    <td>
                      <span className="server-admin-badge">
                        {auditActionLabel(item.action, t)}
                      </span>
                      <span className="server-admin-row-meta">
                        {auditCategoryLabel(item.category, t)}
                      </span>
                    </td>
                    <td className="server-admin-actor-id">
                      {item.actorId ?? t('serverAdmin.activity.systemActor')}
                    </td>
                    <td className="server-admin-actor-id">
                      {item.targetAccountId ?? item.targetSpaceId ?? '–'}
                    </td>
                    <td>{auditEffectLabel(item, t)}</td>
                    <td>{t('serverAdmin.activity.completed')}</td>
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
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              {t('serverAdmin.activity.previous')}
            </button>
            <label className="server-admin-page-size">
              <span>{t('serverAdmin.activity.pageSize')}</span>
              <select
                value={limit}
                onChange={(event) => {
                  setOffset(0);
                  setLimit(Number(event.target.value));
                }}
              >
                {[25, 50, 100].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <span>
              {offset + 1}–{offset + data.items.length} / {data.total}
            </span>
            <button
              type="button"
              className="secondary-button"
              disabled={!canGoForward}
              onClick={() => setOffset(offset + limit)}
            >
              {t('serverAdmin.activity.next')}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function OverviewContent({
  overview,
  section,
}: {
  overview: ServerAdminOverview;
  section: Extract<ServerAdminSection, 'overview' | 'jobs' | 'security'>;
}) {
  const { t } = useTranslation();
  const lastSuccessfulJob = formatDate(overview.lastSuccessfulJobAt);
  const oldestPendingJob = formatDate(overview.oldestPendingJobAt);

  return (
    <>
      {section === 'overview' ? (
        <ServerAdminSituation overview={overview} />
      ) : null}

      {section === 'overview' ? (
        <section
          className="server-admin-panel"
          aria-labelledby="server-usage-title"
        >
          <h2 id="server-usage-title">{t('serverAdmin.usage.title')}</h2>
          <dl className="server-admin-metrics">
            <Metric
              label={t('serverAdmin.usage.accounts')}
              value={formatNumber(overview.accountCount)}
            />
            <Metric
              label={t('serverAdmin.usage.enabledAccounts')}
              value={formatNumber(overview.enabledAccountCount)}
            />
            <Metric
              label={t('serverAdmin.usage.suspendedAccounts')}
              value={formatNumber(overview.suspendedAccountCount)}
            />
            <Metric
              label={t('serverAdmin.usage.spaces')}
              value={formatNumber(overview.activeSpaceCount)}
            />
            <Metric
              label={t('serverAdmin.usage.accounts24h')}
              value={formatNumber(overview.accountsLast24h)}
            />
            <Metric
              label={t('serverAdmin.usage.accounts7d')}
              value={formatNumber(overview.accountsLast7d)}
            />
            <Metric
              label={t('serverAdmin.usage.accounts30d')}
              value={formatNumber(overview.accountsLast30d)}
            />
            <Metric
              label={t('serverAdmin.usage.activeSessions')}
              value={formatNumber(overview.activeSessionCount)}
            />
            <Metric
              label={t('serverAdmin.usage.verifiedEmails')}
              value={formatNumber(overview.verifiedPrimaryEmailCount)}
            />
            <Metric
              label={t('serverAdmin.usage.unverifiedEmails')}
              value={formatNumber(overview.unverifiedPrimaryEmailCount)}
            />
            <Metric
              label={t('serverAdmin.usage.mediaObjects')}
              value={formatNumber(overview.mediaObjectCount)}
            />
            <Metric
              label={t('serverAdmin.usage.mediaBytes')}
              value={formatBytes(overview.mediaStoredBytes)}
            />
            <Metric
              label={t('serverAdmin.usage.supportReportsNew')}
              value={formatNumber(overview.supportReportsNew)}
            />
          </dl>
        </section>
      ) : null}

      {section === 'security' ? (
        <section
          className="server-admin-panel"
          aria-labelledby="server-security-title"
        >
          <h2 id="server-security-title">{t('serverAdmin.security.title')}</h2>
          <dl className="server-admin-metrics">
            <Metric
              label={t('serverAdmin.security.localPassword')}
              value={formatNumber(overview.localPasswordAccountCount)}
            />
            <Metric
              label={t('serverAdmin.security.oidc')}
              value={formatNumber(overview.oidcAccountCount)}
            />
            <Metric
              label={t('serverAdmin.security.passkey')}
              value={formatNumber(overview.passkeyAccountCount)}
            />
            <Metric
              label={t('serverAdmin.security.serverAdmins')}
              value={`${formatNumber(overview.serverAdminVerifiedMatchCount)} / ${formatNumber(overview.serverAdminAllowlistCount)}`}
            />
          </dl>
        </section>
      ) : null}

      {section === 'jobs' ? (
        <section
          className="server-admin-panel server-admin-panel-wide"
          aria-labelledby="server-jobs-title"
        >
          <h2 id="server-jobs-title">{t('serverAdmin.jobs.title')}</h2>
          <dl className="server-admin-metrics server-admin-job-metrics">
            <Metric
              label={t('serverAdmin.jobs.pending')}
              value={formatNumber(overview.jobsPending)}
            />
            <Metric
              label={t('serverAdmin.jobs.running')}
              value={formatNumber(overview.jobsRunning)}
            />
            <Metric
              label={t('serverAdmin.jobs.failed')}
              value={formatNumber(overview.jobsFailed)}
            />
            <Metric
              label={t('serverAdmin.jobs.oldestPending')}
              value={oldestPendingJob ?? '–'}
            />
            <Metric
              label={t('serverAdmin.jobs.lastSuccess')}
              value={lastSuccessfulJob ?? t('serverAdmin.jobs.noSuccess')}
            />
          </dl>
          <h3>{t('serverAdmin.jobs.failuresTitle')}</h3>
          {overview.recentFailedJobs.length === 0 ? (
            <p className="server-admin-muted">
              {t('serverAdmin.jobs.noFailures')}
            </p>
          ) : (
            <div className="server-admin-table-scroll">
              <table className="server-admin-table">
                <thead>
                  <tr>
                    <th scope="col">{t('serverAdmin.jobs.kind')}</th>
                    <th scope="col">{t('serverAdmin.jobs.attempts')}</th>
                    <th scope="col">{t('serverAdmin.jobs.finishedAt')}</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.recentFailedJobs.map((job) => (
                    <tr key={job.id}>
                      <td>{job.kind}</td>
                      <td>
                        {formatNumber(job.attempts)} /{' '}
                        {formatNumber(job.maxAttempts)}
                      </td>
                      <td>{formatDate(job.finishedAt) ?? '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {section === 'security' ? (
        <section
          className="server-admin-panel"
          aria-labelledby="server-configuration-title"
        >
          <h2 id="server-configuration-title">
            {t('serverAdmin.configuration.title')}
          </h2>
          <dl className="server-admin-config-list">
            <Metric
              label={t('serverAdmin.configuration.deployment')}
              value={overview.deployment}
            />
            <Metric
              label={t('serverAdmin.configuration.environment')}
              value={overview.environment}
            />
            <Metric
              label={t('serverAdmin.configuration.revision')}
              value={overview.buildRevision}
            />
            <Metric
              label={t('serverAdmin.configuration.startedAt')}
              value={formatDate(overview.processStartedAt) ?? '–'}
            />
            <Metric
              label={t('serverAdmin.configuration.publicBaseUrl')}
              value={overview.publicBaseUrl}
            />
            <Metric
              label={t('serverAdmin.configuration.mediaStore')}
              value={overview.mediaStore}
            />
            <Metric
              label={t('serverAdmin.configuration.mailTransport')}
              value={overview.mailTransport}
            />
            <Metric
              label={t('serverAdmin.configuration.oidcConnections')}
              value={formatNumber(overview.oidcConnectionCount)}
            />
            <Metric
              label={t('serverAdmin.configuration.databaseProvider')}
              value={overview.databaseProvider}
            />
            <Metric
              label={t('serverAdmin.configuration.demoMode')}
              value={t(
                overview.demoMode
                  ? 'serverAdmin.configuration.enabled'
                  : 'serverAdmin.configuration.disabled',
              )}
            />
          </dl>
        </section>
      ) : null}
    </>
  );
}

export function ServerAdminPage({
  apiBaseUrl,
  accessToken,
  onLogout,
}: {
  apiBaseUrl: string;
  accessToken: string;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigationType = useNavigationType();
  // The page lives outside the app shell's route handoff, so it kept the
  // scroll offset of Mehr and opened halfway down (#2063). An in-app entry
  // starts at the top; Back and Forward keep the browser's restoration.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Runs once per page entry.
  useEffect(() => {
    if (navigationType !== 'POP') window.scrollTo(0, 0);
  }, []);
  const requestedSection = resolveServerAdminSection(
    searchParams.get('section'),
  );
  const queryClient = useQueryClient();
  const apis = useMemo(
    () => createServerAdminApis(apiBaseUrl, accessToken),
    [accessToken, apiBaseUrl],
  );
  // Every section reads the overview: its `supportReportsOperatorAvailable`
  // decides whether the navigation offers the Reports section.
  const overviewQuery = useQuery({
    queryKey: ['server-admin', 'overview'],
    queryFn: () =>
      apis.serverAdmin.getServerAdminOverviewApiV1ServerAdminOverviewGet(),
    retry: false,
  });
  const supportReportsAvailable =
    overviewQuery.data?.supportReportsOperatorAvailable === true;
  const proAreaAvailable = overviewQuery.data?.proAreaAvailable === true;
  // A Pro link without the Pro area opens the overview once that is known.
  const section = overviewQuery.isPending
    ? requestedSection
    : availableSection(requestedSection, { proAreaAvailable });
  const overviewSection =
    section === 'overview' || section === 'jobs' || section === 'security';
  // An unsent reply or ticket text in an open report; leaving the section asks.
  const [reportsDraftDirty, setReportsDraftDirty] = useState(false);
  const confirmLeaveReports = () =>
    !reportsDraftDirty ||
    window.confirm(t('serverAdmin.reports.detail.discardDraftConfirm'));
  const navigate = useNavigate();
  // Both Help pages need the operator plugin; without it they share one state.
  const helpSection = section === 'reports' || section === 'replyTemplates';
  const settingsQuery = useQuery({
    queryKey: ['server-admin', 'settings'],
    queryFn: () =>
      apis.serverAdmin.getServerAdminSettingsApiV1ServerAdminSettingsGet(),
    retry: false,
    enabled: section === 'settings',
  });
  // Both toggles write the same server-serialized settings row. A response
  // snapshot can arrive out of order, so never paint it; refetch the
  // authoritative row instead (invalidation cancels older in-flight reads).
  function settleSettingsMutation() {
    void queryClient.invalidateQueries({
      queryKey: ['server-admin', 'settings'],
    });
  }
  const registrationMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apis.serverAdmin.updateRegistrationSettingApiV1ServerAdminSettingsRegistrationPut(
        { serverAdminSettingUpdate: { enabled } },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['server-admin', 'activity'],
      });
      void queryClient.invalidateQueries({
        queryKey: ['server-admin', 'overview'],
      });
    },
    onSettled: settleSettingsMutation,
  });
  const maintenanceMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apis.serverAdmin.updateMaintenanceSettingApiV1ServerAdminSettingsMaintenancePut(
        { serverAdminSettingUpdate: { enabled } },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['server-admin', 'activity'],
      });
      void queryClient.invalidateQueries({
        queryKey: ['server-admin', 'overview'],
      });
    },
    onSettled: settleSettingsMutation,
  });
  const refreshing =
    (overviewSection && overviewQuery.isFetching) ||
    (section === 'settings' && settingsQuery.isFetching);
  const mutationError = registrationMutation.error ?? maintenanceMutation.error;

  function refreshCurrentSection() {
    if (section === 'jobs') {
      void overviewQuery.refetch();
      void queryClient.invalidateQueries({
        queryKey: ['server-admin', 'jobs'],
      });
      return;
    }
    if (overviewSection) {
      void overviewQuery.refetch();
      return;
    }
    if (section === 'monitoring') {
      void queryClient.invalidateQueries({
        queryKey: ['server-admin', 'monitoring'],
      });
      return;
    }
    if (section === 'storage') {
      void queryClient.invalidateQueries({
        queryKey: ['server-admin', 'storage'],
      });
      return;
    }
    if (section === 'replyTemplates') {
      void overviewQuery.refetch();
      void queryClient.invalidateQueries({
        queryKey: ['server-admin', 'support-reports', 'templates'],
      });
      return;
    }
    if (section === 'reports') {
      void overviewQuery.refetch();
      void queryClient.invalidateQueries({
        queryKey: ['server-admin', 'support-reports'],
      });
      void queryClient.invalidateQueries({
        queryKey: ['server-admin', 'support-report'],
      });
      return;
    }
    if (section === 'settings') {
      void settingsQuery.refetch();
      return;
    }
    if (section === 'pro') {
      void queryClient.invalidateQueries({
        queryKey: ['server-admin', 'pro'],
      });
      return;
    }
    if (section === 'activity') {
      void queryClient.invalidateQueries({
        queryKey: ['server-admin', 'privileged-activity'],
      });
      return;
    }
    if (section === 'accounts') {
      void queryClient.invalidateQueries({
        queryKey: ['server-admin', 'accounts'],
      });
      void queryClient.invalidateQueries({
        queryKey: ['server-admin', 'action-activity'],
      });
      return;
    }
    if (section === 'search') {
      void queryClient.invalidateQueries({
        queryKey: ['server-admin', 'search'],
      });
      return;
    }
    if (section === 'spaces') {
      void queryClient.invalidateQueries({
        queryKey: ['server-admin', 'spaces'],
      });
      void queryClient.invalidateQueries({
        queryKey: ['server-admin', 'space-file'],
      });
      void queryClient.invalidateQueries({
        queryKey: ['server-admin', 'space'],
      });
    }
  }

  function updateMaintenance(enabled: boolean) {
    if (
      enabled &&
      !window.confirm(t('serverAdmin.settings.maintenanceConfirmEnable'))
    ) {
      return;
    }
    maintenanceMutation.mutate(enabled);
  }

  function logout() {
    onLogout();
    window.location.assign(PUBLIC_START_ROUTE);
  }

  return (
    <div className="server-admin-shell">
      <ThemeControl />
      <a className="skip-link" href="#server-admin-main">
        {t('navigation.skipToContent')}
      </a>
      <header className="server-admin-topbar">
        <TaskBackLink to={DEFAULT_APP_ROUTE}>
          {t('serverAdmin.backToApp')}
        </TaskBackLink>
        <Brand to={DEFAULT_APP_ROUTE} ariaLabel={t('brand.homeAria')} />
        <nav
          className="server-admin-topbar-actions"
          aria-label={t('serverAdmin.title')}
        >
          <button type="button" className="text-button" onClick={logout}>
            {t('serverAdmin.logout')}
          </button>
        </nav>
      </header>

      <main id="server-admin-main" className="server-admin-main" tabIndex={-1}>
        <div className="server-admin-heading-row">
          <div>
            <p className="eyebrow">{t('serverAdmin.eyebrow')}</p>
            <h1>{t('serverAdmin.title')}</h1>
            <p className="server-admin-intro">{t('serverAdmin.intro')}</p>
          </div>
          <button
            type="button"
            onClick={refreshCurrentSection}
            disabled={refreshing}
          >
            {t('serverAdmin.refresh')}
          </button>
        </div>

        <div className="server-admin-workspace">
          <ServerAdminAreaNavigation
            activeSection={section}
            supportReportsAvailable={supportReportsAvailable}
            proAreaAvailable={proAreaAvailable}
            supportReportsNew={overviewQuery.data?.supportReportsNew ?? 0}
            confirmLeave={
              section === 'reports' ? confirmLeaveReports : undefined
            }
          />

          <div className="server-admin-grid">
            <ServerAdminSubNavigation
              activeSection={section}
              confirmLeave={
                section === 'reports' ? confirmLeaveReports : undefined
              }
            />
            {helpSection ? (
              supportReportsAvailable ? (
                <Suspense
                  fallback={
                    <section className="server-admin-panel server-admin-panel-wide">
                      <UiState
                        kind="loading"
                        title={t('serverAdmin.states.loadingTitle')}
                        body={t('serverAdmin.states.loadingBody')}
                      />
                    </section>
                  }
                >
                  {section === 'replyTemplates' ? (
                    <ServerAdminReplyTemplatesPanel api={apis.supportReports} />
                  ) : (
                    <ServerAdminSupportReportsPanel
                      api={apis.supportReports}
                      initialFilter={searchParams.get('state')}
                      onDraftChange={setReportsDraftDirty}
                      onEditTemplates={() => {
                        // The open report asked already; the draft is given up.
                        setReportsDraftDirty(false);
                        navigate(sectionHref('replyTemplates'));
                      }}
                    />
                  )}
                </Suspense>
              ) : (
                <section className="server-admin-panel server-admin-panel-wide">
                  {overviewQuery.isPending ? (
                    <UiState
                      kind="loading"
                      title={t('serverAdmin.states.loadingTitle')}
                      body={t('serverAdmin.states.loadingBody')}
                    />
                  ) : overviewQuery.error ? (
                    <UiState
                      kind="error"
                      title={t('serverAdmin.states.errorTitle')}
                      body={t('serverAdmin.states.errorBody')}
                      action={
                        <button
                          type="button"
                          onClick={() => void overviewQuery.refetch()}
                        >
                          {t('serverAdmin.refresh')}
                        </button>
                      }
                    />
                  ) : (
                    <UiState
                      kind="permission"
                      title={t('serverAdmin.reportsUnavailable.title')}
                      body={t('serverAdmin.reportsUnavailable.body')}
                    />
                  )}
                </section>
              )
            ) : null}

            {section === 'settings' ? (
              settingsQuery.isPending ? (
                <section className="server-admin-panel server-admin-panel-wide">
                  <UiState
                    kind="loading"
                    title={t('serverAdmin.settings.loadingTitle')}
                    body={t('serverAdmin.settings.loadingBody')}
                  />
                </section>
              ) : settingsQuery.error ? (
                <section className="server-admin-panel server-admin-panel-wide">
                  <UiState
                    kind="error"
                    title={t('serverAdmin.settings.errorTitle')}
                    body={t('serverAdmin.settings.errorBody')}
                    action={
                      <button
                        type="button"
                        onClick={() => void settingsQuery.refetch()}
                      >
                        {t('serverAdmin.refresh')}
                      </button>
                    }
                  />
                </section>
              ) : settingsQuery.data ? (
                <ServerAdminSettingsPanel
                  settings={settingsQuery.data}
                  registrationPending={registrationMutation.isPending}
                  maintenancePending={maintenanceMutation.isPending}
                  mutationError={mutationError}
                  onRegistrationChange={(enabled) =>
                    registrationMutation.mutate(enabled)
                  }
                  onMaintenanceChange={updateMaintenance}
                />
              ) : null
            ) : null}

            {overviewSection ? (
              overviewQuery.isPending ? (
                <section className="server-admin-panel server-admin-panel-wide">
                  <UiState
                    kind="loading"
                    title={t('serverAdmin.states.loadingTitle')}
                    body={t('serverAdmin.states.loadingBody')}
                  />
                </section>
              ) : overviewQuery.error ? (
                <section className="server-admin-panel server-admin-panel-wide">
                  <UiState
                    kind="error"
                    title={t('serverAdmin.states.errorTitle')}
                    body={t('serverAdmin.states.errorBody')}
                    action={
                      <button
                        type="button"
                        onClick={() => void overviewQuery.refetch()}
                      >
                        {t('serverAdmin.refresh')}
                      </button>
                    }
                  />
                </section>
              ) : overviewQuery.data ? (
                <OverviewContent
                  overview={overviewQuery.data}
                  section={
                    section as Extract<
                      ServerAdminSection,
                      'overview' | 'jobs' | 'security'
                    >
                  }
                />
              ) : null
            ) : null}

            {section === 'jobs' ? (
              <ServerAdminJobsPanel api={apis.serverAdmin} />
            ) : null}

            {section === 'monitoring' ? (
              <ServerAdminMonitoringPanel api={apis.serverAdmin} />
            ) : null}

            {section === 'storage' ? (
              <ServerAdminStoragePanel api={apis.serverAdmin} />
            ) : null}

            {section === 'search' ? (
              <ServerAdminPeopleSearch api={apis.serverAdmin} />
            ) : null}

            {section === 'accounts' ? (
              <ServerAdminAccountsPanel
                api={apis.serverAdmin}
                initialAccountId={searchParams.get('account')}
                onOverviewChanged={() =>
                  void queryClient.invalidateQueries({
                    queryKey: ['server-admin', 'overview'],
                  })
                }
              />
            ) : null}

            {section === 'spaces' ? (
              <ServerAdminSpacesPanel
                api={apis.serverAdmin}
                initialSpaceId={searchParams.get('space')}
              />
            ) : null}

            {section === 'pro' ? (
              proAreaAvailable ? (
                <Suspense
                  fallback={
                    <section className="server-admin-panel server-admin-panel-wide">
                      <UiState
                        kind="loading"
                        title={t('serverAdmin.states.loadingTitle')}
                        body={t('serverAdmin.states.loadingBody')}
                      />
                    </section>
                  }
                >
                  <ServerAdminProPanel
                    api={apis.pro}
                    publicBaseUrl={overviewQuery.data?.publicBaseUrl}
                  />
                </Suspense>
              ) : (
                <section className="server-admin-panel server-admin-panel-wide">
                  <UiState
                    kind="loading"
                    title={t('serverAdmin.states.loadingTitle')}
                    body={t('serverAdmin.states.loadingBody')}
                  />
                </section>
              )
            ) : null}

            {section === 'activity' ? (
              <ServerAdminActivityPanel
                api={apis.serverAdmin}
                initialCategory={
                  searchParams.get('category') === 'accounts'
                    ? 'accounts'
                    : searchParams.get('category') === 'settings'
                      ? 'settings'
                      : searchParams.get('category') === 'spaces'
                        ? 'spaces'
                        : searchParams.get('category') === 'destructive'
                          ? 'destructive'
                          : 'all'
                }
              />
            ) : null}
          </div>
        </div>

        <p className="server-admin-privacy-note">
          {t('serverAdmin.privacyNote')}
        </p>
      </main>
      {/* Copy feedback of the Pro area; the app shell's snackbar is not mounted here. */}
      <Snackbar />
    </div>
  );
}
