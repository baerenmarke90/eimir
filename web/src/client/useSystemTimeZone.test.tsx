// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { AccountApi } from '../api/generated/apis/AccountApi';
import { useSystemTimeZone } from './useSystemTimeZone';
afterEach(() => {
  cleanup();
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
      return { timezone: zone, sharedDayPending: false };
    });
  const client = new QueryClient();
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
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ['daily-check-in', 'today', 'first', 'space'],
  });
  view.rerender({ account: 'second' });
  expect(calls[0].signal?.aborted).toBe(true);
  view.unmount();
  expect(calls.at(-1)?.signal?.aborted).toBe(true);
});
