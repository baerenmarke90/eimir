import type { SpaceStorageUsage } from '../api/generated/models/SpaceStorageUsage';
import { i18n, resolvedLocale } from '../i18n';
import { normalizeClientError } from './problemDetails';
import { ReferenceFlowError } from './referenceFlow';

/** The server's refusal of new bytes that do not fit the Space's quota (#2141). */
export const STORAGE_QUOTA_EXCEEDED = 'STORAGE_QUOTA_EXCEEDED';

/** "Almost full" starts here (Product Owner decision P4); the client decides it. */
export const ALMOST_FULL_SHARE = 0.8;

export type StorageLevel = 'roomy' | 'almostFull' | 'full';

/** How full the Space's storage is, or ``null`` where it is unmetered (Self-Hosted). */
export function storageLevel(usage: SpaceStorageUsage): StorageLevel | null {
  if (usage.quota === null || usage.quota <= 0) return null;
  if ((usage.available ?? 0) <= 0) return 'full';
  return usage.used >= usage.quota * ALMOST_FULL_SHARE ? 'almostFull' : 'roomy';
}

/** The share of the quota in use, for the meter: 0 to 1. */
export function storageShare(usage: SpaceStorageUsage): number {
  if (!usage.quota) return 0;
  return Math.min(Math.max(usage.used / usage.quota, 0), 1);
}

/**
 * One plain message for an upload the storage quota refused, the same on every
 * media path (Product Owner decision P6). A file too large for its type is a
 * different refusal (`ATTACHMENT_TOO_LARGE`) and keeps its own message.
 */
export async function storageRefusal(
  error: unknown,
): Promise<ReferenceFlowError | null> {
  if (error instanceof ReferenceFlowError) return null;
  if (error instanceof DOMException && error.name === 'AbortError') return null;
  const problem = await normalizeClientError(error);
  return problem.code === STORAGE_QUOTA_EXCEEDED
    ? new ReferenceFlowError(
        i18n.t('storageQuota.uploadRefused'),
        STORAGE_QUOTA_EXCEEDED,
      )
    : null;
}

const DECIMAL_UNITS = [
  ['gigabyte', 1e9],
  ['megabyte', 1e6],
  ['kilobyte', 1e3],
] as const;

/**
 * Storage sizes in decimal units, as the Freemium matrix states the quota
 * (5 GB = 5,000,000,000 bytes). `formatBytes` is binary and would show the
 * same quota as "4.7 GB".
 */
export function formatStorageBytes(
  value: number,
  locale = resolvedLocale(),
): string {
  for (const [unit, size] of DECIMAL_UNITS) {
    if (value >= size)
      return new Intl.NumberFormat(locale, {
        style: 'unit',
        unit,
        maximumFractionDigits: 1,
      }).format(value / size);
  }
  return new Intl.NumberFormat(locale, { style: 'unit', unit: 'byte' }).format(
    value,
  );
}
