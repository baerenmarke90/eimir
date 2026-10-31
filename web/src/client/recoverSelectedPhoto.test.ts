import { describe, expect, it, vi } from 'vitest';
import type { ReferenceApis } from './referenceFlow';
import { recoverSelectedPhoto } from './recoverSelectedPhoto';
import {
  memoryOnlyPhotoDescriptor,
  missingSelectedPhoto,
  selectedPhotoUnavailable,
} from './selectedMediaRetention';

const missing = () =>
  missingSelectedPhoto({
    name: 'photo.jpg',
    type: 'image/jpeg',
    size: 9,
    lastModified: 42,
  });

function fixture() {
  const getAttachment = vi.fn().mockResolvedValue({ status: 'READY' });
  const getAttachmentContentRaw = vi.fn().mockResolvedValue({
    raw: { blob: async () => new Blob(['pixels'], { type: 'image/jpeg' }) },
  });
  const apis = {
    attachments: { getAttachment, getAttachmentContentRaw },
  } as unknown as ReferenceApis;
  return { apis, getAttachment, getAttachmentContentRaw };
}

describe('memory-only selected-photo recovery', () => {
  it('reads with current authorization and no-store without inventing a parent', async () => {
    const f = fixture();
    const signal = new AbortController().signal;
    const file = await recoverSelectedPhoto(
      f.apis,
      'space',
      missing(),
      'ready-id',
      signal,
    );
    expect(file.size).toBe(6);
    expect(file.name).toBe('photo.jpg');
    expect(file.lastModified).toBe(42);
    expect(memoryOnlyPhotoDescriptor(file)).toBeDefined();
    expect(selectedPhotoUnavailable(file)).toBe(false);
    expect(f.getAttachmentContentRaw).toHaveBeenCalledWith(
      { spaceId: 'space', attachmentId: 'ready-id' },
      { signal, cache: 'no-store' },
    );
  });

  it('never uploads or reads an unfinished selection without a server reference', async () => {
    const f = fixture();
    await expect(
      recoverSelectedPhoto(
        f.apis,
        'space',
        missing(),
        undefined,
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    expect(f.getAttachment).not.toHaveBeenCalled();
  });

  it.each(['PENDING', 'FAILED'])(
    'does not read a %s upload',
    async (status) => {
      const f = fixture();
      f.getAttachment.mockResolvedValue({ status });
      await expect(
        recoverSelectedPhoto(
          f.apis,
          'space',
          missing(),
          'id',
          new AbortController().signal,
        ),
      ).rejects.toThrow();
      expect(f.getAttachmentContentRaw).not.toHaveBeenCalled();
    },
  );

  it('preserves an authorization failure without another transport fallback', async () => {
    const f = fixture();
    f.getAttachment.mockRejectedValue(new Error('Forbidden'));
    await expect(
      recoverSelectedPhoto(
        f.apis,
        'space',
        missing(),
        'id',
        new AbortController().signal,
      ),
    ).rejects.toThrow('Forbidden');
    expect(f.getAttachmentContentRaw).not.toHaveBeenCalled();
  });

  it('rejects late bytes after cancellation', async () => {
    const f = fixture();
    const controller = new AbortController();
    f.getAttachmentContentRaw.mockImplementation(async () => {
      controller.abort();
      return {
        raw: {
          blob: async () => new Blob(['private'], { type: 'image/jpeg' }),
        },
      };
    });
    await expect(
      recoverSelectedPhoto(f.apis, 'space', missing(), 'id', controller.signal),
    ).rejects.toThrow();
  });

  it('does not reload ordinary device bytes', async () => {
    const f = fixture();
    const file = new File(['local'], 'local.jpg', { type: 'image/jpeg' });
    expect(
      await recoverSelectedPhoto(
        f.apis,
        'space',
        file,
        undefined,
        new AbortController().signal,
      ),
    ).toBe(file);
    expect(f.getAttachment).not.toHaveBeenCalled();
  });
});
