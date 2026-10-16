// @vitest-environment jsdom
import React from 'react';
import { act, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReferenceApis } from './referenceFlow';
import {
  formatAttachmentDraftContextKey,
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

describe('useAttachmentDrafts context and generation binding (#700)', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  let revokeObjectURLSpy: ReturnType<typeof vi.fn<typeof URL.revokeObjectURL>>;
  let urlCounter = 0;

  beforeEach(() => {
    urlCounter = 0;
    revokeObjectURLSpy = vi.fn();
    URL.createObjectURL = vi.fn(
      (_blob: Blob) => `blob:mock-url-${++urlCounter}`,
    );
    URL.revokeObjectURL = revokeObjectURLSpy;
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it('Test A: in-flight upload during Space change is aborted, cleared, and ignores late resolution', async () => {
    const uploadDeferred = deferred<{ attachmentId: string }>();
    let capturedSignal: AbortSignal | undefined;

    const uploadFn = vi.fn(
      async (
        _apis: ReferenceApis,
        _apiBaseUrl: string,
        _accessToken: string,
        _spaceId: string,
        _file: File,
        _onPhase?: (phase: 'uploading' | 'validating') => void,
        _fetchApi?: typeof fetch,
        options?: { signal?: AbortSignal },
      ) => {
        capturedSignal = options?.signal;
        return uploadDeferred.promise;
      },
    );

    const initialProps: AttachmentDraftOptions = {
      apis: mockApis,
      apiBaseUrl: 'https://api.example.com',
      accessToken: 'token-a',
      accountId: 'account-1',
      spaceId: 'space-a',
      uploadAttachmentFn: uploadFn,
    };

    const { result, rerender } = renderHook(
      (props: AttachmentDraftOptions) => useAttachmentDrafts(props),
      { initialProps },
    );

    expect(result.current.contextKey).toBe('account-1:space-a');
    expect(result.current.items).toHaveLength(0);

    const file = createMockFile('photo-a.jpg');
    act(() => {
      result.current.addFiles(createMockFileList(file));
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.status).toBe('uploading');
    expect(result.current.hasPending).toBe(true);
    expect(capturedSignal?.aborted).toBe(false);

    // Rerender under Space B
    act(() => {
      rerender({
        ...initialProps,
        spaceId: 'space-b',
      });
    });

    // Verify Space A state is synchronously and completely removed
    expect(result.current.contextKey).toBe('account-1:space-b');
    expect(result.current.items).toHaveLength(0);
    expect(result.current.readyIds).toEqual([]);
    expect(result.current.hasPending).toBe(false);
    expect(capturedSignal?.aborted).toBe(true);

    // Now resolve the stale Space A promise
    await act(async () => {
      uploadDeferred.resolve({ attachmentId: 'stale-space-a-attachment' });
      await uploadDeferred.promise;
    });

    // Prove: no Space A state returns
    expect(result.current.items).toHaveLength(0);
    expect(result.current.readyIds).toEqual([]);
    expect(result.current.hasPending).toBe(false);
  });

  it('Test B: already READY attachment is immediately cleared on Space change and not submitted', async () => {
    const uploadFn = vi.fn(async () => ({
      attachmentId: 'ready-attachment-space-a',
    }));

    const initialProps: AttachmentDraftOptions = {
      apis: mockApis,
      apiBaseUrl: 'https://api.example.com',
      accessToken: 'token-a',
      accountId: 'account-1',
      spaceId: 'space-a',
      uploadAttachmentFn: uploadFn,
    };

    const { result, rerender } = renderHook(
      (props: AttachmentDraftOptions) => useAttachmentDrafts(props),
      { initialProps },
    );

    const file = createMockFile('ready-photo.jpg');
    await act(async () => {
      result.current.addFiles(createMockFileList(file));
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.status).toBe('ready');
    expect(result.current.readyIds).toEqual(['ready-attachment-space-a']);

    // Switch to Space B
    act(() => {
      rerender({
        ...initialProps,
        spaceId: 'space-b',
      });
    });

    // READY ID must immediately disappear
    expect(result.current.contextKey).toBe('account-1:space-b');
    expect(result.current.readyIds).toEqual([]);
    expect(result.current.items).toHaveLength(0);
  });

  it('Test C: Account change invalidates in-flight and ready drafts', async () => {
    const uploadDeferred = deferred<{ attachmentId: string }>();
    let capturedSignal: AbortSignal | undefined;

    const uploadFn = vi.fn(
      async (
        _a,
        _b,
        _c,
        _d,
        _e,
        _f,
        _g,
        options?: { signal?: AbortSignal },
      ) => {
        capturedSignal = options?.signal;
        return uploadDeferred.promise;
      },
    );

    const initialProps: AttachmentDraftOptions = {
      apis: mockApis,
      apiBaseUrl: 'https://api.example.com',
      accessToken: 'token-user-1',
      accountId: 'account-user-1',
      spaceId: 'space-shared',
      uploadAttachmentFn: uploadFn,
    };

    const { result, rerender } = renderHook(
      (props: AttachmentDraftOptions) => useAttachmentDrafts(props),
      { initialProps },
    );

    act(() => {
      result.current.addFiles(createMockFileList(createMockFile('secret.jpg')));
    });

    expect(result.current.contextKey).toBe('account-user-1:space-shared');
    expect(result.current.items).toHaveLength(1);
    expect(capturedSignal?.aborted).toBe(false);

    // Switch account identity in the same space
    act(() => {
      rerender({
        ...initialProps,
        accessToken: 'token-user-2',
        accountId: 'account-user-2',
      });
    });

    expect(result.current.contextKey).toBe('account-user-2:space-shared');
    expect(result.current.items).toHaveLength(0);
    expect(result.current.readyIds).toEqual([]);
    expect(capturedSignal?.aborted).toBe(true);

    // Resolve old upload anyway
    await act(async () => {
      uploadDeferred.resolve({ attachmentId: 'user-1-attachment' });
      await uploadDeferred.promise;
    });

    expect(result.current.items).toHaveLength(0);
    expect(result.current.readyIds).toEqual([]);
  });

  it('Test D: token refresh for identical Account + Space preserves valid drafts', async () => {
    const uploadDeferred = deferred<{ attachmentId: string }>();

    const uploadFn = vi.fn(async () => uploadDeferred.promise);

    const initialProps: AttachmentDraftOptions = {
      apis: mockApis,
      apiBaseUrl: 'https://api.example.com',
      accessToken: 'access-token-initial',
      accountId: 'account-1',
      spaceId: 'space-1',
      uploadAttachmentFn: uploadFn,
    };

    const { result, rerender } = renderHook(
      (props: AttachmentDraftOptions) => useAttachmentDrafts(props),
      { initialProps },
    );

    const file = createMockFile('persistent.jpg');
    act(() => {
      result.current.addFiles(createMockFileList(file));
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.status).toBe('uploading');
    const originalPreview = result.current.items[0]?.previewUrl;
    const initialGeneration = result.current.generation;

    // Simulate token refresh (accessToken rotates, account and space unchanged)
    act(() => {
      rerender({
        ...initialProps,
        accessToken: 'access-token-refreshed',
      });
    });

    // Verify contextKey and generation are unchanged, drafts intact
    expect(result.current.contextKey).toBe('account-1:space-1');
    expect(result.current.generation).toBe(initialGeneration);
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.status).toBe('uploading');
    expect(result.current.items[0]?.previewUrl).toBe(originalPreview);
    expect(revokeObjectURLSpy).not.toHaveBeenCalled();

    // Now complete the upload under the refreshed token
    await act(async () => {
      uploadDeferred.resolve({ attachmentId: 'completed-attachment' });
      await uploadDeferred.promise;
    });

    expect(result.current.items[0]?.status).toBe('ready');
    expect(result.current.readyIds).toEqual(['completed-attachment']);
  });

  it('Test E: Object URLs are revoked when context changes', () => {
    const uploadDeferred = deferred<{ attachmentId: string }>();
    const uploadFn = vi.fn(async () => uploadDeferred.promise);

    const initialProps: AttachmentDraftOptions = {
      apis: mockApis,
      apiBaseUrl: 'https://api.example.com',
      accessToken: 'token-1',
      accountId: 'account-1',
      spaceId: 'space-1',
      uploadAttachmentFn: uploadFn,
    };

    const { result, rerender } = renderHook(
      (props: AttachmentDraftOptions) => useAttachmentDrafts(props),
      { initialProps },
    );

    act(() => {
      result.current.addFiles(
        createMockFileList(
          createMockFile('img1.jpg'),
          createMockFile('img2.jpg'),
        ),
      );
    });

    expect(result.current.items).toHaveLength(2);
    const url1 = result.current.items[0]?.previewUrl;
    const url2 = result.current.items[1]?.previewUrl;
    expect(url1).toBeTruthy();
    expect(url2).toBeTruthy();

    expect(revokeObjectURLSpy).not.toHaveBeenCalled();

    // Change space
    act(() => {
      rerender({
        ...initialProps,
        spaceId: 'space-2',
      });
    });

    expect(revokeObjectURLSpy).toHaveBeenCalledWith(url1);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith(url2);
    expect(result.current.items).toHaveLength(0);
  });

  it('Test F: late phase, progress, and error callbacks from old context cannot populate new context', async () => {
    let capturedPhase:
      | ((phase: 'uploading' | 'validating') => void)
      | undefined;
    let capturedProgress: ((progress: number) => void) | undefined;
    const uploadDeferred = deferred<{ attachmentId: string }>();

    const uploadFn = vi.fn(
      async (
        _a,
        _b,
        _c,
        _d,
        _e,
        onPhase?: (phase: 'uploading' | 'validating') => void,
        _f?: typeof fetch,
        options?: { onProgress?: (p: number) => void },
      ) => {
        capturedPhase = onPhase;
        capturedProgress = options?.onProgress;
        return uploadDeferred.promise;
      },
    );

    const initialProps: AttachmentDraftOptions = {
      apis: mockApis,
      apiBaseUrl: 'https://api.example.com',
      accessToken: 'token-1',
      accountId: 'account-1',
      spaceId: 'space-1',
      uploadAttachmentFn: uploadFn,
    };

    const { result, rerender } = renderHook(
      (props: AttachmentDraftOptions) => useAttachmentDrafts(props),
      { initialProps },
    );

    act(() => {
      result.current.addFiles(createMockFileList(createMockFile('pic.jpg')));
    });

    expect(result.current.items).toHaveLength(1);

    // Switch context to space-2
    act(() => {
      rerender({
        ...initialProps,
        spaceId: 'space-2',
      });
    });

    expect(result.current.items).toHaveLength(0);

    // Call late callbacks from space-1 upload
    act(() => {
      capturedProgress?.(75);
      capturedPhase?.('validating');
    });

    expect(result.current.items).toHaveLength(0);

    // Reject old upload
    await act(async () => {
      uploadDeferred.reject(new Error('Network error from old space'));
      try {
        await uploadDeferred.promise;
      } catch {
        // expected rejection
      }
    });

    // Neither error nor progress may leak into space-2
    expect(result.current.items).toHaveLength(0);
    expect(result.current.readyIds).toEqual([]);
    expect(result.current.hasPending).toBe(false);
  });

  it('switching Space A -> B -> A increments generation and permanently rejects old upload from visit 1', async () => {
    const uploadDeferred = deferred<{ attachmentId: string }>();
    const uploadFn = vi.fn(async () => uploadDeferred.promise);

    const initialProps: AttachmentDraftOptions = {
      apis: mockApis,
      apiBaseUrl: 'https://api.example.com',
      accessToken: 'token-1',
      accountId: 'account-1',
      spaceId: 'space-a',
      uploadAttachmentFn: uploadFn,
    };

    const { result, rerender } = renderHook(
      (props: AttachmentDraftOptions) => useAttachmentDrafts(props),
      { initialProps },
    );

    act(() => {
      result.current.addFiles(createMockFileList(createMockFile('visit1.jpg')));
    });

    expect(result.current.generation).toBe(1);
    expect(result.current.items).toHaveLength(1);

    // Switch to space-b
    act(() => {
      rerender({ ...initialProps, spaceId: 'space-b' });
    });
    expect(result.current.generation).toBe(2);
    expect(result.current.items).toHaveLength(0);

    // Switch back to space-a
    act(() => {
      rerender({ ...initialProps, spaceId: 'space-a' });
    });
    expect(result.current.generation).toBe(3);
    expect(result.current.items).toHaveLength(0);

    // Resolve upload from visit 1 (generation 1)
    await act(async () => {
      uploadDeferred.resolve({ attachmentId: 'stale-visit-1-id' });
      await uploadDeferred.promise;
    });

    // Generation 3 rejects generation 1 completion
    expect(result.current.items).toHaveLength(0);
    expect(result.current.readyIds).toEqual([]);
  });

  it('clear() bumps generation and ignores late callbacks from in-flight upload', async () => {
    const uploadDeferred = deferred<{ attachmentId: string }>();
    const uploadFn = vi.fn(async () => uploadDeferred.promise);

    const initialProps: AttachmentDraftOptions = {
      apis: mockApis,
      apiBaseUrl: 'https://api.example.com',
      accessToken: 'token-1',
      accountId: 'account-1',
      spaceId: 'space-1',
      uploadAttachmentFn: uploadFn,
    };

    const { result } = renderHook(() => useAttachmentDrafts(initialProps));

    act(() => {
      result.current.addFiles(createMockFileList(createMockFile('draft.jpg')));
    });

    const genBefore = result.current.generation;
    expect(result.current.items).toHaveLength(1);

    act(() => {
      result.current.clear();
    });

    expect(result.current.generation).toBe(genBefore + 1);
    expect(result.current.items).toHaveLength(0);
    expect(revokeObjectURLSpy).toHaveBeenCalled();

    // Late resolve
    await act(async () => {
      uploadDeferred.resolve({ attachmentId: 'late-id' });
      await uploadDeferred.promise;
    });

    expect(result.current.items).toHaveLength(0);
    expect(result.current.readyIds).toEqual([]);
  });

  it('unmount aborts controllers and revokes object URLs', () => {
    const uploadDeferred = deferred<{ attachmentId: string }>();
    let capturedSignal: AbortSignal | undefined;
    const uploadFn = vi.fn(
      async (
        _a,
        _b,
        _c,
        _d,
        _e,
        _f,
        _g,
        options?: { signal?: AbortSignal },
      ) => {
        capturedSignal = options?.signal;
        return uploadDeferred.promise;
      },
    );

    const initialProps: AttachmentDraftOptions = {
      apis: mockApis,
      apiBaseUrl: 'https://api.example.com',
      accessToken: 'token-1',
      accountId: 'account-1',
      spaceId: 'space-1',
      uploadAttachmentFn: uploadFn,
    };

    const { result, unmount } = renderHook(() =>
      useAttachmentDrafts(initialProps),
    );

    act(() => {
      result.current.addFiles(
        createMockFileList(createMockFile('unmount.jpg')),
      );
    });

    const previewUrl = result.current.items[0]?.previewUrl;
    expect(capturedSignal?.aborted).toBe(false);

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith(previewUrl);
  });

  it('formatAttachmentDraftContextKey formats accountId:spaceId deterministically', () => {
    expect(formatAttachmentDraftContextKey('acc-1', 'space-a')).toBe(
      'acc-1:space-a',
    );
    expect(formatAttachmentDraftContextKey('acc-2', 'space-b')).toBe(
      'acc-2:space-b',
    );
  });
});

describe('useAttachmentDrafts React commit lifecycle and speculative render safety (#739)', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  let revokeObjectURLSpy: ReturnType<typeof vi.fn<typeof URL.revokeObjectURL>>;
  let urlCounter = 0;

  beforeEach(() => {
    urlCounter = 0;
    revokeObjectURLSpy = vi.fn();
    URL.createObjectURL = vi.fn(
      (_blob: Blob) => `blob:mock-url-${++urlCounter}`,
    );
    URL.revokeObjectURL = revokeObjectURLSpy;
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it('Test A & B: pure render-time visibility masks old drafts before commit, and commit-time effect executes abort and URL revocation', () => {
    const uploadDeferred = deferred<{ attachmentId: string }>();
    let capturedSignal: AbortSignal | undefined;

    const uploadFn = vi.fn(
      async (
        _apis: ReferenceApis,
        _apiBaseUrl: string,
        _accessToken: string,
        _spaceId: string,
        _file: File,
        _onPhase?: (phase: 'uploading' | 'validating') => void,
        _fetchApi?: typeof fetch,
        options?: { signal?: AbortSignal },
      ) => {
        capturedSignal = options?.signal;
        return uploadDeferred.promise;
      },
    );

    const initialProps: AttachmentDraftOptions = {
      apis: mockApis,
      apiBaseUrl: 'https://api.example.com',
      accessToken: 'token-a',
      accountId: 'account-1',
      spaceId: 'space-a',
      uploadAttachmentFn: uploadFn,
    };

    let hookResult!: ReturnType<typeof useAttachmentDrafts>;
    let renderPhaseItemsInB: unknown[] | null = null;
    let renderPhaseReadyIdsInB: string[] | null = null;
    let renderPhaseAbortedInB: boolean | undefined;
    let renderPhaseRevokeCountInB = -1;

    function InspectorApp({ props }: { props: AttachmentDraftOptions }) {
      hookResult = useAttachmentDrafts(props);
      if (props.spaceId === 'space-b' && renderPhaseItemsInB === null) {
        // Inspect directly during the initial render phase of Space B before commit / useLayoutEffect
        renderPhaseItemsInB = hookResult.items;
        renderPhaseReadyIdsInB = hookResult.readyIds;
        renderPhaseAbortedInB = capturedSignal?.aborted;
        renderPhaseRevokeCountInB = revokeObjectURLSpy.mock.calls.length;
      }
      return <div data-testid="count">{hookResult.items.length}</div>;
    }

    const { rerender } = render(<InspectorApp props={initialProps} />);

    // Add a file in Space A
    const file = createMockFile('test-a.jpg');
    act(() => {
      hookResult.addFiles(createMockFileList(file));
    });

    expect(hookResult.items).toHaveLength(1);
    expect(hookResult.items[0]?.status).toBe('uploading');
    expect(capturedSignal?.aborted).toBe(false);
    expect(revokeObjectURLSpy).not.toHaveBeenCalled();

    // Now rerender with Space B
    act(() => {
      rerender(
        <InspectorApp
          props={{
            ...initialProps,
            spaceId: 'space-b',
          }}
        />,
      );
    });

    // 1. Render-time Privacy Invariant:
    // During the render phase of Space B, drafts were masked to empty
    expect(renderPhaseItemsInB).toEqual([]);
    expect(renderPhaseReadyIdsInB).toEqual([]);

    // 2. Render-time Purity Invariant:
    // During the render phase of Space B, the upload in Space A was NOT aborted
    // and Object URLs were NOT revoked!
    expect(renderPhaseAbortedInB).toBe(false);
    expect(renderPhaseRevokeCountInB).toBe(0);

    // 3. Commit-time Invariant:
    // Once committed to Space B, the layout effect ran:
    expect(hookResult.contextKey).toBe('account-1:space-b');
    expect(hookResult.items).toHaveLength(0);
    expect(hookResult.readyIds).toEqual([]);
    expect(hookResult.hasPending).toBe(false);
    expect(capturedSignal?.aborted).toBe(true);
    expect(revokeObjectURLSpy).toHaveBeenCalled();
  });

  it('Test F: React StrictMode preserves drafts during token refresh and cleans up safely on context change', async () => {
    const uploadDeferred = deferred<{ attachmentId: string }>();
    let capturedSignal: AbortSignal | undefined;

    const uploadFn = vi.fn(
      async (
        _apis: ReferenceApis,
        _apiBaseUrl: string,
        _accessToken: string,
        _spaceId: string,
        _file: File,
        _onPhase?: (phase: 'uploading' | 'validating') => void,
        _fetchApi?: typeof fetch,
        options?: { signal?: AbortSignal },
      ) => {
        capturedSignal = options?.signal;
        return uploadDeferred.promise;
      },
    );

    const initialProps: AttachmentDraftOptions = {
      apis: mockApis,
      apiBaseUrl: 'https://api.example.com',
      accessToken: 'token-strict-1',
      accountId: 'account-1',
      spaceId: 'space-1',
      uploadAttachmentFn: uploadFn,
    };

    const { result, rerender } = renderHook(
      (props: AttachmentDraftOptions) => useAttachmentDrafts(props),
      {
        initialProps,
        wrapper: ({ children }) => (
          <React.StrictMode>{children}</React.StrictMode>
        ),
      },
    );

    // Initial state
    expect(result.current.contextKey).toBe('account-1:space-1');
    expect(result.current.generation).toBe(1);

    // Add file in Space 1
    act(() => {
      result.current.addFiles(
        createMockFileList(createMockFile('strict-test.jpg')),
      );
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.status).toBe('uploading');
    expect(capturedSignal?.aborted).toBe(false);

    // Token refresh under StrictMode
    act(() => {
      rerender({
        ...initialProps,
        accessToken: 'token-strict-2',
      });
    });

    // Draft is preserved under StrictMode token refresh
    expect(result.current.contextKey).toBe('account-1:space-1');
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.status).toBe('uploading');
    expect(capturedSignal?.aborted).toBe(false);

    // Context transition under StrictMode
    act(() => {
      rerender({
        ...initialProps,
        spaceId: 'space-2',
      });
    });

    // Space 2 is empty, Space 1 upload aborted, URL revoked
    expect(result.current.contextKey).toBe('account-1:space-2');
    expect(result.current.items).toHaveLength(0);
    expect(result.current.generation).toBe(2);
    expect(capturedSignal?.aborted).toBe(true);
    expect(revokeObjectURLSpy).toHaveBeenCalled();
  });

  it('Test D: A -> B -> A transition under StrictMode increments generation and permanently rejects visit 1 callbacks', async () => {
    const uploadDeferred = deferred<{ attachmentId: string }>();
    const uploadFn = vi.fn(async () => uploadDeferred.promise);

    const initialProps: AttachmentDraftOptions = {
      apis: mockApis,
      apiBaseUrl: 'https://api.example.com',
      accessToken: 'token-1',
      accountId: 'account-1',
      spaceId: 'space-a',
      uploadAttachmentFn: uploadFn,
    };

    const { result, rerender } = renderHook(
      (props: AttachmentDraftOptions) => useAttachmentDrafts(props),
      {
        initialProps,
        wrapper: ({ children }) => (
          <React.StrictMode>{children}</React.StrictMode>
        ),
      },
    );

    act(() => {
      result.current.addFiles(
        createMockFileList(createMockFile('visit1-strict.jpg')),
      );
    });

    expect(result.current.generation).toBe(1);
    expect(result.current.items).toHaveLength(1);

    // Switch to space-b
    act(() => {
      rerender({ ...initialProps, spaceId: 'space-b' });
    });
    expect(result.current.generation).toBe(2);
    expect(result.current.items).toHaveLength(0);

    // Switch back to space-a
    act(() => {
      rerender({ ...initialProps, spaceId: 'space-a' });
    });
    expect(result.current.generation).toBe(3);
    expect(result.current.items).toHaveLength(0);

    // Resolve upload from visit 1 (generation 1)
    await act(async () => {
      uploadDeferred.resolve({ attachmentId: 'stale-strict-visit-1-id' });
      await uploadDeferred.promise;
    });

    // Generation 3 rejects generation 1 completion
    expect(result.current.items).toHaveLength(0);
    expect(result.current.readyIds).toEqual([]);
  });
});
