// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { ServerAdminSupportReportsApi } from '../api/generated/apis/ServerAdminSupportReportsApi';
import type { SupportReportDetailView } from '../api/generated/models/SupportReportDetailView';
import type { SupportReportTicketSummary } from '../api/generated/models/SupportReportTicketSummary';
import { ResponseError } from '../api/generated/runtime';
import { ClientProblemError } from './problemDetails';
import {
  characterCount,
  createSupportReportTicket,
  loadSupportReportPage,
  nextSupportReportCursor,
  PENDING_TICKET_UNCERTAIN_AFTER_MS,
  resolveSupportReportFilter,
  replyToSupportReport,
  SupportReportAdminError,
  safeTicketUrl,
  supportReportErrorKey,
  isTicketUncertain,
  ticketFooterPreview,
} from './supportReportsAdmin';

function problemResponse(status: number, body: Record<string, unknown>) {
  return new ResponseError(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/problem+json' },
    }),
  );
}

const report: SupportReportDetailView = {
  accountId: '00000000-0000-4000-8000-000000000001',
  appVersion: '1.4.0',
  build: '412',
  client: {
    appVersion: '1.4.0',
    build: '412',
    engine: 'Blink',
    localTime: '2026-11-24T10:00:00+01:00',
    locale: 'de-DE',
    online: true,
    os: 'Android 16',
    platform: 'app',
    theme: 'dark',
    timeZone: 'Europe/Berlin',
  },
  createdAt: new Date('2026-11-24T09:00:00Z'),
  failureReference: 'GET:/api/v1/memories:500:app',
  hasReply: false,
  id: '00000000-0000-4000-8000-0000000000aa',
  kind: 'PROBLEM',
  note: 'Private words of the couple',
  reply: null,
  requestId: 'req-1',
  state: 'NEW',
  ticket: null,
  ticketAvailable: true,
};

