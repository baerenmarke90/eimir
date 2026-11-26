import type { ServerAdminOverview } from '../api/generated/models/ServerAdminOverview';
import { type ServerAdminSection, sectionHref } from './serverAdminAreas';

export type NeedsYouKind =
  | 'reports'
  | 'failedJobs'
  | 'storage'
  | 'expiringGrant'
  | 'warning';

export interface NeedsYouItem {
  id: string;
  kind: NeedsYouKind;
  tone: 'danger' | 'warning' | 'info';
  href: string;
  titleKey: string;
  titleValues?: Record<string, number>;
  /** A second line, such as the 14-day unread hint on new reports. */
  detailKey?: string;
  /** A full Space: the bytes the item describes, formatted by the view. */
  storage?: { usedBytes: number; quotaBytes: number };
}

const DAY_MS = 86_400_000;

/** Configuration warnings and the page that resolves each. */
const WARNING_TARGETS: Record<
  string,
  {
    section: ServerAdminSection;
    titleKey: string;
    tone?: NeedsYouItem['tone'];
  }
> = {
  // No backup is a risk of data loss, not a setting (#2317).
  backup_not_configured: {
    section: 'monitoring',
    titleKey: 'serverAdmin.situation.backupNotConfigured',
    tone: 'danger',
  },
  maintenance_mode_enabled: {
    section: 'settings',
    titleKey: 'serverAdmin.warnings.maintenance',
  },
  registration_disabled: {
    section: 'settings',
    titleKey: 'serverAdmin.warnings.registration',
  },
  server_admin_allowlist_empty: {
    section: 'security',
    titleKey: 'serverAdmin.warnings.adminAllowlistEmpty',
  },
  server_admin_allowlist_unmatched: {
    section: 'security',
    titleKey: 'serverAdmin.warnings.adminAllowlistUnmatched',
  },
  mail_disabled_with_unverified_accounts: {
    section: 'security',
    titleKey: 'serverAdmin.warnings.mailVerification',
  },
};

/**
 * What the Situation page asks the operator to look at, most urgent kind
 * first. Codes that already have their own item (failed jobs, unread
 * reports, storage pressure, expiring gifts) are not repeated as warnings.
 */
export function buildNeedsYouItems(
  overview: ServerAdminOverview,
  now: Date = new Date(),
): NeedsYouItem[] {
  const items: NeedsYouItem[] = [];
  if (
    overview.supportReportsOperatorAvailable &&
    overview.supportReportsNew > 0
  ) {
    items.push({
      id: 'reports',
      kind: 'reports',
      tone: 'info',
      href: sectionHref('reports', { state: 'NEW' }),
      titleKey: 'serverAdmin.situation.reports',
      titleValues: { count: overview.supportReportsNew },
      detailKey: overview.warningCodes.includes('support_reports_unread')
        ? 'serverAdmin.warnings.supportReportsUnread'
        : undefined,
    });
  }
  if (overview.jobsFailed > 0) {
    items.push({
      id: 'failed-jobs',
      kind: 'failedJobs',
      tone: 'danger',
      href: sectionHref('jobs'),
      titleKey: 'serverAdmin.situation.failedJobs',
      titleValues: { count: overview.jobsFailed },
    });
  }
  for (const space of overview.storagePressure) {
    items.push({
      id: `storage-${space.spaceId}`,
      kind: 'storage',
      tone: 'warning',
      href: sectionHref('spaces', { space: space.spaceId }),
      titleKey: 'serverAdmin.situation.storage',
      titleValues: {
        percent: Math.floor((space.usedBytes * 100) / space.quotaBytes),
      },
      storage: { usedBytes: space.usedBytes, quotaBytes: space.quotaBytes },
    });
  }
  const moreStorage =
    overview.storagePressureCount - overview.storagePressure.length;
  if (moreStorage > 0) {
    items.push({
      id: 'more-storage',
      kind: 'storage',
      tone: 'warning',
      href: sectionHref('spaces'),
      titleKey: 'serverAdmin.situation.moreStorage',
      titleValues: { count: moreStorage },
    });
  }
  for (const grant of overview.expiringAdminGrants) {
    const days = Math.max(
      1,
      Math.ceil((grant.effectiveUntil.getTime() - now.getTime()) / DAY_MS),
    );
    items.push({
      id: `grant-${grant.grantId}`,
      kind: 'expiringGrant',
      tone: 'info',
      href: sectionHref('spaces', { space: grant.spaceId }),
      titleKey: 'serverAdmin.situation.expiringGrant',
      titleValues: { count: days },
    });
  }
  const moreGrants =
    overview.expiringAdminGrantCount - overview.expiringAdminGrants.length;
  if (moreGrants > 0) {
    items.push({
      id: 'more-expiring-grants',
      kind: 'expiringGrant',
      tone: 'info',
      href: sectionHref('spaces'),
      titleKey: 'serverAdmin.situation.moreExpiringGrants',
      titleValues: { count: moreGrants },
    });
  }
  for (const code of overview.warningCodes) {
    const target = WARNING_TARGETS[code];
    if (!target) continue;
    items.push({
      id: `warning-${code}`,
      kind: 'warning',
      tone: target.tone ?? 'warning',
      href: sectionHref(target.section),
      titleKey: target.titleKey,
    });
  }
  return items;
}

export function summaryTone(
  overview: ServerAdminOverview,
  now: Date = new Date(),
): 'ok' | 'attention' {
  if (overview.applicationStatus !== 'ok' || overview.databaseStatus !== 'ok') {
    return 'attention';
  }
  // Anything queued needs the operator, so the summary never reads as calm.
  return buildNeedsYouItems(overview, now).length > 0 ? 'attention' : 'ok';
}
