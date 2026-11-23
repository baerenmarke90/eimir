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
}));

vi.mock('../client/serverAdmin', () => ({
  createServerAdminApis: () => ({
    auth: {},
    serverAdmin: {
      getServerAdminActivityApiV1ServerAdminActivityGet: api.getActivity,
      getServerAdminOverviewApiV1ServerAdminOverviewGet: api.getOverview,
    },
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
    supportReportsNew: 0,
    suspendedAccountCount: 0,
    unverifiedPrimaryEmailCount: 0,
    verifiedPrimaryEmailCount: 4,
    warningCodes: [],
    workerStatus: 'ok',
    ...overrides,
  };
}

function renderOverview() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/server-admin?section=overview']}>
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
        warningCodes: ['support_reports_unread'],
      }),
    );

    renderOverview();

    expect(
      await screen.findByText(serverAdmin.warnings.supportReportsUnread),
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
});
