// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import { notificationUnreadCountQueryKey } from './notificationQueries';
import {
  type NotificationTray,
  syncTrayNotices,
  useTrayNoticeSync,
} from './trayNoticeSync';

const SPACE = 'space-a';
const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

function tray(ids: string[]) {
  return {
    delivered: vi.fn(async () => ids),
    withdraw: vi.fn(async () => undefined),
  } satisfies NotificationTray;
}

type Lookup = {
  spaceId: string;
  settledNotificationsQuery: { notificationIds: string[] };
};

function api(settledIds: string[]) {
  return {
    findSettledNotifications: vi.fn(
      async (_request: Lookup, _init?: RequestInit) => ({ settledIds }),
    ),
  } satisfies Pick<NotificationsApi, 'findSettledNotifications'>;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('syncTrayNotices (#2345)', () => {
  it('withdraws only what the server reports as settled', async () => {
    const device = tray([A, B]);
    const server = api([B]);

    await syncTrayNotices(device, server, SPACE);

    expect(server.findSettledNotifications).toHaveBeenCalledWith(
      {
        spaceId: SPACE,
        settledNotificationsQuery: { notificationIds: [A, B] },
      },
      { signal: undefined },
    );
    expect(device.withdraw).toHaveBeenCalledWith([B]);
  });

  it('asks nothing while the tray is empty', async () => {
    const device = tray([]);
    const server = api([]);

    await syncTrayNotices(device, server, SPACE);

    expect(server.findSettledNotifications).not.toHaveBeenCalled();
    expect(device.withdraw).not.toHaveBeenCalled();
  });

  it('leaves the tray alone when nothing is settled or the lookup fails', async () => {
    const device = tray([A]);
    await syncTrayNotices(device, api([]), SPACE);
    const failing = {
      findSettledNotifications: vi.fn(async () => {
        throw new Error('offline');
      }),
    };
    await expect(syncTrayNotices(device, failing, SPACE)).rejects.toThrow();
    expect(device.withdraw).not.toHaveBeenCalled();
  });

  it('bounds one lookup to fifty notices', async () => {
    const many = Array.from(
      { length: 60 },
      (_, index) =>
        `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
    );
    const server = api([]);

    await syncTrayNotices(tray(many), server, SPACE);

    expect(
      server.findSettledNotifications.mock.calls[0]?.[0]
        .settledNotificationsQuery.notificationIds,
    ).toHaveLength(50);
  });
});

describe('useTrayNoticeSync (#2345)', () => {
  it('syncs at start and after each refreshed unread count', async () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const device = tray([A]);
    const server = api([A]);
    renderHook(() =>
      useTrayNoticeSync({
        tray: device,
        notificationsApi: server,
        queryClient: client,
        spaceId: SPACE,
      }),
    );

    await vi.advanceTimersByTimeAsync(400);
    expect(device.delivered).toHaveBeenCalledTimes(1);

    await client.fetchQuery({
      queryKey: notificationUnreadCountQueryKey(SPACE),
      queryFn: async () => ({ unreadCount: 0 }),
    });
    await client.fetchQuery({
      queryKey: notificationUnreadCountQueryKey('space-b'),
      queryFn: async () => ({ unreadCount: 0 }),
    });
    await vi.advanceTimersByTimeAsync(400);

    // Only this Space's count triggers a second sync.
    expect(device.delivered).toHaveBeenCalledTimes(2);
    expect(device.withdraw).toHaveBeenLastCalledWith([A]);
  });

  it('does nothing without a tray', async () => {
    vi.useFakeTimers();
    const server = api([]);
    renderHook(() =>
      useTrayNoticeSync({
        tray: null,
        notificationsApi: server,
        queryClient: new QueryClient(),
        spaceId: SPACE,
      }),
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(server.findSettledNotifications).not.toHaveBeenCalled();
  });
});
