import type { ServerAdminSupportReportsApi } from '../api/generated/apis/ServerAdminSupportReportsApi';
import type { SupportReportDetailView } from '../api/generated/models/SupportReportDetailView';
import type { SupportReportListView } from '../api/generated/models/SupportReportListView';
import type { SupportReportState } from '../api/generated/models/SupportReportState';
import {
  type SupportReportTicketSummary,
  SupportReportTicketSummaryFromJSON,
} from '../api/generated/models/SupportReportTicketSummary';
import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { ResponseError } from '../api/generated/runtime';
import { resolvedLocale } from '../i18n';
import { assertOnlineWrite, isClientOnline } from './connectivity';
import { ClientProblemError, normalizeClientError } from './problemDetails';

/** Operator data helpers of the ServerAdmin "Reports" section (#2189). */

export const SUPPORT_REPORT_FILTERS = [
  'NEW',
  'IN_PROGRESS',
  'CLOSED',
  'all',
] as const;
export type SupportReportFilter = (typeof SUPPORT_REPORT_FILTERS)[number];

export const SUPPORT_REPORT_STATES = ['NEW', 'IN_PROGRESS', 'CLOSED'] as const;

/** Page size of the list; the server allows 1 to 100. */
export const SUPPORT_REPORT_PAGE_SIZE = 25;

/** Server limits (backend `eimir_admin/api/models.py`), counted in code points. */
export const REPLY_MAX_CHARACTERS = 500;
export const TICKET_TITLE_MAX_CHARACTERS = 256;
export const TICKET_BODY_MAX_CHARACTERS = 65_536;

/**
 * A `PENDING` ticket link older than this is shown as uncertain: the tracker
 * call may have succeeded or failed, and no automatic retry runs.
 */
export const PENDING_TICKET_UNCERTAIN_AFTER_MS = 5 * 60 * 1000;

/** The triage queue opens on the reports nobody has looked at yet. */
export function resolveSupportReportFilter(
  value: string | null,
): SupportReportFilter {
  return SUPPORT_REPORT_FILTERS.includes(value as SupportReportFilter)
    ? (value as SupportReportFilter)
    : 'NEW';
}

export const SUPPORT_REPORTS_QUERY_KEY = [
  'server-admin',
  'support-reports',
] as const;

export function supportReportsQueryKey(filter: SupportReportFilter) {
  return [...SUPPORT_REPORTS_QUERY_KEY, filter] as const;
}

export function supportReportQueryKey(reportId: string) {
  return ['server-admin', 'support-report', reportId] as const;
}

/** A ticket-route problem with the existing link or the tracker retry flag. */
export class SupportReportAdminError extends ClientProblemError {
  constructor(
    problem: ClientProblemError,
    readonly ticket: SupportReportTicketSummary | null,
    readonly retryable: boolean | null,
  ) {
    super(
      problem.kind,
      problem.status,
      problem.code,
      problem.retryAfterSeconds,
    );
    this.name = 'SupportReportAdminError';
  }
}

async function ticketProblemFields(error: ResponseError): Promise<{
  ticket: SupportReportTicketSummary | null;
  retryable: boolean | null;
}> {
  try {
    const body = (await error.response.clone().json()) as {
      ticket?: unknown;
      retryable?: unknown;
    };
    return {
      ticket:
        body.ticket && typeof body.ticket === 'object'
          ? SupportReportTicketSummaryFromJSON(body.ticket)
          : null,
      retryable: typeof body.retryable === 'boolean' ? body.retryable : null,
    };
  } catch {
    return { ticket: null, retryable: null };
  }
}

export async function normalizeSupportReportError(
  error: unknown,
): Promise<ClientProblemError> {
  const problem = await normalizeClientError(error);
  if (error instanceof ResponseError) {
    const { ticket, retryable } = await ticketProblemFields(error);
    if (ticket !== null || retryable !== null) {
      return new SupportReportAdminError(problem, ticket, retryable);
    }
  }
  return problem;
}

async function call<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw await normalizeSupportReportError(error);
  }
}

async function write<T>(operation: () => Promise<T>): Promise<T> {
  assertOnlineWrite();
  return call(operation);
}

export function loadSupportReportPage(
  api: ServerAdminSupportReportsApi,
  filter: SupportReportFilter,
  cursor?: string | null,
): Promise<SupportReportListView> {
  return call(() =>
    api.listSupportReports({
      cursor: cursor ?? undefined,
      limit: SUPPORT_REPORT_PAGE_SIZE,
      state: filter === 'all' ? undefined : filter,
    }),
  );
}

/** The keyset cursor of the next page, or undefined at the end of the list. */
export function nextSupportReportCursor(
  page: SupportReportListView,
): string | undefined {
  return page.hasMore && page.nextCursor ? page.nextCursor : undefined;
}

