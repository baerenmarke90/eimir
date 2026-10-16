// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReferenceApis } from './referenceFlow';
import {
  useAttachmentDrafts,
  type AttachmentDraftOptions,
} from './useAttachmentDrafts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createMockFile(name: string, content = 'image-bytes'): File {
  return new File([content], name, { type: 'image/jpeg' });
}

function createMockFileList(...files: File[]): FileList {
  return Object.assign([...files], {
    item: (index: number) => files[index] ?? null,
  }) as unknown as FileList;
}

const mockApis = {
  auth: {},
  memories: {},
  attachments: {},
  story: {},
} as unknown as ReferenceApis;

/** Deferred upload calls, keyed by call order, so tests can settle them individually. */
function createQueueingUploadFn() {
  const calls: Array<ReturnType<typeof deferred<{ attachmentId: string }>>> =
    [];
  const uploadFn = vi.fn(async () => {
    const call = deferred<{ attachmentId: string }>();
    calls.push(call);
    return call.promise;
  });
  return { uploadFn, calls };
}

describe('useAttachmentDrafts capacity bounding and upload queue (#701)', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  let urlCounter = 0;

  beforeEach(() => {
    urlCounter = 0;
    URL.createObjectURL = vi.fn(
      (_blob: Blob) => `blob:mock-url-${++urlCounter}`,
    );
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  function baseProps(
    overrides: Partial<AttachmentDraftOptions> = {},
  ): AttachmentDraftOptions {
    return {
      apis: mockApis,
      apiBaseUrl: 'https://api.example.com',
      accessToken: 'token-a',
      accountId: 'account-1',
      spaceId: 'space-a',
      ...overrides,
    };
  }

  it('selecting 100 files with 20 remaining slots starts at most 20 upload lifecycles, not 100', () => {
    const { uploadFn, calls } = createQueueingUploadFn();
    const { result } = renderHook(() =>
      useAttachmentDrafts(
        baseProps({ uploadAttachmentFn: uploadFn, maxAttachments: 20 }),
      ),
    );

    const files = Array.from({ length: 100 }, (_, i) =>
      createMockFile(`photo-${i}.jpg`),
    );
    act(() => {
      result.current.addFiles(createMockFileList(...files));
    });

    expect(result.current.items).toHaveLength(20);
    expect(result.current.rejectedCount).toBe(80);
    // Even though 20 drafts were accepted, the queue only ever starts the
    // concurrency-bounded subset of upload lifecycles at once.
    expect(calls.length).toBeLessThanOrEqual(3);
    expect(uploadFn.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('create accepts up to the full remaining capacity with no rejection', () => {
    const { uploadFn } = createQueueingUploadFn();
    const { result } = renderHook(() =>
      useAttachmentDrafts(
        baseProps({ uploadAttachmentFn: uploadFn, maxAttachments: 20 }),
      ),
    );

    const files = Array.from({ length: 5 }, (_, i) =>
      createMockFile(`create-${i}.jpg`),
    );
    act(() => {
      result.current.addFiles(createMockFileList(...files));
    });

    expect(result.current.items).toHaveLength(5);
    expect(result.current.rejectedCount).toBe(0);
  });

  it('edit with 17 existing attachments (maxAttachments=3) accepts only 3 new uploads', () => {
    const { uploadFn } = createQueueingUploadFn();
    const { result } = renderHook(() =>
      useAttachmentDrafts(
        baseProps({ uploadAttachmentFn: uploadFn, maxAttachments: 3 }),
      ),
    );

    const files = Array.from({ length: 5 }, (_, i) =>
      createMockFile(`edit-${i}.jpg`),
    );
    act(() => {
      result.current.addFiles(createMockFileList(...files));
    });

    expect(result.current.items).toHaveLength(3);
    expect(result.current.rejectedCount).toBe(2);
    expect(uploadFn.mock.calls.length).toBe(3);
  });

  it('bounds concurrent automatic uploads to the configured queue width and releases a slot on completion', async () => {
    const { uploadFn, calls } = createQueueingUploadFn();
    const { result } = renderHook(() =>
      useAttachmentDrafts(baseProps({ uploadAttachmentFn: uploadFn })),
    );

    const files = Array.from({ length: 5 }, (_, i) =>
      createMockFile(`queued-${i}.jpg`),
    );
    act(() => {
      result.current.addFiles(createMockFileList(...files));
    });

    expect(result.current.items).toHaveLength(5);
    // Only the queue-width subset actually started a server upload.
    expect(calls.length).toBe(3);

    // Settle the first upload; the 4th queued file should now start.
    await act(async () => {
      calls[0].resolve({ attachmentId: 'attachment-0' });
      await calls[0].promise;
    });

    expect(calls.length).toBe(4);

    await act(async () => {
      calls[1].resolve({ attachmentId: 'attachment-1' });
      await calls[1].promise;
    });

    expect(calls.length).toBe(5);
  });

  it('preserves stable selection order regardless of completion order', async () => {
    const { uploadFn, calls } = createQueueingUploadFn();
    const { result } = renderHook(() =>
      useAttachmentDrafts(baseProps({ uploadAttachmentFn: uploadFn })),
    );

    act(() => {
      result.current.addFiles(
        createMockFileList(
          createMockFile('a.jpg'),
          createMockFile('b.jpg'),
          createMockFile('c.jpg'),
        ),
      );
    });

    const orderedNames = result.current.items.map((item) => item.file.name);
    expect(orderedNames).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);

    // Resolve out of order: c-equivalent (index 2) first, then a, then b.
    await act(async () => {
      calls[2].resolve({ attachmentId: 'attachment-c' });
      await calls[2].promise;
    });
    await act(async () => {
      calls[0].resolve({ attachmentId: 'attachment-a' });
      await calls[0].promise;
    });
    await act(async () => {
      calls[1].resolve({ attachmentId: 'attachment-b' });
      await calls[1].promise;
    });

    expect(result.current.items.map((item) => item.file.name)).toEqual([
      'a.jpg',
      'b.jpg',
      'c.jpg',
    ]);
    expect(result.current.readyIds).toEqual([
      'attachment-a',
      'attachment-b',
      'attachment-c',
    ]);
  });

  it('one failed upload does not affect independent successful drafts', async () => {
    const { uploadFn, calls } = createQueueingUploadFn();
    const { result } = renderHook(() =>
      useAttachmentDrafts(baseProps({ uploadAttachmentFn: uploadFn })),
    );

    act(() => {
      result.current.addFiles(
        createMockFileList(
          createMockFile('ok-1.jpg'),
          createMockFile('will-fail.jpg'),
          createMockFile('ok-2.jpg'),
        ),
      );
    });

    expect(calls.length).toBe(3);

    await act(async () => {
      calls[1].reject(new Error('upload exploded'));
      try {
        await calls[1].promise;
      } catch {
        // expected
      }
    });

    expect(result.current.items[1]?.status).toBe('failed');

    await act(async () => {
      calls[0].resolve({ attachmentId: 'ok-1-attachment' });
      calls[2].resolve({ attachmentId: 'ok-2-attachment' });
      await Promise.all([calls[0].promise, calls[2].promise]);
    });

    expect(result.current.items[0]?.status).toBe('ready');
    expect(result.current.items[2]?.status).toBe('ready');
    expect(result.current.readyIds).toEqual([
      'ok-1-attachment',
      'ok-2-attachment',
    ]);
  });

  it('removing a still-queued draft prevents it from ever starting a server upload', async () => {
    const { uploadFn, calls } = createQueueingUploadFn();
    const { result } = renderHook(() =>
      useAttachmentDrafts(baseProps({ uploadAttachmentFn: uploadFn })),
    );

    act(() => {
      result.current.addFiles(
        createMockFileList(
          createMockFile('active-0.jpg'),
          createMockFile('active-1.jpg'),
          createMockFile('active-2.jpg'),
          createMockFile('queued-3.jpg'),
        ),
      );
    });

    // Concurrency width 3: the 4th file is queued, not yet uploaded.
    expect(result.current.items).toHaveLength(4);
    expect(calls.length).toBe(3);
    const queuedDraftId = result.current.items[3]?.id;
    expect(queuedDraftId).toBeTruthy();

    act(() => {
      result.current.remove(queuedDraftId as string);
    });

    expect(result.current.items).toHaveLength(3);

    // Free up a slot; if the removed draft were still queued it would start now.
    await act(async () => {
      calls[0].resolve({ attachmentId: 'active-0-attachment' });
      await calls[0].promise;
    });

    // No 4th call was ever made for the removed, still-queued draft.
    expect(calls.length).toBe(3);
    expect(uploadFn).toHaveBeenCalledTimes(3);
  });

  it('removing an in-flight draft aborts it, frees its queue slot, and ignores late resolution', async () => {
    const { uploadFn, calls } = createQueueingUploadFn();
    const signals: Array<AbortSignal | undefined> = [];
    const signalCapturingUploadFn = vi.fn(
      async (
        _apis: ReferenceApis,
        _apiBaseUrl: string,
        _accessToken: string,
        _spaceId: string,
        _file: File,
        _onPhase?: unknown,
        _fetchApi?: typeof fetch,
        options?: { signal?: AbortSignal },
      ) => {
        signals.push(options?.signal);
        return uploadFn();
      },
    );

    const { result } = renderHook(() =>
      useAttachmentDrafts(
        baseProps({ uploadAttachmentFn: signalCapturingUploadFn }),
      ),
    );

    act(() => {
      result.current.addFiles(
        createMockFileList(
          createMockFile('in-flight.jpg'),
          createMockFile('queued.jpg'),
          createMockFile('queued-2.jpg'),
          createMockFile('queued-3.jpg'),
        ),
      );
    });

    expect(calls.length).toBe(3);
    const inFlightId = result.current.items[0]?.id as string;

    act(() => {
      result.current.remove(inFlightId);
    });

    // The first started draft's own signal (not a later contender's) was aborted.
    expect(signals[0]?.aborted).toBe(true);
    expect(result.current.items).toHaveLength(3);

    // The aborted upload's underlying promise resolves late anyway.
    await act(async () => {
      calls[0].resolve({ attachmentId: 'late-attachment' });
      await calls[0].promise;
    });

    // Its result never reappears...
    expect(result.current.readyIds).not.toContain('late-attachment');
    expect(result.current.items).toHaveLength(3);

    // ...and its queue slot was correctly released: the 4th, still-queued
    // draft started once the abort settled, proving the concurrency slot
    // was not leaked.
    expect(calls.length).toBe(4);
  });
});
