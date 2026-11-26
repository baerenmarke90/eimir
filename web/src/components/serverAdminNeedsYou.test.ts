import { describe, expect, it } from 'vitest';
import type { ServerAdminOverview } from '../api/generated/models/ServerAdminOverview';
import { buildNeedsYouItems, summaryTone } from './serverAdminNeedsYou';

const NOW = new Date('2026-11-26T10:00:00Z');
const SPACE = '00000000-0000-4000-8000-000000000001';
const GRANT = '00000000-0000-4000-8000-000000000002';

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

describe('buildNeedsYouItems', () => {
  it('is empty and calm when nothing needs the operator', () => {
    const data = overview();
    expect(buildNeedsYouItems(data, NOW)).toEqual([]);
    expect(summaryTone(data, NOW)).toBe('ok');
  });

  it('offers new reports only with the operator plugin', () => {
    expect(buildNeedsYouItems(overview({ supportReportsNew: 3 }), NOW)).toEqual(
      [],
    );
    const [item] = buildNeedsYouItems(
      overview({ supportReportsNew: 3, supportReportsOperatorAvailable: true }),
      NOW,
    );
    expect(item.kind).toBe('reports');
    expect(item.href).toBe('/server-admin?section=reports&state=NEW');
    expect(item.titleValues).toEqual({ count: 3 });
  });

  it('keeps the 14-day unread hint on the reports item', () => {
    const [item] = buildNeedsYouItems(
      overview({
        supportReportsNew: 1,
        supportReportsOperatorAvailable: true,
        warningCodes: ['support_reports_unread'],
      }),
      NOW,
    );
    expect(item.detailKey).toBe('serverAdmin.warnings.supportReportsUnread');
    const [fresh] = buildNeedsYouItems(
      overview({ supportReportsNew: 1, supportReportsOperatorAvailable: true }),
      NOW,
    );
    expect(fresh.detailKey).toBeUndefined();
  });

  it('orders reports, jobs, storage, grants, then warnings', () => {
    const items = buildNeedsYouItems(
      overview({
        supportReportsNew: 1,
        supportReportsOperatorAvailable: true,
        jobsFailed: 2,
        storagePressureCount: 1,
        storagePressure: [{ spaceId: SPACE, usedBytes: 90, quotaBytes: 100 }],
        expiringAdminGrantCount: 1,
        expiringAdminGrants: [
          {
            spaceId: SPACE,
            grantId: GRANT,
            effectiveUntil: new Date('2026-11-28T12:00:00Z'),
          },
        ],
        warningCodes: [
          'failed_jobs_present',
          'support_reports_unread',
          'storage_quota_pressure',
          'admin_grants_expiring',
          'maintenance_mode_enabled',
        ],
      }),
      NOW,
    );
    expect(items.map((item) => item.kind)).toEqual([
      'reports',
      'failedJobs',
      'storage',
      'expiringGrant',
      'warning',
    ]);
  });

  it('describes a full Space by percent and links to it', () => {
    const [item] = buildNeedsYouItems(
      overview({
        storagePressureCount: 1,
        storagePressure: [{ spaceId: SPACE, usedBytes: 90, quotaBytes: 100 }],
      }),
      NOW,
    );
    expect(item.titleValues).toEqual({ percent: 90 });
    expect(item.href).toBe(`/server-admin?section=spaces&space=${SPACE}`);
    expect(item.tone).toBe('warning');
  });

  it('counts the days left of an expiring gift, at least one', () => {
    const [soon] = buildNeedsYouItems(
      overview({
        expiringAdminGrantCount: 1,
        expiringAdminGrants: [
          {
            spaceId: SPACE,
            grantId: GRANT,
            effectiveUntil: new Date('2026-11-28T12:00:00Z'),
          },
        ],
      }),
      NOW,
    );
    expect(soon.titleValues).toEqual({ count: 3 });
    const [today] = buildNeedsYouItems(
      overview({
        expiringAdminGrantCount: 1,
        expiringAdminGrants: [
          {
            spaceId: SPACE,
            grantId: GRANT,
            effectiveUntil: new Date('2026-11-26T10:30:00Z'),
          },
        ],
      }),
      NOW,
    );
    expect(today.titleValues).toEqual({ count: 1 });
  });

  it('links configuration warnings to the page that fixes them', () => {
    const items = buildNeedsYouItems(
      overview({
        warningCodes: [
          'maintenance_mode_enabled',
          'server_admin_allowlist_unmatched',
        ],
      }),
      NOW,
    );
    expect(items.map((item) => item.href)).toEqual([
      '/server-admin?section=settings',
      '/server-admin?section=security',
    ]);
    expect(items[0].titleKey).toBe('serverAdmin.warnings.maintenance');
  });

  it('names Spaces beyond the five listed ones', () => {
    const items = buildNeedsYouItems(
      overview({
        storagePressureCount: 7,
        storagePressure: [{ spaceId: SPACE, usedBytes: 90, quotaBytes: 100 }],
        expiringAdminGrantCount: 3,
        expiringAdminGrants: [
          {
            spaceId: SPACE,
            grantId: GRANT,
            effectiveUntil: new Date('2026-11-28T12:00:00Z'),
          },
        ],
      }),
      NOW,
    );
    const more = items.filter((item) => item.id.startsWith('more-'));
    expect(more.map((item) => [item.titleKey, item.titleValues])).toEqual([
      ['serverAdmin.situation.moreStorage', { count: 6 }],
      ['serverAdmin.situation.moreExpiringGrants', { count: 2 }],
    ]);
    expect(more[0].href).toBe('/server-admin?section=spaces');
  });

  it('asks for attention whenever something is queued', () => {
    expect(
      summaryTone(
        overview({
          supportReportsNew: 1,
          supportReportsOperatorAvailable: true,
        }),
        NOW,
      ),
    ).toBe('attention');
  });

  it('marks attention when the API or database is not ok', () => {
    expect(summaryTone(overview({ databaseStatus: 'unavailable' }), NOW)).toBe(
      'attention',
    );
  });
});
