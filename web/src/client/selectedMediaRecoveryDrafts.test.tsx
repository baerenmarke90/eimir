// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReferenceApis } from './referenceFlow';
import {
  missingSelectedPhoto,
  memoryOnlyPhotoDescriptor,
} from './selectedMediaRetention';
import { useAttachmentDrafts } from './useAttachmentDrafts';

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:recovered');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

function fixture() {
  let release!: (value: unknown) => void;
  const content = new Promise((done) => {
    release = done;
  });
  const apis = {
    attachments: {
      getAttachment: vi.fn().mockResolvedValue({ status: 'READY' }),
      getAttachmentContentRaw: vi.fn(() => content),
    },
  } as unknown as ReferenceApis;
  const uploadAttachmentFn = vi.fn();
  const props = {
    apis,
    apiBaseUrl: 'https://one.example',
    accountId: 'owner',
    spaceId: 'one',
    accessToken: 'synthetic',
    uploadAttachmentFn,
  };
  const file = missingSelectedPhoto({
    name: 'photo.jpg',
    type: 'image/jpeg',
    size: 4,
    lastModified: 42,
  });
  const finish = () =>
    release({
      raw: { blob: async () => new Blob(['pixels'], { type: 'image/jpeg' }) },
    });
  return { props, file, finish, uploadAttachmentFn };
}

it('keeps a missing slot and restores it from its authorized upload without uploading a placeholder', async () => {
  const f = fixture();
  const { result } = renderHook(() => useAttachmentDrafts(f.props));
  act(() =>
    result.current.restore([
      { file: f.file, attachmentId: 'staged', isSensitive: true },
    ]),
  );
  expect(result.current.items[0]).toMatchObject({
    status: 'failed',
    attachmentId: 'staged',
    isSensitive: true,
    previewUrl: '',
  });
  expect(f.uploadAttachmentFn).not.toHaveBeenCalled();
  act(() => result.current.retry(result.current.items[0]));
  await act(async () => f.finish());
  await waitFor(() => expect(result.current.items[0].status).toBe('ready'));
  expect(result.current.items[0].file.size).toBe(6);
  expect(result.current.items[0].isSensitive).toBe(true);
  expect(memoryOnlyPhotoDescriptor(result.current.items[0].file)).toBeDefined();
  expect(result.current.readyIds).toEqual(['staged']);
  expect(f.uploadAttachmentFn).not.toHaveBeenCalled();
});

it('cannot resurrect a photo removed while its protected read is pending', async () => {
  const f = fixture();
  const { result } = renderHook(() => useAttachmentDrafts(f.props));
  act(() => result.current.restore([{ file: f.file, attachmentId: 'staged' }]));
  act(() => result.current.retry(result.current.items[0]));
  act(() => result.current.remove(result.current.items[0].id));
  await act(async () => f.finish());
  expect(result.current.items).toEqual([]);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('ignores a protected read after the Account/Space task changes', async () => {
  const f = fixture();
  const { result, rerender } = renderHook(
    (props) => useAttachmentDrafts(props),
    { initialProps: f.props },
  );
  act(() => result.current.restore([{ file: f.file, attachmentId: 'staged' }]));
  act(() => result.current.retry(result.current.items[0]));
  rerender({ ...f.props, spaceId: 'other' });
  await act(async () => f.finish());
  expect(result.current.items).toEqual([]);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('does not retry an unfinished volatile selection as an empty upload', async () => {
  const f = fixture();
  const { result } = renderHook(() => useAttachmentDrafts(f.props));
  act(() => result.current.restore([{ file: f.file }]));
  await act(async () => result.current.retry(result.current.items[0]));
  expect(result.current.items[0].status).toBe('failed');
  expect(f.uploadAttachmentFn).not.toHaveBeenCalled();
});
