import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlanFileSummary } from '../api/generated/models/PlanFileSummary';
import { isCapacitorNativePlatform } from '../client/config';
import { openNativePlanFile } from '../client/nativePlanFiles';
import { createOwnedObjectUrl } from '../client/objectUrlResource';
import type { ReferenceApis } from '../client/referenceFlow';
import { triggerTransferDownload } from '../client/transfer';
import type { AttachmentDraftSelection } from '../client/useAttachmentDrafts';
import type { usePlanFileDrafts } from '../client/usePlanFileDrafts';
import { useTranslation } from '../i18n';
import { EimirIcon } from './EimirIcon';
import { ComposerTool } from './PageComposer';
import './PlanFiles.css';

function FileRow({
  name,
  size,
  children,
}: {
  name: string;
  size: number;
  children: ReactNode;
}) {
  const { i18n, t } = useTranslation();
  const megabytes = size >= 1_000_000;
  const formattedSize = new Intl.NumberFormat(i18n.resolvedLanguage, {
    style: 'unit',
    unit: megabytes ? 'megabyte' : 'kilobyte',
    maximumFractionDigits: 1,
  }).format(size / (megabytes ? 1_000_000 : 1_000));
  return (
    <li className="plan-file-row">
      <EimirIcon name="paperclip" />
      <div className="plan-file-description">
        <span>{name}</span>
        <small>{t('planFiles.pdfSize', { size: formattedSize })}</small>
      </div>
      {children}
    </li>
  );
}

export function PlanFilesEditor({
  drafts,
  savedFiles = [],
  removeSaved,
  onChange,
  toolHost,
  disabled,
  online,
}: {
  drafts: ReturnType<typeof usePlanFileDrafts>;
  savedFiles?: readonly PlanFileSummary[];
  removeSaved?: (id: string) => void;
  onChange: () => void;
  toolHost: HTMLSpanElement | null;
  disabled: boolean;
  online: boolean;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const input = useRef<HTMLInputElement>(null);
  const selection = useRef<AttachmentDraftSelection | null>(null);
  useEffect(() => () => selection.current?.cancel(), []);
  const hasFiles = savedFiles.length > 0 || drafts.items.length > 0;
  const remove = (name: string, onClick: () => void) => (
    <button
      type="button"
      className="tertiary plan-file-remove"
      aria-label={t('planFiles.removeNamed', { name })}
      disabled={disabled}
      onClick={onClick}
    >
      <EimirIcon name="close" />
    </button>
  );
  return (
    <>
      <input
        ref={input}
        hidden
        type="file"
        accept="application/pdf"
        multiple
        aria-label={t('planFiles.add')}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          const pending = selection.current;
          selection.current = null;
          event.currentTarget.value = '';
          if (files.length && pending?.commit(files)) onChange();
          else pending?.cancel();
        }}
      />
      {toolHost
        ? createPortal(
            <ComposerTool
              icon="paperclip"
              label={t('planFiles.tool')}
              aria-label={t('planFiles.add')}
              active={hasFiles}
              disabled={disabled || !online}
              onClick={() => {
                selection.current?.cancel();
                selection.current = drafts.beginSelection();
                input.current?.click();
              }}
            />,
            toolHost,
          )
        : null}
      {hasFiles ? (
        <section className="plan-files" aria-labelledby={headingId}>
          <h3 id={headingId}>{t('planFiles.heading')}</h3>
          <ul>
            {savedFiles.map((file) => (
              <FileRow key={file.id} name={file.name} size={file.size}>
                {removeSaved
                  ? remove(file.name, () => removeSaved(file.id))
                  : null}
              </FileRow>
            ))}
            {drafts.items.map((draft) => (
              <FileRow
                key={draft.id}
                name={draft.file.name}
                size={draft.file.size}
              >
                {remove(draft.file.name, () => drafts.remove(draft.id))}
                {draft.status === 'uploading' ? (
                  <progress
                    className="plan-file-feedback"
                    aria-label={t('planFiles.progress', {
                      name: draft.file.name,
                    })}
                    max={100}
                    value={draft.progress}
                  />
                ) : null}
                {draft.status === 'validating' ? (
                  <small className="plan-file-feedback" role="status">
                    {t('planFiles.validating')}
                  </small>
                ) : null}
                {draft.status === 'failed' ? (
                  <div className="plan-file-feedback">
                    <small role="status">{draft.error}</small>
                    <button
                      type="button"
                      className="tertiary"
                      disabled={disabled || !online}
                      onClick={() => drafts.retry(draft)}
                    >
                      {t('common.retry')}
                    </button>
                  </div>
                ) : null}
              </FileRow>
            ))}
          </ul>
        </section>
      ) : null}
      {drafts.rejectedCount ? (
        <p className="plan-file-notice" role="status">
          {t('planFiles.capacity')}
        </p>
      ) : null}
      {!online ? (
        <p className="plan-file-notice">{t('planFiles.offline')}</p>
      ) : null}
    </>
  );
}

