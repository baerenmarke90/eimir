// @vitest-environment jsdom
import { onlineManager, QueryClient } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import type { NotificationItem } from '../api/generated/models/NotificationItem';
import {
  notificationUnreadCountQueryKey,
  notificationsListQueryKey,
} from './notificationQueries';
import { beginNotificationRead } from './notificationRead';
import { ClientProblemError } from './problemDetails';

afterEach(() => {
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
});

function notification(id: string): NotificationItem {
  return {
    id,
    actorId: 'other-account',
    actor: null,
    kind: 'THINKING_OF_YOU',
    sourceEventId: `event-${id}`,
    targetType: null,
    targetId: null,
    target: null,
    readAt: null,
    createdAt: new Date('2026-10-25T09:00:00Z'),
  };
}

function fixture() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const listKey = notificationsListQueryKey('space-a');
  const countKey = notificationUnreadCountQueryKey('space-a');
  client.setQueryData(listKey, {
    pages: [
      {
        items: [notification('first'), notification('second')],
        nextCursor: null,
      },
    ],
    pageParams: [null],
  });
  client.setQueryData(countKey, { unreadCount: 2 });
  const read = (id: string) =>
    client
      .getQueryData<{
        pages: Array<{ items: NotificationItem[] }>;
      }>(listKey)
      ?.pages[0].items.find((item) => item.id === id)?.readAt;
  const count = () =>
    client.getQueryData<{ unreadCount: number }>(countKey)?.unreadCount;
  return { client, listKey, countKey, read, count };
}

it('immediately marks one notification read and admits no duplicate request', async () => {
  const h = fixture();
  const first = beginNotificationRead(h.client, 'space-a', 'first');
  expect(first).not.toBeNull();
  expect(h.read('first')).toBeInstanceOf(Date);
  expect(h.count()).toBe(1);
  expect(beginNotificationRead(h.client, 'space-a', 'first')).toBeNull();
  const send = vi.fn(async () => undefined);
  await first?.perform(send);
  expect(send).toHaveBeenCalledTimes(1);
});

it('rolls back only one failed mark while another mark remains pending', () => {
  const h = fixture();
  const first = beginNotificationRead(h.client, 'space-a', 'first');
  const second = beginNotificationRead(h.client, 'space-a', 'second');
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  expect(h.count()).toBe(0);
  first?.rollback();
  expect(h.read('first')).toBeNull();
  expect(h.read('second')).toBeInstanceOf(Date);
  expect(h.count()).toBe(1);
  second?.rollback();
  expect(h.count()).toBe(2);
  expect(h.read('second')).toBeNull();
});

it('does not overwrite a newer server list or count after an older failure', async () => {
  const h = fixture();
  const first = beginNotificationRead(h.client, 'space-a', 'first');
  expect(first).not.toBeNull();
  const authoritative = notification('first');
  authoritative.readAt = new Date('2026-10-25T12:30:00Z');
  h.client.setQueryData(h.listKey, {
    pages: [
      {
        items: [authoritative, notification('second')],
        nextCursor: null,
      },
    ],
    pageParams: [null],
  });
  h.client.setQueryData(h.countKey, { unreadCount: 9 });
  first?.rollback();
  await first?.refresh();
  expect(h.read('first')).toEqual(authoritative.readAt);
  expect(h.count()).toBe(9);
});

it.each(['removed', 'replaced', 'denied'] as const)(
  'never dispatches or reconciles after its original Query is %s',
  async (mode) => {
    const h = fixture();
    const first = beginNotificationRead(h.client, 'space-a', 'first');
    expect(first).not.toBeNull();
    const invalidate = vi.spyOn(h.client, 'invalidateQueries');

    if (mode === 'denied') {
      h.client.getQueryCache().find({ queryKey: h.listKey, exact: true })?.setState({
        error: new ClientProblemError('permission', 403),
        status: 'error',
      });
    } else {
      h.client.removeQueries({ queryKey: h.listKey, exact: true });
      if (mode === 'replaced')
        h.client.setQueryData(h.listKey, {
          pages: [
            {
              items: [notification('first')],
              nextCursor: null,
            },
          ],
          pageParams: [null],
        });
    }
    const send = vi.fn(async () => undefined);
    await expect(first?.perform(send)).rejects.toBeInstanceOf(
      ClientProblemError,
    );
    first?.rollback();
    await first?.refresh();
    expect(send).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    if (mode === 'removed') expect(h.client.getQueryData(h.listKey)).toBeUndefined();
    else if (mode === 'replaced') expect(h.read('first')).toBeNull();
    else expect(h.read('first')).toBeInstanceOf(Date);
  },
);

it('rejects offline dispatch without reconnect replay, then allows a new intent', async () => {
  const h = fixture();
  const first = beginNotificationRead(h.client, 'space-a', 'first');
  onlineManager.setOnline(false);
  const send = vi.fn(async () => undefined);
  await expect(first?.perform(send)).rejects.toBeInstanceOf(
    ClientProblemError,
  );
  first?.rollback();
  expect(h.read('first')).toBeNull();
  expect(h.count()).toBe(2);
  onlineManager.setOnline(true);
  expect(send).not.toHaveBeenCalled();
  const second = beginNotificationRead(h.client, 'space-a', 'first');
  await second?.perform(send);
  expect(send).toHaveBeenCalledTimes(1);
});

it('keeps an unrelated Space Query untouched during late failure and refresh', async () => {
  const h = fixture();
  const first = beginNotificationRead(h.client, 'space-a', 'first');
  const otherKey = notificationsListQueryKey('space-b');
  const otherCount = notificationUnreadCountQueryKey('space-b');
  const otherList = {
    pages: [{ items: [notification('first')], nextCursor: null }],
    pageParams: [null],
  };
  h.client.setQueryData(otherKey, otherList);
  h.client.setQueryData(otherCount, { unreadCount: 7 });
  first?.rollback();
  await first?.refresh();
  expect(h.client.getQueryData(otherKey)).toEqual(otherList);
  expect(h.client.getQueryData(otherCount)).toEqual({ unreadCount: 7 });
});
