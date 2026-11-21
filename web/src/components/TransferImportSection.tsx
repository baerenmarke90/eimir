import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AttachmentsApi } from '../api/generated/apis/AttachmentsApi';
import { ImportStatus } from '../api/generated/models/ImportStatus';
import type { TransferImportDetail } from '../api/generated/models/TransferImportDetail';
import { TransferImportApplyMode } from '../api/generated/models/TransferImportApplyMode';
import { Configuration } from '../client/apiConfiguration';
import { isClientOnline } from '../client/connectivity';
import { useImportCacheConvergence } from '../client/importCacheConvergence';
import { ClientProblemError } from '../client/problemDetails';
import { proPaywallPath, STORY_PHOTOS_ROUTE } from '../client/routes';
import {
  createTransferApi,
  importStatusNeedsPolling,
  transferApiCall,
} from '../client/transfer';
import {
  formatStorageBytes,
  type ImportPreview,
  importPreview,
  recoveryFits,
  STORAGE_QUOTA_CODES,
} from '../client/transferImport';
import { useTranslation } from '../i18n';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';

/** Refusals the preview explains itself; they never reach the generic error state. */
const PREVIEW_CODES = new Set([
  ...STORAGE_QUOTA_CODES,
  'TRANSFER_VIDEOS_NEED_PRO',
]);

type Purpose = 'import' | 'recover';

