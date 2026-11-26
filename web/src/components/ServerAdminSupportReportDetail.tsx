import {
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ServerAdminSupportReportsApi } from '../api/generated/apis/ServerAdminSupportReportsApi';
import type { SupportReportDetailView } from '../api/generated/models/SupportReportDetailView';
import type { SupportReportState } from '../api/generated/models/SupportReportState';
import type { SupportReportTicketSummary } from '../api/generated/models/SupportReportTicketSummary';
import { ClientProblemError } from '../client/problemDetails';
import { useDocumentLeaveGuard } from '../client/useDocumentLeaveGuard';
import {
  characterCount,
  clearSupportReportTicket,
  createSupportReportTicket,
  deleteSupportReport,
  formatReportDate,
  isTicketUncertain,
  loadSupportReport,
  PENDING_TICKET_UNCERTAIN_AFTER_MS,
  REPLY_MAX_CHARACTERS,
  replyToSupportReport,
  SUPPORT_REPORT_STATES,
  SUPPORT_REPORTS_QUERY_KEY,
  SupportReportAdminError,
  type SupportReportTicketDraft,
  safeTicketUrl,
  setSupportReportArchived,
  setSupportReportState,
  supportReportErrorKey,
  supportReportQueryKey,
  TICKET_BODY_MAX_CHARACTERS,
  TICKET_TITLE_MAX_CHARACTERS,
  ticketFooterPreview,
  useClientOnline,
} from '../client/supportReportsAdmin';
import { resolvedLocale, useTranslation } from '../i18n';
import { TaskBackButton } from './TaskBackButton';
import { containModalTabFocus, useModalLifecycle } from './useModalLifecycle';

type FeedbackSection = 'state' | 'reply' | 'ticket' | 'manage';

interface Feedback {
  section: FeedbackSection;
  tone: 'success' | 'error';
  message: string;
}