export function PlanFilesList({
  attachments,
  files,
  apiBaseUrl,
  accessToken,
  spaceId,
  online,
}: {
  attachments: ReferenceApis['attachments'];
  files: readonly PlanFileSummary[];
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
  online: boolean;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const native = isCapacitorNativePlatform();
  const transfer = useRef<AbortController | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<{
    id: string;
    message: string;
  } | null>(null);
  useEffect(() => () => transfer.current?.abort(), []);

  async function open(file: PlanFileSummary, download = false) {
    if (!online || transfer.current) return;
    const controller = new AbortController();
    transfer.current = controller;
    setBusyId(file.id);
    setProblem(null);
    let viewer: Window | null = null;
    try {
      if (native) {
        await openNativePlanFile(
          apiBaseUrl,
          accessToken,
          spaceId,
          file,
          controller.signal,
        );
        return;
      }
      if (!download) {
        viewer = window.open('', '_blank');
        if (!viewer) throw new Error('The PDF tab could not be opened.');
        viewer.opener = null;
      }
      const response = await attachments.getAttachmentContentRaw(
        { spaceId, attachmentId: file.id },
        {
          signal: controller.signal,
          redirect: 'error',
        },
      );
      const blob = await response.raw.blob();
      controller.signal.throwIfAborted();
      if (blob.type !== 'application/pdf' || blob.size !== file.size)
        throw new Error('The PDF response is invalid.');
      if (viewer) {
        const resource = createOwnedObjectUrl(blob);
        setTimeout(() => resource.dispose(), 60_000);
        viewer.location.replace(resource.url);
      } else {
        triggerTransferDownload(blob, file.name);
      }
    } catch (error) {
      viewer?.close();
      if (!controller.signal.aborted) {
        const noViewer =
          (error as { code?: string } | null)?.code === 'NO_PDF_VIEWER';
        setProblem({
          id: file.id,
          message: t(
            noViewer
              ? 'planFiles.noViewer'
              : download
                ? 'planFiles.downloadFailed'
                : 'planFiles.openFailed',
          ),
        });
      }
    } finally {
      transfer.current = null;
      if (!controller.signal.aborted) setBusyId(null);
    }
  }

  if (!files.length) return null;
  return (
    <section className="plan-files" aria-labelledby={headingId}>
      <h3 id={headingId}>{t('planFiles.heading')}</h3>
      {!online ? (
        <p className="plan-file-notice">{t('planFiles.offline')}</p>
      ) : null}
      <ul>
        {files.map((file) => (
          <FileRow key={file.id} name={file.name} size={file.size}>
            <div className="plan-file-actions" aria-busy={busyId === file.id}>
              <button
                type="button"
                className="tertiary"
                aria-label={t('planFiles.openNamed', { name: file.name })}
                title={t('planFiles.open')}
                disabled={!online || busyId !== null}
                onClick={() => void open(file)}
              >
                <EimirIcon name="external-link" />
              </button>
              {!native ? (
                <button
                  type="button"
                  className="tertiary"
                  aria-label={t('planFiles.downloadNamed', { name: file.name })}
                  title={t('planFiles.download')}
                  disabled={!online || busyId !== null}
                  onClick={() => void open(file, true)}
                >
                  <EimirIcon name="download" />
                </button>
              ) : null}
            </div>
            {problem?.id === file.id ? (
              <small role="status" className="plan-file-feedback">
                {problem.message}
              </small>
            ) : null}
          </FileRow>
        ))}
      </ul>
    </section>
  );
}
