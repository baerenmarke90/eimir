import { useQuery } from '@tanstack/react-query';
import type { ServerAdminApi } from '../api/generated/apis/ServerAdminApi';
import { resolvedLocale, useTranslation } from '../i18n';
import './ServerAdminObservabilityPanels.css';

function formatNumber(value: number): string {
  return new Intl.NumberFormat(resolvedLocale()).format(value);
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

function statusLabel(status: string, t: (key: string) => string): string {
  switch (status) {
    case 'PENDING':
      return t('serverAdmin.storage.status.pending');
    case 'UPLOADING':
      return t('serverAdmin.storage.status.uploading');
    case 'VALIDATING':
      return t('serverAdmin.storage.status.validating');
    case 'READY':
      return t('serverAdmin.storage.status.ready');
    case 'FAILED':
      return t('serverAdmin.storage.status.failed');
    case 'DELETING':
      return t('serverAdmin.storage.status.deleting');
    case 'DELETE_FAILED':
      return t('serverAdmin.storage.status.deleteFailed');
    default:
      return status;
  }
}

function mediaTypeLabel(mediaType: string, t: (key: string) => string): string {
  switch (mediaType) {
    case 'IMAGE':
      return t('serverAdmin.storage.media.image');
    case 'VIDEO':
      return t('serverAdmin.storage.media.video');
    default:
      return mediaType;
  }
}

function growthWindowLabel(window: string, t: (key: string) => string): string {
  switch (window) {
    case '24h':
      return t('serverAdmin.storage.growth.hours24');
    case '7d':
      return t('serverAdmin.storage.growth.days7');
    case '30d':
      return t('serverAdmin.storage.growth.days30');
    default:
      return window;
  }
}

function StorageMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="server-admin-metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function ServerAdminStoragePanel({ api }: { api: ServerAdminApi }) {
  const { t } = useTranslation();
  const storageQuery = useQuery({
    queryKey: ['server-admin', 'storage'],
    queryFn: () => api.getServerAdminStorageApiV1ServerAdminStorageGet(),
    retry: false,
  });

  if (storageQuery.isPending) {
    return (
      <section className="server-admin-panel server-admin-panel-wide">
        <p className="server-admin-muted">{t('serverAdmin.storage.loading')}</p>
      </section>
    );
  }

  if (storageQuery.error) {
    return (
      <section className="server-admin-panel server-admin-panel-wide">
        <p className="status status-error" role="alert">
          {t('serverAdmin.storage.error')}
        </p>
      </section>
    );
  }

  const storage = storageQuery.data;
  if (!storage) return null;

  const needsOperationalAttention =
    storage.failedCount > 0 ||
    storage.deleteFailedCount > 0 ||
    storage.deletingCount > 0;

  return (
    <>
      <section
        className="server-admin-panel server-admin-panel-wide"
        aria-labelledby="server-storage-title"
      >
        <div className="server-admin-section-heading">
          <div>
            <h2 id="server-storage-title">{t('serverAdmin.storage.title')}</h2>
            <p className="server-admin-muted">
              {t('serverAdmin.storage.body')}
            </p>
          </div>
          <span className="server-admin-count">
            {formatNumber(storage.readyCount)}{' '}
            {t('serverAdmin.storage.readyObjectsSuffix')}
          </span>
        </div>

        <dl className="server-admin-metrics server-admin-storage-metrics">
          <StorageMetric
            label={t('serverAdmin.storage.readyBytes')}
            value={formatBytes(storage.readyBytes)}
          />
          <StorageMetric
            label={t('serverAdmin.storage.readyObjects')}
            value={formatNumber(storage.readyCount)}
          />
          <StorageMetric
            label={t('serverAdmin.storage.unknownSize')}
            value={formatNumber(storage.readySizeUnknownCount)}
          />
          <StorageMetric
            label={t('serverAdmin.storage.thumbnailReady')}
            value={formatNumber(storage.thumbnailReadyCount)}
          />
        </dl>

        <p className="server-admin-privacy-note server-admin-panel-privacy-note">
          {t('serverAdmin.storage.privacy')}
        </p>
      </section>

      <section
        className={`server-admin-panel server-admin-panel-wide${
          needsOperationalAttention ? ' server-admin-warning-panel' : ''
        }`}
        aria-labelledby="server-storage-operations-title"
      >
        <h2 id="server-storage-operations-title">
          {t('serverAdmin.storage.operationsTitle')}
        </h2>
        <p className="server-admin-muted">
          {t('serverAdmin.storage.operationsBody')}
        </p>
        <dl className="server-admin-metrics server-admin-storage-metrics">
          <StorageMetric
            label={t('serverAdmin.storage.failed')}
            value={formatNumber(storage.failedCount)}
          />
          <StorageMetric
            label={t('serverAdmin.storage.deleteFailed')}
            value={formatNumber(storage.deleteFailedCount)}
          />
          <StorageMetric
            label={t('serverAdmin.storage.uploading')}
            value={formatNumber(storage.uploadingCount)}
          />
          <StorageMetric
            label={t('serverAdmin.storage.validating')}
            value={formatNumber(storage.validatingCount)}
          />
          <StorageMetric
            label={t('serverAdmin.storage.deleting')}
            value={formatNumber(storage.deletingCount)}
          />
        </dl>
      </section>

      <section
        className="server-admin-panel"
        aria-labelledby="server-storage-lifecycle-title"
      >
        <h2 id="server-storage-lifecycle-title">
          {t('serverAdmin.storage.lifecycleTitle')}
        </h2>
        <div className="server-admin-table-scroll">
          <table className="server-admin-table">
            <thead>
              <tr>
                <th scope="col">{t('serverAdmin.storage.lifecycleState')}</th>
                <th scope="col">{t('serverAdmin.storage.count')}</th>
              </tr>
            </thead>
            <tbody>
              {storage.statusCounts.map((item) => (
                <tr key={item.status}>
                  <td>{statusLabel(item.status, t)}</td>
                  <td>{formatNumber(item.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        className="server-admin-panel"
        aria-labelledby="server-storage-media-title"
      >
        <h2 id="server-storage-media-title">
          {t('serverAdmin.storage.mediaTitle')}
        </h2>
        <div className="server-admin-table-scroll">
          <table className="server-admin-table">
            <thead>
              <tr>
                <th scope="col">{t('serverAdmin.storage.mediaType')}</th>
                <th scope="col">{t('serverAdmin.storage.count')}</th>
              </tr>
            </thead>
            <tbody>
              {storage.mediaTypeCounts.map((item) => (
                <tr key={item.mediaType}>
                  <td>{mediaTypeLabel(item.mediaType, t)}</td>
                  <td>{formatNumber(item.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        className="server-admin-panel server-admin-panel-wide"
        aria-labelledby="server-storage-growth-title"
      >
        <h2 id="server-storage-growth-title">
          {t('serverAdmin.storage.growthTitle')}
        </h2>
        <p className="server-admin-muted">
          {t('serverAdmin.storage.growthBody')}
        </p>
        <div className="server-admin-table-scroll">
          <table className="server-admin-table">
            <thead>
              <tr>
                <th scope="col">{t('serverAdmin.storage.period')}</th>
                <th scope="col">{t('serverAdmin.storage.readyObjects')}</th>
                <th scope="col">{t('serverAdmin.storage.readyBytes')}</th>
                <th scope="col">{t('serverAdmin.storage.unknownSize')}</th>
              </tr>
            </thead>
            <tbody>
              {storage.growth.map((item) => (
                <tr key={item.window}>
                  <td>{growthWindowLabel(item.window, t)}</td>
                  <td>{formatNumber(item.readyCount)}</td>
                  <td>{formatBytes(item.readyBytes)}</td>
                  <td>{formatNumber(item.readySizeUnknownCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
