import { onlineManager } from '@tanstack/react-query';
import { useEffect, useId, useRef, useSyncExternalStore } from 'react';
import { useApiRuntime } from '../client/apiRuntimeContext';
import { isClientOnline } from '../client/connectivity';
import type { FailureReference } from '../client/failureReference';
import {
  describeSupportReport,
  NOTE_MAX_CHARACTERS,
  type SupportReportKind,
} from '../client/supportReport';
import {
  type SupportReportSender,
  useSupportReportDraft,
} from '../client/useSupportReportDraft';
import { resolvedLocale, useTranslation } from '../i18n';
import { ShortTaskSheet } from './ShortTaskSheet';
import './SupportReportSheet.css';

const KINDS: readonly SupportReportKind[] = ['PROBLEM', 'FEEDBACK'];

export interface SupportReportSheetProps {
  open: boolean;
  onClose: () => void;
  /** The choice selected for a new draft; a kept draft keeps its own kind. */
  initialKind: SupportReportKind;
  /**
   * The failure shown where the sheet was opened. Only `ProblemState` passes
   * it; it is attached to a problem, never to feedback.
   */
  failure?: FailureReference;
  /** Replaces the generated client; for tests. */
  api?: SupportReportSender;
}

function subscribeConnectivity(notify: () => void): () => void {
  const unsubscribe = onlineManager.subscribe(notify);
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => {
    unsubscribe();
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
  };
}

function useClientOnline(): boolean {
  return useSyncExternalStore(
    subscribeConnectivity,
    isClientOnline,
    () => true,
  );
}

/**
 * The support report sheet (#2189): one choice, one note, the plain list of
 * what is sent and one filled Send action. It closes by pulling down, the
 * backdrop, Back/Escape or the labeled handle; it shows no Close icon.
 */
export function SupportReportSheet(props: SupportReportSheetProps) {
  const accountId = useApiRuntime()?.accountId;
  // Reports are signed-in only; without a session there is nothing to send.
  if (!accountId) return null;
  return <SupportReportSheetContent {...props} accountId={accountId} />;
}

