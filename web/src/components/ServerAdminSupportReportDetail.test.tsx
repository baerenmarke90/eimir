// @vitest-environment jsdom
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerAdminSupportReportsApi } from '../api/generated/apis/ServerAdminSupportReportsApi';
import type { SupportReportDetailView } from '../api/generated/models/SupportReportDetailView';
import type { SupportReportTicketSummary } from '../api/generated/models/SupportReportTicketSummary';
import { FetchError, ResponseError } from '../api/generated/runtime';
import { ClientProblemError } from '../client/problemDetails';
import serverAdmin from '../i18n/locales/serverAdmin';

const reports = serverAdmin.reports;
import { ServerAdminSupportReportDetail } from './ServerAdminSupportReportDetail';

const NOTE = 'Our private words about the bug';
const reportId = '00000000-0000-4000-8000-0000000000aa';

function report(
  overrides: Partial<SupportReportDetailView> = {},
): SupportReportDetailView {
  return {
    os: 'Android 16',
    platform: 'app',
    accountId: '00000000-0000-4000-8000-0000000000ff',
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
    id: reportId,
    kind: 'PROBLEM',
    note: NOTE,
    reply: null,
    requestId: 'req-1',
    state: 'NEW',
    archivedAt: null,
    ticket: null,
    ticketAvailable: true,
    ...overrides,
  };
}

function ticket(
  overrides: Partial<SupportReportTicketSummary> = {},
): SupportReportTicketSummary {
  return {
    createdAt: new Date(),
    number: 7,
    state: 'CREATED',
    tracker: 'github',
    url: 'https://github.com/example/tracker/issues/7',
    ...overrides,
  };
}

function renderDetail(
  initial: SupportReportDetailView,
  calls: Partial<Record<keyof ServerAdminSupportReportsApi, unknown>> = {},
  onClose: () => void = vi.fn(),
  onEditTemplates?: () => void,
) {
  const getSupportReport = vi.fn().mockResolvedValue(initial);
  const api = {
    getSupportReport,
    listSupportReplyTemplates: vi.fn().mockResolvedValue({ items: [] }),
    ...calls,
  } as unknown as ServerAdminSupportReportsApi;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ServerAdminSupportReportDetail
        api={api}
        reportId={initial.id}
        onClose={onClose}
        onEditTemplates={onEditTemplates}
      />
    </QueryClientProvider>,
  );
  return { getSupportReport };
}

const templates = serverAdmin.templates;