export function loadSupportReport(
  api: ServerAdminSupportReportsApi,
  reportId: string,
): Promise<SupportReportDetailView> {
  return call(() => api.getSupportReport({ reportId }));
}

export function setSupportReportState(
  api: ServerAdminSupportReportsApi,
  reportId: string,
  state: SupportReportState,
): Promise<SupportReportDetailView> {
  return write(() =>
    api.setSupportReportState({
      reportId,
      supportReportStateUpdate: { state },
    }),
  );
}

export function replyToSupportReport(
  api: ServerAdminSupportReportsApi,
  reportId: string,
  text: string,
): Promise<SupportReportDetailView> {
  return write(() =>
    api.replyToSupportReport({
      reportId,
      supportReportReplyCreate: { text },
    }),
  );
}

export interface SupportReportTicketDraft {
  title: string;
  body: string;
}

/** Sends exactly what the operator typed; the server appends the footer. */
export function createSupportReportTicket(
  api: ServerAdminSupportReportsApi,
  reportId: string,
  draft: SupportReportTicketDraft,
): Promise<SupportReportTicketSummary> {
  return write(() =>
    api.createSupportReportTicket({
      reportId,
      supportReportTicketCreate: { title: draft.title, body: draft.body },
    }),
  );
}

export function clearSupportReportTicket(
  api: ServerAdminSupportReportsApi,
  reportId: string,
): Promise<void> {
  return write(() => api.clearSupportReportTicket({ reportId }));
}

/** The localization key of the message shown for a failed request. */
export function supportReportErrorKey(error: unknown): string {
  const prefix = 'serverAdmin.reports.errors';
  if (!(error instanceof ClientProblemError)) return `${prefix}.generic`;
  switch (error.code) {
    case 'SUPPORT_REPORT_ALREADY_REPLIED':
      return `${prefix}.alreadyReplied`;
    case 'SUPPORT_TICKET_EXISTS':
      return `${prefix}.ticketExists`;
    case 'SUPPORT_TICKET_NOT_CONFIGURED':
      return `${prefix}.ticketNotConfigured`;
    case 'SUPPORT_TICKET_TOO_LONG':
      return `${prefix}.ticketTooLong`;
    case 'SUPPORT_TICKET_NOT_FOUND':
      return `${prefix}.ticketNotFound`;
    case 'SUPPORT_TICKET_FAILED':
      return error instanceof SupportReportAdminError && error.retryable
        ? `${prefix}.ticketFailedRetryable`
        : `${prefix}.ticketFailed`;
    default:
      break;
  }
  switch (error.kind) {
    case 'offline':
      return `${prefix}.offline`;
    case 'notFound':
      return `${prefix}.notFound`;
    case 'validation':
      return `${prefix}.validation`;
    default:
      return `${prefix}.generic`;
  }
}

/** Length as the server counts it: Unicode code points. */
export function characterCount(text: string): number {
  return Array.from(text).length;
}

export function isTicketUncertain(
  ticket: SupportReportTicketSummary | null,
  now: Date = new Date(),
): boolean {
  return (
    ticket !== null &&
    ticket.state === 'PENDING' &&
    now.getTime() - ticket.createdAt.getTime() >
      PENDING_TICKET_UNCERTAIN_AFTER_MS
  );
}

/** Only an https tracker link is rendered; anything else is dropped. */
export function safeTicketUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

const UNSAFE_FOOTER_CHARACTERS = /[^A-Za-z0-9._+:/{}-]/g;

function footerValue(text: string | null): string {
  if (text === null) return 'none';
  const cleaned = text.replace(UNSAFE_FOOTER_CHARACTERS, '_');
  return cleaned ? `\`${cleaned}\`` : '`none`';
}

/**
 * A read-only preview of the technical footer the server appends to the
 * ticket body. It mirrors `compose_body` in
 * `backend/admin/src/eimir_admin/support_tickets/service.py`; the tracker text
 * is technical and stays untranslated. The server builds the real footer.
 */
export function ticketFooterPreview(report: SupportReportDetailView): string {
  return [
    '---',
    'Support report (technical details)',
    `- Report: ${footerValue(report.id)}`,
    `- Kind: ${footerValue(report.kind)}`,
    `- App version: ${footerValue(report.appVersion)}`,
    `- Build: ${footerValue(report.build)}`,
    `- Platform: ${footerValue(report.client.platform)}`,
    `- Failure reference: ${footerValue(report.failureReference)}`,
    `- Request id: ${footerValue(report.requestId)}`,
  ].join('\n');
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

/**
 * Whether writes may be attempted. Kept in this lazily loaded module rather
 * than the shared connectivity module so the web entry stays within budget.
 */
export function useClientOnline(): boolean {
  return useSyncExternalStore(
    subscribeConnectivity,
    isClientOnline,
    () => true,
  );
}

export function formatReportDate(value: Date): string {
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}
