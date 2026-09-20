import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import type { ServerAdminActivityItem } from '../api/generated/models/ServerAdminActivityItem';
import type { ServerAdminOverview } from '../api/generated/models/ServerAdminOverview';
import type { ServerAdminSettings } from '../api/generated/models/ServerAdminSettings';
import { PUBLIC_START_ROUTE } from '../client/publicStart';
import { DEFAULT_APP_ROUTE, SERVER_ADMIN_ROUTE } from '../client/routes';
import { createServerAdminApis } from '../client/serverAdmin';
import { resolvedLocale, useTranslation } from '../i18n';
import { Brand } from './Brand';
import { ServerAdminAccountsPanel } from './ServerAdminAccountsPanel';
import { ServerAdminJobsPanel } from './ServerAdminJobsPanel';
import { ServerAdminSpacesPanel } from './ServerAdminSpacesPanel';
import { ServerAdminStoragePanel } from './ServerAdminStoragePanel';
import { ThemeControl } from './ThemeControl';
import { UiState } from './UiState';
import './ServerAdminPage.css';

const SERVER_ADMIN_SECTIONS = [
  'overview',
  'accounts',
  'spaces',
  'jobs',
  'storage',
  'security',
  'settings',
  'activity',
] as const;

export type ServerAdminSection = (typeof SERVER_ADMIN_SECTIONS)[number];

export function resolveServerAdminSection(
  value: string | null,
): ServerAdminSection {
  return SERVER_ADMIN_SECTIONS.includes(value as ServerAdminSection)
    ? (value as ServerAdminSection)
    : 'overview';
}

function sectionHref(section: ServerAdminSection): string {
  return section === 'overview'
    ? SERVER_ADMIN_ROUTE
    : `${SERVER_ADMIN_ROUTE}?section=${section}`;
}

