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
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServerAdminSupportReportsApi } from '../api/generated/apis/ServerAdminSupportReportsApi';
import type { SupportReportDetailView } from '../api/generated/models/SupportReportDetailView';
import type { SupportReportListItem } from '../api/generated/models/SupportReportListItem';
import type { SupportReportListView } from '../api/generated/models/SupportReportListView';
import { FetchError } from '../api/generated/runtime';
import { ClientProblemError } from '../client/problemDetails';
import serverAdmin from '../i18n/locales/serverAdmin';

const reports = serverAdmin.reports;
import { ServerAdminSupportReportsPanel } from './ServerAdminSupportReportsPanel';

const NOTE = 'Our private words about the bug';

function item(index: number, overrides: Partial<SupportReportListItem> = {}) {
  return {
    appVersion: '1.4.0',
    build: '412',
    createdAt: new Date(`2026-11-2${index}T09:00:00Z`),
    failureReference: null,
    hasReply: false,
    id: `00000000-0000-4000-8000-00000000000${index}`,
    kind: 'PROBLEM',
    state: 'NEW',
    ticket: null,
    ...overrides,
  } satisfies SupportReportListItem;
}

function page(
  items: SupportReportListItem[],
  overrides: Partial<SupportReportListView> = {},
): SupportReportListView {
  return {
    hasMore: false,
    items,
    newCount: items.filter((entry) => entry.state === 'NEW').length,
    nextCursor: null,
    ...overrides,
  };
}

function detail(listItem: SupportReportListItem): SupportReportDetailView {
  return {
    ...listItem,
    accountId: '00000000-0000-4000-8000-0000000000ff',
    client: {
      appVersion: listItem.appVersion,
      build: listItem.build,
      engine: 'Blink',
      localTime: '2026-11-24T10:00:00+01:00',
      locale: 'de-DE',
      online: true,
      os: 'Android 16',
      platform: 'app',
      theme: 'dark',
      timeZone: 'Europe/Berlin',
    },
    note: NOTE,
    reply: null,
    requestId: null,
    ticketAvailable: true,
  };
}

