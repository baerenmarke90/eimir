// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { UploadDescriptor } from '../api/generated/models/UploadDescriptor';
import {
  clearBackgroundVideoTransfers,
  prepareNativeVideoForUpload,
  releasePreparedVideo,
  startBackgroundVideoTransfer,
} from './backgroundVideoUploads';
import type { ReferenceApis } from './referenceFlow';

const native = vi.hoisted(() => ({
  prepare: vi.fn(),
  cancelPreparation: vi.fn(async () => {}),
  enqueue: vi.fn(async () => {}),
  cancel: vi.fn(async () => {}),
  list: vi.fn(async () => ({ items: [] })),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isPluginAvailable: () => true },
  registerPlugin: () => native,
}));
vi.mock('./config', () => ({ isAndroidApp: () => true }));
const owner = {
  instance: 'https://api.example.invalid',
  accountId: 'owner',
  spaceId: 'space',
};
const file = new File(['original'], 'eimir-selected-video.mov', {
  type: 'video/quicktime',
});
afterEach(() => {
  clearBackgroundVideoTransfers();
  vi.clearAllMocks();
});

it('hands the exact prepared size and opaque identity to the existing native uploader', async () => {
  native.prepare.mockImplementationOnce(async ({ attachmentId }) => ({
    preparationId: attachmentId,
    name: 'video.mp4',
    type: 'video/mp4',
    size: 3,
  }));
  const prepared = await prepareNativeVideoForUpload(owner, file);
  expect(prepared?.size).toBe(3);
  await startBackgroundVideoTransfer({
    apis: {} as ReferenceApis,
    apiBaseUrl: owner.instance,
    accessToken: 'synthetic',
    accountId: owner.accountId,
    spaceId: owner.spaceId,
    file,
    prepared,
    descriptor: { attachment: { id: 'attachment' } } as UploadDescriptor,
  });
  expect(native.enqueue).toHaveBeenCalledWith(
    expect.objectContaining({
      attachmentId: 'attachment',
      preparationId: prepared?.preparationId,
      size: 3,
      mimeType: 'video/mp4',
    }),
  );
  if (!prepared) throw new Error('Native preparation must produce a file.');
  await releasePreparedVideo(owner, prepared);
  expect(native.cancelPreparation).toHaveBeenCalledWith({
    ...owner,
    attachmentId: prepared?.preparationId,
  });
});

it('cancels active preparation and rejects a late result after removal', async () => {
  let finish!: (value: unknown) => void;
  native.prepare.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const controller = new AbortController();
  const result = prepareNativeVideoForUpload(owner, file, controller.signal);
  const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
  const id = native.prepare.mock.calls[0][0].attachmentId;
  controller.abort();
  expect(native.cancelPreparation).toHaveBeenCalledWith({
    ...owner,
    attachmentId: id,
  });
  finish({ preparationId: id, type: 'video/mp4', size: 3, name: 'video.mp4' });
  await rejected;
  expect(native.enqueue).not.toHaveBeenCalled();
});

it('rejects late preparation after account/Space revocation', async () => {
  let finish!: (value: unknown) => void;
  native.prepare.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const result = prepareNativeVideoForUpload(owner, file);
  const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
  const id = native.prepare.mock.calls[0][0].attachmentId;
  clearBackgroundVideoTransfers();
  expect(native.cancelPreparation).toHaveBeenCalledWith({
    ...owner,
    attachmentId: id,
  });
  finish({ preparationId: id, type: 'video/mp4', size: 3, name: 'video.mp4' });
  await rejected;
  expect(native.cancelPreparation).toHaveBeenCalledWith({
    ...owner,
    attachmentId: id,
  });
});