/** Re-renders while a ticket link is pending so it turns uncertain in time. */
function useNow(active: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    setNow(new Date());
    const timer = window.setInterval(
      () => setNow(new Date()),
      PENDING_TICKET_UNCERTAIN_AFTER_MS / 10,
    );
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function SectionFeedback({
  feedback,
  section,
}: {
  feedback: Feedback | null;
  section: FeedbackSection;
}) {
  if (!feedback || feedback.section !== section) return null;
  return feedback.tone === 'error' ? (
    <p className="status status-error" role="alert">
      {feedback.message}
    </p>
  ) : (
    <p className="status status-success eimir-motion-disclosure" role="status">
      {feedback.message}
    </p>
  );
}

function TicketDialog({
  report,
  draft,
  pending,
  error,
  headingRef,
  onDraftChange,
  onSubmit,
  onCancel,
}: {
  report: SupportReportDetailView;
  /** Kept by the detail so a failed attempt can be retried with it. */
  draft: SupportReportTicketDraft;
  pending: boolean;
  error: string | null;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onDraftChange: (draft: SupportReportTicketDraft) => void;
  onSubmit: (draft: SupportReportTicketDraft) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const baseId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const { title, body } = draft;
  const footer = ticketFooterPreview(report);
  const titleEmpty = title.trim() === '';
  const titleTooLong =
    characterCount(title.trim()) > TICKET_TITLE_MAX_CHARACTERS;
  // The server refuses a body that is too long once the footer is appended.
  const bodyTooLong =
    characterCount(body) > TICKET_BODY_MAX_CHARACTERS ||
    characterCount(body) + characterCount(footer) + 2 >
      TICKET_BODY_MAX_CHARACTERS;
  const invalid = titleEmpty || titleTooLong || bodyTooLong;

  useModalLifecycle({ active: true, initialFocusRef: titleRef });

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && !pending) {
      event.preventDefault();
      onCancel();
      return;
    }
    containModalTabFocus(event, dialogRef.current);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (invalid || pending) return;
    onSubmit({ title, body });
  }

  const titleErrorId = `${baseId}-title-error`;
  const bodyErrorId = `${baseId}-body-error`;

  return (
    <div className="server-admin-report-sheet-backdrop">
      <section
        ref={dialogRef}
        className="form-card server-admin-report-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${baseId}-title`}
        aria-describedby={`${baseId}-intro`}
        onKeyDown={handleKeyDown}
      >
        <header className="server-admin-report-sheet-head">
          <div>
            <p className="eyebrow">
              {t('serverAdmin.reports.ticketDialog.eyebrow')}
            </p>
            <h2 id={`${baseId}-title`} ref={headingRef} tabIndex={-1}>
              {t('serverAdmin.reports.ticketDialog.title')}
            </h2>
          </div>
        </header>
        <p id={`${baseId}-intro`} className="server-admin-muted">
          {t('serverAdmin.reports.ticketDialog.intro')}
        </p>
        <form className="server-admin-report-form" onSubmit={submit}>
          <label htmlFor={`${baseId}-title-input`}>
            {t('serverAdmin.reports.ticketDialog.titleLabel')}
          </label>
          <input
            ref={titleRef}
            id={`${baseId}-title-input`}
            type="text"
            value={title}
            disabled={pending}
            autoComplete="off"
            aria-invalid={titleEmpty || titleTooLong || undefined}
            aria-describedby={
              titleEmpty || titleTooLong ? titleErrorId : undefined
            }
            onChange={(event) =>
              onDraftChange({ title: event.target.value, body })
            }
          />
          {titleEmpty || titleTooLong ? (
            <p id={titleErrorId} className="status status-error" role="alert">
              {t(
                titleEmpty
                  ? 'serverAdmin.reports.ticketDialog.titleRequired'
                  : 'serverAdmin.reports.ticketDialog.titleTooLong',
              )}
            </p>
          ) : null}
          <label htmlFor={`${baseId}-body-input`}>
            {t('serverAdmin.reports.ticketDialog.bodyLabel')}
          </label>
          <textarea
            id={`${baseId}-body-input`}
            value={body}
            rows={5}
            disabled={pending}
            aria-invalid={bodyTooLong || undefined}
            aria-describedby={bodyTooLong ? bodyErrorId : undefined}
            onChange={(event) =>
              onDraftChange({ title, body: event.target.value })
            }
          />
          {bodyTooLong ? (
            <p id={bodyErrorId} className="status status-error" role="alert">
              {t('serverAdmin.reports.ticketDialog.bodyTooLong')}
            </p>
          ) : null}
          <figure className="server-admin-report-footer-figure">
            <figcaption className="server-admin-report-label">
              {t('serverAdmin.reports.ticketDialog.footerLabel')}
            </figcaption>
            <pre className="server-admin-report-footer">{footer}</pre>
          </figure>
          {error ? (
            <p className="status status-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="server-admin-report-dialog-actions">
            <button
              type="button"
              className="secondary"
              disabled={pending}
              onClick={onCancel}
            >
              {t('serverAdmin.reports.ticketDialog.cancel')}
            </button>
            <button type="submit" disabled={invalid || pending}>
              {pending
                ? t('serverAdmin.reports.ticketDialog.submitting')
                : t('serverAdmin.reports.ticketDialog.submit')}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

/**
 * The confirmation before a report is deleted for good. Cancel holds the
 * initial focus, so Enter never deletes; the consequence is named in text.
 */
function DeleteDialog({
  report,
  pending,
  error,
  headingRef,
  onConfirm,
  onCancel,
}: {
  report: SupportReportDetailView;
  pending: boolean;
  error: string | null;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const baseId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useModalLifecycle({ active: true, initialFocusRef: cancelRef });

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && !pending) {
      event.preventDefault();
      onCancel();
      return;
    }
    containModalTabFocus(event, dialogRef.current);
  }

  return (
    <div className="server-admin-report-sheet-backdrop">
      <section
        ref={dialogRef}
        className="form-card server-admin-report-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${baseId}-title`}
        aria-describedby={`${baseId}-intro`}
        onKeyDown={handleKeyDown}
      >
        <header className="server-admin-report-sheet-head">
          <div>
            <p className="eyebrow">
              {t('serverAdmin.reports.deleteDialog.eyebrow')}
            </p>
            <h2 id={`${baseId}-title`} ref={headingRef} tabIndex={-1}>
              {t('serverAdmin.reports.deleteDialog.title')}
            </h2>
          </div>
        </header>
        <div id={`${baseId}-intro`} className="server-admin-report-delete-copy">
          <p>
            <span aria-hidden="true">⚠ </span>
            {t('serverAdmin.reports.deleteDialog.intro', {
              kind: t(`serverAdmin.reports.kinds.${report.kind}`),
              date: formatReportDate(report.createdAt),
            })}
          </p>
          <p>{t('serverAdmin.reports.deleteDialog.consequence')}</p>
          {report.ticket ? (
            <p>{t('serverAdmin.reports.deleteDialog.ticketStays')}</p>
          ) : null}
          <p className="server-admin-muted">
            {t('serverAdmin.reports.deleteDialog.archiveHint')}
          </p>
        </div>
        {error ? (
          <p className="status status-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="server-admin-report-dialog-actions">
          <button
            ref={cancelRef}
            type="button"
            className="secondary"
            disabled={pending}
            onClick={onCancel}
          >
            {t('serverAdmin.reports.deleteDialog.cancel')}
          </button>
          <button
            type="button"
            className="server-admin-report-danger"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending
              ? t('serverAdmin.reports.deleteDialog.deleting')
              : t('serverAdmin.reports.deleteDialog.confirm')}
          </button>
        </div>
      </section>
    </div>
  );
}

function TicketSection({
  report,
  online,
  busy,
  trackerFailed,
  linkRef,
  onCreate,
  onClear,
}: {
  report: SupportReportDetailView;
  online: boolean;
  busy: boolean;
  /** The tracker refused or failed an attempt in this session. */
  trackerFailed: boolean;
  linkRef: RefObject<HTMLAnchorElement | null>;
  onCreate: () => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const ticket: SupportReportTicketSummary | null = report.ticket;
  const now = useNow(ticket?.state === 'PENDING');
  // After a failed attempt the PENDING link is known to be stuck: the
  // operator may clear it at once instead of waiting for the timeout.
  const uncertain = trackerFailed || isTicketUncertain(ticket, now);

  if (ticket === null) {
    return report.ticketAvailable ? (
      <>
        <p className="server-admin-muted">
          {t('serverAdmin.reports.ticket.none')}
        </p>
        <button type="button" disabled={busy || !online} onClick={onCreate}>
          {t('serverAdmin.reports.ticket.create')}
        </button>
      </>
    ) : (
      <p className="server-admin-muted">
        {t('serverAdmin.reports.ticket.unavailable')}
      </p>
    );
  }

  if (ticket.state === 'PENDING') {
    return uncertain ? (
      <div className="server-admin-report-uncertain">
        <p className="status status-warning">
          <strong>{t('serverAdmin.reports.ticket.uncertain')}</strong>
        </p>
        <p className="server-admin-muted">
          {t('serverAdmin.reports.ticket.uncertainHint')}
        </p>
        <button
          type="button"
          className="secondary"
          disabled={busy || !online}
          onClick={onClear}
        >
          {t('serverAdmin.reports.ticket.clear')}
        </button>
      </div>
    ) : (
      <p className="server-admin-muted">
        {t('serverAdmin.reports.ticket.pending')}
      </p>
    );
  }

  const url = safeTicketUrl(ticket.url);
  const label =
    ticket.number !== null
      ? t('serverAdmin.reports.ticket.open', { number: `#${ticket.number}` })
      : t('serverAdmin.reports.ticket.openWithoutNumber');
  return url ? (
    <a
      ref={linkRef}
      className="server-admin-report-ticket-link"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {label}
      <span className="sr-only">
        {' '}
        ({t('serverAdmin.reports.ticket.opensExternal')})
      </span>
    </a>
  ) : (
    <p>
      {t('serverAdmin.reports.ticket.created')}
      {ticket.number !== null ? ` #${ticket.number}` : ''}
    </p>
  );
}

/** The report itself is gone (404 on the report, not on its ticket link). */
function isReportGone(error: unknown): boolean {
  return (
    error instanceof ClientProblemError &&
    error.kind === 'notFound' &&
    error.code !== 'SUPPORT_TICKET_NOT_FOUND'
  );
}

export function ServerAdminSupportReportDetail({
  api,
  reportId,
  onClose,
  onDraftChange,
}: {
  api: ServerAdminSupportReportsApi;
  reportId: string;
  /** `gone`: the report no longer exists; `deleted`: the operator deleted it. */
  onClose: (reason?: 'gone' | 'deleted') => void;
  /** Whether an unsent reply or ticket text would be lost on leaving. */
  onDraftChange?: (dirty: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const online = useClientOnline();
  const baseId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [replyText, setReplyText] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const [ticketDialogError, setTicketDialogError] = useState<string | null>(
    null,
  );
  const [ticketDraft, setTicketDraft] =
    useState<SupportReportTicketDraft | null>(null);
  const [trackerFailed, setTrackerFailed] = useState(false);
  const [ticketFocusRequest, setTicketFocusRequest] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteDialogError, setDeleteDialogError] = useState<string | null>(
    null,
  );
  const deleteHeadingRef = useRef<HTMLHeadingElement>(null);
  const ticketLinkRef = useRef<HTMLAnchorElement>(null);
  const ticketHeadingRef = useRef<HTMLHeadingElement>(null);
  const dialogHeadingRef = useRef<HTMLHeadingElement>(null);
  const queryKey = supportReportQueryKey(reportId);
  // The prefilled ticket title alone is no draft; typed body text is.
  const replyDirty = replyText.trim() !== '';
  const draftDirty =
    replyDirty || (ticketDraft !== null && ticketDraft.body.trim() !== '');
  useDocumentLeaveGuard(draftDirty);
  const onDraftChangeRef = useRef(onDraftChange);
  onDraftChangeRef.current = onDraftChange;
  useEffect(() => {
    onDraftChangeRef.current?.(draftDirty);
  }, [draftDirty]);
  useEffect(() => () => onDraftChangeRef.current?.(false), []);

  // `always`: an offline read fails with an offline error instead of pausing
  // as "loading" forever; writes refuse offline themselves.
  const detailQuery = useQuery({
    queryKey,
    queryFn: () => loadSupportReport(api, reportId),
    retry: false,
    networkMode: 'always',
  });
  const report = detailQuery.data;
  const loadedId = report?.id;

  // Opening a report moves focus to its heading so the change of view is
  // announced and keyboard users continue in the detail.
  useEffect(() => {
    if (loadedId) headingRef.current?.focus({ preventScroll: true });
  }, [loadedId]);

  // After the ticket dialog closes, focus lands on the new link or, without
  // one, on the ticket heading instead of the replaced Create button.
  useEffect(() => {
    if (ticketFocusRequest === 0) return;
    (ticketLinkRef.current ?? ticketHeadingRef.current)?.focus({
      preventScroll: true,
    });
  }, [ticketFocusRequest]);

  function changed(next?: SupportReportDetailView) {
    if (next) queryClient.setQueryData(queryKey, next);
    void queryClient.invalidateQueries({ queryKey: SUPPORT_REPORTS_QUERY_KEY });
    void queryClient.invalidateQueries({
      queryKey: ['server-admin', 'overview'],
    });
  }

  function patchTicket(ticket: SupportReportTicketSummary | null) {
    queryClient.setQueryData<SupportReportDetailView>(queryKey, (current) =>
      current ? { ...current, ticket } : current,
    );
  }

  /** The report was deleted meanwhile: drop it and return to the list. */
  function reportGone(): void {
    queryClient.removeQueries({ queryKey, exact: true });
    void queryClient.invalidateQueries({ queryKey: SUPPORT_REPORTS_QUERY_KEY });
    void queryClient.invalidateQueries({
      queryKey: ['server-admin', 'overview'],
    });
    onClose('gone');
  }

  function failed(error: unknown, section: FeedbackSection): void {
    if (isReportGone(error)) {
      reportGone();
      return;
    }
    setFeedback({
      section,
      tone: 'error',
      message: t(supportReportErrorKey(error)),
    });
  }

  const stateMutation = useMutation({
    networkMode: 'always',
    mutationFn: (state: SupportReportState) =>
      setSupportReportState(api, reportId, state),
    onMutate: () => setFeedback(null),
    onSuccess: (next) => {
      changed(next);
      setFeedback({
        section: 'state',
        tone: 'success',
        message: t('serverAdmin.reports.detail.stateSaved', {
          state: t(`serverAdmin.reports.states.${next.state}`),
        }),
      });
    },
    onError: (error) => {
      failed(error, 'state');
    },
  });

  const replyMutation = useMutation({
    networkMode: 'always',
    mutationFn: (text: string) => replyToSupportReport(api, reportId, text),
    onMutate: () => setFeedback(null),
    onSuccess: (next) => {
      setReplyText('');
      changed(next);
      setFeedback({
        section: 'reply',
        tone: 'success',
        message: t('serverAdmin.reports.reply.sent'),
      });
    },
    onError: (error) => {
      failed(error, 'reply');
      if (
        error instanceof ClientProblemError &&
        error.code === 'SUPPORT_REPORT_ALREADY_REPLIED'
      ) {
        // The stored reply replaces the form; this draft can never be sent.
        setReplyText('');
        void detailQuery.refetch();
      }
    },
  });

  const ticketMutation = useMutation({
    networkMode: 'always',
    mutationFn: (draft: SupportReportTicketDraft) =>
      createSupportReportTicket(api, reportId, draft),
    onMutate: () => {
      setFeedback(null);
      setTicketDialogError(null);
    },
    onSuccess: (ticket) => {
      patchTicket(ticket);
      changed();
      setTicketDialogOpen(false);
      setTicketDraft(null);
      setTrackerFailed(false);
      setTicketFocusRequest((value) => value + 1);
      setFeedback({
        section: 'ticket',
        tone: 'success',
        message: t('serverAdmin.reports.ticket.createdNotice'),
      });
    },
    onError: (error) => {
      if (isReportGone(error)) {
        reportGone();
        return;
      }
      const message = t(supportReportErrorKey(error));
      // Text the operator can fix stays in the dialog with the draft.
      if (
        error instanceof ClientProblemError &&
        (error.code === 'SUPPORT_TICKET_TOO_LONG' ||
          error.kind === 'validation' ||
          error.kind === 'offline')
      ) {
        setTicketDialogError(message);
        return;
      }
      // The dialog closes; the draft stays for the next attempt.
      setTicketDialogOpen(false);
      setTicketFocusRequest((value) => value + 1);
      setFeedback({ section: 'ticket', tone: 'error', message });
      if (
        error instanceof ClientProblemError &&
        error.code === 'SUPPORT_TICKET_FAILED'
      ) {
        setTrackerFailed(true);
      }
      if (error instanceof SupportReportAdminError && error.ticket) {
        patchTicket(error.ticket);
      } else {
        void detailQuery.refetch();
      }
      changed();
    },
  });

  const clearMutation = useMutation({
    networkMode: 'always',
    mutationFn: () => clearSupportReportTicket(api, reportId),
    onMutate: () => setFeedback(null),
    onSuccess: () => {
      patchTicket(null);
      changed();
      setTrackerFailed(false);
      setFeedback({
        section: 'ticket',
        tone: 'success',
        message: t('serverAdmin.reports.ticket.cleared'),
      });
    },
    onError: (error) => {
      failed(error, 'ticket');
      if (
        error instanceof ClientProblemError &&
        error.code === 'SUPPORT_TICKET_NOT_FOUND'
      ) {
        setTrackerFailed(false);
        void detailQuery.refetch();
      }
    },
  });

  const archiveMutation = useMutation({
    networkMode: 'always',
    mutationFn: (archived: boolean) =>
      setSupportReportArchived(api, reportId, archived),
    onMutate: () => setFeedback(null),
    onSuccess: (next) => {
      changed(next);
      setFeedback({
        section: 'manage',
        tone: 'success',
        message: t(
          next.archivedAt
            ? 'serverAdmin.reports.manage.archived'
            : 'serverAdmin.reports.manage.unarchived',
        ),
      });
    },
    onError: (error) => {
      failed(error, 'manage');
    },
  });

  const deleteMutation = useMutation({
    networkMode: 'always',
    mutationFn: () => deleteSupportReport(api, reportId),
    onMutate: () => {
      setFeedback(null);
      setDeleteDialogError(null);
    },
    onSuccess: () => {
      // The report is gone with its reply and ticket link: drop every cache of
      // it, then return to the list, which says so.
      setReplyText('');
      setTicketDraft(null);
      queryClient.removeQueries({ queryKey, exact: true });
      void queryClient.invalidateQueries({
        queryKey: SUPPORT_REPORTS_QUERY_KEY,
      });
      void queryClient.invalidateQueries({
        queryKey: ['server-admin', 'overview'],
      });
      onClose('deleted');
    },
    onError: (error) => {
      if (isReportGone(error)) {
        reportGone();
        return;
      }
      // The failure stays in the dialog, next to the action that failed.
      setDeleteDialogError(t(supportReportErrorKey(error)));
    },
  });

  const busy =
    archiveMutation.isPending ||
    deleteMutation.isPending ||
    stateMutation.isPending ||
    replyMutation.isPending ||
    ticketMutation.isPending ||
    clearMutation.isPending;

  function clearTicket() {
    if (window.confirm(t('serverAdmin.reports.ticket.confirmClear'))) {
      clearMutation.mutate();
    }
  }

  function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!replyReady) return;
    replyMutation.mutate(replyText);
  }

  const replyLength = characterCount(replyText);
  const replyTooLong = replyLength > REPLY_MAX_CHARACTERS;
  const replyReady =
    replyText.trim() !== '' && !replyTooLong && online && !busy;
  const numbers = new Intl.NumberFormat(resolvedLocale());

  function close() {
    // An unsent reply or ticket text is the operator's draft: leaving asks first.
    if (
      draftDirty &&
      !window.confirm(
        t(
          replyDirty
            ? 'serverAdmin.reports.reply.discardConfirm'
            : 'serverAdmin.reports.detail.discardDraftConfirm',
        ),
      )
    ) {
      return;
    }
    onClose();
  }

  const back = (
    <TaskBackButton inline onClick={close}>
      {t('serverAdmin.reports.detail.back')}
    </TaskBackButton>
  );

  if (detailQuery.isPending) {
    return (
      <div className="server-admin-report-detail">
        {back}
        <p className="server-admin-muted" role="status">
          {t('serverAdmin.reports.detail.loading')}
        </p>
      </div>
    );
  }

  if (detailQuery.error || !report) {
    return (
      <div className="server-admin-report-detail">
        {back}
        <p className="status status-error" role="alert">
          {t(
            detailQuery.error instanceof ClientProblemError &&
              detailQuery.error.kind === 'notFound'
              ? 'serverAdmin.reports.errors.notFound'
              : detailQuery.error instanceof ClientProblemError &&
                  detailQuery.error.kind === 'offline'
                ? 'serverAdmin.reports.offlineBody'
                : 'serverAdmin.reports.detail.error',
          )}
        </p>
        <button
          type="button"
          className="secondary"
          onClick={() => void detailQuery.refetch()}
        >
          {t('serverAdmin.reports.retry')}
        </button>
      </div>
    );
  }

  const kindLabel = t(`serverAdmin.reports.kinds.${report.kind}`);
  const counterId = `${baseId}-reply-counter`;
  const hintId = `${baseId}-reply-hint`;
  const replyErrorId = `${baseId}-reply-error`;
  const stateTitleId = `${baseId}-state-title`;
  const facts: Array<{ label: string; value: string; technical?: boolean }> = [
    {
      label: t('serverAdmin.reports.detail.createdAt'),
      value: formatReportDate(report.createdAt),
    },
    {
      label: t('serverAdmin.reports.detail.appVersion'),
      value: report.appVersion,
    },
    { label: t('serverAdmin.reports.detail.build'), value: report.build },
    {
      label: t('serverAdmin.reports.detail.platform'),
      value: report.client.platform,
    },
    { label: t('serverAdmin.reports.detail.os'), value: report.client.os },
    {
      label: t('serverAdmin.reports.detail.engine'),
      value: report.client.engine,
    },
    {
      label: t('serverAdmin.reports.detail.locale'),
      value: report.client.locale,
    },
    {
      label: t('serverAdmin.reports.detail.timeZone'),
      value: report.client.timeZone,
    },
    {
      label: t('serverAdmin.reports.detail.theme'),
      value: report.client.theme,
    },
    {
      label: t('serverAdmin.reports.detail.online'),
      value: t(
        report.client.online
          ? 'serverAdmin.reports.detail.yes'
          : 'serverAdmin.reports.detail.no',
      ),
    },
    {
      label: t('serverAdmin.reports.detail.failureReference'),
      value: report.failureReference ?? t('serverAdmin.reports.detail.none'),
      technical: true,
    },
    {
      label: t('serverAdmin.reports.detail.requestId'),
      value: report.requestId ?? t('serverAdmin.reports.detail.none'),
      technical: true,
    },
    {
      label: t('serverAdmin.reports.detail.accountId'),
      value: report.accountId,
      technical: true,
    },
  ];

  return (
    <article
      className="server-admin-report-detail"
      aria-labelledby={`${baseId}-heading`}
    >
      {back}
      <header className="server-admin-report-detail-head">
        <p className="eyebrow">{t('serverAdmin.reports.detail.eyebrow')}</p>
        <h3 id={`${baseId}-heading`} ref={headingRef} tabIndex={-1}>
          {t('serverAdmin.reports.detail.heading', {
            kind: kindLabel,
            date: formatReportDate(report.createdAt),
          })}
        </h3>
        <span className="server-admin-report-badges">
          <span className="server-admin-badge">
            {t(`serverAdmin.reports.states.${report.state}`)}
          </span>
          {report.archivedAt ? (
            <span className="server-admin-badge">
              {t('serverAdmin.reports.item.archived')}
            </span>
          ) : null}
        </span>
      </header>

      {!online ? (
        <p className="status status-warning" role="status">
          {t('serverAdmin.reports.offlineNotice')}
        </p>
      ) : null}

      <section className="server-admin-report-note">
        <h4>{t('serverAdmin.reports.detail.noteTitle')}</h4>
        {report.note ? (
          <p className="server-admin-report-text">{report.note}</p>
        ) : (
          <p className="server-admin-muted">
            {t('serverAdmin.reports.detail.noNote')}
          </p>
        )}
        <p className="server-admin-muted server-admin-report-privacy">
          {t('serverAdmin.reports.detail.privacy')}
        </p>
      </section>

      <section aria-labelledby={stateTitleId}>
        <fieldset className="server-admin-report-segments">
          <legend>
            <h4 id={stateTitleId}>
              {t('serverAdmin.reports.detail.stateTitle')}
            </h4>
          </legend>
          {SUPPORT_REPORT_STATES.map((state) => (
            <button
              key={state}
              type="button"
              className="secondary"
              aria-pressed={report.state === state}
              disabled={busy || !online}
              onClick={() => {
                if (report.state !== state) stateMutation.mutate(state);
              }}
            >
              {t(`serverAdmin.reports.states.${state}`)}
            </button>
          ))}
        </fieldset>
        <SectionFeedback feedback={feedback} section="state" />
      </section>

      <section>
        <h4>{t('serverAdmin.reports.reply.title')}</h4>
        {report.hasReply || report.reply ? (
          <div className="server-admin-report-sent-reply">
            <p className="server-admin-report-label">
              {t('serverAdmin.reports.reply.sentTitle')}
            </p>
            {report.reply ? (
              <>
                <p className="server-admin-report-text">{report.reply.text}</p>
                <p className="server-admin-muted">
                  {t('serverAdmin.reports.reply.sentAt', {
                    date: formatReportDate(report.reply.repliedAt),
                  })}
                </p>
              </>
            ) : null}
            <p className="server-admin-muted">
              {t('serverAdmin.reports.reply.readOnly')}
            </p>
          </div>
        ) : (
          <form className="server-admin-report-form" onSubmit={submitReply}>
            <label htmlFor={`${baseId}-reply`}>
              {t('serverAdmin.reports.reply.label')}
            </label>
            <p id={hintId} className="server-admin-muted">
              {t('serverAdmin.reports.reply.hint')}
            </p>
            <textarea
              id={`${baseId}-reply`}
              value={replyText}
              rows={4}
              disabled={replyMutation.isPending}
              aria-describedby={
                replyTooLong
                  ? `${hintId} ${counterId} ${replyErrorId}`
                  : `${hintId} ${counterId}`
              }
              aria-invalid={replyTooLong || undefined}
              onChange={(event) => setReplyText(event.target.value)}
            />
            <p id={counterId} className="server-admin-report-counter">
              <span aria-hidden="true">
                {t('serverAdmin.reports.reply.counter', {
                  length: numbers.format(replyLength),
                  max: numbers.format(REPLY_MAX_CHARACTERS),
                })}
              </span>
              <span className="sr-only">
                {t('serverAdmin.reports.reply.counterLabel', {
                  length: numbers.format(replyLength),
                  max: numbers.format(REPLY_MAX_CHARACTERS),
                })}
              </span>
            </p>
            {replyTooLong ? (
              <p id={replyErrorId} className="status status-error" role="alert">
                {t('serverAdmin.reports.reply.tooLong')}
              </p>
            ) : null}
            <button type="submit" disabled={!replyReady}>
              {replyMutation.isPending
                ? t('serverAdmin.reports.reply.sending')
                : t('serverAdmin.reports.reply.send')}
            </button>
          </form>
        )}
        <SectionFeedback feedback={feedback} section="reply" />
      </section>

      <section>
        <h4 ref={ticketHeadingRef} tabIndex={-1}>
          {t('serverAdmin.reports.ticket.title')}
        </h4>
        <TicketSection
          report={report}
          online={online}
          busy={busy}
          trackerFailed={trackerFailed}
          linkRef={ticketLinkRef}
          onCreate={() => {
            setTicketDialogError(null);
            setTicketDraft(
              (kept) =>
                kept ?? {
                  title: t('serverAdmin.reports.ticketDialog.titleTemplate', {
                    kind: kindLabel,
                    appVersion: report.appVersion,
                  }),
                  body: '',
                },
            );
            setTicketDialogOpen(true);
          }}
          onClear={clearTicket}
        />
        <SectionFeedback feedback={feedback} section="ticket" />
      </section>

      <section>
        <h4>{t('serverAdmin.reports.detail.factsTitle')}</h4>
        <dl className="server-admin-metrics server-admin-report-facts">
          {facts.map((fact) => (
            <div className="server-admin-metric" key={fact.label}>
              <dt>{fact.label}</dt>
              <dd
                className={fact.technical ? 'server-admin-actor-id' : undefined}
              >
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="server-admin-muted">
          {t('serverAdmin.reports.detail.accountHint')}
        </p>
      </section>

      <section aria-labelledby={`${baseId}-manage-title`}>
        <h4 id={`${baseId}-manage-title`}>
          {t('serverAdmin.reports.manage.title')}
        </h4>
        <p className="server-admin-muted">
          {t(
            report.archivedAt
              ? 'serverAdmin.reports.manage.archivedHint'
              : 'serverAdmin.reports.manage.archiveHint',
          )}
        </p>
        <div className="server-admin-report-manage-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy || !online}
            onClick={() => archiveMutation.mutate(!report.archivedAt)}
          >
            {archiveMutation.isPending
              ? t('serverAdmin.reports.manage.saving')
              : t(
                  report.archivedAt
                    ? 'serverAdmin.reports.manage.unarchive'
                    : 'serverAdmin.reports.manage.archive',
                )}
          </button>
          <button
            type="button"
            className="server-admin-report-danger-outline"
            disabled={busy || !online}
            onClick={() => {
              setDeleteDialogError(null);
              setDeleteDialogOpen(true);
            }}
          >
            {t('serverAdmin.reports.manage.delete')}
          </button>
        </div>
        <SectionFeedback feedback={feedback} section="manage" />
      </section>

      {deleteDialogOpen ? (
        <DeleteDialog
          report={report}
          pending={deleteMutation.isPending}
          error={deleteDialogError}
          headingRef={deleteHeadingRef}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setDeleteDialogOpen(false)}
        />
      ) : null}

      {ticketDialogOpen && ticketDraft ? (
        <TicketDialog
          report={report}
          draft={ticketDraft}
          pending={ticketMutation.isPending}
          error={ticketDialogError}
          headingRef={dialogHeadingRef}
          onDraftChange={setTicketDraft}
          onSubmit={(draft) => ticketMutation.mutate(draft)}
          onCancel={() => setTicketDialogOpen(false)}
        />
      ) : null}
    </article>
  );
}