export function ServerAdminSectionNavigation({
  activeSection,
}: {
  activeSection: ServerAdminSection;
}) {
  const { t } = useTranslation();
  const sections: Array<{ id: ServerAdminSection; label: string }> = [
    { id: 'overview', label: t('serverAdmin.navigation.overview') },
    { id: 'accounts', label: t('serverAdmin.navigation.accounts') },
    { id: 'spaces', label: t('serverAdmin.navigation.spaces') },
    { id: 'jobs', label: t('serverAdmin.navigation.jobs') },
    { id: 'storage', label: t('serverAdmin.navigation.storage') },
    { id: 'security', label: t('serverAdmin.navigation.security') },
    { id: 'settings', label: t('serverAdmin.navigation.settings') },
    { id: 'activity', label: t('serverAdmin.navigation.activity') },
  ];

  return (
    <nav
      className="server-admin-section-nav"
      aria-label={t('serverAdmin.navigation.aria')}
    >
      {sections.map((section) => (
        <Link
          key={section.id}
          className="server-admin-section-link"
          to={sectionHref(section.id)}
          aria-current={section.id === activeSection ? 'page' : undefined}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}

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
              <Link
                className="button-link secondary-link"
                to={DEFAULT_APP_ROUTE}
              >
                {t('serverAdmin.backToApp')}
              </Link>
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

function formatBytes(value: number): string {
  if (value < 1024) return `${formatNumber(value)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let amount = value / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && amount >= 1024; index += 1) {
    amount /= 1024;
    unit = units[index];
  }
  return `${new Intl.NumberFormat(resolvedLocale(), { maximumFractionDigits: 1 }).format(amount)} ${unit}`;
}

function healthLabel(status: string, t: (key: string) => string): string {
  switch (status) {
    case 'ok':
      return t('serverAdmin.health.ok');
    case 'unavailable':
      return t('serverAdmin.health.unavailable');
    case 'no_heartbeat_signal':
      return t('serverAdmin.health.noHeartbeat');
    case 'not_probed':
      return t('serverAdmin.health.notProbed');
    default:
      return t('serverAdmin.health.unknown');
  }
}

function warningLabel(code: string, t: (key: string) => string): string {
  switch (code) {
    case 'maintenance_mode_enabled':
      return t('serverAdmin.warnings.maintenance');
    case 'registration_disabled':
      return t('serverAdmin.warnings.registration');
    case 'server_admin_allowlist_empty':
      return t('serverAdmin.warnings.adminAllowlistEmpty');
    case 'server_admin_allowlist_unmatched':
      return t('serverAdmin.warnings.adminAllowlistUnmatched');
    case 'mail_disabled_with_unverified_accounts':
      return t('serverAdmin.warnings.mailVerification');
    case 'failed_jobs_present':
      return t('serverAdmin.warnings.failedJobs');
    default:
      return code;
  }
}

function StatusRow({ label, status }: { label: string; status: string }) {
  const { t } = useTranslation();
  const statusClass = status === 'ok' ? 'is-ok' : 'is-neutral';
  return (
    <div className="server-admin-status-row">
      <span>{label}</span>
      <span className={`server-admin-status ${statusClass}`}>
        {healthLabel(status, t)}
      </span>
    </div>
  );
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

function activitySettingLabel(
  setting: string,
  t: (key: string) => string,
): string {
  switch (setting) {
    case 'registration_enabled':
      return t('serverAdmin.activity.registration');
    case 'maintenance_mode':
      return t('serverAdmin.activity.maintenance');
    default:
      return t('serverAdmin.activity.unknown');
  }
}

function booleanStateLabel(value: boolean, t: (key: string) => string): string {
  return t(
    value ? 'serverAdmin.activity.enabled' : 'serverAdmin.activity.disabled',
  );
}

export function ServerAdminActivityPanel({
  activity,
}: {
  activity: ServerAdminActivityItem[];
}) {
  const { t } = useTranslation();
  return (
    <section
      className="server-admin-panel server-admin-panel-wide"
      aria-labelledby="server-activity-title"
    >
      <h2 id="server-activity-title">{t('serverAdmin.activity.title')}</h2>
      <p className="server-admin-muted">{t('serverAdmin.activity.body')}</p>
      {activity.length === 0 ? (
        <p className="server-admin-muted">{t('serverAdmin.activity.empty')}</p>
      ) : (
        <div className="server-admin-table-scroll">
          <table className="server-admin-table">
            <thead>
              <tr>
                <th scope="col">{t('serverAdmin.activity.setting')}</th>
                <th scope="col">{t('serverAdmin.activity.change')}</th>
                <th scope="col">{t('serverAdmin.activity.actor')}</th>
                <th scope="col">{t('serverAdmin.activity.changedAt')}</th>
              </tr>
            </thead>
            <tbody>
              {activity.map((item) => (
                <tr key={item.id}>
                  <td>{activitySettingLabel(item.setting, t)}</td>
                  <td>
                    {booleanStateLabel(item.previousValue, t)} →{' '}
                    {booleanStateLabel(item.newValue, t)}
                  </td>
                  <td className="server-admin-actor-id">
                    {item.actorId ?? t('serverAdmin.activity.systemActor')}
                  </td>
                  <td>{formatDate(item.createdAt) ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
      {section === 'overview' && overview.warningCodes.length > 0 ? (
        <section
          className="server-admin-panel server-admin-panel-wide server-admin-warning-panel"
          aria-labelledby="server-warnings-title"
        >
          <h2 id="server-warnings-title">{t('serverAdmin.warnings.title')}</h2>
          <ul>
            {overview.warningCodes.map((code) => (
              <li key={code}>{warningLabel(code, t)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {section === 'overview' ? (
        <section
          className="server-admin-panel"
          aria-labelledby="server-health-title"
        >
          <h2 id="server-health-title">{t('serverAdmin.health.title')}</h2>
          <div className="server-admin-status-list">
            <StatusRow
              label={t('serverAdmin.health.application')}
              status={overview.applicationStatus}
            />
            <StatusRow
              label={t('serverAdmin.health.database')}
              status={overview.databaseStatus}
            />
            <StatusRow
              label={t('serverAdmin.health.worker')}
              status={overview.workerStatus}
            />
            <StatusRow
              label={t('serverAdmin.health.media')}
              status={overview.mediaStatus}
            />
          </div>
        </section>
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
  const section = resolveServerAdminSection(searchParams.get('section'));
  const overviewSection =
    section === 'overview' || section === 'jobs' || section === 'security';
  const queryClient = useQueryClient();
  const apis = useMemo(
    () => createServerAdminApis(apiBaseUrl, accessToken),
    [accessToken, apiBaseUrl],
  );
  const overviewQuery = useQuery({
    queryKey: ['server-admin', 'overview'],
    queryFn: () =>
      apis.serverAdmin.getServerAdminOverviewApiV1ServerAdminOverviewGet(),
    retry: false,
    enabled: overviewSection,
  });
  const settingsQuery = useQuery({
    queryKey: ['server-admin', 'settings'],
    queryFn: () =>
      apis.serverAdmin.getServerAdminSettingsApiV1ServerAdminSettingsGet(),
    retry: false,
    enabled: section === 'settings',
  });
  const activityQuery = useQuery({
    queryKey: ['server-admin', 'activity'],
    queryFn: () =>
      apis.serverAdmin.getServerAdminActivityApiV1ServerAdminActivityGet(),
    retry: false,
    enabled: section === 'activity',
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
    (section === 'settings' && settingsQuery.isFetching) ||
    (section === 'activity' && activityQuery.isFetching);
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
    if (section === 'storage') {
      void queryClient.invalidateQueries({
        queryKey: ['server-admin', 'storage'],
      });
      return;
    }
    if (section === 'settings') {
      void settingsQuery.refetch();
      return;
    }
    if (section === 'activity') {
      void activityQuery.refetch();
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
    if (section === 'spaces') {
      void queryClient.invalidateQueries({
        queryKey: ['server-admin', 'spaces'],
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
        <Brand to={DEFAULT_APP_ROUTE} ariaLabel={t('brand.homeAria')} />
        <nav
          className="server-admin-topbar-actions"
          aria-label={t('serverAdmin.title')}
        >
          <Link className="secondary-link" to={DEFAULT_APP_ROUTE}>
            {t('serverAdmin.backToApp')}
          </Link>
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
          <ServerAdminSectionNavigation activeSection={section} />

          <div className="server-admin-grid">
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

            {section === 'storage' ? (
              <ServerAdminStoragePanel api={apis.serverAdmin} />
            ) : null}

            {section === 'accounts' ? (
              <ServerAdminAccountsPanel
                api={apis.serverAdmin}
                apiBaseUrl={apiBaseUrl}
                accessToken={accessToken}
                onOverviewChanged={() =>
                  void queryClient.invalidateQueries({
                    queryKey: ['server-admin', 'overview'],
                  })
                }
              />
            ) : null}

            {section === 'spaces' ? (
              <ServerAdminSpacesPanel api={apis.serverAdmin} />
            ) : null}

            {section === 'activity' ? (
              activityQuery.isPending ? (
                <section className="server-admin-panel server-admin-panel-wide">
                  <UiState
                    kind="loading"
                    title={t('serverAdmin.activity.loadingTitle')}
                    body={t('serverAdmin.activity.loadingBody')}
                  />
                </section>
              ) : activityQuery.error ? (
                <section className="server-admin-panel server-admin-panel-wide">
                  <UiState
                    kind="error"
                    title={t('serverAdmin.activity.errorTitle')}
                    body={t('serverAdmin.activity.errorBody')}
                    action={
                      <button
                        type="button"
                        onClick={() => void activityQuery.refetch()}
                      >
                        {t('serverAdmin.refresh')}
                      </button>
                    }
                  />
                </section>
              ) : activityQuery.data ? (
                <ServerAdminActivityPanel activity={activityQuery.data} />
              ) : null
            ) : null}
          </div>
        </div>

        <p className="server-admin-privacy-note">
          {t('serverAdmin.privacyNote')}
        </p>
      </main>
    </div>
  );
}