function templateList(...entries: Array<[string, string]>) {
  return vi.fn().mockResolvedValue({
    items: entries.map(([name, text], index) => ({
      id: `00000000-0000-4000-8000-00000000020${index}`,
      name,
      text,
      createdAt: new Date('2026-11-26T09:00:00Z'),
      updatedAt: new Date('2026-11-26T09:00:00Z'),
    })),
  });
}

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ServerAdminSupportReportDetail archive and delete', () => {
  it('archives a report, keeps its state and offers to bring it back', async () => {
    const setSupportReportArchived = vi
      .fn()
      .mockResolvedValueOnce(report({ archivedAt: new Date() }))
      .mockResolvedValueOnce(report());
    renderDetail(report(), { setSupportReportArchived });

    fireEvent.click(
      await screen.findByRole('button', { name: reports.manage.archive }),
    );

    await waitFor(() =>
      expect(setSupportReportArchived).toHaveBeenCalledWith({
        reportId,
        supportReportArchiveUpdate: { archived: true },
      }),
    );
    expect(await screen.findByText(reports.manage.archived)).toBeTruthy();
    expect(screen.getByText(reports.item.archived)).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: reports.manage.unarchive }),
    );
    await waitFor(() =>
      expect(setSupportReportArchived).toHaveBeenLastCalledWith({
        reportId,
        supportReportArchiveUpdate: { archived: false },
      }),
    );
    expect(await screen.findByText(reports.manage.unarchived)).toBeTruthy();
  });

  it('names the consequence and deletes nothing until confirmed', async () => {
    const deleteSupportReport = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    renderDetail(report(), { deleteSupportReport }, onClose);

    fireEvent.click(
      await screen.findByRole('button', { name: reports.manage.delete }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: reports.deleteDialog.title,
    });
    expect(
      within(dialog).getByText(reports.deleteDialog.consequence),
    ).toBeTruthy();
    expect(
      within(dialog).queryByText(reports.deleteDialog.ticketStays),
    ).toBeNull();
    // Cancel holds the focus, so Enter cannot delete by accident.
    expect(document.activeElement).toBe(
      within(dialog).getByRole('button', { name: reports.deleteDialog.cancel }),
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: reports.deleteDialog.cancel }),
    );
    expect(
      screen.queryByRole('dialog', { name: reports.deleteDialog.title }),
    ).toBeNull();
    expect(deleteSupportReport).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('deletes after confirmation and returns to the list as deleted', async () => {
    const deleteSupportReport = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    renderDetail(report(), { deleteSupportReport }, onClose);

    fireEvent.click(
      await screen.findByRole('button', { name: reports.manage.delete }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: reports.deleteDialog.confirm }),
    );

    await waitFor(() =>
      expect(deleteSupportReport).toHaveBeenCalledWith({ reportId }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledWith('deleted'));
  });

  it('says in the dialog that a linked tracker ticket stays', async () => {
    renderDetail(report({ ticket: ticket() }));

    fireEvent.click(
      await screen.findByRole('button', { name: reports.manage.delete }),
    );

    expect(
      await screen.findByText(reports.deleteDialog.ticketStays),
    ).toBeTruthy();
  });

  it('keeps a failed deletion in the dialog and the report open', async () => {
    const deleteSupportReport = vi
      .fn()
      .mockRejectedValue(new ClientProblemError('server', 500, 'INTERNAL'));
    const onClose = vi.fn();
    renderDetail(report(), { deleteSupportReport }, onClose);

    fireEvent.click(
      await screen.findByRole('button', { name: reports.manage.delete }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: reports.deleteDialog.title,
    });
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: reports.deleteDialog.confirm,
      }),
    );

    expect(
      await within(dialog).findByText(reports.errors.generic),
    ).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('ServerAdminSupportReportDetail', () => {
  it('shows the note as plain text', async () => {
    renderDetail(report({ note: '<b>bold</b>' }));
    expect(await screen.findByText('<b>bold</b>')).toBeTruthy();
    expect(document.querySelector('b')).toBeNull();
  });

  it('switches the triage state', async () => {
    const setSupportReportState = vi
      .fn()
      .mockResolvedValue(report({ state: 'IN_PROGRESS' }));
    renderDetail(report(), { setSupportReportState });
    const group = await screen.findByRole('group', {
      name: reports.detail.stateTitle,
    });

    fireEvent.click(
      within(group).getByRole('button', { name: reports.states.IN_PROGRESS }),
    );

    await waitFor(() =>
      expect(setSupportReportState).toHaveBeenCalledWith({
        reportId,
        supportReportStateUpdate: { state: 'IN_PROGRESS' },
      }),
    );
    await waitFor(() =>
      expect(
        within(group)
          .getByRole('button', { name: reports.states.IN_PROGRESS })
          .getAttribute('aria-pressed'),
      ).toBe('true'),
    );
  });

  it('hides the ticket button when ticketAvailable is false', async () => {
    renderDetail(report({ ticketAvailable: false }));
    expect(await screen.findByText(reports.ticket.unavailable)).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: reports.ticket.create }),
    ).toBeNull();
  });

  it('reply form counts characters, sends once and then shows the sent text', async () => {
    const replyToSupportReport = vi.fn().mockResolvedValue(
      report({
        hasReply: true,
        reply: { repliedAt: new Date('2026-11-24T11:00:00Z'), text: 'Danke!' },
      }),
    );
    renderDetail(report(), { replyToSupportReport });

    const field = await screen.findByLabelText(reports.reply.label);
    expect(screen.getByText(reports.reply.hint)).toBeTruthy();
    const send = screen.getByRole('button', { name: reports.reply.send });
    expect((send as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(field, { target: { value: 'x'.repeat(501) } });
    expect(screen.getByText('501 / 500')).toBeTruthy();
    expect((send as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(field, { target: { value: 'Danke!' } });
    expect(screen.getByText('6 / 500')).toBeTruthy();
    fireEvent.click(send);

    await waitFor(() =>
      expect(replyToSupportReport).toHaveBeenCalledWith({
        reportId,
        supportReportReplyCreate: { text: 'Danke!' },
      }),
    );
    expect(await screen.findByText(reports.reply.sentTitle)).toBeTruthy();
    expect(screen.getByText('Danke!')).toBeTruthy();
    expect(screen.queryByLabelText(reports.reply.label)).toBeNull();
    expect(
      screen.queryByRole('button', { name: reports.reply.send }),
    ).toBeNull();
    expect(replyToSupportReport).toHaveBeenCalledTimes(1);
  });

  it('asks before leaving an unsent reply draft', async () => {
    const onClose = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    renderDetail(report(), {}, onClose);

    fireEvent.change(await screen.findByLabelText(reports.reply.label), {
      target: { value: 'Halb fertig' },
    });
    fireEvent.click(screen.getByRole('button', { name: reports.detail.back }));

    expect(confirm).toHaveBeenCalledWith(reports.reply.discardConfirm);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: reports.detail.back }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reports an unsent reply as a draft to the list', async () => {
    const onDraftChange = vi.fn();
    const getSupportReport = vi.fn().mockResolvedValue(report());
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ServerAdminSupportReportDetail
          api={{ getSupportReport } as unknown as ServerAdminSupportReportsApi}
          reportId={reportId}
          onClose={vi.fn()}
          onDraftChange={onDraftChange}
        />
      </QueryClientProvider>,
    );
    const field = await screen.findByLabelText(reports.reply.label);
    fireEvent.change(field, { target: { value: 'Draft' } });
    expect(onDraftChange).toHaveBeenLastCalledWith(true);
    fireEvent.change(field, { target: { value: '   ' } });
    expect(onDraftChange).toHaveBeenLastCalledWith(false);
  });

  it.each([
    ['state', 'setSupportReportState'],
    ['reply', 'replyToSupportReport'],
    ['ticket', 'createSupportReportTicket'],
  ])(
    'closes as gone when the report disappeared during a %s write',
    async (kind, method) => {
      const onClose = vi.fn();
      const write = vi
        .fn()
        .mockRejectedValue(
          new ClientProblemError('notFound', 404, 'RESOURCE_NOT_FOUND'),
        );
      renderDetail(report(), { [method]: write }, onClose);

      if (kind === 'state') {
        const group = await screen.findByRole('group', {
          name: reports.detail.stateTitle,
        });
        fireEvent.click(
          within(group).getByRole('button', { name: reports.states.CLOSED }),
        );
      } else if (kind === 'reply') {
        fireEvent.change(await screen.findByLabelText(reports.reply.label), {
          target: { value: 'Hello' },
        });
        fireEvent.click(
          screen.getByRole('button', { name: reports.reply.send }),
        );
      } else {
        fireEvent.click(
          await screen.findByRole('button', { name: reports.ticket.create }),
        );
        const dialog = await screen.findByRole('dialog');
        fireEvent.click(
          within(dialog).getByRole('button', {
            name: reports.ticketDialog.submit,
          }),
        );
      }

      await waitFor(() => expect(onClose).toHaveBeenCalledWith('gone'));
      expect(screen.queryByText(reports.errors.generic)).toBeNull();
    },
  );

  it('shows a stored reply read-only without a form', async () => {
    renderDetail(
      report({
        hasReply: true,
        reply: {
          repliedAt: new Date('2026-11-24T11:00:00Z'),
          text: 'Schon da',
        },
      }),
    );
    expect(await screen.findByText('Schon da')).toBeTruthy();
    expect(screen.queryByLabelText(reports.reply.label)).toBeNull();
  });

  it('ticket dialog sends only the typed title and body', async () => {
    const createSupportReportTicket = vi
      .fn()
      .mockResolvedValue(ticket({ number: 9 }));
    renderDetail(report(), { createSupportReportTicket });

    fireEvent.click(
      await screen.findByRole('button', { name: reports.ticket.create }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: reports.ticketDialog.title,
    });
    expect(within(dialog).getByText(reports.ticketDialog.intro)).toBeTruthy();
    const title = within(dialog).getByLabelText(
      reports.ticketDialog.titleLabel,
    ) as HTMLInputElement;
    const body = within(dialog).getByLabelText(
      reports.ticketDialog.bodyLabel,
    ) as HTMLTextAreaElement;
    expect(title.value).toBe('Problem in Version 1.4.0');
    expect(body.value).toBe('');
    expect(dialog.textContent).toContain(`- Report: \`${reportId}\``);
    expect(dialog.textContent).not.toContain(NOTE);
    await waitFor(() => expect(document.activeElement).toBe(title));

    fireEvent.change(title, { target: { value: 'Upload fails' } });
    fireEvent.change(body, { target: { value: 'Steps: open, tap.' } });
    fireEvent.click(
      within(dialog).getByRole('button', { name: reports.ticketDialog.submit }),
    );

    await waitFor(() =>
      expect(createSupportReportTicket).toHaveBeenCalledWith({
        reportId,
        supportReportTicketCreate: {
          title: 'Upload fails',
          body: 'Steps: open, tap.',
        },
      }),
    );
    expect(JSON.stringify(createSupportReportTicket.mock.calls)).not.toContain(
      NOTE,
    );
    const link = await screen.findByRole('link', { name: /Ticket #9/ });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(
      screen.queryByRole('dialog', { name: reports.ticketDialog.title }),
    ).toBeNull();
  });

  it('shows the ticket link of an existing ticket', async () => {
    renderDetail(report({ ticket: ticket() }));
    const link = await screen.findByRole('link', { name: /Ticket #7/ });
    expect(link.getAttribute('href')).toBe(
      'https://github.com/example/tracker/issues/7',
    );
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(
      screen.queryByRole('button', { name: reports.ticket.create }),
    ).toBeNull();
  });

  it('shows a fresh pending ticket as in progress without clearing', async () => {
    renderDetail(
      report({
        ticket: ticket({ state: 'PENDING', url: null, number: null }),
      }),
    );
    expect(await screen.findByText(reports.ticket.pending)).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: reports.ticket.clear }),
    ).toBeNull();
  });

  it('shows a pending ticket older than five minutes as uncertain and asks before clearing', async () => {
    const clearSupportReportTicket = vi.fn().mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    renderDetail(
      report({
        ticket: ticket({
          state: 'PENDING',
          url: null,
          number: null,
          createdAt: new Date(Date.now() - 6 * 60 * 1000),
        }),
      }),
      { clearSupportReportTicket },
    );

    expect(await screen.findByText(reports.ticket.uncertain)).toBeTruthy();
    const clear = screen.getByRole('button', { name: reports.ticket.clear });

    fireEvent.click(clear);
    expect(confirm).toHaveBeenCalledWith(reports.ticket.confirmClear);
    expect(clearSupportReportTicket).not.toHaveBeenCalled();

    confirm.mockReturnValueOnce(true);
    fireEvent.click(clear);
    await waitFor(() =>
      expect(clearSupportReportTicket).toHaveBeenCalledWith({ reportId }),
    );
    expect(await screen.findByText(reports.ticket.cleared)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: reports.ticket.create }),
    ).toBeTruthy();
  });

  it('maps a ticket conflict to a message and shows the existing link', async () => {
    const response = new Response(
      JSON.stringify({
        code: 'SUPPORT_TICKET_EXISTS',
        detail: 'x',
        retryable: null,
        status: 409,
        ticket: {
          createdAt: new Date().toISOString(),
          number: 11,
          state: 'CREATED',
          tracker: 'github',
          url: 'https://github.com/example/tracker/issues/11',
        },
        title: 'Conflict',
        type: 'conflict',
      }),
      { status: 409 },
    );
    const { ResponseError } = await import('../api/generated/runtime');
    const createSupportReportTicket = vi
      .fn()
      .mockRejectedValue(new ResponseError(response));
    renderDetail(report(), { createSupportReportTicket });

    fireEvent.click(
      await screen.findByRole('button', { name: reports.ticket.create }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: reports.ticketDialog.title,
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: reports.ticketDialog.submit }),
    );

    expect(await screen.findByText(reports.errors.ticketExists)).toBeTruthy();
    expect(
      await screen.findByRole('link', { name: /Ticket #11/ }),
    ).toBeTruthy();
  });

  it('blocks writes while offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderDetail(report());
    expect(await screen.findByText(reports.offlineNotice)).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: reports.ticket.create,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});

