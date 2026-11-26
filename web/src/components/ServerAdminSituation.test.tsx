// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
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
    supportReportsOperatorAvailable: false,
    suspendedAccountCount: 0,
    unverifiedPrimaryEmailCount: 0,
    verifiedPrimaryEmailCount: 2,
    warningCodes: [],
    workerStatus: 'no_heartbeat_signal',
    ...overrides,
  };
}

function renderSituation(data: ServerAdminOverview) {
  return render(
    <MemoryRouter>
      <ServerAdminSituation overview={data} />
    </MemoryRouter>,
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
