// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerAdminOverview } from '../api/generated/models/ServerAdminOverview';
import serverAdmin from '../i18n/locales/serverAdmin';
import { ServerAdminPage } from './ServerAdminPage';

const api = vi.hoisted(() => ({
  getOverview: vi.fn(),
  getActivity: vi.fn(),
  listSupportReports: vi.fn(),
}));

vi.mock('../client/serverAdmin', () => ({
  createServerAdminApis: () => ({
    auth: {},
    serverAdmin: {
      getServerAdminActivityApiV1ServerAdminActivityGet: api.getActivity,
      getServerAdminOverviewApiV1ServerAdminOverviewGet: api.getOverview,
    },
    supportReports: { listSupportReports: api.listSupportReports },
  }),
}));

function overview(
  overrides: Partial<ServerAdminOverview> = {},
): ServerAdminOverview {
  return {
    accountCount: 4,
    accountsLast24h: 0,
    accountsLast30d: 1,
    accountsLast7d: 0,
    activeSessionCount: 2,
    activeSpaceCount: 2,
    applicationStatus: 'ok',
    buildRevision: 'test',
    databaseProvider: 'sqlite',
    databaseStatus: 'ok',
    demoMode: false,
    deployment: 'self_hosted',
    enabledAccountCount: 4,
    environment: 'test',
    jobsFailed: 0,
    jobsFailedUnseen: 0,
    jobsPending: 0,
    jobsRunning: 0,
    lastSuccessfulJobAt: null,
    localPasswordAccountCount: 4,
    mailTransport: 'smtp',
    mediaObjectCount: 0,
    mediaStatus: 'ok',
    mediaStore: 'filesystem',
    mediaStoredBytes: 0,
    oidcAccountCount: 0,
    oidcConnectionCount: 0,
    oldestPendingJobAt: null,
    passkeyAccountCount: 0,
    processStartedAt: new Date('2026-11-23T08:00:00Z'),
    publicBaseUrl: 'https://eimir.test',
    recentFailedJobs: [],
    serverAdminAllowlistCount: 1,
    serverAdminVerifiedMatchCount: 1,
    workerLastSeenAt: null,
    videoWorkerStatus: 'no_heartbeat_signal',
    emailFailuresLastHour: 0,
    pushFailuresLastHour: 0,
    backupStatus: 'not_configured',
    storagePressure: [],
    storagePressureCount: 0,
    expiringAdminGrants: [],
    expiringAdminGrantCount: 0,
    supportReportsNew: 0,
    proAreaAvailable: false,
    supportReportsOperatorAvailable: false,
    suspendedAccountCount: 0,
    unverifiedPrimaryEmailCount: 0,
    verifiedPrimaryEmailCount: 4,
    warningCodes: [],
    workerStatus: 'ok',
    ...overrides,
  };
}

function renderOverview(entry = '/server-admin?section=overview') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <ServerAdminPage
          apiBaseUrl="http://api.test"
          accessToken="token"
          onLogout={() => undefined}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.getOverview.mockReset();
  api.getActivity.mockReset();
  api.listSupportReports.mockReset();
  api.getActivity.mockResolvedValue([]);
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ServerAdmin support report signal', () => {
  it('shows the count of new reports and the unread warning', async () => {
    api.getOverview.mockResolvedValue(
      overview({
        supportReportsNew: 3,
        supportReportsOperatorAvailable: true,
        warningCodes: ['support_reports_unread'],
      }),
    );

    renderOverview();

    // The Situation's queue names the reports and keeps the 14-day hint.
    expect(
      await screen.findByText(serverAdmin.warnings.supportReportsUnread),
    ).toBeTruthy();
    expect(
      screen.getByText(
        serverAdmin.situation.reports_other.replace('{{count, number}}', '3'),
      ),
    ).toBeTruthy();
    const label = screen.getByText(serverAdmin.usage.supportReportsNew);
    expect(label.closest('div')?.textContent).toContain('3');
  });

  it('shows the zero count and no warning when nothing is waiting', async () => {
    api.getOverview.mockResolvedValue(overview());

    renderOverview();

    const label = await screen.findByText(serverAdmin.usage.supportReportsNew);
    expect(label.closest('div')?.textContent).toContain('0');
    expect(
      screen.queryByText(serverAdmin.warnings.supportReportsUnread),
    ).toBeNull();
  });

  it('section hidden when the overview flag is false', async () => {
    api.getOverview.mockResolvedValue(
      overview({
        supportReportsNew: 2,
        warningCodes: ['support_reports_unread'],
      }),
    );

    renderOverview('/server-admin?section=reports');

    expect(
      await screen.findByText(serverAdmin.reportsUnavailable.title),
    ).toBeTruthy();
    expect(
      screen.queryAllByRole('link', { name: serverAdmin.areas.help }),
    ).toHaveLength(0);
    expect(api.listSupportReports).not.toHaveBeenCalled();
  });

  it('links the unread warning into the section when the plugin is loaded', async () => {
    api.getOverview.mockResolvedValue(
      overview({
        supportReportsNew: 2,
        supportReportsOperatorAvailable: true,
        warningCodes: ['support_reports_unread'],
      }),
    );

    renderOverview();

    const title = await screen.findByText(
      serverAdmin.situation.reports_other.replace('{{count, number}}', '2'),
    );
    expect(title.closest('a')?.getAttribute('href')).toBe(
      '/server-admin?section=reports&state=NEW',
    );
    // Both area navigations (Compact bar, Expanded list) offer Help with
    // the unread count in its name.
    expect(
      screen.getAllByRole('link', {
        name: serverAdmin.areas.helpUnread_other.replace(
          '{{count, number}}',
          '2',
        ),
      }),
    ).toHaveLength(2);
  });

  it('loads the reports panel lazily on the reports section', async () => {
    api.getOverview.mockResolvedValue(
      overview({ supportReportsOperatorAvailable: true }),
    );
    api.listSupportReports.mockResolvedValue({
      hasMore: false,
      items: [],
      newCount: 0,
      nextCursor: null,
    });

    renderOverview('/server-admin?section=reports&state=CLOSED');

    // The panel module is loaded on demand, which can take a moment.
    expect(
      await screen.findByRole(
        'heading',
        { name: serverAdmin.reports.title },
        { timeout: 5000 },
      ),
    ).toBeTruthy();
    expect(api.listSupportReports).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'CLOSED' }),
    );
  });
});
