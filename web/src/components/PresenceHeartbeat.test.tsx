// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRuntimeProvider } from '../client/apiRuntimeContext';
import {
  partnerPresenceQueryKey,
  PRESENCE_HEARTBEAT_INTERVAL_MS,
} from '../client/presence';
import { PresenceHeartbeat } from './PresenceHeartbeat';

const mocks = vi.hoisted(() => ({ touchPresence: vi.fn() }));

vi.mock('../client/presence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../client/presence')>();
  return {
    ...actual,
    createPresenceApi: () => ({ touchPresence: mocks.touchPresence }),
  };
});

function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value,
  });
}

function renderHeartbeat() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ApiRuntimeProvider apiBaseUrl="http://api.test" accessToken="token">
        <PresenceHeartbeat accountId="account-1" spaceId="space-1" />
      </ApiRuntimeProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

describe('PresenceHeartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-19T18:00:00Z'));
    setVisibility('visible');
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
    mocks.touchPresence.mockReset();
    mocks.touchPresence.mockResolvedValue({ state: 'ACTIVE' });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('heartbeats at a bounded cadence only while actively visible', async () => {
    renderHeartbeat();
    expect(mocks.touchPresence).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(PRESENCE_HEARTBEAT_INTERVAL_MS);
    });
    expect(mocks.touchPresence).toHaveBeenCalledTimes(2);

    setVisibility('hidden');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await act(async () => {
      vi.advanceTimersByTime(PRESENCE_HEARTBEAT_INTERVAL_MS * 2);
    });
    expect(mocks.touchPresence).toHaveBeenCalledTimes(2);

    setVisibility('visible');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(mocks.touchPresence).toHaveBeenCalledTimes(3);
  });

  it('ignores a heartbeat response that settles after presence is suspended', async () => {
    let resolveTouch!: (value: { state: string }) => void;
    const pendingTouch = new Promise<{ state: string }>((resolve) => {
      resolveTouch = resolve;
    });
    mocks.touchPresence.mockReturnValueOnce(pendingTouch);

    const { queryClient } = renderHeartbeat();
    expect(mocks.touchPresence).toHaveBeenCalledTimes(1);

    act(() => window.dispatchEvent(new Event('blur')));
    expect(
      queryClient.getQueryData(partnerPresenceQueryKey('account-1', 'space-1')),
    ).toEqual({ state: null });

    await act(async () => {
      resolveTouch({ state: 'ACTIVE' });
      await Promise.resolve();
    });

    expect(
      queryClient.getQueryData(partnerPresenceQueryKey('account-1', 'space-1')),
    ).toEqual({ state: null });
  });

  it('does not let an older heartbeat failure clear a newer successful generation', async () => {
    let rejectFirstTouch!: (reason?: unknown) => void;
    const firstTouch = new Promise<{ state: string }>((_resolve, reject) => {
      rejectFirstTouch = reject;
    });
    mocks.touchPresence
      .mockReturnValueOnce(firstTouch)
      .mockResolvedValueOnce({ state: 'ACTIVE' });

    const { queryClient } = renderHeartbeat();
    expect(mocks.touchPresence).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(PRESENCE_HEARTBEAT_INTERVAL_MS);
      await Promise.resolve();
    });

    expect(mocks.touchPresence).toHaveBeenCalledTimes(2);
    expect(
      queryClient.getQueryData(partnerPresenceQueryKey('account-1', 'space-1')),
    ).toEqual({ state: 'ACTIVE' });

    await act(async () => {
      rejectFirstTouch(new Error('late failure'));
      await Promise.resolve();
    });

    expect(
      queryClient.getQueryData(partnerPresenceQueryKey('account-1', 'space-1')),
    ).toEqual({ state: 'ACTIVE' });
  });

  it('fails closed and removes the old Account+Space scope on unmount', async () => {
    mocks.touchPresence.mockRejectedValueOnce(new Error('network'));
    const { queryClient, unmount } = renderHeartbeat();

    await act(async () => {
      await Promise.resolve();
    });
    expect(
      queryClient.getQueryData(partnerPresenceQueryKey('account-1', 'space-1')),
    ).toEqual({ state: null });

    act(() => window.dispatchEvent(new Event('blur')));
    await act(async () => {
      vi.advanceTimersByTime(PRESENCE_HEARTBEAT_INTERVAL_MS * 2);
    });
    expect(mocks.touchPresence).toHaveBeenCalledTimes(1);

    unmount();
    expect(
      queryClient.getQueryData(partnerPresenceQueryKey('account-1', 'space-1')),
    ).toBeUndefined();
  });
});
