// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServerAdminApi } from '../api/generated/apis/ServerAdminApi';
import type { ServerAdminSupportReportsApi } from '../api/generated/apis/ServerAdminSupportReportsApi';
import type { ServerAdminOverview } from '../api/generated/models/ServerAdminOverview';
import serverAdmin from '../i18n/locales/serverAdmin';
import { ServerAdminSituation } from './ServerAdminSituation';

function overview(
  overrides: Partial<ServerAdminOverview> = {},
): ServerAdminOverview {
  return {
    accountCount: 2,
    accountsLast24h: 0,
    accountsLast30d: 0,
    accountsLast7d: 0,
    activeSessionCount: 0,
    activeSpaceCount: 1,
    applicationStatus: 'ok',
    buildRevision: 'test',
    databaseProvider: 'postgresql',
    databaseStatus: 'ok',
    demoMode: false,
    deployment: 'cloud',
    enabledAccountCount: 2,
    environment: 'test',
    expiringAdminGrantCount: 0,
    expiringAdminGrants: [],
    jobsFailed: 0,
    jobsFailedUnseen: 0,
    jobsPending: 0,
    jobsRunning: 0,
    lastSuccessfulJobAt: null,
    localPasswordAccountCount: 0,
    mailTransport: 'smtp',
    mediaObjectCount: 0,
    mediaStatus: 'not_probed',
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
    supportReportsNew: 0,
    proAreaAvailable: false,
    supportReportsOperatorAvailable: false,
    suspendedAccountCount: 0,
    unverifiedPrimaryEmailCount: 0,
    verifiedPrimaryEmailCount: 2,
    warningCodes: [],
    workerStatus: 'no_heartbeat_signal',
    ...overrides,
  };
}

function apis(fail = false) {
  const markJobs = vi.fn(() =>
    fail
      ? Promise.reject(new Error('offline'))
      : Promise.resolve({ hidden: 1 }),
  );
  const markReports = vi.fn(() =>
    fail ? Promise.reject(new Error('offline')) : Promise.resolve({ moved: 2 }),
  );
  return {
    markJobs,
    markReports,
    api: {
      markFailedJobsSeenApiV1ServerAdminFailedJobsSeenPost: markJobs,
    } as unknown as ServerAdminApi,
    reportsApi: {
      markSupportReportsSeen: markReports,
    } as unknown as ServerAdminSupportReportsApi,
  };
}

function renderSituation(
  data: ServerAdminOverview,
  clients: ReturnType<typeof apis> = apis(),
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ServerAdminSituation
          overview={data}
          api={clients.api}
          reportsApi={clients.reportsApi}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ServerAdminSituation', () => {
  afterEach(() => cleanup());

  it('lists what needs the operator with direct links', () => {
    renderSituation(
      overview({
        supportReportsNew: 2,
        supportReportsOperatorAvailable: true,
        jobsFailed: 1,
        jobsFailedUnseen: 1,
      }),
    );
    expect(
      screen.getByRole('heading', {
        name: serverAdmin.situation.needsYouTitle,
      }),
    ).toBeTruthy();
    const links = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    expect(links[0]).toBe('/server-admin?section=reports&state=NEW');
    expect(links[1]).toBe('/server-admin?section=jobs');
    expect(
      screen.getByText(
        serverAdmin.situation.attention_other.replace('{{count, number}}', '2'),
      ),
    ).toBeTruthy();
  });

  it('marks failed jobs and new reports as seen from their rows only', async () => {
    const clients = apis();
    renderSituation(
      overview({
        supportReportsNew: 2,
        supportReportsOperatorAvailable: true,
        jobsFailed: 3,
        jobsFailedUnseen: 1,
        warningCodes: ['registration_disabled'],
      }),
      clients,
    );
    // The registration row has no seen button; only the two counted rows do.
    expect(
      screen
        .getAllByRole('button')
        .filter((button) => button.textContent === serverAdmin.situation.seen),
    ).toHaveLength(2);
    // The jobs row counts only the unseen failures.
    expect(
      screen.getByText(
        serverAdmin.situation.failedJobs_one.replace('{{count, number}}', '1'),
      ),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', {
        name: serverAdmin.situation.seenFailedJobs,
      }),
    );
    await waitFor(() => expect(clients.markJobs).toHaveBeenCalledOnce());
    expect(
      await screen.findByText(serverAdmin.situation.seenSaved),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: serverAdmin.situation.seenReports }),
    );
    await waitFor(() => expect(clients.markReports).toHaveBeenCalledOnce());
    const [request] = clients.markReports.mock.calls[0] as unknown as [
      { supportReportsSeen: { through: Date } },
    ];
    expect(request.supportReportsSeen.through).toBeInstanceOf(Date);
  });

  it('keeps the row and says so when marking as seen fails', async () => {
    renderSituation(
      overview({ jobsFailed: 2, jobsFailedUnseen: 2 }),
      apis(true),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: serverAdmin.situation.seenFailedJobs,
      }),
    );
    expect(
      await screen.findByText(serverAdmin.situation.seenFailed),
    ).toBeTruthy();
    const jobs = serverAdmin.situation.failedJobs_other.replace(
      '{{count, number}}',
      '2',
    );
    expect(
      screen
        .getAllByRole('link')
        .some((link) => link.textContent?.includes(jobs)),
    ).toBe(true);
  });

  it('reads as calm when nothing needs the operator', () => {
    renderSituation(overview());
    expect(
      screen.getByText(serverAdmin.situation.nothingNeedsYou),
    ).toBeTruthy();
    expect(screen.getByText(serverAdmin.situation.allGood)).toBeTruthy();
  });

  it('shows a silent worker as a problem', () => {
    renderSituation(overview({ workerStatus: 'silent' }));
    const worker = screen
      .getByText(serverAdmin.health.worker)
      .closest('.server-admin-service');
    expect(worker?.className).toContain('is-problem');
    expect(worker?.textContent).toContain(serverAdmin.situation.silent);
  });

  it('names a missing backup on Cloud and an unknown one on Self-Hosted', () => {
    renderSituation(overview({ deployment: 'cloud' }));
    const cloud = screen
      .getByText(serverAdmin.situation.backup)
      .closest('.server-admin-service');
    expect(cloud?.textContent).toContain(serverAdmin.situation.backupMissing);
    expect(cloud?.className).toContain('is-problem');
    cleanup();

    renderSituation(overview({ deployment: 'self_hosted' }));
    const selfHosted = screen
      .getByText(serverAdmin.situation.backup)
      .closest('.server-admin-service');
    expect(selfHosted?.textContent).toContain(
      serverAdmin.situation.backupUnknown,
    );
  });

  it('never shows a missing worker signal as available', () => {
    renderSituation(overview({ workerStatus: 'no_heartbeat_signal' }));
    const worker = screen
      .getByText(serverAdmin.health.worker)
      .closest('.server-admin-service');
    expect(worker?.textContent).toContain(serverAdmin.situation.noSignalYet);
    expect(worker?.textContent).not.toContain(serverAdmin.health.ok);
  });
});
