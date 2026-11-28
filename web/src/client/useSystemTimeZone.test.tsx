// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { AccountApi } from '../api/generated/apis/AccountApi';
import type { DeviceContextView } from '../api/generated/models/DeviceContextView';
import { useSystemTimeZone } from './useSystemTimeZone';
import { dashboardQueryKey } from './dashboardQueries';
import { useWarmOverviewQuery } from './useWarmOverviewQuery';
import {
  __resetProductReadCacheStateForTests,
  __setProductReadCacheStorageForTests,
  __waitForProductReadCacheMutationsForTests,
  readWarmOverviewCache,
  loadProductWithReadCache,
} from './productReadCache';
afterEach(async () => {
  cleanup();
  await __waitForProductReadCacheMutationsForTests();
  __resetProductReadCacheStateForTests();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it('coalesces resume reads, syncs the current system zone and aborts retired ownership', async () => {
  let zone = 'Europe/Berlin';
  let now = 1_800_000_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(
    () => ({ timeZone: zone }) as Intl.ResolvedDateTimeFormatOptions,
  );
  const calls: { zone: string; signal?: AbortSignal }[] = [];
  const write = vi
    .spyOn(AccountApi.prototype, 'updateOwnDeviceContext')
    .mockImplementation(async (request, init) => {
      calls.push({
        zone: request.deviceContextUpdate.timezone,
        signal: (init as RequestInit)?.signal as AbortSignal,
      });
      return { timezone: zone, sharedDayPending: false, changed: true };
    });
  const client = new QueryClient();
  const contextKey = ['daily-check-in', 'today', 'first', 'space'];
  let revision = 0;
  await client.fetchQuery({
    queryKey: contextKey,
    queryFn: async () => ++revision,
  });
  const refetch = vi.spyOn(client, 'refetchQueries');
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    ({ account }) =>
      useSystemTimeZone(
        'https://instance.test',
        'test-token',
        account,
        'space',
      ),
    { wrapper, initialProps: { account: 'first' } },
  );
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
  // Returning to a previously opened module must already use the new day,
  // even when its Query has no mounted observer during device synchronization.
  await waitFor(() => expect(client.getQueryData(contextKey)).toBe(2));
  act(() => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
  });
  expect(write).toHaveBeenCalledTimes(1);
  zone = 'Pacific/Auckland';
  now += 61_000;
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
  expect(calls.map((call) => call.zone)).toEqual([
    'Europe/Berlin',
    'Pacific/Auckland',
  ]);
  expect(refetch).toHaveBeenCalledWith({
    queryKey: contextKey,
    type: 'all',
  });
  expect(invalidate).not.toHaveBeenCalled();
  view.rerender({ account: 'second' });
  expect(calls[0].signal?.aborted).toBe(true);
  view.unmount();
  expect(calls.at(-1)?.signal?.aborted).toBe(true);
  client.clear();
});

it('retains an authorized warm Dashboard while the confirmed device context refreshes it', async () => {
  localStorage.clear();
  __resetProductReadCacheStateForTests();
  const rows = new Map<string, unknown>();
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
  const write = vi
    .spyOn(AccountApi.prototype, 'updateOwnDeviceContext')
    .mockResolvedValue({
      timezone: 'Europe/Berlin',
      sharedDayPending: false,
      changed: true,
    });
  const context = {
    accountId: 'warm-viewer',
    spaceId: 'warm-space',
    kind: 'dashboard-overview' as const,
    resourceId: 'https://instance.test/',
    serialize: (value: { label: string }) => value,
    deserialize: (value: unknown) => value as { label: string },
  };
  await loadProductWithReadCache({
    ...context,
    load: async () => ({ label: 'Saved afternoon together' }),
  });
  let finish!: (value: { label: string }) => void;
  const pending = new Promise<{ label: string }>((resolve) => {
    finish = resolve;
  });
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    () => {
      const overview = useWarmOverviewQuery({
        ...context,
        apiBaseUrl: 'https://instance.test',
        queryKey: dashboardQueryKey(context.spaceId),
        load: () => pending,
      });
      useSystemTimeZone(
        'https://instance.test',
        'test-token',
        context.accountId,
        context.spaceId,
      );
      return overview;
    },
    { wrapper },
  );
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(view.result.current.data?.label).toBe('Saved afternoon together'),
  );
  expect((await readWarmOverviewCache(context))?.value.label).toBe(
    'Saved afternoon together',
  );
  await act(async () => finish({ label: 'Fresh afternoon together' }));
  await waitFor(() =>
    expect(view.result.current.data?.label).toBe('Fresh afternoon together'),
  );
});

/** One day-dependent read made before the device context is confirmed. */
async function confirmDeviceContext(
  response: DeviceContextView,
  beforeMount: () => void = () => undefined,
) {
  const write = vi
    .spyOn(AccountApi.prototype, 'updateOwnDeviceContext')
    .mockResolvedValue(response);
  const client = new QueryClient();
  const contextKey = ['daily-check-in', 'today', 'viewer', 'space'];
  let revision = 0;
  await client.fetchQuery({
    queryKey: contextKey,
    queryFn: async () => ++revision,
  });
  beforeMount();
  const refetch = vi.spyOn(client, 'refetchQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    () =>
      useSystemTimeZone(
        'https://instance.test',
        'test-token',
        'viewer',
        'space',
      ),
    { wrapper },
  );
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
  // Let the confirmation continue past the awaited write before asserting.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return {
    refetch,
    read: () => client.getQueryData(contextKey),
    done: () => {
      view.unmount();
      client.clear();
    },
  };
}

it('keeps current reads when the confirmed device context changed nothing', async () => {
  const context = await confirmDeviceContext({
    timezone: 'Europe/Berlin',
    sharedDayPending: false,
    changed: false,
  });
  expect(context.refetch).not.toHaveBeenCalled();
  expect(context.read()).toBe(1);
  context.done();
});

it('refreshes day-dependent reads when the confirmed device context changed', async () => {
  const context = await confirmDeviceContext({
    timezone: 'Europe/Berlin',
    sharedDayPending: false,
    changed: true,
  });
  await waitFor(() => expect(context.read()).toBe(2));
  expect(context.refetch).toHaveBeenCalledTimes(3);
  context.done();
});

it('refreshes day-dependent reads when an older server omits the change result', async () => {
  const context = await confirmDeviceContext({
    timezone: 'Europe/Berlin',
    sharedDayPending: false,
  } as DeviceContextView);
  await waitFor(() => expect(context.read()).toBe(2));
  context.done();
});

it('refreshes reads from an earlier local day even when nothing changed', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 26, 23, 30));
  const context = await confirmDeviceContext(
    { timezone: 'Europe/Berlin', sharedDayPending: false, changed: false },
    () => vi.setSystemTime(new Date(2026, 10, 27, 0, 30)),
  );
  await waitFor(() => expect(context.read()).toBe(2));
  context.done();
});
