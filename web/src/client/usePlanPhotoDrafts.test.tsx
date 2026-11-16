// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { OrderedAttachmentSummary } from '../api/generated/models/OrderedAttachmentSummary';
import type { ReferenceApis } from './referenceFlow';
import { usePlanPhotoDrafts } from './usePlanPhotoDrafts';

beforeEach(() => {
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:draft'),
      revokeObjectURL: vi.fn(),
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

it('stages mixed saved/uploaded order, classification and removal without mutating the saved plan', async () => {
  const saved = [
    {
      id: 'saved',
      position: 0,
      status: 'READY',
      mediaType: 'IMAGE',
      isSensitive: false,
    },
  ] as OrderedAttachmentSummary[];
  const upload = vi.fn(async () => ({ attachmentId: 'new' }));
  const options = {
    apis: {} as ReferenceApis,
    apiBaseUrl: 'https://api.example.org',
    accessToken: 'token',
    accountId: 'account',
    spaceId: 'space',
    uploadAttachmentFn: upload,
  };
  const { result, rerender } = renderHook(
    (props) => usePlanPhotoDrafts(props),
    { initialProps: options },
  );
  act(() => result.current.load(saved));
  await act(async () =>
    result.current.uploads.addFiles([
      new File(['bytes'], 'sea.png', { type: 'image/png' }),
    ]),
  );
  expect(result.current.hasPending).toBe(false);
  expect(result.current.entries.map((item) => item.attachmentId)).toEqual([
    'saved',
    'new',
  ]);
  act(() => result.current.move(result.current.items[1].key, -1));
  act(() => result.current.setSensitive(result.current.items[1], true));
  expect(result.current.entries).toEqual([
    { attachmentId: 'new', position: 0, isSensitive: false },
    { attachmentId: 'saved', position: 1, isSensitive: true },
  ]);
  expect(saved[0].isSensitive).toBe(false);
  act(() => result.current.remove(result.current.items[0]));
  expect(result.current.entries).toEqual([
    { attachmentId: 'saved', position: 0, isSensitive: true },
  ]);
  act(() => result.current.load(saved));
  expect(result.current.entries[0].isSensitive).toBe(false);
  rerender({ ...options, spaceId: 'other' });
  expect(result.current.items).toEqual([]);
  expect(result.current.entries).toEqual([]);
});

it('puts an edited saved photo in its place, keeps cover and sensitivity, and names the replaced photo (#1907 G1)', async () => {
  const saved = [
    {
      id: 'first',
      position: 0,
      status: 'READY',
      mediaType: 'IMAGE',
      isSensitive: false,
    },
    {
      id: 'second',
      position: 1,
      status: 'READY',
      mediaType: 'IMAGE',
      isSensitive: true,
    },
  ] as OrderedAttachmentSummary[];
  const upload = vi.fn(async () => ({ attachmentId: 'edited' }));
  const { result } = renderHook(() =>
    usePlanPhotoDrafts({
      apis: {} as ReferenceApis,
      apiBaseUrl: 'https://api.example.org',
      accessToken: 'token',
      accountId: 'account',
      spaceId: 'space',
      uploadAttachmentFn: upload,
    }),
  );
  act(() => result.current.load(saved, 'second'));
  await act(async () =>
    result.current.replaceSaved(
      result.current.items[1],
      new File(['edited'], 'second.jpg', { type: 'image/jpeg' }),
    ),
  );
  expect(result.current.hasPending).toBe(false);
  expect(result.current.entries).toEqual([
    { attachmentId: 'first', position: 0, isSensitive: false },
    {
      attachmentId: 'edited',
      position: 1,
      isSensitive: true,
      replacesAttachmentId: 'second',
    },
  ]);
  expect(result.current.selectedCoverAttachmentId).toBe('edited');
  // Removing the edited photo also leaves the original out of the gallery.
  act(() => result.current.remove(result.current.items[1]));
  expect(result.current.entries).toEqual([
    { attachmentId: 'first', position: 0, isSensitive: false },
  ]);
});
