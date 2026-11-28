import { describe, expect, it } from 'vitest';
import { ResponseError } from '../api/generated/runtime';
import { i18n } from '../i18n';
import { ReferenceFlowError } from './referenceFlow';
import {
  formatStorageBytes,
  STORAGE_QUOTA_EXCEEDED,
  storageLevel,
  storageRefusal,
  storageShare,
} from './storageQuota';

function problem(status: number, code: string): ResponseError {
  return new ResponseError(
    new Response(
      JSON.stringify({ type: 'x', title: 'x', status, detail: 'x', code }),
      { status, headers: { 'Content-Type': 'application/json' } },
    ),
  );
}

describe('storageLevel', () => {
  it('is roomy below 80 percent, almost full from 80 percent and full without room', () => {
    expect(storageLevel({ used: 3_999, quota: 5_000, available: 1_001 })).toBe(
      'roomy',
    );
    expect(storageLevel({ used: 4_000, quota: 5_000, available: 1_000 })).toBe(
      'almostFull',
    );
    expect(storageLevel({ used: 5_000, quota: 5_000, available: 0 })).toBe(
      'full',
    );
    // Over the quota after a downgrade.
    expect(storageLevel({ used: 9_000, quota: 5_000, available: 0 })).toBe(
      'full',
    );
  });

  it('has no level where storage is unmetered', () => {
    expect(
      storageLevel({ used: 9_000, quota: null, available: null }),
    ).toBeNull();
  });
});

describe('storageShare', () => {
  it('stays between empty and full', () => {
    expect(storageShare({ used: 1_250, quota: 5_000, available: 3_750 })).toBe(
      0.25,
    );
    expect(storageShare({ used: 9_000, quota: 5_000, available: 0 })).toBe(1);
    expect(storageShare({ used: 9_000, quota: null, available: null })).toBe(0);
  });
});

describe('storageRefusal', () => {
  it('turns the quota refusal into one plain message with its code', async () => {
    const refused = await storageRefusal(problem(413, STORAGE_QUOTA_EXCEEDED));

    expect(refused).toBeInstanceOf(ReferenceFlowError);
    expect(refused?.message).toBe(i18n.t('storageQuota.uploadRefused'));
    expect(refused?.code).toBe(STORAGE_QUOTA_EXCEEDED);
  });

  it('never mistakes a file too large for its type for a full storage', async () => {
    expect(
      await storageRefusal(problem(413, 'ATTACHMENT_TOO_LARGE')),
    ).toBeNull();
  });

  it('leaves other failures and cancellation to the caller', async () => {
    expect(await storageRefusal(problem(500, 'INTERNAL'))).toBeNull();
    expect(
      await storageRefusal(new ReferenceFlowError('already said')),
    ).toBeNull();
    expect(
      await storageRefusal(new DOMException('Upload aborted.', 'AbortError')),
    ).toBeNull();
  });
});

describe('photo source import refusal', () => {
  it('reports a full storage as retryable, unlike a file that is too large', async () => {
    const { importFailure } = await import('./photoSources');
    const { ClientProblemError } = await import('./problemDetails');

    expect(
      importFailure(
        new ClientProblemError('validation', 413, STORAGE_QUOTA_EXCEEDED),
      ),
    ).toEqual({ state: 'failed', reason: 'storageQuota.uploadRefused' });
    expect(
      importFailure(
        new ClientProblemError('validation', 413, 'ATTACHMENT_TOO_LARGE'),
      ),
    ).toEqual({ state: 'unsupported', reason: 'video.tooLarge' });
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