describe('support report admin helpers', () => {
  it('resolves the filter and defaults to new reports', () => {
    expect(resolveSupportReportFilter(null)).toBe('NEW');
    expect(resolveSupportReportFilter('CLOSED')).toBe('CLOSED');
    expect(resolveSupportReportFilter('all')).toBe('all');
    expect(resolveSupportReportFilter('nonsense')).toBe('NEW');
  });

  it('pages with the keyset cursor and sends no state for all', async () => {
    const listSupportReports = vi.fn().mockResolvedValue({
      hasMore: true,
      items: [],
      newCount: 0,
      nextCursor: 'c2',
    });
    const api = {
      listSupportReports,
    } as unknown as ServerAdminSupportReportsApi;

    const page = await loadSupportReportPage(api, 'all', 'c1');
    await loadSupportReportPage(api, 'IN_PROGRESS', null);

    expect(listSupportReports.mock.calls[0]?.[0]).toEqual({
      cursor: 'c1',
      limit: 25,
      state: undefined,
    });
    expect(listSupportReports.mock.calls[1]?.[0]).toEqual({
      cursor: undefined,
      limit: 25,
      state: 'IN_PROGRESS',
    });
    expect(nextSupportReportCursor(page)).toBe('c2');
    expect(
      nextSupportReportCursor({ ...page, hasMore: false, nextCursor: 'x' }),
    ).toBeUndefined();
  });

  it('counts characters as code points', () => {
    expect(characterCount('ab')).toBe(2);
    expect(characterCount('💛')).toBe(1);
  });

  it('marks a pending ticket older than five minutes as uncertain', () => {
    const now = new Date('2026-11-24T10:00:00Z');
    const ticket = (createdAt: Date, state: 'PENDING' | 'CREATED') =>
      ({
        createdAt,
        number: null,
        state,
        tracker: 'github',
        url: null,
      }) satisfies SupportReportTicketSummary;
    const old = new Date(now.getTime() - PENDING_TICKET_UNCERTAIN_AFTER_MS - 1);
    const fresh = new Date(now.getTime() - 60_000);

    expect(isTicketUncertain(ticket(old, 'PENDING'), now)).toBe(true);
    expect(isTicketUncertain(ticket(fresh, 'PENDING'), now)).toBe(false);
    expect(isTicketUncertain(ticket(old, 'CREATED'), now)).toBe(false);
    expect(isTicketUncertain(null, now)).toBe(false);
  });

  it('accepts only https ticket links', () => {
    expect(safeTicketUrl('https://github.com/o/r/issues/7')).toBe(
      'https://github.com/o/r/issues/7',
    );
    expect(safeTicketUrl('http://github.com/o/r/issues/7')).toBeNull();
    expect(safeTicketUrl('javascript:alert(1)')).toBeNull();
    expect(safeTicketUrl('not a url')).toBeNull();
    expect(safeTicketUrl(null)).toBeNull();
  });

  it('previews the technical footer without the note', () => {
    const footer = ticketFooterPreview(report);
    expect(footer).toContain(
      '- Report: `00000000-0000-4000-8000-0000000000aa`',
    );
    expect(footer).toContain('- Kind: `PROBLEM`');
    expect(footer).toContain('- Platform: `app`');
    expect(footer).toContain(
      '- Failure reference: `GET:/api/v1/memories:500:app`',
    );
    expect(footer).not.toContain(report.note as string);
    expect(
      ticketFooterPreview({
        ...report,
        failureReference: null,
        requestId: null,
      }),
    ).toContain('- Request id: none');
  });

  it('sends the reply text and normalizes the one-time conflict', async () => {
    const replyToSupportReportApi = vi.fn().mockRejectedValue(
      problemResponse(409, {
        code: 'SUPPORT_REPORT_ALREADY_REPLIED',
        detail: 'x',
        status: 409,
        title: 'Conflict',
        type: 'conflict',
      }),
    );
    const api = {
      replyToSupportReport: replyToSupportReportApi,
    } as unknown as ServerAdminSupportReportsApi;

    const error = await replyToSupportReport(api, report.id, 'Danke').catch(
      (caught: unknown) => caught,
    );

    expect(replyToSupportReportApi).toHaveBeenCalledWith({
      reportId: report.id,
      supportReportReplyCreate: { text: 'Danke' },
    });
    expect(error).toBeInstanceOf(ClientProblemError);
    expect(supportReportErrorKey(error)).toBe(
      'serverAdmin.reports.errors.alreadyReplied',
    );
  });

  it('keeps the existing link and the retry flag of ticket problems', async () => {
    const createdAt = '2026-11-24T09:30:00Z';
    const createApi = vi
      .fn()
      .mockRejectedValueOnce(
        problemResponse(409, {
          code: 'SUPPORT_TICKET_EXISTS',
          detail: 'x',
          retryable: null,
          status: 409,
          ticket: {
            createdAt,
            number: 7,
            state: 'CREATED',
            tracker: 'github',
            url: 'https://github.com/o/r/issues/7',
          },
          title: 'Conflict',
          type: 'conflict',
        }),
      )
      .mockRejectedValueOnce(
        problemResponse(502, {
          code: 'SUPPORT_TICKET_FAILED',
          detail: 'x',
          retryable: true,
          status: 502,
          ticket: null,
          title: 'Tracker error',
          type: 'bad_gateway',
        }),
      );
    const api = {
      createSupportReportTicket: createApi,
    } as unknown as ServerAdminSupportReportsApi;
    const draft = { title: 'Typed title', body: 'Typed body' };

    const exists = (await createSupportReportTicket(
      api,
      report.id,
      draft,
    ).catch((caught: unknown) => caught)) as SupportReportAdminError;
    const failed = (await createSupportReportTicket(
      api,
      report.id,
      draft,
    ).catch((caught: unknown) => caught)) as SupportReportAdminError;

    expect(createApi.mock.calls[0]?.[0]).toEqual({
      reportId: report.id,
      supportReportTicketCreate: draft,
    });
    expect(exists).toBeInstanceOf(SupportReportAdminError);
    expect(exists.ticket?.number).toBe(7);
    expect(exists.ticket?.createdAt).toEqual(new Date(createdAt));
    expect(supportReportErrorKey(exists)).toBe(
      'serverAdmin.reports.errors.ticketExists',
    );
    expect(failed.retryable).toBe(true);
    expect(supportReportErrorKey(failed)).toBe(
      'serverAdmin.reports.errors.ticketFailedRetryable',
    );
    expect(
      supportReportErrorKey(
        new SupportReportAdminError(
          new ClientProblemError('server', 502, 'SUPPORT_TICKET_FAILED'),
          null,
          false,
        ),
      ),
    ).toBe('serverAdmin.reports.errors.ticketFailed');
  });

  it('maps configuration, length, offline and unknown errors', () => {
    expect(
      supportReportErrorKey(
        new ClientProblemError(
          'conflict',
          409,
          'SUPPORT_TICKET_NOT_CONFIGURED',
        ),
      ),
    ).toBe('serverAdmin.reports.errors.ticketNotConfigured');
    expect(
      supportReportErrorKey(
        new ClientProblemError('validation', 422, 'SUPPORT_TICKET_TOO_LONG'),
      ),
    ).toBe('serverAdmin.reports.errors.ticketTooLong');
    expect(
      supportReportErrorKey(
        new ClientProblemError('notFound', 404, 'SUPPORT_TICKET_NOT_FOUND'),
      ),
    ).toBe('serverAdmin.reports.errors.ticketNotFound');
    expect(supportReportErrorKey(new ClientProblemError('offline'))).toBe(
      'serverAdmin.reports.errors.offline',
    );
    expect(supportReportErrorKey(new ClientProblemError('notFound', 404))).toBe(
      'serverAdmin.reports.errors.notFound',
    );
    expect(supportReportErrorKey(new Error('boom'))).toBe(
      'serverAdmin.reports.errors.generic',
    );
  });

  it('refuses a write while offline without calling the server', async () => {
    const replyApi = vi.fn();
    const api = {
      replyToSupportReport: replyApi,
    } as unknown as ServerAdminSupportReportsApi;
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    const error = await replyToSupportReport(api, report.id, 'Hallo').catch(
      (caught: unknown) => caught,
    );

    expect(replyApi).not.toHaveBeenCalled();
    expect((error as ClientProblemError).kind).toBe('offline');
    online.mockRestore();
  });
});
