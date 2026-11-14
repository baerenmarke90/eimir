// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { UploadDescriptor } from '../api/generated/models/UploadDescriptor';
import {
  clearBackgroundVideoTransfers,
  retryVideoTransfer,
  startBackgroundVideoTransfer,
  useVideoTransfer,
} from './backgroundVideoUploads';
import type { ReferenceApis } from './referenceFlow';

const upload = vi.hoisted(() => vi.fn());
vi.mock('./config', () => ({ isAndroidApp: () => false }));
vi.mock('./referenceFlow', () => ({
  uploadAttachmentBytesWithProgress: upload,
}));
afterEach(() => {
  clearBackgroundVideoTransfers();
  vi.clearAllMocks();
});
const file = new File(['synthetic-video'], 'video.mp4', { type: 'video/mp4' });
function fixture(id = 'video') {
  const finalize = vi.fn().mockResolvedValue({ status: 'PROCESSING' });
  const apis = {
    attachments: {
      getAttachment: vi.fn().mockResolvedValue({ status: 'PENDING' }),
      finalizeAttachmentUpload: finalize,
    },
  } as unknown as ReferenceApis;
  const options = {
    apis,
    apiBaseUrl: 'https://api.example',
    accessToken: 'synthetic',
    accountId: 'owner',
    spaceId: 'space',
    file,
    descriptor: {
      attachment: { id },
      method: 'STREAM',
      uploadUrl: '/content',
      requiredHeaders: {},
    } as UploadDescriptor,
  };
  return { options, finalize };
}
it('admits a placeholder before bytes finish and keeps transferring after the editor unmounts', async () => {
  let finish!: () => void;
  const bytes = new Promise<void>((done) => {
    finish = done;
  });
  upload.mockReturnValue(bytes);
  const f = fixture();
  const view = renderHook(() => useVideoTransfer('video'));
  await act(async () => {
    await startBackgroundVideoTransfer(f.options);
  });
  expect(view.result.current?.phase).toBe('uploading');
  expect(f.finalize).not.toHaveBeenCalled();
  const signal = upload.mock.calls[0][4].signal as AbortSignal;
  view.unmount();
  expect(signal.aborted).toBe(false);
  finish();
  await waitFor(() => expect(f.finalize).toHaveBeenCalledTimes(1));
});
it('retries the same attachment after a transfer failure without creating another parent or upload', async () => {
  upload
    .mockRejectedValueOnce(new Error('Interrupted'))
    .mockResolvedValueOnce(undefined);
  const f = fixture();
  const { result } = renderHook(() => useVideoTransfer('video'));
  await act(async () => {
    await startBackgroundVideoTransfer(f.options);
  });
  await waitFor(() => expect(result.current?.phase).toBe('failed'));
  await act(async () => {
    await retryVideoTransfer('video');
  });
  await waitFor(() => expect(f.finalize).toHaveBeenCalledTimes(1));
  expect(upload).toHaveBeenCalledTimes(2);
  expect(f.finalize).toHaveBeenCalledWith(
    { spaceId: 'space', attachmentId: 'video', body: {} },
    expect.anything(),
  );
});
it('aborts and forgets transfer state at session revocation and ignores late completion', async () => {
  let finish!: () => void;
  upload.mockReturnValue(
    new Promise<void>((done) => {
      finish = done;
    }),
  );
  const f = fixture();
  const { result } = renderHook(() => useVideoTransfer('video'));
  await act(async () => {
    await startBackgroundVideoTransfer(f.options);
  });
  const signal = upload.mock.calls[0][4].signal as AbortSignal;
  act(() => clearBackgroundVideoTransfers());
  expect(signal.aborted).toBe(true);
  expect(result.current).toBeUndefined();
  await act(async () => finish());
  expect(result.current).toBeUndefined();
  expect(f.finalize).not.toHaveBeenCalled();
});
