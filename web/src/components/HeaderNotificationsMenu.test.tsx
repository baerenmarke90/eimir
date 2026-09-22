// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationItem } from '../api/generated/models/NotificationItem';
import {
  notificationUnreadCountQueryKey,
  notificationsListQueryKey,
} from '../client/notificationQueries';
import m5s5 from '../i18n/locales/m5s5';
import navigation from '../i18n/locales/navigation';
import { HeaderNotificationsMenu } from './HeaderNotificationsMenu';

function fireReactAnimationEnd(element: Element): void {
  fireEvent.animationEnd(element);
  if (element.isConnected) {
    fireEvent(element, new Event('webkitAnimationEnd', { bubbles: true }));
  }
}

function mockMatchMedia({
  compact,
  reducedMotion,
}: {
  compact: boolean;
  reducedMotion: boolean;
}): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches:
      query === '(max-width: 640px)'
        ? compact
        : query === '(prefers-reduced-motion: reduce)'
          ? reducedMotion
          : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function mockResponsiveMatchMedia({
  compact,
  reducedMotion,
}: {
  compact: boolean;
  reducedMotion: boolean;
}): { setCompact: (matches: boolean) => void } {
  let compactMatches = compact;
  const compactListeners = new Set<(event: MediaQueryListEvent) => void>();

  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    const isCompactQuery = query === '(max-width: 640px)';
    const mediaQuery = {
      get matches() {
        if (isCompactQuery) return compactMatches;
        if (query === '(prefers-reduced-motion: reduce)') return reducedMotion;
        return false;
      },
      media: query,
      onchange: null,
      addListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => {
        if (isCompactQuery) compactListeners.add(listener);
      }),
      removeListener: vi.fn(
        (listener: (event: MediaQueryListEvent) => void) => {
          if (isCompactQuery) compactListeners.delete(listener);
        },
      ),
      addEventListener: vi.fn(
        (
          type: string,
          listener: (event: MediaQueryListEvent) => void,
        ) => {
          if (isCompactQuery && type === 'change') {
            compactListeners.add(listener);
          }
        },
      ),
      removeEventListener: vi.fn(
        (
          type: string,
          listener: (event: MediaQueryListEvent) => void,
        ) => {
          if (isCompactQuery && type === 'change') {
            compactListeners.delete(listener);
          }
        },
      ),
      dispatchEvent: vi.fn(),
    };

    return mediaQuery;
  });

  return {
    setCompact(matches: boolean) {
      compactMatches = matches;
      const event = {
        matches,
        media: '(max-width: 640px)',
      } as MediaQueryListEvent;
      act(() => {
        for (const listener of compactListeners) listener(event);
      });
    },
  };
}

function LocationTracker({
  onLocation,
}: {
  onLocation: (loc: string) => void;
}) {
  const loc = useLocation();
  onLocation(loc.pathname);
  return null;
}

function createSampleNotification(
  overrides: Partial<NotificationItem> = {},
): NotificationItem {
  return {
    id: 'notif-1',
    actorId: 'account-partner',
    actor: { id: 'account-partner', displayName: 'Alex Partner' },
    kind: 'COMMENT_CREATED',
    targetType: 'PLAN',
    targetId: 'plan-123',
    target: { targetId: 'plan-123', targetType: 'PLAN', title: 'Summer Trip' },
    sourceEventId: 'event-1',
    readAt: null,
    createdAt: new Date('2026-09-04T09:00:00Z'),
    ...overrides,
  };
}

