import { type FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { TransferExportDetail } from '../api/generated/models/TransferExportDetail';
import {
  TransferScope,
  type TransferScope as TransferScopeValue,
} from '../api/generated/models/TransferScope';
import { ExportStatus } from '../api/generated/models/ExportStatus';
import {
  createTransferApi,
  exportStatusNeedsPolling,
  transferApiCall,
  transferBundleFilename,
  triggerTransferDownload,
} from '../client/transfer';
import { resolvedLocale, useTranslation } from '../i18n';
import { ProblemState } from './ProblemState';
import { TransferImportSection } from './TransferImportSection';
import './TransferPanel.css';

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

export function TransferPanel({
  apiBaseUrl,
  accessToken,
  spaceId,
  requestedExportId,
  requestedImportId,
}: {
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
  requestedExportId?: string | null;
  requestedImportId?: string | null;
}) {
  const { t } = useTranslation();
  const requestedTransfer = (value?: string | null) => {
    return value && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)
      ? value
      : null;
  };
  const api = useMemo(
    () => createTransferApi(apiBaseUrl, accessToken),
    [apiBaseUrl, accessToken],
  );
  const [scope, setScope] = useState<TransferScopeValue>(TransferScope.SHARED);
  const [exportId, setExportId] = useState<string | null>(() =>
    requestedTransfer(requestedExportId),
  );

  const createExport = useMutation({
    mutationFn: (selectedScope: TransferScopeValue) =>
      transferApiCall(() =>
        api.createTransferExport({
          spaceId,
          transferExportCreate: { scope: selectedScope },
        }),
      ),
    onSuccess: (detail) => setExportId(detail.id),
  });

  const exportQuery = useQuery({
    queryKey: ['transfer', 'export', spaceId, exportId],
    queryFn: () =>
      transferApiCall(() =>
        api.getTransferExport({ spaceId, exportId: exportId as string }),
      ),
    enabled: Boolean(exportId),
    retry: false,
    refetchInterval: (query) => {
      const detail = query.state.data as TransferExportDetail | undefined;
      return exportStatusNeedsPolling(detail?.status) ? 1500 : false;
    },
  });

  const downloadExport = useMutation({
    mutationFn: (detail: TransferExportDetail) =>
      transferApiCall(() =>
        api.downloadTransferExport({ spaceId, exportId: detail.id }),
      ),
    onSuccess: (blob, detail) =>
      triggerTransferDownload(blob, transferBundleFilename(detail.scope)),
  });

  const exportDetail = exportQuery.data ?? createExport.data;
  const exportError =
    createExport.error ?? exportQuery.error ?? downloadExport.error;

  function submitExport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setExportId(null);
    createExport.reset();
    downloadExport.reset();
    createExport.mutate(scope);
  }

  return (
    <section
      id="data-transfer"
      className="form-card transfer-panel"
      aria-labelledby="transfer-title"
    >
      <p className="eyebrow">{t('transfer.eyebrow')}</p>
      <h2 id="transfer-title">{t('transfer.title')}</h2>
      <p>{t('transfer.intro')}</p>

      <div className="transfer-columns">
        <section aria-labelledby="transfer-export-heading">
          <h3 id="transfer-export-heading">{t('transfer.export.heading')}</h3>
          <form className="form-grid" onSubmit={submitExport}>
            <fieldset>
              <legend>{t('transfer.export.scopeLabel')}</legend>
              <label className="transfer-scope-option">
                <input
                  type="radio"
                  name="transferScope"
                  value={TransferScope.SHARED}
                  checked={scope === TransferScope.SHARED}
                  onChange={() => setScope(TransferScope.SHARED)}
                />
                <span>
                  <strong>{t('transfer.export.shared')}</strong>
                  <small>{t('transfer.export.sharedHelp')}</small>
                </span>
              </label>
              <label className="transfer-scope-option">
                <input
                  type="radio"
                  name="transferScope"
                  value={TransferScope.PERSONAL}
                  checked={scope === TransferScope.PERSONAL}
                  onChange={() => setScope(TransferScope.PERSONAL)}
                />
                <span>
                  <strong>{t('transfer.export.personal')}</strong>
                  <small>{t('transfer.export.personalHelp')}</small>
                </span>
              </label>
            </fieldset>
            <button type="submit" disabled={createExport.isPending}>
              {createExport.isPending
                ? t('transfer.export.starting')
                : t('transfer.export.start')}
            </button>
          </form>

          {exportDetail ? (
            <div className="transfer-status" role="status" aria-live="polite">
              <strong>{t('transfer.export.statusLabel')}</strong>
              <span>{t(`transfer.export.status.${exportDetail.status}`)}</span>
              <small>
                {t('transfer.export.expires')}{' '}
                {formatDate(exportDetail.expiresAt)}
              </small>
              {exportDetail.status === ExportStatus.READY ? (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => downloadExport.mutate(exportDetail)}
                  disabled={downloadExport.isPending}
                >
                  {downloadExport.isPending
                    ? t('transfer.export.downloading')
                    : t('transfer.export.download')}
                </button>
              ) : null}
              {exportDetail.status === ExportStatus.FAILED ||
              exportDetail.status === ExportStatus.EXPIRED ? (
                <span>{t('transfer.genericFailure')}</span>
              ) : null}
            </div>
          ) : null}
          {exportError ? <ProblemState error={exportError} /> : null}
        </section>

        <TransferImportSection
          apiBaseUrl={apiBaseUrl}
          accessToken={accessToken}
          spaceId={spaceId}
          requestedImportId={requestedTransfer(requestedImportId)}
        />
      </div>
    </section>
  );
}