function useOnline(): boolean {
  const [online, setOnline] = useState(() => isClientOnline());
  useEffect(() => {
    const update = () => setOnline(isClientOnline());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

function isPreviewRefusal(error: unknown): boolean {
  return (
    error instanceof ClientProblemError && PREVIEW_CODES.has(error.code ?? '')
  );
}

/**
 * The import column of Settings › Data and the note on skipped videos (#2141
 * B2+N2, approved UI preflight states 5–11 and 13). The server decides what
 * fits and what needs Pro; this only presents its live preview in words.
 */
export function TransferImportSection({
  apiBaseUrl,
  accessToken,
  spaceId,
  requestedImportId,
}: {
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
  requestedImportId: string | null;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const online = useOnline();
  const api = useMemo(
    () => createTransferApi(apiBaseUrl, accessToken),
    [apiBaseUrl, accessToken],
  );
  const attachments = useMemo(
    () =>
      new AttachmentsApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ),
    [apiBaseUrl, accessToken],
  );
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importId, setImportId] = useState<string | null>(requestedImportId);
  const [purpose, setPurpose] = useState<Purpose>('import');
  const [confirmed, setConfirmed] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);
  const dismissSheet = useRef<ShortTaskSheetHandle>(null);
  const dismissTrigger = useRef<HTMLButtonElement>(null);

  const skippedKey = useMemo(
    () => ['transfer', 'skipped-videos', spaceId] as const,
    [spaceId],
  );
  const skipped = useQuery({
    queryKey: skippedKey,
    queryFn: () =>
      transferApiCall(() => api.getTransferSkippedVideos({ spaceId })),
    retry: false,
  });
  const policy = useQuery({
    queryKey: ['transfer', 'upload-policy', apiBaseUrl, spaceId],
    queryFn: () =>
      transferApiCall(() => attachments.getAttachmentUploadPolicy({ spaceId })),
    enabled: Boolean(skipped.data?.count),
    staleTime: 60_000,
    retry: false,
  });
  const videosAllowed = Boolean(
    policy.data?.videoProcessingEnabled && policy.data?.videoUploadAllowed,
  );

  const createImport = useMutation({
    mutationFn: (file: File) =>
      transferApiCall(() => api.createTransferImport({ spaceId, body: file })),
    onSuccess: (detail) => {
      setConfirmed(false);
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
    mutationFn: ({
      detail,
      mode,
    }: {
      detail: TransferImportDetail;
      mode: TransferImportApplyMode;
    }) =>
      transferApiCall(() =>
        api.applyTransferImport({
          spaceId,
          importId: detail.id,
          transferImportApply: { mode },
        }),
      ),
    onSettled: async () => {
      setConfirmed(false);
      // A refusal changes nothing; the live preview says why and what is possible.
      await importQuery.refetch();
    },
  });

  const dismiss = useMutation({
    mutationFn: () =>
      transferApiCall(() => api.dismissTransferSkippedVideos({ spaceId })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: skippedKey }),
  });

  const detail = importQuery.data ?? createImport.data;
  const cacheConvergenceError = useImportCacheConvergence(detail, spaceId);
  useEffect(() => {
    // A finished import can add or recover remembered videos.
    if (detail?.status === ImportStatus.COMPLETED)
      void queryClient.invalidateQueries({ queryKey: skippedKey });
  }, [detail?.status, queryClient, skippedKey]);

  const applyError =
    applyImport.error && !isPreviewRefusal(applyImport.error)
      ? applyImport.error
      : null;
  const importError =
    createImport.error ??
    importQuery.error ??
    applyError ??
    cacheConvergenceError;

  function startImport(file: File, nextPurpose: Purpose) {
    setImportId(null);
    setConfirmed(false);
    setPurpose(nextPurpose);
    createImport.reset();
    applyImport.reset();
    createImport.mutate(file);
  }

  function submitImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (importFile) startImport(importFile, 'import');
  }

  const busy = createImport.isPending || applyImport.isPending;
  const apply = (mode: TransferImportApplyMode) => {
    if (detail) applyImport.mutate({ detail, mode });
  };

  return (
    <div className="transfer-import-stack">
      {skipped.data && skipped.data.count > 0 ? (
        <section
          className="transfer-skipped"
          aria-labelledby="transfer-skipped-heading"
        >
          <h3 id="transfer-skipped-heading">{t('transfer.skipped.heading')}</h3>
          <div className="transfer-surface">
            <p className="transfer-lead">
              {t('transfer.skipped.lead', {
                count: skipped.data.count,
                size: formatStorageBytes(skipped.data.totalSize),
              })}
            </p>
            <p className="transfer-muted">
              {videosAllowed
                ? t('transfer.skipped.bodyPro')
                : t('transfer.skipped.bodyFree')}
            </p>
            <div className="transfer-actions">
              {videosAllowed ? (
                <>
                  <input
                    id="transfer-recover-file"
                    className="visually-hidden-input"
                    type="file"
                    accept=".zip,application/zip"
                    disabled={busy || !online}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = '';
                      if (file) startImport(file, 'recover');
                    }}
                  />
                  <label
                    className="button-link transfer-file-button"
                    htmlFor="transfer-recover-file"
                    aria-disabled={busy || !online ? 'true' : undefined}
                  >
                    {t('transfer.skipped.recover')}
                  </label>
                </>
              ) : (
                <Link className="transfer-link" to={proPaywallPath('general')}>
                  {t('transfer.import.discoverPro')}
                </Link>
              )}
              <button
                ref={dismissTrigger}
                type="button"
                className="transfer-link-button"
                onClick={() => setDismissOpen(true)}
              >
                {t('transfer.skipped.dismiss')}
              </button>
            </div>
          </div>
          <ShortTaskSheet
            ref={dismissSheet}
            open={dismissOpen}
            title={t('transfer.skipped.dismissTitle')}
            onClose={() => setDismissOpen(false)}
            restoreFocusRef={dismissTrigger}
          >
            <p>{t('transfer.skipped.dismissBody')}</p>
            <div className="transfer-actions">
              <button
                type="button"
                disabled={dismiss.isPending || !online}
                onClick={() =>
                  dismiss.mutate(undefined, {
                    onSuccess: () => setDismissOpen(false),
                  })
                }
              >
                {t('transfer.skipped.dismissConfirm')}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setDismissOpen(false)}
              >
                {t('transfer.skipped.dismissCancel')}
              </button>
            </div>
            {dismiss.error ? <ProblemState error={dismiss.error} /> : null}
          </ShortTaskSheet>
        </section>
      ) : null}

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
                setConfirmed(false);
              }}
            />
            <p className="field-help">{t('transfer.import.fileHelp')}</p>
          </div>
          <button type="submit" disabled={!importFile || busy || !online}>
            {createImport.isPending
              ? t('transfer.import.uploading')
              : t('transfer.import.upload')}
          </button>
        </form>

        {!online ? (
          <div className="transfer-callout" data-tone="info" role="status">
            <strong>{t('transfer.import.offline.title')}</strong>
            <span>{t('transfer.import.offline.body')}</span>
          </div>
        ) : null}

        {detail ? (
          <ImportDetail
            detail={detail}
            purpose={purpose}
            confirmed={confirmed}
            onConfirm={setConfirmed}
            busy={busy}
            online={online}
            onApply={apply}
          />
        ) : null}

        {importError ? <ProblemState error={importError} /> : null}
      </section>
    </div>
  );
}

