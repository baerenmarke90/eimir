// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidateDashboard } from './dashboardQueries';
import { storeSession } from './sessionPersistence';
import { ClientProblemError } from './problemDetails';
import {
  __resetProductReadCacheStateForTests,
  __setProductReadCacheStorageForTests,
  __waitForProductReadCacheMutationsForTests,
  canPersistProductReadPayload,
  clearProductReadCache,
  loadProductWithReadCache,
  readWarmOverviewCache,
} from './productReadCache';
import {
  overviewCacheResourceId,
  useWarmOverviewQuery,
} from './useWarmOverviewQuery';

vi.mock('./config', () => ({
  loadReferenceClientConfig: () => ({ apiBaseUrl: 'https://api.example.test' }),
}));

const rows = new Map<string, unknown>();
const context = {
  accountId: 'account-1',
  spaceId: 'space-1',
  kind: 'plans-overview' as const,
  apiBaseUrl: 'https://api.example.test',
};
const resourceId = 'https://api.example.test/';
type Value = { label: string };
const serialize = (value: Value) => value;
const deserialize = (payload: unknown) => {
  if (!payload || typeof (payload as Value).label !== 'string')
    throw new Error('Invalid test snapshot');
  return payload as Value;
};
beforeEach(() => {
  window.localStorage.clear();
  __resetProductReadCacheStateForTests();
  rows.clear();
  __setProductReadCacheStorageForTests({
    read: async (key) => rows.get(key) ?? null,
    write: async (record) => {
      rows.set((record as { key: string }).key, structuredClone(record));
    },
    remove: async (key) => {
      rows.delete(key);
    },
    clear: async () => {
      rows.clear();
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function seed() {
  await loadProductWithReadCache({
    ...context,
    resourceId,
    load: async () => ({ label: 'Saved plan' }),
    serialize,
    deserialize,
  });
}
function setup(load: () => Promise<Value>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const hook = () =>
    useWarmOverviewQuery({
      ...context,
      queryKey: ['plans', context.spaceId],
      load,
      serialize,
      deserialize,
    });
  return { client, wrapper, hook, ...renderHook(hook, { wrapper }) };
}

describe('Warm shared overview continuity', () => {
  it('paints the saved snapshot during a slow cold read, then replaces it with live data', async () => {
    await seed();
    let finish!: (value: Value) => void;
    const read = vi.fn(
      () =>
        new Promise<Value>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = setup(read);
    await waitFor(() => expect(result.current.data?.label).toBe('Saved plan'));
    expect(result.current.isCached).toBe(true);
    expect(result.current.isFetching).toBe(true);
    expect(result.current.cachedAt).toBeInstanceOf(Date);
    await act(async () => finish({ label: 'Current plan' }));
    await waitFor(() =>
      expect(result.current.data?.label).toBe('Current plan'),
    );
    expect(result.current.isCached).toBe(false);
    expect(read).toHaveBeenCalledOnce();
  });
  it('reuses a healthy read when returning to a tab instead of loading again', async () => {
    const read = vi.fn(async () => ({ label: 'Current plan' }));
    const state = setup(read);
    await waitFor(() =>
      expect(state.result.current.data?.label).toBe('Current plan'),
    );
    state.unmount();
    const again = renderHook(state.hook, { wrapper: state.wrapper });
    expect(again.result.current.data?.label).toBe('Current plan');
    expect(again.result.current.isLoading).toBe(false);
    expect(read).toHaveBeenCalledOnce();
  });
  it.each(['permission', 'unauthorized', 'notFound'] as const)(
    'hides and durably evicts an earlier snapshot after %s',
    async (kind) => {
      await seed();
      const state = setup(async () => {
        throw new ClientProblemError(kind);
      });
      await waitFor(() => expect(state.result.current.error).toBeTruthy());
      expect(state.result.current.data).toBeUndefined();
      expect(state.result.current.isCached).toBe(false);
      await __waitForProductReadCacheMutationsForTests();
      expect(rows.size).toBe(0);
    },
  );
  it('keeps the original timestamp and read-only state through an availability failure and return', async () => {
    await seed();
    const savedAt = (Array.from(rows.values())[0] as { refreshedAt: string })
      .refreshedAt;
    const state = setup(async () => {
      throw new ClientProblemError('offline');
    });
    await waitFor(() => expect(state.result.current.isFetching).toBe(false));
    expect(state.result.current.data?.label).toBe('Saved plan');
    expect(state.result.current.isCached).toBe(true);
    expect(state.result.current.cachedAt?.toISOString()).toBe(savedAt);
    state.unmount();
    const again = renderHook(state.hook, { wrapper: state.wrapper });
    expect(again.result.current.isCached).toBe(true);
    expect(again.result.current.cachedAt?.toISOString()).toBe(savedAt);
  });
  it('invalidates the durable snapshot when a detail mutation invalidates an unmounted overview', async () => {
    const state = setup(async () => ({ label: 'Current plan' }));
    await waitFor(() => expect(state.result.current.data).toBeTruthy());
    state.unmount();
    await state.client.invalidateQueries({
      queryKey: ['plans', context.spaceId],
    });
    await __waitForProductReadCacheMutationsForTests();
    expect(rows.size).toBe(0);
  });
  it('revokes both durable overviews after a confirmed write even with an empty memory cache', async () => {
    await storeSession({
      account: { id: context.accountId, displayName: 'Anna' },
      spaceId: context.spaceId,
      tokens: {
        accessToken: 'access',
        refreshToken: 'refresh',
        accessExpiresAt: new Date(Date.now() + 60000),
        refreshExpiresAt: new Date(Date.now() + 600000),
      },
    });
    await seed();
    await loadProductWithReadCache({
      ...context,
      kind: 'dashboard-overview',
      resourceId,
      load: async () => ({ label: 'Saved dashboard' }),
      serialize,
      deserialize,
    });
    expect(rows.size).toBe(2);
    const client = new QueryClient();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    await invalidateDashboard(client, context.spaceId);
    await __waitForProductReadCacheMutationsForTests();
    expect(rows.size).toBe(0);
  });
  it('isolates API origins and clears saved content on logout', async () => {
    await seed();
    expect(overviewCacheResourceId(context.apiBaseUrl)).toBe(resourceId);
    expect(
      await readWarmOverviewCache({
        ...context,
        resourceId: 'https://another.example.test/',
        deserialize,
      }),
    ).toBeUndefined();
    await clearProductReadCache();
    expect(
      await readWarmOverviewCache({ ...context, resourceId, deserialize }),
    ).toBeUndefined();
  });
  it('bounds overview storage rather than retaining arbitrarily large histories', () => {
    expect(
      canPersistProductReadPayload('plans-overview', {
        label: 'x'.repeat(256 * 1024),
      }),
    ).toBe(false);
    expect(
      canPersistProductReadPayload('dashboard-overview', { label: 'Small' }),
    ).toBe(true);
  });
});
