import { type FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { TransferExportDetail } from '../api/generated/models/TransferExportDetail';
import type { TransferImportDetail } from '../api/generated/models/TransferImportDetail';
import {
  TransferScope,
  type TransferScope as TransferScopeValue,
} from '../api/generated/models/TransferScope';
import { ExportStatus } from '../api/generated/models/ExportStatus';
import { ImportStatus } from '../api/generated/models/ImportStatus';
import {
  createTransferApi,
  exportStatusNeedsPolling,
  importStatusNeedsPolling,
  transferApiCall,
  transferBundleFilename,
  triggerTransferDownload,
} from '../client/transfer';
import { useImportCacheConvergence } from '../client/importCacheConvergence';
import { resolvedLocale, useTranslation } from '../i18n';
import { ProblemState } from './ProblemState';
import './TransferPanel.css';

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

function summaryRecordCount(detail: TransferImportDetail): number {
  return Object.values(detail.summary?.recordCounts ?? {}).reduce(
    (sum, count) => sum + count,
    0,
  );
}

export function TransferPanel({
  apiBaseUrl,
  accessToken,
  spaceId,
}: {
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const api = useMemo(
    () => createTransferApi(apiBaseUrl, accessToken),
    [apiBaseUrl, accessToken],
  );
  const [scope, setScope] = useState<TransferScopeValue>(TransferScope.SHARED);
  const [exportId, setExportId] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [applyConfirmed, setApplyConfirmed] = useState(false);

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

  const createImport = useMutation({
    mutationFn: (file: File) =>
      transferApiCall(() => api.createTransferImport({ spaceId, body: file })),
    onSuccess: (detail) => {
      setApplyConfirmed(false);
      setImportId(detail.id);
    },
  });

  const importQuery = useQuery({
    queryKey: ['transfer', 'import', spaceId, importId],
    queryFn: () =>
      transferApiCall(() =>
        api.getTransferImport({ spaceId, importId: importId as string }),
      ),
    enabled: Boolean(importId),
    retry: false,
    refetchInterval: (query) => {
      const detail = query.state.data as TransferImportDetail | undefined;
      return importStatusNeedsPolling(detail?.status) ? 1500 : false;
    },
  });

  const applyImport = useMutation({
    mutationFn: (detail: TransferImportDetail) =>
      transferApiCall(() =>
        api.applyTransferImport({ spaceId, importId: detail.id }),
      ),
    onSuccess: async () => {
      setApplyConfirmed(false);
      await importQuery.refetch();
    },
  });

  const exportDetail = exportQuery.data ?? createExport.data;
  const importDetail = importQuery.data ?? createImport.data;
  const cacheConvergenceError = useImportCacheConvergence(
    importDetail,
    spaceId,
  );
  const exportError =
    createExport.error ?? exportQuery.error ?? downloadExport.error;
  const importError =
    createImport.error ??
    importQuery.error ??
    applyImport.error ??
    cacheConvergenceError;

  function submitExport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setExportId(null);
    createExport.reset();
    downloadExport.reset();
    createExport.mutate(scope);
  }

  function submitImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!importFile) return;
    setImportId(null);
    setApplyConfirmed(false);
    createImport.reset();
    applyImport.reset();
    createImport.mutate(importFile);
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

        <section aria-labelledby="transfer-import-heading">
          <h3 id="transfer-import-heading">{t('transfer.import.heading')}</h3>
          <form className="form-grid" onSubmit={submitImport}>
            <div className="field-group">
              <label htmlFor="transfer-import-file">
                {t('transfer.import.fileLabel')}
              </label>
              <input
                id="transfer-import-file"
                type="file"
                accept=".zip,application/zip"
                onChange={(event) => {
                  setImportFile(event.currentTarget.files?.[0] ?? null);
                  setImportId(null);
                  setApplyConfirmed(false);
                }}
              />
              <p className="field-help">{t('transfer.import.fileHelp')}</p>
            </div>
            <button
              type="submit"
              disabled={!importFile || createImport.isPending}
            >
              {createImport.isPending
                ? t('transfer.import.uploading')
                : t('transfer.import.upload')}
            </button>
          </form>

          {importDetail ? (
            <div className="transfer-status" role="status" aria-live="polite">
              <strong>{t('transfer.import.statusLabel')}</strong>
              <span>{t(`transfer.import.status.${importDetail.status}`)}</span>
            </div>
          ) : null}

          {importDetail?.status === ImportStatus.READY_TO_APPLY &&
          importDetail.summary ? (
            <div className="transfer-summary">
              <h4>{t('transfer.import.summaryHeading')}</h4>
              <dl>
                <div>
                  <dt>{t('transfer.import.scope')}</dt>
                  <dd>
                    {importDetail.summary.scope === TransferScope.PERSONAL
                      ? t('transfer.export.personal')
                      : t('transfer.export.shared')}
                  </dd>
                </div>
                <div>
                  <dt>{t('transfer.import.members')}</dt>
                  <dd>{importDetail.summary.sourceMemberCount}</dd>
                </div>
                <div>
                  <dt>{t('transfer.import.records')}</dt>
                  <dd>{summaryRecordCount(importDetail)}</dd>
                </div>
                <div>
                  <dt>{t('transfer.import.media')}</dt>
                  <dd>{importDetail.summary.mediaCount}</dd>
                </div>
              </dl>
              <p className="field-help" id="transfer-apply-help">
                {t('transfer.import.additive')}
              </p>
              <label className="transfer-confirm">
                <input
                  type="checkbox"
                  checked={applyConfirmed}
                  onChange={(event) =>
                    setApplyConfirmed(event.currentTarget.checked)
                  }
                  aria-describedby="transfer-apply-help"
                />
                <span>{t('transfer.import.confirm')}</span>
              </label>
              <button
                type="button"
                onClick={() => applyImport.mutate(importDetail)}
                disabled={!applyConfirmed || applyImport.isPending}
              >
                {applyImport.isPending
                  ? t('transfer.import.applying')
                  : t('transfer.import.apply')}
              </button>
            </div>
          ) : null}

          {importDetail?.status === ImportStatus.FAILED ||
          importDetail?.status === ImportStatus.EXPIRED ? (
            <p className="status status-error">
              {t('transfer.genericFailure')}
            </p>
          ) : null}
          {importError ? <ProblemState error={importError} /> : null}
        </section>
      </div>
    </section>
  );
}