function ImportDetail({
  detail,
  purpose,
  confirmed,
  onConfirm,
  busy,
  online,
  onApply,
}: {
  detail: TransferImportDetail;
  purpose: Purpose;
  confirmed: boolean;
  onConfirm: (value: boolean) => void;
  busy: boolean;
  online: boolean;
  onApply: (mode: TransferImportApplyMode) => void;
}) {
  const { t } = useTranslation();
  const status = detail.status;

  if (
    status === ImportStatus.QUEUED ||
    status === ImportStatus.VALIDATING ||
    status === ImportStatus.APPLYING
  ) {
    return (
      <div
        className="transfer-surface transfer-progress"
        role="status"
        aria-live="polite"
      >
        <span
          className="transfer-spinner eimir-motion-loading-spin"
          aria-hidden="true"
        />
        <span>
          <strong>{t(`transfer.import.status.${status}`)}</strong>
          <span className="transfer-muted">
            {status === ImportStatus.APPLYING
              ? t('transfer.import.applyingHint')
              : t('transfer.import.checkingHint')}
          </span>
        </span>
      </div>
    );
  }

  if (status === ImportStatus.COMPLETED) {
    const summary = detail.summary;
    const skipped = summary?.skippedVideoCount ?? 0;
    const recovered = summary?.recoveredVideoCount ?? 0;
    const unrecovered = summary?.unrecoveredVideoCount ?? 0;
    return (
      <div
        className="transfer-surface transfer-reveal transfer-done"
        role="status"
        aria-live="polite"
      >
        <span className="transfer-success-mark" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            aria-hidden="true"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <span>
          <strong>{t('transfer.import.completed.title')}</strong>
          <span className="transfer-muted">
            {recovered > 0
              ? t('transfer.import.completed.recovered', { count: recovered })
              : t('transfer.import.completed.body')}
          </span>
          {skipped > 0 ? (
            <span className="transfer-muted">
              {t('transfer.import.completed.skipped', { count: skipped })}
            </span>
          ) : null}
          {unrecovered > 0 ? (
            <span className="transfer-muted">
              {t('transfer.import.completed.unrecovered', {
                count: unrecovered,
              })}
            </span>
          ) : null}
          <Link className="transfer-link" to="/story">
            {t('transfer.import.completed.toMoments')}
          </Link>
        </span>
      </div>
    );
  }

  if (status === ImportStatus.FAILED || status === ImportStatus.EXPIRED) {
    return (
      <div className="transfer-callout" data-tone="error" role="status">
        <strong>{t(`transfer.import.status.${status}`)}</strong>
        <span>
          {status === ImportStatus.FAILED
            ? t('transfer.import.failed')
            : t('transfer.import.expired')}
        </span>
      </div>
    );
  }

  const preview = importPreview(detail);
  if (!preview) return null;
  return (
    <div className="transfer-surface transfer-reveal">
      <p className="transfer-file-status">
        {t('transfer.import.status.READY_TO_APPLY')}
      </p>
      {preview.roomTaken ? (
        <div className="transfer-callout" data-tone="warn" role="status">
          <strong>{t('transfer.import.roomTaken.title')}</strong>
          <span>{t('transfer.import.roomTaken.body')}</span>
        </div>
      ) : null}
      {purpose === 'recover' ? (
        <RecoverPreview
          detail={detail}
          busy={busy}
          online={online}
          onApply={onApply}
        />
      ) : (
        <ImportPreviewView
          preview={preview}
          confirmed={confirmed}
          onConfirm={onConfirm}
          busy={busy}
          online={online}
          onApply={onApply}
        />
      )}
    </div>
  );
}

function StorageLine({
  needed,
  available,
}: {
  needed: number;
  available: number | null;
}) {
  const { t } = useTranslation();
  if (available === null) return null;
  return (
    <li>
      {t('transfer.import.storage', {
        needed: formatStorageBytes(needed),
        available: formatStorageBytes(available),
      })}
    </li>
  );
}

