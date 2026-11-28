import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ServerAdminApi } from '../api/generated/apis/ServerAdminApi';
import type { ServerAdminMonitoring } from '../api/generated/models/ServerAdminMonitoring';
import { formatBytes } from '../client/formatBytes';
import { resolvedLocale, useTranslation } from '../i18n';
import { Sparkline } from './Sparkline';
import { UiState } from './UiState';

type MonitoringRange = '24h' | '30d' | '90d';
const RANGES: MonitoringRange[] = ['24h', '30d', '90d'];

function errorRate(points: ServerAdminMonitoring['points']): number | null {
  const requests = points.reduce((sum, point) => sum + point.requests, 0);
  if (requests === 0) return null;
  return points.reduce((sum, point) => sum + point.serverErrors, 0) / requests;
}

function lastValue(values: Array<number | null>): number | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (value !== null) return value;
  }
  return null;
}

/**
 * System › Monitoring (ServerAdmin redesign part 2, #2317): history of the
 * chosen range, storage, which services still report, and the two alert
 * switches: mails and app push (#2314 part 2b).
 */
export function ServerAdminMonitoringPanel({ api }: { api: ServerAdminApi }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [range, setRange] = useState<MonitoringRange>('24h');
  const query = useQuery({
    queryKey: ['server-admin', 'monitoring', range],
    queryFn: () =>
      api.getServerAdminMonitoringApiV1ServerAdminMonitoringGet({ range }),
    retry: false,
  });
  // The switch moves at once; a failed save puts it back and says so.
  const [alertsDraft, setAlertsDraft] = useState<boolean | null>(null);
  const alerts = useMutation({
    mutationFn: (enabled: boolean) =>
      api.updateMonitoringAlertsSettingApiV1ServerAdminSettingsMonitoringAlertsPut(
        { serverAdminSettingUpdate: { enabled } },
      ),
    onMutate: (enabled) => setAlertsDraft(enabled),
    onSuccess: (_settings, enabled) => {
      queryClient.setQueriesData<ServerAdminMonitoring>(
        { queryKey: ['server-admin', 'monitoring'] },
        (current) =>
          current ? { ...current, alertsEnabled: enabled } : current,
      );
      void queryClient.invalidateQueries({
        queryKey: ['server-admin', 'settings'],
      });
    },
    onSettled: () => setAlertsDraft(null),
  });
  const [pushDraft, setPushDraft] = useState<boolean | null>(null);
  const push = useMutation({
    mutationFn: (enabled: boolean) =>
      api.updateMonitoringPushSettingApiV1ServerAdminSettingsMonitoringPushPut({
        serverAdminSettingUpdate: { enabled },
      }),
    onMutate: (enabled) => setPushDraft(enabled),
    onSuccess: (_settings, enabled) => {
      queryClient.setQueriesData<ServerAdminMonitoring>(
        { queryKey: ['server-admin', 'monitoring'] },
        (current) => (current ? { ...current, pushEnabled: enabled } : current),
      );
      void queryClient.invalidateQueries({
        queryKey: ['server-admin', 'settings'],
      });
    },
    onSettled: () => setPushDraft(null),
  });
  const percent = new Intl.NumberFormat(resolvedLocale(), {
    style: 'percent',
    maximumFractionDigits: 1,
  });
  const number = new Intl.NumberFormat(resolvedLocale());
  const time = new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  const data = query.data;
  const points = data?.points ?? [];
  const rate = errorRate(points);
  const p95 = lastValue(points.map((point) => point.p95Ms));

  return (
    <section
      className="server-admin-panel server-admin-panel-wide server-admin-monitoring"
      aria-labelledby="server-monitoring-title"
    >
      <h2 id="server-monitoring-title">
        {t('serverAdmin.navigation.monitoring')}
      </h2>
      <fieldset className="server-admin-range">
        <legend className="sr-only">
          {t('serverAdmin.monitoring.rangeAria')}
        </legend>
        {RANGES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={range === value}
            onClick={() => setRange(value)}
          >
            {t(`serverAdmin.monitoring.ranges.${value}`)}
          </button>
        ))}
      </fieldset>

      {query.isPending ? (
        <UiState
          kind="loading"
          title={t('serverAdmin.states.loadingTitle')}
          body={t('serverAdmin.states.loadingBody')}
        />
      ) : query.error || !data ? (
        <UiState
          kind="error"
          title={t('serverAdmin.states.errorTitle')}
          body={t('serverAdmin.states.errorBody')}
          action={
            <button type="button" onClick={() => void query.refetch()}>
              {t('common.refresh')}
            </button>
          }
        />
      ) : (
        <>
          {points.length === 0 ? (
            <p className="server-admin-muted">
              {t('serverAdmin.monitoring.emptyHistory')}
            </p>
          ) : (
            <div className="server-admin-monitoring-cards">
              <div className="server-admin-monitoring-card">
                <span className="eyebrow">
                  {t('serverAdmin.monitoring.errorRate')}
                </span>
                <strong>
                  {rate === null
                    ? t('serverAdmin.monitoring.noValue')
                    : percent.format(rate)}
                </strong>
                <Sparkline
                  tone="danger"
                  label={t('serverAdmin.monitoring.errorRateTrend')}
                  values={points.map((point) =>
                    point.requests ? point.serverErrors / point.requests : null,
                  )}
                />
              </div>
              <div className="server-admin-monitoring-card">
                <span className="eyebrow">
                  {t('serverAdmin.monitoring.responseTime')}
                </span>
                <strong>
                  {p95 === null
                    ? t('serverAdmin.monitoring.noValue')
                    : t('serverAdmin.monitoring.milliseconds', {
                        value: number.format(p95),
                      })}
                </strong>
                <Sparkline
                  label={t('serverAdmin.monitoring.responseTrend')}
                  values={points.map((point) => point.p95Ms)}
                />
                <span className="server-admin-muted">
                  {t('serverAdmin.monitoring.responseTimeHint')}
                </span>
              </div>
            </div>
          )}

          <div className="server-admin-monitoring-storage">
            <span className="eyebrow">
              {t('serverAdmin.monitoring.storage')}
            </span>
            <strong>
              {data.storage.totalBytes === null ||
              data.storage.totalBytes === undefined
                ? t('serverAdmin.monitoring.storageUsed', {
                    used: formatBytes(data.storage.usedBytes),
                  })
                : t('serverAdmin.monitoring.storageOf', {
                    used: formatBytes(data.storage.usedBytes),
                    total: formatBytes(data.storage.totalBytes),
                  })}
            </strong>
            {points.length > 1 ? (
              <Sparkline
                label={t('serverAdmin.monitoring.storageTrend')}
                values={points.map(
                  (point) => point.diskUsedBytes ?? point.storedBytes,
                )}
              />
            ) : null}
            {data.storage.fullInDays !== null &&
            data.storage.fullInDays !== undefined ? (
              <span className="server-admin-muted">
                {t('serverAdmin.monitoring.fullIn', {
                  count: data.storage.fullInDays,
                })}
              </span>
            ) : null}
          </div>

          <div>
            <h3>{t('serverAdmin.monitoring.servicesTitle')}</h3>
            <ul className="server-admin-monitoring-services">
              {data.services.map((service) => (
                <li key={service.key} className={`is-${service.status}`}>
                  <span
                    className="server-admin-service-dot"
                    aria-hidden="true"
                  />
                  <span>
                    <strong>
                      {t(`serverAdmin.monitoring.services.${service.key}`)}
                    </strong>
                    <span>
                      {t(`serverAdmin.monitoring.status.${service.status}`)}
                      {service.lastSeenAt
                        ? ` · ${t('serverAdmin.monitoring.lastSeen', {
                            time: time.format(service.lastSeenAt),
                          })}`
                        : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="server-admin-monitoring-alerts">
            <span>
              <label htmlFor="server-monitoring-alerts">
                <strong>{t('serverAdmin.monitoring.alertsLabel')}</strong>
              </label>
              <span
                id="server-monitoring-alerts-help"
                className="server-admin-muted"
              >
                {t('serverAdmin.monitoring.alertsBody')}
              </span>
            </span>
            <input
              id="server-monitoring-alerts"
              type="checkbox"
              aria-describedby="server-monitoring-alerts-help"
              checked={alertsDraft ?? data.alertsEnabled}
              disabled={alerts.isPending}
              onChange={(event) => alerts.mutate(event.target.checked)}
            />
          </div>
          {alerts.isError ? (
            <p className="server-admin-muted" role="alert">
              {t('serverAdmin.monitoring.alertsSaveFailed')}
            </p>
          ) : null}

          <div className="server-admin-monitoring-alerts">
            <span>
              <label htmlFor="server-monitoring-push">
                <strong>{t('serverAdmin.monitoring.pushLabel')}</strong>
              </label>
              <span
                id="server-monitoring-push-help"
                className="server-admin-muted"
              >
                {t('serverAdmin.monitoring.pushBody')}
              </span>
            </span>
            <input
              id="server-monitoring-push"
              type="checkbox"
              aria-describedby="server-monitoring-push-help"
              checked={pushDraft ?? data.pushEnabled}
              disabled={push.isPending}
              onChange={(event) => push.mutate(event.target.checked)}
            />
          </div>
          {push.isError ? (
            <p className="server-admin-muted" role="alert">
              {t('serverAdmin.monitoring.pushSaveFailed')}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
