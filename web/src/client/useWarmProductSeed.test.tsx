// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { ClientProblemError } from './problemDetails';
import {
  __resetProductReadCacheStateForTests,
  __setProductReadCacheStorageForTests,
  __waitForProductReadCacheMutationsForTests,
  loadProductWithReadCache,
  type ProductReadResult,
} from './productReadCache';
import { useWarmProductSeed } from './useWarmProductSeed';

const rows = new Map<string, unknown>();
type Story = { title: string };
const identity = { accountId: 'account', spaceId: 'space' } as const;
const resource = { kind: 'story', resourceId: 'all' } as const;

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
});

function setup(load: () => Promise<Story>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    () => {
      const query = useQuery<ProductReadResult<Story>>({
        queryKey: ['story', 'space'],
        queryFn: () =>
          loadProductWithReadCache({
            ...identity,
            ...resource,
            load,
            serialize: (value) => value,
            deserialize: (payload) => payload as Story,
          }),
      });
      useWarmProductSeed({
        queryKey: ['story', 'space'],
        ...identity,
        ...resource,
        deserialize: (payload) => payload as Story,
        toQueryData: (snapshot) => snapshot,
        error: query.error,
      });
      return query;
    },
    { wrapper },
  );
}

async function store(title: string) {
  await loadProductWithReadCache({
    ...identity,
    ...resource,
    load: async () => ({ title }),
    serialize: (value) => value,
    deserialize: (payload) => payload as Story,
  });
  await __waitForProductReadCacheMutationsForTests();
}

it('paints the stored snapshot while the network read is pending, then replaces it', async () => {
  await store('stored');
  let answer!: (story: Story) => void;
  const { result } = setup(
    () =>
      new Promise<Story>((resolve) => {
        answer = resolve;
      }),
  );
  await waitFor(() => expect(result.current.data?.source).toBe('warm'));
  expect(result.current.data?.value.title).toBe('stored');
  expect(result.current.isFetching).toBe(true);
  answer({ title: 'fresh' });
  await waitFor(() => expect(result.current.data?.source).toBe('network'));
  expect(result.current.data?.value.title).toBe('fresh');
});

it('removes the painted snapshot when the read is denied', async () => {
  await store('stored');
  let deny!: (error: Error) => void;
  const { result } = setup(
    () =>
      new Promise<Story>((_, reject) => {
        deny = reject;
      }),
  );
  await waitFor(() => expect(result.current.data?.source).toBe('warm'));
  deny(new ClientProblemError('permission', 403));
  await waitFor(() => expect(result.current.isError).toBe(true));
  await waitFor(() => expect(result.current.data).toBeUndefined());
  await __waitForProductReadCacheMutationsForTests();
  expect(rows.size).toBe(0);
});

it('paints nothing without a stored snapshot', async () => {
  const { result } = setup(async () => ({ title: 'fresh' }));
  await waitFor(() => expect(result.current.data?.source).toBe('network'));
});
