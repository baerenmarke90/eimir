import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FetchError, ResponseError } from '../api/generated/runtime';
import { i18n } from '../i18n';
import { ClientProblemError } from './problemDetails';
import { ReferenceFlowError, UploadTransferError } from './referenceFlow';
import { describeUploadFailure, UploadFailureError } from './uploadFailure';

const native = vi.hoisted(() => ({ value: false }));
vi.mock('../pwa', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../pwa')>()),
  isCapacitorNative: () => native.value,
}));

function refusal(status: number, code?: string): ResponseError {
  return new ResponseError(
    new Response(
      code
        ? JSON.stringify({
            type: 'problem',
            title: 'Refused',
            status,
            detail: 'Server-side detail that must not reach the couple.',
            code,
          })
        : '<html>proxy</html>',
      { status, headers: { 'Content-Type': 'application/json' } },
    ),
  );
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  native.value = false;
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  vi.unstubAllGlobals();
});

describe('describeUploadFailure', () => {
  it.each(['de', 'en'])(
    'says plainly in %s that the storage is full, without a reference',
    async (locale) => {
      await i18n.changeLanguage(locale);
      const failure = await describeUploadFailure(
        refusal(413, 'STORAGE_QUOTA_EXCEEDED'),
        { phase: 'create', media: 'image', size: 4 * 1024 * 1024 },
      );
      expect(failure).toBeInstanceOf(UploadFailureError);
      expect(failure).toMatchObject({
        message: i18n.t('storageQuota.uploadRefused'),
        code: 'STORAGE_QUOTA_EXCEEDED',
        reason: 'storageFull',
      });
      expect(failure.message).not.toContain('create-413');
    },
  );

  it('keeps the size limit and format reasons distinguishable per media kind', async () => {
    await expect(
      describeUploadFailure(refusal(413, 'ATTACHMENT_TOO_LARGE'), {
        phase: 'create',
        media: 'image',
      }),
    ).resolves.toMatchObject({
      message: i18n.t('flow.imageTooLarge'),
      reason: 'tooLarge',
    });
    await expect(
      describeUploadFailure(refusal(415, 'ATTACHMENT_TYPE_NOT_ALLOWED'), {
        phase: 'create',
        media: 'image',
      }),
    ).resolves.toMatchObject({
      message: i18n.t('uploadFailure.imageType'),
      reason: 'typeNotAllowed',
    });
    await expect(
      describeUploadFailure(refusal(415, 'ATTACHMENT_TYPE_NOT_ALLOWED'), {
        phase: 'create',
        media: 'video',
      }),
    ).resolves.toMatchObject({ message: i18n.t('video.unsupported') });
    await expect(
      describeUploadFailure(refusal(413, 'ATTACHMENT_TOO_LARGE'), {
        phase: 'create',
        media: 'document',
      }),
    ).resolves.toMatchObject({ message: i18n.t('planFiles.tooLarge') });
  });

  it('adds a reference when the server refuses the bytes after admitting the file', async () => {
    native.value = true;
    const failure = await describeUploadFailure(
      new UploadTransferError('http', 413, undefined, 100),
      { phase: 'put', media: 'image' },
    );
    expect(failure.message).toBe(
      `${i18n.t('flow.imageTooLarge')} ${i18n.t('uploadFailure.reference', { reference: 'put-413-app' })}`,
    );
  });

  it('falls back to a warm message with the status and problem code', async () => {
    const failure = await describeUploadFailure(
      refusal(409, 'ATTACHMENT_NOT_READY'),
      { phase: 'finalize', media: 'image' },
    );
    expect(failure).toMatchObject({
      reason: 'refused',
      reference: 'finalize-409-ATTACHMENT_NOT_READY-web',
      message: `${i18n.t('uploadFailure.image')} ${i18n.t('uploadFailure.reference', { reference: 'finalize-409-ATTACHMENT_NOT_READY-web' })}`,
    });
    expect(failure.message).not.toContain('Server-side detail');

    await expect(
      describeUploadFailure(refusal(502), { phase: 'create', media: 'audio' }),
    ).resolves.toMatchObject({
      reference: 'create-502-web',
      message: expect.stringContaining(i18n.t('voiceNotes.uploadFailed')),
    });
  });

  it('tells a dropped connection, a stalled transfer and being offline apart', async () => {
    native.value = true;
    await expect(
      describeUploadFailure(
        new UploadTransferError('network', 0, undefined, 37),
        { phase: 'put', media: 'image' },
      ),
    ).resolves.toMatchObject({
      reason: 'connection',
      reference: 'put-network-app',
      message: expect.stringContaining(i18n.t('uploadFailure.connection')),
    });
    await expect(
      describeUploadFailure(new UploadTransferError('stalled'), {
        phase: 'put',
        media: 'image',
      }),
    ).resolves.toMatchObject({
      reason: 'stalled',
      message: expect.stringContaining(i18n.t('uploadFailure.stalled')),
    });
    await expect(
      describeUploadFailure(new FetchError(new TypeError('Failed to fetch')), {
        phase: 'create',
        media: 'image',
      }),
    ).resolves.toMatchObject({ reason: 'connection' });

    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    await expect(
      describeUploadFailure(new UploadTransferError('network'), {
        phase: 'put',
        media: 'image',
      }),
    ).resolves.toMatchObject({
      reason: 'offline',
      message: i18n.t('uploadFailure.offline'),
    });
  });

  it('names a client-side refusal such as a session or origin mismatch', async () => {
    await expect(
      describeUploadFailure(new ClientProblemError('unauthorized', 401), {
        phase: 'put',
        media: 'image',
      }),
    ).resolves.toMatchObject({ reason: 'refused', reference: 'put-401-web' });
    await expect(
      describeUploadFailure(new Error('Private transport details'), {
        phase: 'start',
        media: 'video',
      }),
    ).resolves.toMatchObject({
      reference: 'start-client-web',
      message: expect.not.stringContaining('Private'),
    });
  });

  it('passes specific client checks and cancellations through', async () => {
    const specific = new ReferenceFlowError(
      i18n.t('flow.imageUnreadable'),
      'IMAGE_UNREADABLE',
    );
    await expect(
      describeUploadFailure(specific, { phase: 'validate', media: 'image' }),
    ).resolves.toBe(specific);
    const aborted = new DOMException('Upload aborted.', 'AbortError');
    await expect(
      describeUploadFailure(aborted, { phase: 'put', media: 'image' }),
    ).resolves.toBe(aborted);
  });

  it('leaves one privacy-safe breadcrumb line for testers', async () => {
    native.value = true;
    await describeUploadFailure(
      new UploadTransferError('network', 0, undefined, 37),
      { phase: 'put', media: 'image', size: 4.4 * 1024 * 1024 },
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      '[eimir.upload] failed phase=put transport=app media=image reason=connection status=0 detail=network progress=37 sizeMiB=4.4 online=true',
    );
  });
});
