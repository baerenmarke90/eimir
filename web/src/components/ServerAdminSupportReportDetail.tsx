import {
  type FormEvent,
  type KeyboardEvent,
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
import { isRecentAuthRequired } from '../client/recentAuthentication';
import {
  characterCount,
  clearSupportReportTicket,
  createSupportReportTicket,
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
  setSupportReportState,
  supportReportErrorKey,
  supportReportQueryKey,
  TICKET_BODY_MAX_CHARACTERS,
  TICKET_TITLE_MAX_CHARACTERS,
  ticketFooterPreview,
  useClientOnline,
} from '../client/supportReportsAdmin';
import { resolvedLocale, useTranslation } from '../i18n';
import { registerServerAdminReportsLocale } from '../i18n/locales/serverAdminReports';
import { ServerAdminRecentAuthModal } from './ServerAdminRecentAuthModal';
import { TaskBackButton } from './TaskBackButton';
import { containModalTabFocus, useModalLifecycle } from './useModalLifecycle';

// The section's copy loads with its code, outside the app entry.
registerServerAdminReportsLocale();

type PrivilegedWrite =
  | { kind: 'state'; state: SupportReportState }
  | { kind: 'reply'; text: string }
  | { kind: 'ticket'; draft: SupportReportTicketDraft }
  | { kind: 'clear' };

type FeedbackSection = 'state' | 'reply' | 'ticket';

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
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  report: SupportReportDetailView;
  pending: boolean;
  error: string | null;
  onSubmit: (draft: SupportReportTicketDraft) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const baseId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(() =>
    t('serverAdmin.reports.ticketDialog.titleTemplate', {
      kind: t(`serverAdmin.reports.kinds.${report.kind}`),
      appVersion: report.appVersion,
    }),
  );
  const [body, setBody] = useState('');
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

  return (
    <div className="server-admin-recent-auth-backdrop">
      <section
        ref={dialogRef}
        className="form-card server-admin-recent-auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${baseId}-title`}
        aria-describedby={`${baseId}-intro`}
        onKeyDown={handleKeyDown}
      >
        <header className="server-admin-recent-auth-head">
          <div>
            <p className="eyebrow">
              {t('serverAdmin.reports.ticketDialog.eyebrow')}
            </p>
            <h2 id={`${baseId}-title`}>
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
            onChange={(event) => setTitle(event.target.value)}
          />
          {titleEmpty || titleTooLong ? (
            <p id={titleErrorId} className="status status-error">
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
            onChange={(event) => setBody(event.target.value)}
          />
          {bodyTooLong ? (
            <p className="status status-error">
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

function TicketSection({
  report,
  online,
  busy,
  onCreate,
  onClear,
}: {
  report: SupportReportDetailView;
  online: boolean;
  busy: boolean;
  onCreate: () => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const ticket: SupportReportTicketSummary | null = report.ticket;
  const now = useNow(ticket?.state === 'PENDING');

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
    return isTicketUncertain(ticket, now) ? (
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

export function ServerAdminSupportReportDetail({
  api,
  reportId,
  apiBaseUrl,
  accessToken,
  onClose,
}: {
  api: ServerAdminSupportReportsApi;
  reportId: string;
  apiBaseUrl: string;
  accessToken: string;
  onClose: () => void;
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
  const [pendingWrite, setPendingWrite] = useState<PrivilegedWrite | null>(
    null,
  );
  const queryKey = supportReportQueryKey(reportId);

  const detailQuery = useQuery({
    queryKey,
    queryFn: () => loadSupportReport(api, reportId),
    retry: false,
  });
  const report = detailQuery.data;
  const loadedId = report?.id;

  // Opening a report moves focus to its heading so the change of view is
  // announced and keyboard users continue in the detail.
  useEffect(() => {
    if (loadedId) headingRef.current?.focus({ preventScroll: true });
  }, [loadedId]);

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

  function failed(
    error: unknown,
    write: PrivilegedWrite,
    section: FeedbackSection,
  ): void {
    if (isRecentAuthRequired(error)) {
      setPendingWrite(write);
      return;
    }
    setFeedback({
      section,
      tone: 'error',
      message: t(supportReportErrorKey(error)),
    });
  }

  const stateMutation = useMutation({
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
    onError: (error, state) => {
      failed(error, { kind: 'state', state }, 'state');
    },
  });

  const replyMutation = useMutation({
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
    onError: (error, text) => {
      failed(error, { kind: 'reply', text }, 'reply');
      if (
        error instanceof ClientProblemError &&
        error.code === 'SUPPORT_REPORT_ALREADY_REPLIED'
      ) {
        void detailQuery.refetch();
      }
    },
  });

  const ticketMutation = useMutation({
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
      setFeedback({
        section: 'ticket',
        tone: 'success',
        message: t('serverAdmin.reports.ticket.createdNotice'),
      });
    },
    onError: (error, draft) => {
      if (isRecentAuthRequired(error)) {
        setPendingWrite({ kind: 'ticket', draft });
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
      setTicketDialogOpen(false);
      setFeedback({ section: 'ticket', tone: 'error', message });
      if (error instanceof SupportReportAdminError && error.ticket) {
        patchTicket(error.ticket);
      } else {
        void detailQuery.refetch();
      }
      changed();
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => clearSupportReportTicket(api, reportId),
    onMutate: () => setFeedback(null),
    onSuccess: () => {
      patchTicket(null);
      changed();
      setFeedback({
        section: 'ticket',
        tone: 'success',
        message: t('serverAdmin.reports.ticket.cleared'),
      });
    },
    onError: (error) => {
      failed(error, { kind: 'clear' }, 'ticket');
    },
  });

  const busy =
    stateMutation.isPending ||
    replyMutation.isPending ||
    ticketMutation.isPending ||
    clearMutation.isPending;

  function retryPendingWrite() {
    const write = pendingWrite;
    setPendingWrite(null);
    if (!write) return;
    if (write.kind === 'state') stateMutation.mutate(write.state);
    else if (write.kind === 'reply') replyMutation.mutate(write.text);
    else if (write.kind === 'ticket') ticketMutation.mutate(write.draft);
    else clearMutation.mutate();
  }

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
    // An unsent reply is the operator's draft: leaving asks first.
    if (
      replyText.trim() !== '' &&
      !window.confirm(t('serverAdmin.reports.reply.discardConfirm'))
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
        <span className="server-admin-badge">
          {t(`serverAdmin.reports.states.${report.state}`)}
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
              aria-describedby={`${hintId} ${counterId}`}
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
              <p className="status status-error">
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
        <h4>{t('serverAdmin.reports.ticket.title')}</h4>
        <TicketSection
          report={report}
          online={online}
          busy={busy}
          onCreate={() => {
            setTicketDialogError(null);
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

      {ticketDialogOpen ? (
        <TicketDialog
          report={report}
          pending={ticketMutation.isPending}
          error={ticketDialogError}
          onSubmit={(draft) => ticketMutation.mutate(draft)}
          onCancel={() => setTicketDialogOpen(false)}
        />
      ) : null}

      {pendingWrite ? (
        <ServerAdminRecentAuthModal
          apiBaseUrl={apiBaseUrl}
          accessToken={accessToken}
          onCancel={() => setPendingWrite(null)}
          onSuccess={retryPendingWrite}
        />
      ) : null}
    </article>
  );
}
