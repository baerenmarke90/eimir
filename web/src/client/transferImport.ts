import type { TransferImportDetail } from '../api/generated/models/TransferImportDetail';
import { ImportStatus } from '../api/generated/models/ImportStatus';
import { resolvedLocale } from '../i18n';

/** Server codes of a storage refusal; never shown, only used to pick a state (#2141). */
export const STORAGE_QUOTA_CODES = new Set([
  'STORAGE_QUOTA_EXCEEDED',
  'STORAGE_QUOTA_EXCEEDED_FITS_WITHOUT_VIDEOS',
]);

/** What the import preview offers, from the server's live summary (#2141). */
export type ImportPreviewKind =
  /** Everything fits and needs no Pro: one "Import" action. */
  | 'fits'
  /** The bundle has videos this Space cannot import: import without them. */
  | 'videosNeedPro'
  /** Everything does not fit, but leaving the videos out does. */
  | 'fitsWithoutVideos'
  /** It does not fit even without videos: free up space or get Pro. */
  | 'noRoom';

export interface ImportPreview {
  kind: ImportPreviewKind;
  entries: number;
  media: number;
  videos: number;
  present: number;
  /** Bytes the chosen way adds; ``null`` storage values mean unmetered. */
  needed: number;
  neededWithoutVideos: number;
  available: number | null;
  /** The apply job found less room than the preview did. */
  roomTaken: boolean;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Derive the preview state; missing fields from an older server count as zero. */
export function importPreview(
  detail: TransferImportDetail,
): ImportPreview | null {
  const summary = detail.summary;
  if (!summary) return null;
  const videos = count(summary.videoCount);
  const available =
    typeof summary.storageAvailable === 'number'
      ? summary.storageAvailable
      : null;
  const exceeded = summary.storageQuotaExceeded === true;
  const fitsWithoutVideos = summary.storageFitsWithoutVideos !== false;
  let kind: ImportPreviewKind = 'fits';
  if (summary.videosNeedPro === true && videos > 0) {
    // Without Pro the videos stay out anyway; only the rest has to fit.
    kind = fitsWithoutVideos ? 'videosNeedPro' : 'noRoom';
  } else if (exceeded) {
    kind = videos > 0 && fitsWithoutVideos ? 'fitsWithoutVideos' : 'noRoom';
  }
  return {
    kind,
    entries: Object.values(summary.recordCounts ?? {}).reduce(
      (sum, value) => sum + count(value),
      0,
    ),
    media: count(summary.mediaCount),
    videos,
    present: count(summary.alreadyPresentCount),
    needed: count(summary.storageNeeded),
    neededWithoutVideos: count(summary.storageNeededWithoutVideos),
    available,
    roomTaken:
      detail.status === ImportStatus.READY_TO_APPLY &&
      STORAGE_QUOTA_CODES.has(detail.errorCode ?? ''),
  };
}

/** Whether a recovery of the remembered videos in this file fits the storage. */
export function recoveryFits(detail: TransferImportDetail): boolean {
  const summary = detail.summary;
  if (!summary || typeof summary.storageAvailable !== 'number') return true;
  return count(summary.recoverableVideoBytes) <= summary.storageAvailable;
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
