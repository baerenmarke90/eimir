// @vitest-environment jsdom
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationItem } from '../api/generated/models/NotificationItem';
import type { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import type { M4ProductApis } from '../client/m4Product';
import {
  notificationUnreadCountQueryKey,
  notificationsListQueryKey,
} from '../client/notificationQueries';
import { ClientProblemError } from '../client/problemDetails';
import { i18n } from '../i18n';
import { NotificationsProductPage } from './M4ProductPages';

const SPACE_ID = 'space-a';
const ACCOUNT_ID = 'account-a';

afterEach(() => {
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function notification(readAt: Date | null = null): NotificationItem {
  return {
    id: 'notification-a',
    sourceEventId: 'event-a',
    kind: 'THINKING_OF_YOU',
    actorId: 'account-b',
    actor: null,
    targetType: null,
    targetId: null,
    target: null,
    createdAt: new Date('2026-10-25T12:00:00Z'),
    readAt,
  };
}

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const listKey = notificationsListQueryKey(SPACE_ID);
  const unreadKey = notificationUnreadCountQueryKey(SPACE_ID);
  queryClient.setQueryData(listKey, {
    pages: [{ items: [notification()], nextCursor: null }],
    pageParams: [null],
  });
  queryClient.setQueryData(unreadKey, { unreadCount: 2 });

  const result = deferred<unknown>();
  const markAllNotificationsRead = vi.fn(() => result.promise);
  const getNotificationUnreadCount = vi.fn(async () => ({ unreadCount: 0 }));
  const getNotifications = vi.fn(async () => ({
    items: [notification(new Date('2026-10-25T12:05:00Z'))],
    nextCursor: null,
  }));
  const api = {
    markAllNotificationsRead,
    getNotificationUnreadCount,
    getNotifications,
  } as unknown as NotificationsApi;

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <NotificationsProductPage
          apis={{ notifications: api } as M4ProductApis}
          spaceId={SPACE_ID}
          currentAccountId={ACCOUNT_ID}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const button = () =>
    screen.getByRole('button', {
      name: new RegExp(
        i18n.t('m5s5.notifications.markAllRead') + '|' +
          i18n.t('m5s5.notifications.markingAllRead'),
      ),
    });
  return {
    queryClient,
    listKey,
    unreadKey,
    button,
    result,
    markAllNotificationsRead,
    getNotificationUnreadCount,
    getNotifications,
  };
}

describe('Notifications bulk mark-read ownership', () => {
  it('confirms on the server before updating the count, blocking rapid duplicate taps', async () => {
    const context = setup();
    const button = context.button();
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    await waitFor(() =>
      expect(context.markAllNotificationsRead).toHaveBeenCalledTimes(1),
    );
    expect(context.queryClient.getQueryData(context.unreadKey)).toEqual({
      unreadCount: 2,
    });
    expect(context.button().hasAttribute('disabled')).toBe(true);

    await act(async () => context.result.resolve(undefined));
    await waitFor(() =>
      expect(context.queryClient.getQueryData(context.unreadKey)).toEqual({
        unreadCount: 0,
      }),
    );
    expect(context.getNotificationUnreadCount).toHaveBeenCalledTimes(1);
    expect(context.getNotifications).toHaveBeenCalledTimes(1);
    expect(context.markAllNotificationsRead).toHaveBeenCalledWith({
      spaceId: SPACE_ID,
    });
    expect(context.button().hasAttribute('disabled')).toBe(true);
  });

  it('fails offline immediately and does not send the bulk action on reconnect', async () => {
    onlineManager.setOnline(false);
    const context = setup();
    fireEvent.click(context.button());
    await waitFor(() => {
      const failures = context.queryClient
        .getMutationCache()
        .getAll()
        .filter((entry) => entry.state.status === 'error');
      expect(failures).toHaveLength(1);
      expect(failures[0].state.error).toBeInstanceOf(ClientProblemError);
    });
    expect(context.markAllNotificationsRead).not.toHaveBeenCalled();
    onlineManager.setOnline(true);
    await act(async () => Promise.resolve());
    expect(context.markAllNotificationsRead).not.toHaveBeenCalled();
    expect(context.queryClient.getQueryData(context.unreadKey)).toEqual({
      unreadCount: 2,
    });
  });

  it.each(['replaced', 'denied'] as const)(
    'does not invalidate a %s unread Query after older confirmation',
    async (mode) => {
      const context = setup();
      fireEvent.click(context.button());
      await waitFor(() =>
        expect(context.markAllNotificationsRead).toHaveBeenCalledTimes(1),
      );

      const invalidate = vi.spyOn(context.queryClient, 'invalidateQueries');
      if (mode === 'replaced') {
        context.queryClient.removeQueries({
          queryKey: context.unreadKey,
          exact: true,
        });
        context.queryClient.setQueryData(context.unreadKey, {
          unreadCount: 9,
        });
      } else {
        context.queryClient
          .getQueryCache()
          .find({ queryKey: context.unreadKey, exact: true })
          ?.setState({
            error: new ClientProblemError('permission', 403),
            status: 'error',
          });
      }
      await act(async () => context.result.resolve(undefined));
      expect(invalidate).not.toHaveBeenCalled();
      if (mode === 'replaced')
        expect(context.queryClient.getQueryData(context.unreadKey)).toEqual({
          unreadCount: 9,
        });
    },
  );

  it('never updates another Space when the original bulk request settles', async () => {
    const context = setup();
    const otherListKey = notificationsListQueryKey('space-b');
    const otherCountKey = notificationUnreadCountQueryKey('space-b');
    context.queryClient.setQueryData(otherListKey, {
      pages: [{ items: [notification()], nextCursor: null }],
      pageParams: [null],
    });
    context.queryClient.setQueryData(otherCountKey, { unreadCount: 7 });
    fireEvent.click(context.button());
    await waitFor(() =>
      expect(context.markAllNotificationsRead).toHaveBeenCalledTimes(1),
    );
    await act(async () => context.result.resolve(undefined));
    expect(context.queryClient.getQueryData(otherCountKey)).toEqual({
      unreadCount: 7,
    });
    expect(
      context.queryClient.getQueryData<{
        pages: Array<{ items: NotificationItem[] }>;
      }>(otherListKey)?.pages[0].items[0].readAt,
    ).toBeNull();
  });
});