function SupportReportSheetContent({
  open,
  onClose,
  initialKind,
  failure,
  api,
  accountId,
}: SupportReportSheetProps & { accountId: string }) {
  const { t } = useTranslation();
  const draft = useSupportReportDraft(accountId, { api });
  const online = useClientOnline();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const baseId = useId();
  const noteId = `${baseId}-note`;
  const counterId = `${baseId}-counter`;
  const hintId = `${baseId}-hint`;
  const sentHeadingId = `${baseId}-sent`;
  const { kind, note, status, invalid, setKind } = draft;

  // A new draft starts with the entry point's choice; a kept note keeps its
  // own choice so reopening restores what the person wrote.
  useEffect(() => {
    if (open && !wasOpen.current && note.trim() === '' && status === 'idle')
      if (kind !== initialKind) setKind(initialKind);
    wasOpen.current = open;
  }, [open, note, status, kind, initialKind, setKind]);

  useEffect(() => {
    if (status === 'sent') doneRef.current?.focus();
  }, [status]);

  const numbers = new Intl.NumberFormat(resolvedLocale());
  const items = describeSupportReport({ kind, failure });
  const length = Array.from(note).length;
  const sending = status === 'sending';
  const sent = status === 'sent';

  function close() {
    // A received report leaves nothing behind; any other draft is kept.
    if (sent) draft.discard();
    onClose();
  }

  function submit() {
    if (sending || invalid) return;
    if (status === 'queued') void draft.retryNow();
    else void draft.send({ failure });
  }

  const actionLabel = sending
    ? t('supportReport.sending')
    : status === 'queued'
      ? t('supportReport.sendNow')
      : status === 'failed'
        ? t('supportReport.retry')
        : online
          ? t('supportReport.send')
          : t('supportReport.sendLater');

  const showOffline = status === 'queued' || (!online && !sending && !sent);
  const message = sent ? (
    // The visible title already says it; the live region announces it.
    <span className="sr-only">{t('supportReport.success.title')}</span>
  ) : showOffline ? (
    <p className="support-report-message support-report-message-info">
      <strong>{t('supportReport.offline.title')}</strong>{' '}
      {t('supportReport.offline.body')}
    </p>
  ) : status === 'failed' ? (
    <p className="support-report-message support-report-message-problem">
      {t('supportReport.failed')}
    </p>
  ) : status === 'rateLimited' ? (
    <p className="support-report-message support-report-message-problem">
      {t('supportReport.rateLimited')}
    </p>
  ) : null;

  const hint =
    invalid === 'noteRequired'
      ? t('supportReport.noteRequired')
      : invalid === 'noteTooLong'
        ? t('supportReport.noteTooLong', {
            max: numbers.format(NOTE_MAX_CHARACTERS),
          })
        : null;

  return (
    <ShortTaskSheet
      open={open}
      title={
        sent
          ? t('supportReport.success.title')
          : t(`supportReport.title.${kind}`)
      }
      onClose={close}
      showCloseIcon={false}
      initialFocusRef={sent ? doneRef : noteRef}
      className="support-report-sheet"
      footer={
        sent ? (
          <button
            ref={doneRef}
            type="button"
            className="button-link button-link-primary support-report-action"
            onClick={close}
          >
            {t('supportReport.success.done')}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="button-link button-link-primary support-report-action"
              disabled={Boolean(invalid) && !sending}
              aria-disabled={sending || undefined}
              aria-describedby={hint ? hintId : undefined}
              onClick={submit}
            >
              {actionLabel}
            </button>
            {hint ? (
              <p id={hintId} className="support-report-hint">
                {hint}
              </p>
            ) : null}
          </>
        )
      }
    >
      {/* One polite live region announces queued, failed and sent states. */}
      <div role="status" aria-live="polite" className="support-report-status">
        {message}
      </div>
      {sent ? (
        <div className="support-report-success">
          <span className="support-report-success-mark" aria-hidden="true">
            ✓
          </span>
          <p>{t('supportReport.success.body')}</p>
        </div>
      ) : (
        <>
          <fieldset className="support-report-kinds" disabled={sending}>
            <legend className="sr-only">{t('supportReport.kindLabel')}</legend>
            {KINDS.map((option) => (
              <label key={option} className="support-report-kind">
                <input
                  type="radio"
                  className="support-report-kind-input"
                  name={`${baseId}-kind`}
                  value={option}
                  checked={kind === option}
                  onChange={() => setKind(option)}
                />
                <span>{t(`supportReport.kinds.${option}`)}</span>
              </label>
            ))}
          </fieldset>
          <label className="support-report-label" htmlFor={noteId}>
            {t(`supportReport.noteLabel.${kind}`)}
          </label>
          <textarea
            ref={noteRef}
            id={noteId}
            className="support-report-note"
            value={note}
            rows={4}
            disabled={sending}
            aria-describedby={counterId}
            aria-invalid={invalid === 'noteTooLong' || undefined}
            onChange={(event) => draft.setNote(event.target.value)}
          />
          <p id={counterId} className="support-report-counter">
            <span aria-hidden="true">
              {t('supportReport.counter', {
                length: numbers.format(length),
                max: numbers.format(NOTE_MAX_CHARACTERS),
              })}
            </span>
            <span className="sr-only">
              {t('supportReport.counterLabel', {
                length: numbers.format(length),
                max: numbers.format(NOTE_MAX_CHARACTERS),
              })}
            </span>
          </p>
          <section
            className="support-report-sent"
            aria-labelledby={sentHeadingId}
          >
            <h3 id={sentHeadingId} className="support-report-sent-heading">
              {t('supportReport.sentHeading')}
            </h3>
            <ul aria-labelledby={sentHeadingId}>
              {items.map((item) => (
                <li key={item}>
                  {item === 'failure' && failure
                    ? t('supportReport.items.failure', {
                        reference: failure.reference,
                      })
                    : t(`supportReport.items.${item}`)}
                </li>
              ))}
            </ul>
            <p className="support-report-never">{t('supportReport.never')}</p>
            {kind === 'FEEDBACK' ? (
              <p className="support-report-never">
                {t('supportReport.feedbackNoCode')}
              </p>
            ) : null}
          </section>
        </>
      )}
    </ShortTaskSheet>
  );
}
