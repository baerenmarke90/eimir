// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import type { M4ProductApis } from '../client/m4Product';
import { TaskOriginProvider, useTaskOrigin } from '../client/taskOrigin';
import { NotificationsProductPage } from './M4ProductPages';

const SPACE_ID = 'space-1';

function renderNotificationsPage(
  items: unknown[],
  unreadCount = 1,
  currentAccountId = 'user-self',
): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(['m5-s5', 'notifications', SPACE_ID], {
    pages: [
      {
        items,
        nextCursor: null,
      },
    ],
    pageParams: [null],
  });
  queryClient.setQueryData(['m5-s5', 'notification-unread-count', SPACE_ID], {
    unreadCount,
  });

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <NotificationsProductPage
          apis={{ notifications: {} as NotificationsApi } as M4ProductApis}
          spaceId={SPACE_ID}
          currentAccountId={currentAccountId}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Notifications Product Experience', () => {
  it('renders interactive notification card for comment with target, chevron, and no separate open button', () => {
    const html = renderNotificationsPage([
      {
        id: 'notif-1',
        sourceEventId: 'evt-1',
        kind: 'COMMENT_CREATED',
        actorId: 'user-partner',
        actor: {
          id: 'user-partner',
          displayName: 'Alex',
          profileAttachmentId: null,
        },
        targetType: 'PLAN',
        targetId: 'plan-123',
        target: {
          targetType: 'PLAN',
          targetId: 'plan-123',
          title: 'Konzert im Herbst',
        },
        createdAt: new Date('2026-09-03T18:03:00Z'),
        readAt: null,
      },
    ]);

    expect(html).toContain('Alex');
    expect(html).toContain('Konzert im Herbst');
    expect(html).toContain('href="/plan/plans/plan-123"');
    expect(html).toContain('activity-card-chevron');
    expect(html).not.toContain('button-link secondary-link');
    expect(html).not.toContain('>Öffnen<');
  });

  it('renders warm thinking-of-you notification as static card without chevron or fake link', () => {
    const html = renderNotificationsPage([
      {
        id: 'notif-2',
        sourceEventId: 'evt-2',
        kind: 'THINKING_OF_YOU',
        actorId: 'user-partner',
        actor: {
          id: 'user-partner',
          displayName: 'Alex',
          profileAttachmentId: null,
        },
        targetType: null,
        targetId: null,
        target: null,
        createdAt: new Date('2026-09-03T19:00:00Z'),
        readAt: null,
      },
    ]);

    expect(html).toContain('Alex');
    expect(html).toContain('denkt an dich.');
    expect(html).not.toContain('activity-card-chevron');
    expect(html).not.toContain('<a class="m4-notification-link"');
    expect(html).toContain('m4-mark-read-btn');
  });

  it('renders reminder due notification with target and link', () => {
    const html = renderNotificationsPage([
      {
        id: 'notif-3',
        sourceEventId: 'evt-3',
        kind: 'REMINDER_DUE',
        actorId: null,
        actor: null,
        targetType: 'PLAN',
        targetId: 'plan-456',
        target: {
          targetType: 'PLAN',
          targetId: 'plan-456',
          title: 'Zahnarzttermin',
        },
        createdAt: new Date('2026-09-03T08:00:00Z'),
        readAt: new Date('2026-09-03T08:05:00Z'),
      },
    ]);

    expect(html).toContain('Zahnarzttermin');
    expect(html).toContain('href="/plan/plans/plan-456"');
  });

  it('optimistically updates unread count and read state on card click without waiting for API', async () => {
    const markNotificationRead = vi.fn().mockReturnValue(new Promise(() => {})); // pending promise
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['m5-s5', 'notifications', SPACE_ID], {
      pages: [
        {
          items: [
            {
              id: 'notif-opt-1',
              sourceEventId: 'evt-1',
              kind: 'COMMENT_CREATED',
              actorId: 'user-partner',
              actor: {
                id: 'user-partner',
                displayName: 'Alex',
                profileAttachmentId: null,
              },
              targetType: 'PLAN',
              targetId: 'plan-123',
              target: {
                targetType: 'PLAN',
                targetId: 'plan-123',
                title: 'Konzertkarte',
              },
              createdAt: new Date('2026-09-03T18:03:00Z'),
              readAt: null,
            },
          ],
          nextCursor: null,
        },
      ],
      pageParams: [null],
    });
    queryClient.setQueryData(['m5-s5', 'notification-unread-count', SPACE_ID], {
      unreadCount: 3,
    });

    let currentState: unknown = null;
    let originContract!: ReturnType<typeof useTaskOrigin>;
    function LocationProbe() {
      const location = useLocation();
      currentState = location.state;
      return <div data-testid="location-probe">{location.pathname}</div>;
    }
    function OriginProbe() {
      originContract = useTaskOrigin();
      return null;
    }

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/more/notifications']}>
          <TaskOriginProvider accountId="user-self" spaceId={SPACE_ID}>
            <LocationProbe />
            <OriginProbe />
            <Routes>
              <Route
                path="/more/notifications"
                element={
                  <NotificationsProductPage
                    apis={
                      {
                        notifications: {
                          markNotificationRead,
                        } as unknown as NotificationsApi,
                      } as M4ProductApis
                    }
                    spaceId={SPACE_ID}
                    currentAccountId="user-self"
                  />
                }
              />
              <Route
                path="/plan/plans/:planId"
                element={<div data-testid="plan-detail-target">Plan Detail</div>}
              />
            </Routes>
          </TaskOriginProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('location-probe').textContent).toBe(
      '/more/notifications',
    );
    expect(screen.queryByTestId('plan-detail-target')).toBeNull();

    const link = screen.getByRole('link', { name: /Konzertkarte/i });
    fireEvent.click(link);

    // Navigates immediately to expected detail path while markNotificationRead is still pending
    expect(screen.getByTestId('location-probe').textContent).toBe(
      '/plan/plans/plan-123',
    );
    expect(screen.getByTestId('plan-detail-target').textContent).toBe(
      'Plan Detail',
    );
    const taskOriginKey = (
      currentState as { taskOriginKey?: unknown } | null
    )?.taskOriginKey;
    expect(taskOriginKey).toMatch(/^task-/);
    expect(originContract.resolveOrigin(taskOriginKey)?.to).toBe(
      '/more/notifications',
    );

    // Unread count decremented immediately in cache without waiting for API resolution
    await waitFor(() => {
      const unreadData = queryClient.getQueryData<{ unreadCount: number }>([
        'm5-s5',
        'notification-unread-count',
        SPACE_ID,
      ]);
      expect(unreadData?.unreadCount).toBe(2);
    });

    // Item marked as read in cache immediately
    await waitFor(() => {
      const listData = queryClient.getQueryData<{
        pages: Array<{ items: Array<{ id: string; readAt: Date | null }> }>;
      }>(['m5-s5', 'notifications', SPACE_ID]);
      expect(listData?.pages[0].items[0].readAt).not.toBeNull();
    });

    // API was called in background
    expect(markNotificationRead).toHaveBeenCalledWith({
      notificationId: 'notif-opt-1',
      spaceId: SPACE_ID,
    });

    await act(async () => originContract.requestReturn(taskOriginKey));
    expect(screen.getByTestId('location-probe').textContent).toBe(
      '/more/notifications',
    );
  });

  it('does not present a loading unread count as a known zero', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    queryClient.setQueryData(['m5-s5', 'notifications', SPACE_ID], {
      pages: [{ items: [], nextCursor: null }],
      pageParams: [null],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <NotificationsProductPage
            apis={
              {
                notifications: {
                  getNotificationUnreadCount: vi.fn(
                    () => new Promise(() => undefined),
                  ),
                },
              } as unknown as M4ProductApis
            }
            spaceId={SPACE_ID}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText(
        'Ungelesene Benachrichtigungen werden geladen …',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('0 ungelesen')).toBeNull();
    expect(screen.getByText('Keine Benachrichtigungen')).toBeTruthy();
  });

  it('keeps an empty notification list distinct when the unread count fails', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    queryClient.setQueryData(['m5-s5', 'notifications', SPACE_ID], {
      pages: [{ items: [], nextCursor: null }],
      pageParams: [null],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <NotificationsProductPage
            apis={
              {
                notifications: {
                  getNotificationUnreadCount: vi
                    .fn()
                    .mockRejectedValue(new Error('unread unavailable')),
                },
              } as unknown as M4ProductApis
            }
            spaceId={SPACE_ID}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Keine Benachrichtigungen')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('0 ungelesen')).toBeNull());
  });

  it('does not let one failed mark-read roll back a different notification marked read concurrently', async () => {
    function deferred<T>() {
      let resolve!: (value: T) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }

    const pendingA = deferred<void>();
    const pendingB = deferred<void>();
    const markNotificationRead = vi.fn(
      ({ notificationId }: { notificationId: string; spaceId: string }) =>
        notificationId === 'notif-a' ? pendingA.promise : pendingB.promise,
    );
    // Never resolves: keeps the onSettled-triggered refetch from masking the
    // intermediate cache state this test asserts on.
    const getNotifications = vi.fn(() => new Promise(() => undefined));
    const getNotificationUnreadCount = vi.fn(
      () => new Promise(() => undefined),
    );

    function notification(id: string) {
      return {
        id,
        sourceEventId: `evt-${id}`,
        kind: 'THINKING_OF_YOU',
        actorId: 'user-partner',
        actor: null,
        targetType: null,
        targetId: null,
        target: null,
        createdAt: new Date('2026-09-03T18:03:00Z'),
        readAt: null,
      };
    }

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const listKey = ['m5-s5', 'notifications', SPACE_ID];
    const unreadKey = ['m5-s5', 'notification-unread-count', SPACE_ID];
    queryClient.setQueryData(listKey, {
      pages: [
        {
          items: [notification('notif-a'), notification('notif-b')],
          nextCursor: null,
        },
      ],
      pageParams: [null],
    });
    queryClient.setQueryData(unreadKey, { unreadCount: 2 });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <NotificationsProductPage
            apis={
              {
                notifications: {
                  markNotificationRead,
                  getNotifications,
                  getNotificationUnreadCount,
                },
              } as unknown as M4ProductApis
            }
            spaceId={SPACE_ID}
            currentAccountId="user-self"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const markReadButtons = screen.getAllByRole('button', {
      name: 'Als gelesen markieren',
    });
    expect(markReadButtons).toHaveLength(2);

    fireEvent.click(markReadButtons[0]);
    fireEvent.click(markReadButtons[1]);

    await waitFor(() => {
      const unreadData = queryClient.getQueryData<{ unreadCount: number }>(
        unreadKey,
      );
      expect(unreadData?.unreadCount).toBe(0);
    });

    pendingA.reject(new Error('network error marking notif-a as read'));

    await waitFor(() => {
      const unreadData = queryClient.getQueryData<{ unreadCount: number }>(
        unreadKey,
      );
      // notif-a's failure must only undo notif-a's own optimistic delta
      // (unreadCount 0 -> 1), not restore a stale whole-cache snapshot that
      // would also un-read notif-b.
      expect(unreadData?.unreadCount).toBe(1);
    });

    const listData = queryClient.getQueryData<{
      pages: Array<{ items: Array<{ id: string; readAt: Date | null }> }>;
    }>(listKey);
    const itemsById = new Map(
      listData?.pages[0].items.map((item) => [item.id, item]) ?? [],
    );
    expect(itemsById.get('notif-a')?.readAt).toBeNull();
    expect(itemsById.get('notif-b')?.readAt).not.toBeNull();

    pendingB.resolve();
  });
});
