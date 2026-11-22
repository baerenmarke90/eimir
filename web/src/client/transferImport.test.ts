import { describe, expect, it } from 'vitest';
import { ImportStatus } from '../api/generated/models/ImportStatus';
import type { TransferImportDetail } from '../api/generated/models/TransferImportDetail';
import type { TransferImportSummary } from '../api/generated/models/TransferImportSummary';
import { TransferScope } from '../api/generated/models/TransferScope';
import {
  formatStorageBytes,
  importPreview,
  recoveryFits,
} from './transferImport';

function summary(
  overrides: Partial<TransferImportSummary> = {},
): TransferImportSummary {
  return {
    scope: TransferScope.SHARED,
    recordCounts: { memories: 3, plans: 1 },
    mediaCount: 5,
    sourceMemberCount: 2,
    alreadyPresentCount: 0,
    videoCount: 0,
    videoBytes: 0,
    videosNeedPro: false,
    skippedVideoCount: 0,
    recoverableVideoCount: 0,
    recoveredVideoCount: 0,
    unrecoveredVideoCount: 0,
    recoverableVideoBytes: 0,
    storageNeeded: 1_000,
    storageNeededWithoutVideos: 1_000,
    storageAvailable: 5_000,
    storageQuotaExceeded: false,
    storageFitsWithoutVideos: true,
    ...overrides,
  };
}

function detail(
  value: TransferImportSummary | null,
  overrides: Partial<TransferImportDetail> = {},
): TransferImportDetail {
  return {
    id: 'import-1',
    status: ImportStatus.READY_TO_APPLY,
    scope: TransferScope.SHARED,
    createdAt: new Date('2026-11-21T10:00:00Z'),
    validatedAt: new Date('2026-11-21T10:01:00Z'),
    completedAt: null,
    expiresAt: new Date('2026-11-22T10:00:00Z'),
    artifactSize: 1024,
    errorCode: null,
    summary: value,
    ...overrides,
  };
}

describe('importPreview', () => {
  it('offers a plain import when everything fits', () => {
    const preview = importPreview(detail(summary({ alreadyPresentCount: 2 })));
    expect(preview).toMatchObject({
      kind: 'fits',
      entries: 4,
      media: 5,
      present: 2,
      needed: 1_000,
      available: 5_000,
      roomTaken: false,
    });
  });

  it('leaves videos out when they need Pro', () => {
    const preview = importPreview(
      detail(
        summary({
          videoCount: 2,
          videosNeedPro: true,
          storageQuotaExceeded: true,
        }),
      ),
    );
    expect(preview?.kind).toBe('videosNeedPro');
  });

  it('offers leaving the videos out when only that fits', () => {
    const preview = importPreview(
      detail(summary({ videoCount: 2, storageQuotaExceeded: true })),
    );
    expect(preview?.kind).toBe('fitsWithoutVideos');
  });

  it.each([
    ['without videos to leave out', { storageQuotaExceeded: true }],
    [
      'even without the videos',
      {
        videoCount: 2,
        storageQuotaExceeded: true,
        storageFitsWithoutVideos: false,
      },
    ],
    [
      'when the videos need Pro and the rest does not fit',
      { videoCount: 2, videosNeedPro: true, storageFitsWithoutVideos: false },
    ],
  ])('has no room %s', (_label, overrides) => {
    expect(importPreview(detail(summary(overrides)))?.kind).toBe('noRoom');
  });

  it('reads an unmetered Space as no storage line', () => {
    expect(
      importPreview(detail(summary({ storageAvailable: null })))?.available,
    ).toBeNull();
  });

  it('notices a refusal by the apply job after room was taken', () => {
    const preview = importPreview(
      detail(summary(), { errorCode: 'STORAGE_QUOTA_EXCEEDED' }),
    );
    expect(preview?.roomTaken).toBe(true);
  });

  it('treats a summary from an older server as zero', () => {
    const older = {
      scope: TransferScope.SHARED,
      recordCounts: {},
      mediaCount: 1,
    };
    const preview = importPreview(
      detail(older as unknown as TransferImportSummary),
    );
    expect(preview).toMatchObject({
      kind: 'fits',
      videos: 0,
      present: 0,
      available: null,
    });
  });

  it('has nothing to show without a summary', () => {
    expect(importPreview(detail(null))).toBeNull();
  });
});

describe('recoveryFits', () => {
  it('compares the recoverable videos with the free room', () => {
    expect(
      recoveryFits(detail(summary({ recoverableVideoBytes: 5_000 }))),
    ).toBe(true);
    expect(
      recoveryFits(detail(summary({ recoverableVideoBytes: 5_001 }))),
    ).toBe(false);
    expect(
      recoveryFits(
        detail(summary({ recoverableVideoBytes: 9, storageAvailable: null })),
      ),
    ).toBe(true);
  });
});

describe('formatStorageBytes', () => {
  // Intl keeps the number and unit together with a no-break space.
  const plain = (value: number, locale: string) =>
    formatStorageBytes(value, locale).replace(/ /g, ' ');

  it('uses decimal units, as the quota is stated', () => {
    expect(plain(5_000_000_000, 'de-DE')).toBe('5 GB');
    expect(plain(1_850_000_000, 'de-DE')).toBe('1,9 GB');
    expect(plain(480_000_000, 'en')).toBe('480 MB');
    expect(plain(1_500, 'en')).toBe('1.5 kB');
    expect(plain(12, 'en')).toBe('12 byte');
  });
});
