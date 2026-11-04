// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiRuntimeProvider } from './apiRuntimeContext';
import { ClientProblemError } from './problemDetails';
import {
  __resetProductReadCacheStateForTests,
  __setProductReadCacheStorageForTests,
  __waitForProductReadCacheMutationsForTests,
  readWarmOverviewCache,
  revokeSharedListCache,
  captureSharedListCacheWrite,
  canPersistProductReadPayload,
} from './productReadCache';
import {
  useWarmInfiniteQuery,
  encodeReadValue,
  decodeReadValue,
} from './useWarmInfiniteQuery';

const rows = new Map<string, unknown>();
const apiBaseUrl = 'https://instance.test';
type Page = {
  items: { id: string; occurredOn: Date }[];
  nextCursor: string | null;
};
const page = (id: string, nextCursor: string | null): Page => ({
  items: [{ id, occurredOn: new Date('2026-11-04') }],
  nextCursor,
});
beforeEach(() => {
  localStorage.clear();
  rows.clear();
  __resetProductReadCacheStateForTests();
  __setProductReadCacheStorageForTests({
    read: async (key) => rows.get(key),
    write: async (record) => {
      rows.set((record as { key: string }).key, structuredClone(record));
    },
    remove: async (key) => {
      rows.delete(key);
    },
    clear: async () => rows.clear(),
  });
});
afterEach(async () => {
  cleanup();
  await __waitForProductReadCacheMutationsForTests();
  vi.restoreAllMocks();
});
function setup(
  load: (cursor: string | null) => Promise<Page>,
  accountId = 'account',
  resource = 'photos',
  revalidateOnRestore = false,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const key = [resource, accountId, 'space'];
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ApiRuntimeProvider
        apiBaseUrl={apiBaseUrl}
        accessToken="test-token"
        accountId={accountId}
        spaceId="space"
      >
        {children}
      </ApiRuntimeProvider>
    </QueryClientProvider>
  );
  const result = renderHook(
    () =>
      useWarmInfiniteQuery(
        {
          queryKey: key,
          initialPageParam: null as string | null,
          queryFn: ({ pageParam }) => load(pageParam),
          getNextPageParam: (page) => page.nextCursor,
        },
        { revalidateOnRestore },
      ),
    { wrapper },
  );
  return { ...result, client, key };
}
it('restores all loaded pages with typed dates after a new QueryClient without another request', async () => {
  const load = vi.fn(async (cursor: string | null) =>
    cursor ? page('second', null) : page('first', 'second-cursor'),
  );
  const first = setup(load);
  await waitFor(() => expect(first.result.current.data?.pages).toHaveLength(1));
  await act(async () => {
    await first.result.current.fetchNextPage();
  });
  await waitFor(() => expect(first.result.current.data?.pages).toHaveLength(2));
  await __waitForProductReadCacheMutationsForTests();
  first.unmount();
  first.client.clear();
  const second = setup(load);
  await waitFor(() =>
    expect(second.result.current.data?.pages).toHaveLength(2),
  );
  expect(second.result.current.data?.pages[1]?.items[0]?.occurredOn).toEqual(
    new Date('2026-11-04'),
  );
  expect(load).toHaveBeenCalledTimes(2);
});
it('marks a restored Plan prefix as cached until its deliberate cold revalidation completes', async () => {
  const first = setup(
    async () => page('saved', null),
    'account',
    'plans',
    true,
  );
  await waitFor(() => expect(first.result.current.data).toBeDefined());
  await __waitForProductReadCacheMutationsForTests();
  first.unmount();
  first.client.clear();
  let release!: (value: Page) => void;
  const load = vi.fn(
    () =>
      new Promise<Page>((resolve) => {
        release = resolve;
      }),
  );
  const restored = setup(load, 'account', 'plans', true);
  await waitFor(() => expect(restored.result.current.isCached).toBe(true));
  expect(restored.result.current.data?.pages[0].items[0].id).toBe('saved');
  expect(restored.result.current.cachedAt).toBeInstanceOf(Date);
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  await act(async () => {
    release(page('fresh', null));
  });
  await waitFor(() => expect(restored.result.current.isCached).toBe(false));
  expect(restored.result.current.data?.pages[0].items[0].id).toBe('fresh');
});

it('keeps filters separate and retires prior-account or revoked late reads', async () => {
  const first = setup(async () => page('photo', null));
  await waitFor(() => expect(first.result.current.data).toBeDefined());
  await __waitForProductReadCacheMutationsForTests();
  const guard = captureSharedListCacheWrite('account', 'space');
  expect(guard()).toBe(true);
  revokeSharedListCache('space');
  expect(guard()).toBe(false);
  const resourceId = JSON.stringify([apiBaseUrl, first.key]);
  expect(
    await readWarmOverviewCache({
      accountId: 'account',
      spaceId: 'space',
      kind: 'shared-list',
      resourceId,
      deserialize: decodeReadValue,
    }),
  ).toBeUndefined();
  first.unmount();
  const other = setup(async () => page('own', null), 'other-account', 'places');
  await waitFor(() =>
    expect(other.result.current.data?.pages[0].items[0].id).toBe('own'),
  );
  expect(JSON.stringify(other.result.current.data)).not.toContain('photo');
});
it('hides retained shared data on a denied live response', async () => {
  let denied = false;
  const view = setup(async () => {
    if (denied) throw new ClientProblemError('notFound', 404);
    return page('visible', null);
  });
  await waitFor(() => expect(view.result.current.data).toBeDefined());
  denied = true;
  await act(async () => {
    await view.result.current.refetch();
  });
  await waitFor(() => expect(view.result.current.data).toBeUndefined());
});
it('bounds snapshots and rejects private data and invalid cached dates', () => {
  expect(
    canPersistProductReadPayload('shared-list', {
      pages: [{ items: [{ visibility: 'PRIVATE' }] }],
      pageParams: [null],
    }),
  ).toBe(false);
  expect(
    canPersistProductReadPayload('shared-list', {
      pages: Array(13).fill({}),
      pageParams: Array(13).fill(null),
    }),
  ).toBe(false);
  expect(
    decodeReadValue(encodeReadValue({ when: new Date('2026-11-04') })),
  ).toEqual({ when: new Date('2026-11-04') });
  expect(() => decodeReadValue({ $eimirDate: 'invalid' })).toThrow();
});