function problem(status: number, body: Record<string, unknown>) {
  return new ResponseError(
    new Response(
      JSON.stringify({
        detail: 'x',
        title: 'Problem',
        type: 'p',
        status,
        ...body,
      }),
      { status },
    ),
  );
}

async function openTicketDialog() {
  fireEvent.click(
    await screen.findByRole('button', { name: reports.ticket.create }),
  );
  return screen.findByRole('dialog', { name: reports.ticketDialog.title });
}

function typeTicket(dialog: HTMLElement, title: string, body: string) {
  fireEvent.change(
    within(dialog).getByLabelText(reports.ticketDialog.titleLabel),
    { target: { value: title } },
  );
  fireEvent.change(
    within(dialog).getByLabelText(reports.ticketDialog.bodyLabel),
    { target: { value: body } },
  );
  fireEvent.click(
    within(dialog).getByRole('button', { name: reports.ticketDialog.submit }),
  );
}

describe('ServerAdminSupportReportDetail ticket and write failures', () => {
  it.each([
    [true, reports.errors.ticketFailedRetryable],
    [false, reports.errors.ticketFailed],
  ])(
    'after a tracker failure (retryable %s) offers the confirmed clear at once and keeps the draft',
    async (retryable, message) => {
      const pendingTicket = ticket({
        state: 'PENDING',
        url: null,
        number: null,
        createdAt: new Date(),
      });
      const getSupportReport = vi
        .fn()
        .mockResolvedValueOnce(report())
        .mockResolvedValue(report({ ticket: pendingTicket }));
      const createSupportReportTicket = vi.fn().mockRejectedValue(
        problem(502, {
          code: 'SUPPORT_TICKET_FAILED',
          retryable,
          ticket: null,
        }),
      );
      const clearSupportReportTicket = vi.fn().mockResolvedValue(undefined);
      renderDetail(report(), {
        getSupportReport,
        createSupportReportTicket,
        clearSupportReportTicket,
      });

      typeTicket(await openTicketDialog(), 'My title', 'My body');

      expect(await screen.findByText(message)).toBeTruthy();
      expect(await screen.findByText(reports.ticket.uncertain)).toBeTruthy();
      expect(screen.queryByText(reports.ticket.pending)).toBeNull();
      fireEvent.click(
        screen.getByRole('button', { name: reports.ticket.clear }),
      );
      expect(window.confirm).toHaveBeenCalledWith(reports.ticket.confirmClear);
      await waitFor(() => expect(clearSupportReportTicket).toHaveBeenCalled());

      const dialog = await openTicketDialog();
      expect(
        (
          within(dialog).getByLabelText(
            reports.ticketDialog.titleLabel,
          ) as HTMLInputElement
        ).value,
      ).toBe('My title');
      expect(
        (
          within(dialog).getByLabelText(
            reports.ticketDialog.bodyLabel,
          ) as HTMLTextAreaElement
        ).value,
      ).toBe('My body');
    },
  );

  it('closes the dialog and hides the button when no tracker is configured', async () => {
    const getSupportReport = vi
      .fn()
      .mockResolvedValueOnce(report())
      .mockResolvedValue(report({ ticketAvailable: false }));
    const createSupportReportTicket = vi
      .fn()
      .mockRejectedValue(
        problem(409, { code: 'SUPPORT_TICKET_NOT_CONFIGURED' }),
      );
    renderDetail(report(), { getSupportReport, createSupportReportTicket });

    typeTicket(await openTicketDialog(), 'T', '');

    expect(
      await screen.findByText(reports.errors.ticketNotConfigured),
    ).toBeTruthy();
    expect(
      screen.queryByRole('dialog', { name: reports.ticketDialog.title }),
    ).toBeNull();
    expect(await screen.findByText(reports.ticket.unavailable)).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: reports.ticket.create }),
    ).toBeNull();
  });

  it('keeps the draft in the dialog when the ticket is too long', async () => {
    const createSupportReportTicket = vi
      .fn()
      .mockRejectedValue(problem(422, { code: 'SUPPORT_TICKET_TOO_LONG' }));
    renderDetail(report(), { createSupportReportTicket });

    const dialog = await openTicketDialog();
    typeTicket(dialog, 'Long one', 'Body');

    expect(
      await within(dialog).findByText(reports.errors.ticketTooLong),
    ).toBeTruthy();
    expect(
      (
        within(dialog).getByLabelText(
          reports.ticketDialog.titleLabel,
        ) as HTMLInputElement
      ).value,
    ).toBe('Long one');
  });

  it('creates a ticket and focuses the new link', async () => {
    const createSupportReportTicket = vi
      .fn()
      .mockResolvedValueOnce(ticket({ number: 5 }));
    renderDetail(report(), { createSupportReportTicket });

    const dialog = await openTicketDialog();
    typeTicket(dialog, 'Crash', 'Steps');

    await waitFor(() =>
      expect(createSupportReportTicket).toHaveBeenCalledTimes(1),
    );
    const link = await screen.findByRole('link', { name: /Ticket #5/ });
    await waitFor(() => expect(document.activeElement).toBe(link));
  });

  it('shows the stored reply after a 409 and leaves without a draft prompt', async () => {
    const onClose = vi.fn();
    const getSupportReport = vi
      .fn()
      .mockResolvedValueOnce(report())
      .mockResolvedValue(
        report({
          hasReply: true,
          reply: { repliedAt: new Date(), text: 'Other tab reply' },
        }),
      );
    const replyToSupportReport = vi
      .fn()
      .mockRejectedValue(
        problem(409, { code: 'SUPPORT_REPORT_ALREADY_REPLIED' }),
      );
    renderDetail(report(), { getSupportReport, replyToSupportReport }, onClose);

    fireEvent.change(await screen.findByLabelText(reports.reply.label), {
      target: { value: 'Mine' },
    });
    fireEvent.click(screen.getByRole('button', { name: reports.reply.send }));

    expect(await screen.findByText(reports.errors.alreadyReplied)).toBeTruthy();
    expect(await screen.findByText('Other tab reply')).toBeTruthy();
    vi.mocked(window.confirm).mockClear();
    fireEvent.click(screen.getByRole('button', { name: reports.detail.back }));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sends a reply and a ticket only once on double submit', async () => {
    const replyToSupportReport = vi.fn(() => new Promise(() => undefined));
    const createSupportReportTicket = vi.fn(() => new Promise(() => undefined));
    renderDetail(report(), { replyToSupportReport, createSupportReportTicket });

    fireEvent.change(await screen.findByLabelText(reports.reply.label), {
      target: { value: 'Once' },
    });
    const send = screen.getByRole('button', { name: reports.reply.send });
    fireEvent.click(send);
    fireEvent.click(send);
    await waitFor(() => expect(replyToSupportReport).toHaveBeenCalledTimes(1));
    cleanup();

    renderDetail(report(), { createSupportReportTicket });
    const dialog = await openTicketDialog();
    const submit = within(dialog).getByRole('button', {
      name: reports.ticketDialog.submit,
    });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() =>
      expect(createSupportReportTicket).toHaveBeenCalledTimes(1),
    );
  });

  it('refetches and explains when the ticket link was already gone', async () => {
    const stale = ticket({
      state: 'PENDING',
      url: null,
      number: null,
      createdAt: new Date(Date.now() - 10 * 60 * 1000),
    });
    const getSupportReport = vi
      .fn()
      .mockResolvedValueOnce(report({ ticket: stale }))
      .mockResolvedValue(report());
    const clearSupportReportTicket = vi
      .fn()
      .mockRejectedValue(problem(404, { code: 'SUPPORT_TICKET_NOT_FOUND' }));
    renderDetail(report({ ticket: stale }), {
      getSupportReport,
      clearSupportReportTicket,
    });

    fireEvent.click(
      await screen.findByRole('button', { name: reports.ticket.clear }),
    );

    expect(await screen.findByText(reports.errors.ticketNotFound)).toBeTruthy();
    expect(
      await screen.findByRole('button', { name: reports.ticket.create }),
    ).toBeTruthy();
  });

  it('shows the offline state when the report cannot load while offline', async () => {
    onlineManager.setOnline(false);
    try {
      const getSupportReport = vi
        .fn()
        .mockRejectedValue(new FetchError(new TypeError('Failed to fetch')));
      renderDetail(report(), { getSupportReport });
      expect(await screen.findByText(reports.offlineBody)).toBeTruthy();
      expect(getSupportReport).toHaveBeenCalled();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('ties length errors to their fields', async () => {
    renderDetail(report());
    const field = await screen.findByLabelText(reports.reply.label);
    fireEvent.change(field, { target: { value: 'x'.repeat(501) } });
    const error = screen.getByText(reports.reply.tooLong);
    expect(error.getAttribute('role')).toBe('alert');
    expect(field.getAttribute('aria-describedby')).toContain(error.id);
  });
});

describe('ServerAdminSupportReportDetail reply templates', () => {
  it('puts the note and the reply before the state and the facts', async () => {
    renderDetail(report());
    await screen.findByLabelText(reports.reply.label);

    const headings = screen
      .getAllByRole('heading', { level: 4 })
      .map((heading) => heading.textContent);

    expect(headings).toEqual([
      reports.detail.noteTitle,
      reports.reply.title,
      reports.detail.stateTitle,
      reports.ticket.title,
      reports.detail.factsTitle,
      reports.manage.title,
    ]);
  });

  it('inserts a template at the caret and keeps the focus in the reply', async () => {
    renderDetail(report(), {
      listSupportReplyTemplates: templateList(['Thanks', 'thank you ']),
    });
    const field = (await screen.findByLabelText(
      reports.reply.label,
    )) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: 'Hello, for the report.' } });
    // A tap into the field places the caret.
    fireEvent.focus(field);
    field.setSelectionRange(7, 7);

    fireEvent.click(await screen.findByRole('button', { name: 'Thanks' }));

    await waitFor(() =>
      expect(field.value).toBe('Hello, thank you for the report.'),
    );
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(17);
  });

  it('keeps an over-long result and blocks sending', async () => {
    renderDetail(report(), {
      listSupportReplyTemplates: templateList(['Long', 'b'.repeat(40)]),
    });
    const field = (await screen.findByLabelText(
      reports.reply.label,
    )) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: 'a'.repeat(480) } });
    field.blur();

    fireEvent.click(await screen.findByRole('button', { name: 'Long' }));

    await waitFor(() => expect(field.value.length).toBe(521));
    expect(screen.getByText(reports.reply.tooLong)).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: reports.reply.send,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('hides the templates once the reply was sent', async () => {
    renderDetail(
      report({
        hasReply: true,
        reply: { repliedAt: new Date('2026-11-24T11:00:00Z'), text: 'Done' },
      }),
      { listSupportReplyTemplates: templateList(['Thanks', 'Thanks!']) },
    );

    await screen.findByText(reports.reply.sentTitle);

    expect(screen.queryByText(templates.chipsTitle)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thanks' })).toBeNull();
  });

  it('asks before leaving a draft for the templates page', async () => {
    const onEditTemplates = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    renderDetail(
      report(),
      { listSupportReplyTemplates: templateList(['Thanks', 'Thanks!']) },
      vi.fn(),
      onEditTemplates,
    );
    fireEvent.change(await screen.findByLabelText(reports.reply.label), {
      target: { value: 'Half done' },
    });

    fireEvent.click(
      await screen.findByRole('button', { name: templates.edit }),
    );
    expect(confirm).toHaveBeenCalledWith(reports.reply.discardConfirm);
    expect(onEditTemplates).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: templates.edit }));
    expect(onEditTemplates).toHaveBeenCalledTimes(1);
  });

  it('offers the ticket next to the reply button, once', async () => {
    renderDetail(report());
    const send = await screen.findByRole('button', {
      name: reports.reply.send,
    });

    const create = screen.getAllByRole('button', {
      name: reports.ticket.create,
    });

    expect(create).toHaveLength(1);
    expect(send.parentElement).toBe(create[0]?.parentElement);
    fireEvent.click(create[0] as HTMLElement);
    expect(
      await screen.findByRole('dialog', { name: reports.ticketDialog.title }),
    ).toBeTruthy();
  });
});
