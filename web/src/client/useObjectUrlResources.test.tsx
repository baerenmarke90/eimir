// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adoptObjectUrl } from './objectUrlResource';
import {
  useObjectUrlResource,
  useObjectUrlResources,
} from './useObjectUrlResources';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe('Object URL resource ownership', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  let nextObjectUrl = 0;
  let createObjectUrl: ReturnType<typeof vi.fn>;
  let revokeObjectUrl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    nextObjectUrl = 0;
    createObjectUrl = vi.fn(
      () => `blob:resource-${++nextObjectUrl}`,
    );
    revokeObjectUrl = vi.fn();
    URL.createObjectURL = createObjectUrl;
    URL.revokeObjectURL = revokeObjectUrl;
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it('makes direct disposal idempotent', () => {
    const resource = adoptObjectUrl('blob:direct-owner');

    resource.dispose();
    resource.dispose();

    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:direct-owner');
  });

  it('creates one owned URL and revokes the final active resource on unmount', async () => {
    const load = vi.fn(async () => new Blob(['image']));
    const { result, unmount } = renderHook(() =>
      useObjectUrlResource('memory:1', 'attachment:1', load),
    );

    await waitFor(() => expect(result.current.url).toBe('blob:resource-1'));
    expect(createObjectUrl).toHaveBeenCalledTimes(1);

    unmount();
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:resource-1');
  });

  it('exposes loader failures without creating or revoking a URL', async () => {
    const failure = new Error('media failed');
    const load = vi.fn(async () => {
      throw failure;
    });
    const { result } = renderHook(() =>
      useObjectUrlResource('memory:1', 'attachment:1', load),
    );

    await waitFor(() => expect(result.current.error).toBe(failure));
    expect(result.current.loading).toBe(false);
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(revokeObjectUrl).not.toHaveBeenCalled();
  });

  it('disposes a late result that resolves after unmount', async () => {
    const pending = deferred<string>();
    const load = vi.fn(() => pending.promise);
    const { unmount } = renderHook(() =>
      useObjectUrlResource('memory:1', 'attachment:1', load),
    );

    unmount();
    await act(async () => {
      pending.resolve('blob:late');
      await pending.promise;
      await Promise.resolve();
    });

    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:late');
  });

  it('keeps the replacement resource when an older request resolves late', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const load = vi.fn((resourceId: string) =>
      resourceId === 'attachment:a' ? first.promise : second.promise,
    );
    const { result, rerender, unmount } = renderHook(
      ({ resourceId }) =>
        useObjectUrlResource('memory:1', resourceId, load),
      { initialProps: { resourceId: 'attachment:a' } },
    );

    rerender({ resourceId: 'attachment:b' });
    await act(async () => {
      second.resolve('blob:b');
      await second.promise;
    });
    await waitFor(() => expect(result.current.url).toBe('blob:b'));

    await act(async () => {
      first.resolve('blob:a-late');
      await first.promise;
      await Promise.resolve();
    });

    expect(result.current.url).toBe('blob:b');
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:a-late');

    unmount();
    expect(revokeObjectUrl).toHaveBeenCalledTimes(2);
    expect(revokeObjectUrl).toHaveBeenLastCalledWith('blob:b');
  });

  it('ignores an error from a replaced request', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const load = vi.fn((resourceId: string) =>
      resourceId === 'attachment:a' ? first.promise : second.promise,
    );
    const { result, rerender } = renderHook(
      ({ resourceId }) =>
        useObjectUrlResource('memory:1', resourceId, load),
      { initialProps: { resourceId: 'attachment:a' } },
    );

    rerender({ resourceId: 'attachment:b' });
    await act(async () => {
      second.resolve('blob:b');
      await second.promise;
      first.reject(new Error('stale failure'));
      try {
        await first.promise;
      } catch {
        // expected rejection from the stale request
      }
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.url).toBe('blob:b'));
    expect(result.current.error).toBeNull();
  });

  it('handles rapid A -> B -> C replacement and leaves only C active', async () => {
    const pending = {
      a: deferred<string>(),
      b: deferred<string>(),
      c: deferred<string>(),
    };
    const load = vi.fn(
      (resourceId: string) =>
        pending[resourceId as keyof typeof pending].promise,
    );
    const { result, rerender, unmount } = renderHook(
      ({ resourceId }) =>
        useObjectUrlResource('scope', resourceId, load),
      { initialProps: { resourceId: 'a' } },
    );

    rerender({ resourceId: 'b' });
    rerender({ resourceId: 'c' });

    await act(async () => {
      pending.b.resolve('blob:b');
      pending.a.resolve('blob:a');
      pending.c.resolve('blob:c');
      await Promise.all([
        pending.a.promise,
        pending.b.promise,
        pending.c.promise,
      ]);
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.url).toBe('blob:c'));
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:a');
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:b');
    expect(revokeObjectUrl).not.toHaveBeenCalledWith('blob:c');

    unmount();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:c');
  });

  it('never double-revokes a resource removed before unmount', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ resourceId }) =>
        useObjectUrlResource(
          'scope',
          resourceId,
          async () => 'blob:single-owner',
        ),
      { initialProps: { resourceId: 'attachment:1' as string | null } },
    );

    await waitFor(() =>
      expect(result.current.url).toBe('blob:single-owner'),
    );
    rerender({ resourceId: null });
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);

    unmount();
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
  });

  it('preserves unchanged gallery resources and does not reload on callback churn', async () => {
    const firstLoad = vi.fn(async (resourceId: string) => `blob:${resourceId}`);
    const secondLoad = vi.fn(async (resourceId: string) => `blob:new-${resourceId}`);
    const { result, rerender, unmount } = renderHook(
      ({ ids, load }) => useObjectUrlResources('memory:1', ids, load),
      {
        initialProps: {
          ids: ['a', 'b'],
          load: firstLoad,
        },
      },
    );

    await waitFor(() => {
      expect(result.current.urls.a).toBe('blob:a');
      expect(result.current.urls.b).toBe('blob:b');
    });
    expect(firstLoad).toHaveBeenCalledTimes(2);

    rerender({ ids: ['a', 'b'], load: secondLoad });
    expect(secondLoad).not.toHaveBeenCalled();

    rerender({ ids: ['b', 'c'], load: secondLoad });
    await waitFor(() => expect(result.current.urls.c).toBe('blob:new-c'));
    expect(secondLoad).toHaveBeenCalledTimes(1);
    expect(secondLoad).toHaveBeenCalledWith('c', expect.any(AbortSignal));
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:a');
    expect(revokeObjectUrl).not.toHaveBeenCalledWith('blob:b');

    unmount();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:b');
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:new-c');
  });
});