function renderNotificationMenu({
  unreadCount = 1,
  items = [createSampleNotification()],
}: {
  unreadCount?: number;
  items?: NotificationItem[];
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const spaceId = 'space-1';
  queryClient.setQueryData(notificationUnreadCountQueryKey(spaceId), {
    unreadCount,
  });
  queryClient.setQueryData(notificationsListQueryKey(spaceId), {
    pages: [{ items, nextCursor: null }],
    pageParams: [null],
  });

  let currentLocation = '/today';

  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/today']}>
        <div>
          <LocationTracker
            onLocation={(loc) => {
              currentLocation = loc;
            }}
          />
          <button type="button" data-testid="outside-target">
            Outside Element
          </button>
          <HeaderNotificationsMenu
            apiBaseUrl="http://api.example.test"
            accessToken="test-token"
            spaceId={spaceId}
            unreadCount={unreadCount}
            currentAccountId="account-user"
          />
        </div>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return {
    ...result,
    queryClient,
    getLocation: () => currentLocation,
  };
}

describe('HeaderNotificationsMenu', () => {
  it('renders unread indicator dot and aria-label when unreadCount > 0', () => {
    renderNotificationMenu({ unreadCount: 2 });
    const trigger = screen.getByRole('button', {
      name: /2 ungelesen/i,
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.querySelector('.notification-dot')).not.toBeNull();
  });

  it('opens preview on bell click without mounting full notifications page', () => {
    renderNotificationMenu({ unreadCount: 1 });
    const trigger = screen.getByRole('button', {
      name: /1 ungelesen/i,
    });

    act(() => {
      fireEvent.click(trigger);
    });

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(m5s5.notifications.previewTitle)).toBeDefined();
    // Verify preview contains the notification item
    expect(screen.getByText(/Alex Partner/)).toBeDefined();
  });

  it('clicking a target notification triggers optimistic read, updates count, navigates, and closes popover', async () => {
    const { queryClient, getLocation } = renderNotificationMenu({
      unreadCount: 1,
      items: [
        createSampleNotification({
          id: 'notif-1',
          readAt: null,
          targetType: 'PLAN',
          targetId: 'plan-123',
        }),
      ],
    });

    const trigger = screen.getByRole('button', { name: /1 ungelesen/i });
    act(() => {
      fireEvent.click(trigger);
    });

    const notifButton = screen.getByRole('button', { name: /Alex Partner/i });
    act(() => {
      fireEvent.click(notifButton);
    });

    // Popover closed
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    // Navigated to plan target
    expect(getLocation()).toBe('/plan/plans/plan-123');

    // Optimistic unread count decremented
    const unreadData = queryClient.getQueryData<{ unreadCount: number }>(
      notificationUnreadCountQueryKey('space-1'),
    );
    expect(unreadData?.unreadCount).toBe(0);

    // Optimistic item readAt set
    const listData = queryClient.getQueryData<{
      pages: Array<{ items: NotificationItem[] }>;
    }>(notificationsListQueryKey('space-1'));
    expect(listData?.pages[0]?.items[0]?.readAt).not.toBeNull();
  });

  it('clicking "Alle Benachrichtigungen anzeigen" navigates to /more/notifications and closes', () => {
    renderNotificationMenu({ unreadCount: 0 });
    const trigger = screen.getByRole('button', {
      name: navigation.notifications,
    });

    act(() => {
      fireEvent.click(trigger);
    });

    const allLink = screen.getByRole('link', {
      name: m5s5.notifications.showAll,
    });
    expect(allLink.getAttribute('href')).toBe('/more/notifications');

    act(() => {
      fireEvent.click(allLink);
    });

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('dismisses on outside pointerdown but stays open on inside click', () => {
    renderNotificationMenu({ unreadCount: 0 });
    const trigger = screen.getByRole('button', {
      name: navigation.notifications,
    });
    const outside = screen.getByTestId('outside-target');

    act(() => {
      fireEvent.click(trigger);
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    // Inside panel click
    const panel = screen.getByRole('region', {
      name: m5s5.notifications.previewTitle,
    });
    act(() => {
      fireEvent.pointerDown(panel);
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    // Outside click
    act(() => {
      fireEvent.pointerDown(outside);
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('dismisses on Escape key and restores focus to bell trigger', () => {
    renderNotificationMenu({ unreadCount: 0 });
    const trigger = screen.getByRole('button', {
      name: navigation.notifications,
    });

    act(() => {
      fireEvent.click(trigger);
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('renders empty state when there are no notifications', () => {
    renderNotificationMenu({ unreadCount: 0, items: [] });
    const trigger = screen.getByRole('button', {
      name: navigation.notifications,
    });

    act(() => {
      fireEvent.click(trigger);
    });

    expect(screen.getByText(m5s5.notifications.emptyPreview)).toBeDefined();
  });

  it('renders anchored popover inside header container on desktop viewports', () => {
    renderNotificationMenu({ unreadCount: 1 });
    const trigger = screen.getByRole('button', { name: /1 ungelesen/i });

    act(() => {
      fireEvent.click(trigger);
    });

    // On desktop, popover is rendered directly inside the header menu container
    const menuContainer = trigger.closest('.header-notifications-menu');
    expect(menuContainer).not.toBeNull();
    const popover = menuContainer?.querySelector(
      '.header-notifications-popover',
    );
    expect(popover).not.toBeNull();
    expect(
      popover?.classList.contains('header-notifications-bottom-sheet'),
    ).toBe(false);

    // No portal rendered into document.body
    expect(
      document.body.querySelector('.header-notifications-portal'),
    ).toBeNull();
  });

  describe('compact / mobile viewport bottom sheet', () => {
    const originalMatchMedia = window.matchMedia;

    beforeEach(() => {
      // Reduced motion by default: presence ends synchronously (no retained
      // exit phase), matching the contract's immediate-close requirement.
      // Individual tests override to `reducedMotion: false` to exercise the
      // animated exit lifecycle explicitly.
      mockMatchMedia({ compact: true, reducedMotion: true });
    });

    afterEach(() => {
      window.matchMedia = originalMatchMedia;
      document.body.style.overflow = '';
    });

    function openSheet(unreadCount = 1) {
      const result = renderNotificationMenu({ unreadCount });
      const trigger = screen.getByRole('button', {
        name: new RegExp(`${unreadCount} ungelesen`, 'i'),
      });
      act(() => {
        fireEvent.click(trigger);
      });
      return { ...result, trigger };
    }

    it('renders viewport-level bottom sheet into document.body and locks body scroll', () => {
      document.body.style.overflow = 'auto';
      const { trigger } = openSheet();

      expect(trigger.getAttribute('aria-expanded')).toBe('true');

      // Portalled into document.body
      const portal = document.body.querySelector(
        '.header-notifications-portal',
      );
      expect(portal).not.toBeNull();

      // Portal container has dialog accessibility role and open presence
      expect(portal?.getAttribute('role')).toBe('dialog');
      expect(portal?.getAttribute('aria-modal')).toBe('true');
      expect(portal?.getAttribute('data-presence')).toBe('open');

      // Sheet has bottom sheet class
      const sheet = portal?.querySelector('.header-notifications-bottom-sheet');
      expect(sheet).not.toBeNull();

      // Body scroll is locked
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('reduced motion closes the backdrop-dismissed sheet immediately, with no retained exit phase', async () => {
      document.body.style.overflow = 'auto';
      const { trigger } = openSheet();
      const portal = document.body.querySelector(
        '.header-notifications-portal',
      ) as HTMLElement;
      const backdrop = portal.querySelector('.header-notifications-backdrop');
      expect(backdrop).not.toBeNull();

      act(() => {
        fireEvent.click(backdrop as HTMLElement);
      });

      // No animationend is fired here: reduced motion must not wait for one.
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      await waitFor(() =>
        expect(
          document.body.querySelector('.header-notifications-portal'),
        ).toBeNull(),
      );
      expect(document.body.style.overflow).toBe('auto');
      await waitFor(() => expect(document.activeElement).toBe(trigger));
    });

    it('keeps the sheet and backdrop present through an animated backdrop-close and completes only after the exit signal', async () => {
      mockMatchMedia({ compact: true, reducedMotion: false });
      document.body.style.overflow = 'auto';
      const { trigger } = openSheet();
      const portal = document.body.querySelector(
        '.header-notifications-portal',
      ) as HTMLElement;
      const sheet = portal.querySelector(
        '.header-notifications-bottom-sheet',
      ) as HTMLElement;
      const backdrop = portal.querySelector(
        '.header-notifications-backdrop',
      ) as HTMLElement;

      act(() => {
        fireEvent.click(backdrop);
      });

      // Authoritative state closes immediately...
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      // ...but presentation, modality and scroll lock are retained while
      // backdrop and surface share the visible exit.
      await waitFor(() =>
        expect(portal.getAttribute('data-presence')).toBe('exiting'),
      );
      expect(document.body.contains(portal)).toBe(true);
      expect(document.body.style.overflow).toBe('hidden');
      expect(document.activeElement).not.toBe(trigger);

      fireReactAnimationEnd(sheet);

      await waitFor(() =>
        expect(
          document.body.querySelector('.header-notifications-portal'),
        ).toBeNull(),
      );
      expect(document.body.style.overflow).toBe('auto');
      await waitFor(() => expect(document.activeElement).toBe(trigger));
    });

    it('ignores a stale exit completion after a rapid close/reopen', async () => {
      mockMatchMedia({ compact: true, reducedMotion: false });
      const { trigger } = openSheet();
      const portal = document.body.querySelector(
        '.header-notifications-portal',
      ) as HTMLElement;
      const sheet = portal.querySelector(
        '.header-notifications-bottom-sheet',
      ) as HTMLElement;
      const backdrop = portal.querySelector(
        '.header-notifications-backdrop',
      ) as HTMLElement;

      act(() => {
        fireEvent.click(backdrop);
      });
      await waitFor(() =>
        expect(portal.getAttribute('data-presence')).toBe('exiting'),
      );

      // Reopen before the exit animation ever completes.
      act(() => {
        fireEvent.click(trigger);
      });
      await waitFor(() =>
        expect(portal.getAttribute('data-presence')).toBe('open'),
      );

      // The stale signal from the interrupted exit must not tear down the
      // now-reopened sheet.
      fireReactAnimationEnd(sheet);
      expect(document.body.contains(portal)).toBe(true);
      expect(document.body.style.overflow).toBe('hidden');

      // A real close from here still completes normally.
      act(() => {
        fireEvent.click(backdrop);
      });
      await waitFor(() =>
        expect(portal.getAttribute('data-presence')).toBe('exiting'),
      );
      fireReactAnimationEnd(sheet);
      await waitFor(() =>
        expect(
          document.body.querySelector('.header-notifications-portal'),
        ).toBeNull(),
      );
    });

    it('keeps compact exit motion alive across a resize into Expanded before handing off to the desktop popover', async () => {
      const responsiveMedia = mockResponsiveMatchMedia({
        compact: true,
        reducedMotion: false,
      });
      const { trigger } = openSheet();
      const portal = document.body.querySelector(
        '.header-notifications-portal',
      ) as HTMLElement;
      const sheet = portal.querySelector(
        '.header-notifications-bottom-sheet',
      ) as HTMLElement;

      responsiveMedia.setCompact(false);

      await waitFor(() =>
        expect(portal.getAttribute('data-presence')).toBe('exiting'),
      );
      expect(sheet.classList.contains('header-notifications-bottom-sheet')).toBe(
        true,
      );
      expect(document.body.contains(portal)).toBe(true);

      fireReactAnimationEnd(sheet);

      await waitFor(() =>
        expect(
          document.body.querySelector('.header-notifications-portal'),
        ).toBeNull(),
      );
      expect(trigger.getAttribute('aria-expanded')).toBe('true');

      const desktopPopover = document.querySelector(
        '.header-notifications-popover',
      ) as HTMLElement;
      expect(desktopPopover).not.toBeNull();
      expect(
        desktopPopover.classList.contains('header-notifications-bottom-sheet'),
      ).toBe(false);
    });

    it('moves focus into the modal sheet and contains Tab navigation', () => {
      openSheet();

      const portal = screen.getByRole('dialog', {
        name: m5s5.notifications.previewTitle,
      });
      const notification = screen.getByRole('button', {
        name: /Alex Partner/i,
      });
      const allLink = screen.getByRole('link', {
        name: m5s5.notifications.showAll,
      });

      expect(document.activeElement).toBe(portal);

      act(() => {
        fireEvent.keyDown(portal, { key: 'Tab' });
      });
      expect(document.activeElement).toBe(notification);

      act(() => {
        fireEvent.keyDown(notification, { key: 'Tab', shiftKey: true });
      });
      expect(document.activeElement).toBe(allLink);

      act(() => {
        fireEvent.keyDown(allLink, { key: 'Tab' });
      });
      expect(document.activeElement).toBe(notification);
    });

    it('mobile bottom sheet dismisses on Escape and restores body scroll and focus once presence ends', async () => {
      document.body.style.overflow = 'visible';
      const { trigger } = openSheet();

      expect(document.body.style.overflow).toBe('hidden');

      act(() => {
        fireEvent.keyDown(window, { key: 'Escape' });
      });

      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      // Escape does not restore focus itself for the compact modal sheet;
      // that stays owned by the shared modal-lifecycle contract so focus
      // never jumps to the trigger while an exit is still visible.
      await waitFor(() =>
        expect(
          document.body.querySelector('.header-notifications-portal'),
        ).toBeNull(),
      );
      expect(document.body.style.overflow).toBe('visible');
      await waitFor(() => expect(document.activeElement).toBe(trigger));
    });

    it('clicking a notification navigates without restoring focus to the trigger once presence ends', async () => {
      document.body.style.overflow = '';
      const { getLocation } = renderNotificationMenu({
        unreadCount: 1,
        items: [
          createSampleNotification({
            id: 'notif-mobile-1',
            targetType: 'PLAN',
            targetId: 'plan-mobile-456',
          }),
        ],
      });

      const trigger = screen.getByRole('button', { name: /1 ungelesen/i });
      act(() => {
        fireEvent.click(trigger);
      });

      expect(document.body.style.overflow).toBe('hidden');

      const notifItem = screen.getByRole('button', { name: /Alex Partner/i });
      act(() => {
        fireEvent.click(notifItem);
      });

      await waitFor(() =>
        expect(getLocation()).toBe('/plan/plans/plan-mobile-456'),
      );
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      await waitFor(() =>
        expect(
          document.body.querySelector('.header-notifications-portal'),
        ).toBeNull(),
      );
      expect(document.body.style.overflow).toBe('');
      expect(document.activeElement).not.toBe(trigger);
    });

    it('does not hand off focus to the destination while the sheet is still visibly exiting', async () => {
      mockMatchMedia({ compact: true, reducedMotion: false });
      const { getLocation } = renderNotificationMenu({
        unreadCount: 1,
        items: [
          createSampleNotification({
            id: 'notif-mobile-2',
            targetType: 'PLAN',
            targetId: 'plan-mobile-789',
          }),
        ],
      });

      const trigger = screen.getByRole('button', { name: /1 ungelesen/i });
      act(() => {
        fireEvent.click(trigger);
      });

      const portal = document.body.querySelector(
        '.header-notifications-portal',
      ) as HTMLElement;
      const sheet = portal.querySelector(
        '.header-notifications-bottom-sheet',
      ) as HTMLElement;

      const notifItem = screen.getByRole('button', { name: /Alex Partner/i });
      act(() => {
        fireEvent.click(notifItem);
      });

      // Authoritative close/read-state happen immediately, but navigation is
      // held back while the sheet is still visibly present/exiting.
      await waitFor(() =>
        expect(portal.getAttribute('data-presence')).toBe('exiting'),
      );
      expect(getLocation()).toBe('/today');
      expect(document.body.contains(portal)).toBe(true);

      fireReactAnimationEnd(sheet);

      await waitFor(() =>
        expect(getLocation()).toBe('/plan/plans/plan-mobile-789'),
      );
      await waitFor(() =>
        expect(
          document.body.querySelector('.header-notifications-portal'),
        ).toBeNull(),
      );
    });

    it('"Alle Benachrichtigungen anzeigen" navigates only after the compact sheet has fully exited', async () => {
      mockMatchMedia({ compact: true, reducedMotion: false });
      const { getLocation } = renderNotificationMenu({ unreadCount: 0 });

      const trigger = screen.getByRole('button', {
        name: navigation.notifications,
      });
      act(() => {
        fireEvent.click(trigger);
      });

      const portal = document.body.querySelector(
        '.header-notifications-portal',
      ) as HTMLElement;
      const sheet = portal.querySelector(
        '.header-notifications-bottom-sheet',
      ) as HTMLElement;
      const allLink = screen.getByRole('link', {
        name: m5s5.notifications.showAll,
      });

      act(() => {
        fireEvent.click(allLink);
      });

      await waitFor(() =>
        expect(portal.getAttribute('data-presence')).toBe('exiting'),
      );
      expect(getLocation()).toBe('/today');

      fireReactAnimationEnd(sheet);

      await waitFor(() => expect(getLocation()).toBe('/more/notifications'));
      await waitFor(() =>
        expect(
          document.body.querySelector('.header-notifications-portal'),
        ).toBeNull(),
      );
    });
  });
});
