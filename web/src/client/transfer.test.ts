import { describe, expect, it } from 'vitest';
import { ExportStatus } from '../api/generated/models/ExportStatus';
import { ImportStatus } from '../api/generated/models/ImportStatus';
import { TransferScope } from '../api/generated/models/TransferScope';
import {
  exportStatusNeedsPolling,
  importStatusNeedsPolling,
  transferBundleFilename,
} from './transfer';

describe('M5 Web S6 transfer runtime', () => {
  it('polls exports only while server work is active', () => {
    expect(exportStatusNeedsPolling(ExportStatus.QUEUED)).toBe(true);
    expect(exportStatusNeedsPolling(ExportStatus.RUNNING)).toBe(true);
    expect(exportStatusNeedsPolling(ExportStatus.READY)).toBe(false);
    expect(exportStatusNeedsPolling(ExportStatus.FAILED)).toBe(false);
    expect(exportStatusNeedsPolling(ExportStatus.EXPIRED)).toBe(false);
  });

  it('polls imports only during validation and apply work', () => {
    expect(importStatusNeedsPolling(ImportStatus.QUEUED)).toBe(true);
    expect(importStatusNeedsPolling(ImportStatus.VALIDATING)).toBe(true);
    expect(importStatusNeedsPolling(ImportStatus.APPLYING)).toBe(true);
    expect(importStatusNeedsPolling(ImportStatus.READY_TO_APPLY)).toBe(false);
    expect(importStatusNeedsPolling(ImportStatus.COMPLETED)).toBe(false);
    expect(importStatusNeedsPolling(ImportStatus.FAILED)).toBe(false);
  });

  it('uses a content-free deterministic download name', () => {
    expect(
      transferBundleFilename(
        TransferScope.PERSONAL,
        new Date('2026-08-31T12:00:00Z'),
      ),
    ).toBe('eimir-personal-2026-08-31.zip');
  });
});