function ImportPreviewView({
  preview,
  confirmed,
  onConfirm,
  busy,
  online,
  onApply,
}: {
  preview: ImportPreview;
  confirmed: boolean;
  onConfirm: (value: boolean) => void;
  busy: boolean;
  online: boolean;
  onApply: (mode: TransferImportApplyMode) => void;
}) {
  const { t } = useTranslation();
  const withoutVideos =
    preview.kind === 'videosNeedPro' || preview.kind === 'fitsWithoutVideos';
  const available = preview.available ?? 0;
  return (
    <>
      <p className="transfer-lead">
        {t('transfer.import.lead', { count: preview.entries })}
      </p>
      <ul className="transfer-facts">
        {preview.media > 0 ? (
          <li>{t('transfer.import.media', { count: preview.media })}</li>
        ) : null}
        {preview.present > 0 ? (
          <li>{t('transfer.import.present', { count: preview.present })}</li>
        ) : null}
        {preview.kind === 'fits' ? (
          <StorageLine needed={preview.needed} available={preview.available} />
        ) : null}
        <li>{t('transfer.import.additive')}</li>
      </ul>

      {preview.kind === 'videosNeedPro' ? (
        <div className="transfer-callout" data-tone="info">
          <strong>{t('transfer.import.videosNeedPro.title')}</strong>
          <span>
            {t('transfer.import.videosNeedPro.body', { count: preview.videos })}
          </span>
        </div>
      ) : null}
      {preview.kind === 'fitsWithoutVideos' ? (
        <div className="transfer-callout" data-tone="warn">
          <strong>{t('transfer.import.fitsWithoutVideos.title')}</strong>
          <span>
            {t('transfer.import.fitsWithoutVideos.body', {
              count: preview.videos,
              needed: formatStorageBytes(preview.neededWithoutVideos),
              available: formatStorageBytes(available),
            })}
          </span>
        </div>
      ) : null}
      {preview.kind === 'noRoom' ? (
        <>
          <div className="transfer-callout" data-tone="error">
            <strong>{t('transfer.import.noRoom.title')}</strong>
            <span>
              {t('transfer.import.noRoom.body', {
                needed: formatStorageBytes(
                  preview.videos > 0
                    ? preview.neededWithoutVideos
                    : preview.needed,
                ),
                available: formatStorageBytes(available),
              })}
            </span>
          </div>
          <div className="transfer-actions">
            <Link className="button-link" to={proPaywallPath('storage')}>
              {t('transfer.import.morePro')}
            </Link>
            <Link className="transfer-link" to={STORY_PHOTOS_ROUTE}>
              {t('transfer.import.viewMedia')}
            </Link>
          </div>
        </>
      ) : (
        <>
          <label className="transfer-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => onConfirm(event.currentTarget.checked)}
            />
            <span>
              {withoutVideos
                ? t('transfer.import.confirmWithoutVideos')
                : t('transfer.import.confirm')}
            </span>
          </label>
          <div className="transfer-actions">
            <button
              type="button"
              disabled={!confirmed || busy || !online}
              onClick={() =>
                onApply(
                  withoutVideos
                    ? TransferImportApplyMode.WITHOUT_VIDEOS
                    : TransferImportApplyMode.ALL,
                )
              }
            >
              {busy
                ? t('transfer.import.applying')
                : withoutVideos
                  ? t('transfer.import.applyWithoutVideos')
                  : t('transfer.import.apply')}
            </button>
            {preview.kind === 'videosNeedPro' ? (
              <Link className="transfer-link" to={proPaywallPath('general')}>
                {t('transfer.import.discoverPro')}
              </Link>
            ) : null}
            {preview.kind === 'fitsWithoutVideos' ? (
              <Link className="transfer-link" to={proPaywallPath('storage')}>
                {t('transfer.import.morePro')}
              </Link>
            ) : null}
          </div>
        </>
      )}
    </>
  );
}

function RecoverPreview({
  detail,
  busy,
  online,
  onApply,
}: {
  detail: TransferImportDetail;
  busy: boolean;
  online: boolean;
  onApply: (mode: TransferImportApplyMode) => void;
}) {
  const { t } = useTranslation();
  const count = detail.summary?.recoverableVideoCount ?? 0;
  const bytes = detail.summary?.recoverableVideoBytes ?? 0;
  const available = detail.summary?.storageAvailable ?? null;
  if (count === 0)
    return <p className="transfer-lead">{t('transfer.import.recover.none')}</p>;
  const fits = recoveryFits(detail);
  return (
    <>
      <p className="transfer-lead">
        {t('transfer.import.recover.lead', { count })}
      </p>
      {available !== null && fits ? (
        <p className="transfer-muted">
          {t('transfer.import.recover.storage', {
            needed: formatStorageBytes(bytes),
            available: formatStorageBytes(available),
          })}
        </p>
      ) : null}
      {fits ? (
        <div className="transfer-actions">
          <button
            type="button"
            disabled={busy || !online}
            onClick={() => onApply(TransferImportApplyMode.VIDEOS_ONLY)}
          >
            {t('transfer.import.recover.action', { count })}
          </button>
        </div>
      ) : (
        <>
          <div className="transfer-callout" data-tone="error">
            <span>
              {t('transfer.import.recover.noRoom', {
                needed: formatStorageBytes(bytes),
                available: formatStorageBytes(available ?? 0),
              })}
            </span>
          </div>
          <div className="transfer-actions">
            <Link className="button-link" to={proPaywallPath('storage')}>
              {t('transfer.import.morePro')}
            </Link>
            <Link className="transfer-link" to={STORY_PHOTOS_ROUTE}>
              {t('transfer.import.viewMedia')}
            </Link>
          </div>
        </>
      )}
    </>
  );
}