function renderPanel(
  listSupportReports: ReturnType<typeof vi.fn>,
  getSupportReport: ReturnType<typeof vi.fn> = vi.fn(),
) {
  const api = {
    listSupportReports,
    getSupportReport,
  } as unknown as ServerAdminSupportReportsApi;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ServerAdminSupportReportsPanel
        api={api}
        apiBaseUrl="https://api.example.test"
        accessToken="admin-token"
      />
    </QueryClientProvider>,
  );
  return { listSupportReports, getSupportReport };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ServerAdminSupportReportsPanel', () => {
  it('renders list without note text', async () => {
    const listSupportReports = vi
      .fn()
      .mockResolvedValue(
        page([item(1), item(2, { hasReply: true })], { newCount: 3 }),
      );
    const { getSupportReport } = renderPanel(listSupportReports);

    expect(await screen.findByText('Neu: 3')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Problem/ })).toHaveLength(2);
    expect(screen.getByText(reports.item.replied)).toBeTruthy();
    expect(screen.queryByText(NOTE)).toBeNull();
    expect(getSupportReport).not.toHaveBeenCalled();
    expect(listSupportReports.mock.calls[0]?.[0]).toMatchObject({
      state: 'NEW',
    });
  });

  it('filters by state', async () => {
    const listSupportReports = vi.fn().mockResolvedValue(page([item(1)]));
    renderPanel(listSupportReports);
    await screen.findByText('Neu: 1');

    fireEvent.click(
      screen.getByRole('button', { name: reports.filter.CLOSED }),
    );
    await waitFor(() =>
      expect(listSupportReports).toHaveBeenLastCalledWith(
        expect.objectContaining({ state: 'CLOSED' }),
      ),
    );
    expect(
      screen
        .getByRole('button', { name: reports.filter.CLOSED })
        .getAttribute('aria-pressed'),
    ).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: reports.filter.all }));
    await waitFor(() =>
      expect(listSupportReports).toHaveBeenLastCalledWith(
        expect.objectContaining({ state: undefined }),
      ),
    );
  });

  it('loads the next page with the keyset cursor', async () => {
    const listSupportReports = vi
      .fn()
      .mockResolvedValueOnce(
        page([item(1)], { hasMore: true, nextCursor: 'cursor-2' }),
      )
      .mockResolvedValueOnce(page([item(2)]));
    renderPanel(listSupportReports);

    fireEvent.click(
      await screen.findByRole('button', { name: reports.loadMore }),
    );

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Problem/ })).toHaveLength(
        2,
      ),
    );
    expect(listSupportReports.mock.calls[1]?.[0]).toMatchObject({
      cursor: 'cursor-2',
    });
    expect(screen.queryByRole('button', { name: reports.loadMore })).toBeNull();
  });

  it('renders loading, empty, error and offline states', async () => {
    const listSupportReports = vi
      .fn()
      .mockReturnValueOnce(new Promise(() => undefined));
    renderPanel(listSupportReports);
    expect(screen.getByText(reports.loadingTitle)).toBeTruthy();
    cleanup();

    renderPanel(vi.fn().mockResolvedValue(page([], { newCount: 0 })));
    expect(await screen.findByText(reports.emptyTitle)).toBeTruthy();
    expect(screen.getByText(reports.emptyNewBody)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: reports.showAll }));
    expect(
      screen
        .getByRole('button', { name: reports.filter.all })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    cleanup();

    renderPanel(
      vi.fn().mockRejectedValue(new ClientProblemError('server', 500)),
    );
    expect(await screen.findByText(reports.errorTitle)).toBeTruthy();
    expect(screen.getByRole('button', { name: reports.retry })).toBeTruthy();
    cleanup();

    renderPanel(vi.fn().mockRejectedValue(new ClientProblemError('offline')));
    expect(await screen.findByText(reports.offlineTitle)).toBeTruthy();
  });

  it('shows the offline state when the device is offline instead of loading forever', async () => {
    onlineManager.setOnline(false);
    try {
      const listSupportReports = vi
        .fn()
        .mockRejectedValue(new FetchError(new TypeError('Failed to fetch')));
      renderPanel(listSupportReports);

      expect(await screen.findByText(reports.offlineTitle)).toBeTruthy();
      expect(listSupportReports).toHaveBeenCalled();
      expect(screen.queryByText(reports.loadingTitle)).toBeNull();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('shows the new count as a number', async () => {
    renderPanel(vi.fn().mockResolvedValue(page([], { newCount: 1234 })));
    expect(await screen.findByText('Neu: 1234')).toBeTruthy();
  });

  it('opens a report in place and returns focus to its row', async () => {
    const first = item(1);
    const listSupportReports = vi.fn().mockResolvedValue(page([first]));
    const getSupportReport = vi.fn().mockResolvedValue(detail(first));
    renderPanel(listSupportReports, getSupportReport);

    const row = await screen.findByRole('button', { name: /Problem/ });
    fireEvent.click(row);

    const heading = await screen.findByRole('heading', { level: 3 });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByText(NOTE)).toBeTruthy();
    expect(getSupportReport).toHaveBeenCalledWith({ reportId: first.id });

    fireEvent.click(screen.getByRole('button', { name: reports.detail.back }));
    const restored = await screen.findByRole('button', { name: /Problem/ });
    await waitFor(() => expect(document.activeElement).toBe(restored));
    expect(screen.queryByText(NOTE)).toBeNull();
  });

  describe('switching rows while a report is open (list beside it)', () => {
    const first = item(1);
    const second = item(2, { kind: 'FEEDBACK' });
    const SECOND_NOTE = 'The second report';

    function renderTwo(calls: Record<string, unknown> = {}) {
      const listSupportReports = vi
        .fn()
        .mockResolvedValue(page([first, second]));
      const getSupportReport = vi.fn(({ reportId }: { reportId: string }) =>
        Promise.resolve(
          reportId === second.id
            ? { ...detail(second), note: SECOND_NOTE }
            : detail(first),
        ),
      );
      const api = {
        listSupportReports,
        getSupportReport,
        ...calls,
      } as unknown as ServerAdminSupportReportsApi;
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });
      render(
        <QueryClientProvider client={queryClient}>
          <ServerAdminSupportReportsPanel
            api={api}
            apiBaseUrl="https://api.example.test"
            accessToken="admin-token"
          />
        </QueryClientProvider>,
      );
      return { listSupportReports, getSupportReport };
    }

    async function openFirstWithDraft(text: string) {
      fireEvent.click(await screen.findByRole('button', { name: /^Problem/ }));
      const field = await screen.findByLabelText(reports.reply.label);
      fireEvent.change(field, { target: { value: text } });
      return field;
    }

    it('asks before replacing a report with an unsent reply; cancel keeps it', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const { getSupportReport } = renderTwo();
      const field = await openFirstWithDraft('Half written');

      fireEvent.click(screen.getByRole('button', { name: /^Feedback/ }));

      expect(confirm).toHaveBeenCalledWith(reports.detail.discardDraftConfirm);
      expect(screen.getByText(NOTE)).toBeTruthy();
      expect((field as HTMLTextAreaElement).value).toBe('Half written');
      expect(getSupportReport).not.toHaveBeenCalledWith({
        reportId: second.id,
      });
    });

    it('confirming discards the draft and opens the other report', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
      renderTwo();
      await openFirstWithDraft('Half written');

      fireEvent.click(screen.getByRole('button', { name: /^Feedback/ }));

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(await screen.findByText(SECOND_NOTE)).toBeTruthy();
      expect(
        (screen.getByLabelText(reports.reply.label) as HTMLTextAreaElement)
          .value,
      ).toBe('');
    });

    it('switches without asking when nothing is typed', async () => {
      const confirm = vi.spyOn(window, 'confirm');
      renderTwo();
      fireEvent.click(await screen.findByRole('button', { name: /^Problem/ }));
      expect(await screen.findByText(NOTE)).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: /^Feedback/ }));

      expect(await screen.findByText(SECOND_NOTE)).toBeTruthy();
      expect(confirm).not.toHaveBeenCalled();
    });

    it('returns to the list with a message when the open report was deleted', async () => {
      const setSupportReportState = vi
        .fn()
        .mockRejectedValue(
          new ClientProblemError('notFound', 404, 'RESOURCE_NOT_FOUND'),
        );
      const { listSupportReports } = renderTwo({ setSupportReportState });
      fireEvent.click(await screen.findByRole('button', { name: /^Problem/ }));
      const group = await screen.findByRole('group', {
        name: reports.detail.stateTitle,
      });
      fireEvent.click(
        Array.from(group.querySelectorAll('button')).find(
          (button) => button.textContent === reports.states.CLOSED,
        ) as HTMLButtonElement,
      );

      expect(await screen.findByRole('alert')).toHaveProperty(
        'textContent',
        reports.errors.notFound,
      );
      expect(screen.queryByText(NOTE)).toBeNull();
      await waitFor(() =>
        expect(listSupportReports.mock.calls.length).toBeGreaterThan(1),
      );
      await waitFor(() =>
        expect(document.activeElement).toBe(
          screen.getByRole('heading', { level: 2, name: reports.title }),
        ),
      );
    });
  });
});
