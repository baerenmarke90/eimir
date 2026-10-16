import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  ListServerAdminJobsApiV1ServerAdminJobsGetRequest,
  ServerAdminApi,
} from '../api/generated/apis/ServerAdminApi';
import { resolvedLocale, useTranslation } from '../i18n';
import './ServerAdminObservabilityPanels.css';

const PAGE_SIZE = 25;

type JobStatusFilter =
  | 'all'
  | NonNullable<ListServerAdminJobsApiV1ServerAdminJobsGetRequest['status']>;
type ExhaustedFilter = 'all' | 'exhausted' | 'retryable';
type CreatedWithinFilter =
  | 'all'
  | NonNullable<
      ListServerAdminJobsApiV1ServerAdminJobsGetRequest['createdWithin']
    >;

function formatNumber(value: number): string {
  return new Intl.NumberFormat(resolvedLocale()).format(value);
}

function formatDate(value: Date | null): string {
  if (!value) return '–';
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

function formatPendingAge(
  seconds: number | null,
  t: (key: string) => string,
): string {
  if (seconds === null) return '–';
  if (seconds >= 86_400) {
    return `${formatNumber(Math.floor(seconds / 86_400))} ${t('serverAdmin.jobs.units.days')}`;
  }
  if (seconds >= 3_600) {
    return `${formatNumber(Math.floor(seconds / 3_600))} ${t('serverAdmin.jobs.units.hours')}`;
  }
  if (seconds >= 60) {
    return `${formatNumber(Math.floor(seconds / 60))} ${t('serverAdmin.jobs.units.minutes')}`;
  }
  return `${formatNumber(seconds)} ${t('serverAdmin.jobs.units.seconds')}`;
}

function jobStatusLabel(status: string, t: (key: string) => string): string {
  switch (status) {
    case 'PENDING':
      return t('serverAdmin.jobs.status.pending');
    case 'RUNNING':
      return t('serverAdmin.jobs.status.running');
    case 'SUCCEEDED':
      return t('serverAdmin.jobs.status.succeeded');
    case 'FAILED':
      return t('serverAdmin.jobs.status.failed');
    default:
      return status;
  }
}

function jobStatusClass(status: string): string {
  if (status === 'SUCCEEDED') return 'is-ok';
  if (status === 'FAILED') return 'is-warning';
  return 'is-neutral';
}

export function ServerAdminJobsPanel({ api }: { api: ServerAdminApi }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<JobStatusFilter>('all');
  const [kind, setKind] = useState('');
  const [exhausted, setExhausted] = useState<ExhaustedFilter>('all');
  const [createdWithin, setCreatedWithin] =
    useState<CreatedWithinFilter>('all');
  const [offset, setOffset] = useState(0);

  const jobRequest = useMemo<ListServerAdminJobsApiV1ServerAdminJobsGetRequest>(
    () => ({
      status: status === 'all' ? undefined : status,
      kind: kind.trim() || undefined,
      exhausted: exhausted === 'all' ? undefined : exhausted === 'exhausted',
      createdWithin: createdWithin === 'all' ? undefined : createdWithin,
      limit: PAGE_SIZE,
      offset,
    }),
    [createdWithin, exhausted, kind, offset, status],
  );
  const jobsQuery = useQuery({
    queryKey: ['server-admin', 'jobs', jobRequest],
    queryFn: () => api.listServerAdminJobsApiV1ServerAdminJobsGet(jobRequest),
    retry: false,
  });

  const data = jobsQuery.data;
  const canGoBack = offset > 0;
  const canGoForward = data ? offset + data.items.length < data.total : false;

  return (
    <section
      className="server-admin-panel server-admin-panel-wide"
      aria-labelledby="server-jobs-directory-title"
    >
      <div className="server-admin-section-heading">
        <div>
          <h2 id="server-jobs-directory-title">
            {t('serverAdmin.jobs.directoryTitle')}
          </h2>
          <p className="server-admin-muted">
            {t('serverAdmin.jobs.directoryBody')}
          </p>
        </div>
        {data ? (
          <span className="server-admin-count">
            {formatNumber(data.total)} {t('serverAdmin.jobs.totalSuffix')}
          </span>
        ) : null}
      </div>

      <div className="server-admin-job-filters">
        <label>
          <span>{t('serverAdmin.jobs.status.label')}</span>
          <select
            value={status}
            onChange={(event) => {
              setOffset(0);
              setStatus(event.target.value as JobStatusFilter);
            }}
          >
            <option value="all">{t('serverAdmin.jobs.status.all')}</option>
            <option value="PENDING">
              {t('serverAdmin.jobs.status.pending')}
            </option>
            <option value="RUNNING">
              {t('serverAdmin.jobs.status.running')}
            </option>
            <option value="SUCCEEDED">
              {t('serverAdmin.jobs.status.succeeded')}
            </option>
            <option value="FAILED">
              {t('serverAdmin.jobs.status.failed')}
            </option>
          </select>
        </label>

        <label>
          <span>{t('serverAdmin.jobs.kind')}</span>
          <input
            type="search"
            value={kind}
            onChange={(event) => {
              setOffset(0);
              setKind(event.target.value);
            }}
            placeholder={t('serverAdmin.jobs.kindPlaceholder')}
          />
        </label>

        <label>
          <span>{t('serverAdmin.jobs.retryState.label')}</span>
          <select
            value={exhausted}
            onChange={(event) => {
              setOffset(0);
              setExhausted(event.target.value as ExhaustedFilter);
            }}
          >
            <option value="all">{t('serverAdmin.jobs.retryState.all')}</option>
            <option value="exhausted">
              {t('serverAdmin.jobs.retryState.exhausted')}
            </option>
            <option value="retryable">
              {t('serverAdmin.jobs.retryState.retryable')}
            </option>
          </select>
        </label>

        <label>
          <span>{t('serverAdmin.jobs.createdWithin.label')}</span>
          <select
            value={createdWithin}
            onChange={(event) => {
              setOffset(0);
              setCreatedWithin(event.target.value as CreatedWithinFilter);
            }}
          >
            <option value="all">
              {t('serverAdmin.jobs.createdWithin.all')}
            </option>
            <option value="24h">
              {t('serverAdmin.jobs.createdWithin.hours24')}
            </option>
            <option value="7d">
              {t('serverAdmin.jobs.createdWithin.days7')}
            </option>
            <option value="30d">
              {t('serverAdmin.jobs.createdWithin.days30')}
            </option>
          </select>
        </label>
      </div>

      {jobsQuery.isPending ? (
        <p className="server-admin-muted">{t('serverAdmin.jobs.loading')}</p>
      ) : jobsQuery.error ? (
        <p className="status status-error" role="alert">
          {t('serverAdmin.jobs.error')}
        </p>
      ) : data && data.items.length === 0 ? (
        <p className="server-admin-muted">{t('serverAdmin.jobs.empty')}</p>
      ) : data ? (
        <>
          <div className="server-admin-table-scroll">
            <table className="server-admin-table server-admin-jobs-table">
              <thead>
                <tr>
                  <th scope="col">{t('serverAdmin.jobs.kind')}</th>
                  <th scope="col">{t('serverAdmin.jobs.status.label')}</th>
                  <th scope="col">{t('serverAdmin.jobs.attempts')}</th>
                  <th scope="col">{t('serverAdmin.jobs.createdAt')}</th>
                  <th scope="col">{t('serverAdmin.jobs.runAfter')}</th>
                  <th scope="col">{t('serverAdmin.jobs.pendingAge')}</th>
                  <th scope="col">{t('serverAdmin.jobs.finishedAt')}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <strong>{job.kind}</strong>
                      <span className="server-admin-row-meta">{job.id}</span>
                    </td>
                    <td>
                      <div className="server-admin-job-state">
                        <span
                          className={`server-admin-badge ${jobStatusClass(job.status)}`}
                        >
                          {jobStatusLabel(job.status, t)}
                        </span>
                        {job.delayed ? (
                          <span className="server-admin-badge is-warning">
                            {t('serverAdmin.jobs.delayed')}
                          </span>
                        ) : null}
                        {job.exhausted ? (
                          <span className="server-admin-badge is-warning">
                            {t('serverAdmin.jobs.exhausted')}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      {formatNumber(job.attempts)} /{' '}
                      {formatNumber(job.maxAttempts)}
                      {job.status === 'FAILED' ? (
                        <span className="server-admin-muted server-admin-job-retry-copy">
                          {t(
                            job.exhausted
                              ? 'serverAdmin.jobs.retryExhausted'
                              : 'serverAdmin.jobs.retryAvailable',
                          )}
                        </span>
                      ) : null}
                    </td>
                    <td>{formatDate(job.createdAt)}</td>
                    <td>{formatDate(job.runAfter)}</td>
                    <td>{formatPendingAge(job.pendingAgeSeconds, t)}</td>
                    <td>{formatDate(job.finishedAt)}</td>
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
              {t('serverAdmin.jobs.previous')}
            </button>
            <span>
              {offset + 1}–{offset + data.items.length} /{' '}
              {formatNumber(data.total)}
            </span>
            <button
              type="button"
              className="secondary-button"
              disabled={!canGoForward}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              {t('serverAdmin.jobs.next')}
            </button>
          </div>
        </>
      ) : null}

      <p className="server-admin-privacy-note server-admin-panel-privacy-note">
        {t('serverAdmin.jobs.privacy')}
      </p>
    </section>
  );
}
