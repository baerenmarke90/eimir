// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import type { DashboardItem } from '../api/generated/models/DashboardItem';
import type { WirNotice } from '../api/generated/models/WirNotice';
import { notificationUnreadCountQueryKey } from '../client/notificationQueries';
import { MORE_NOTIFICATIONS_ROUTE } from '../client/routes';
import { i18n } from '../i18n';
import { WirNewForYouModule } from './WirNewForYouModule';

const SPACE = 'space';
const ME = 'me';
const PARTNER = 'partner';
const CREATED = new Date('2026-11-27T08:00:00Z');

function notice(
  overrides: Partial<WirNotice> & Pick<WirNotice, 'id' | 'kind'>,
): WirNotice {
  return {
    sourceEventId: `event-${overrides.id}`,
    actorId: PARTNER,
    targetType: null,
    targetId: null,
    createdAt: CREATED,
    readAt: null,
    ...overrides,
  } as WirNotice;
}

function renderModule({
  items = [],
  upcoming = [],
  visible = true,
}: {
  items?: WirNotice[];
  upcoming?: DashboardItem[];
  visible?: boolean;
} = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // The server forgets a notice once it is read, like the real read.
  const read = new Set<string>();
  const getWirNotices = vi.fn(async () => ({
    items: items.filter((item) => !read.has(item.id)),
  }));
  const markNotificationRead = vi.fn(
    async ({ notificationId }: { notificationId: string }) => {
      read.add(notificationId);
      return {};
    },
  );
  const getNotificationUnreadCount = vi.fn(async () => ({
    unreadCount: items.filter((item) => !read.has(item.id)).length,
  }));
  const api = {
    getWirNotices,
    markNotificationRead,
    getNotificationUnreadCount,
  } as unknown as Pick<
    NotificationsApi,
    'getWirNotices' | 'markNotificationRead' | 'getNotificationUnreadCount'
  >;
  const result = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <WirNewForYouModule
          notificationsApi={api}
          accountId={ME}
          spaceId={SPACE}
          upcoming={upcoming}
          viewerLocalDate={new Date('2026-11-27T00:00:00Z')}
          visible={visible}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return {
    ...result,
    client,
    getWirNotices,
    markNotificationRead,
    getNotificationUnreadCount,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('WirNewForYouModule (#2345 B)', () => {
  it('renders nothing and reads nothing while hidden in Settings', async () => {
    const { container, getWirNotices } = renderModule({ visible: false });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getWirNotices).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe('');
  });

  it('stays away and asks for no tiles while nothing is unread or planned today', async () => {
    const { container, getWirNotices, getNotificationUnreadCount } =
      renderModule();
    await waitFor(() =>
      expect(getNotificationUnreadCount).toHaveBeenCalledTimes(1),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getWirNotices).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe('');
  });

  it('puts today first, then the newest notice, as a swipeable Wir track', async () => {
    renderModule({
      upcoming: [
        {
          type: 'PLAN',
          id: 'plan-1',
          titleOrText: 'Dinner with Lena',
          occurredOn: null,
          scheduledOn: new Date('2026-11-27T00:00:00Z'),
          scheduledAt: null,
          createdAt: null,
        } as DashboardItem,
      ],
      items: [
        notice({
          id: 'n-list',
          kind: 'COLLECTION_SENT',
          targetType: 'COLLECTION',
          targetId: 'list-1',
          target: {
            targetType: 'COLLECTION',
            targetId: 'list-1',
            title: 'Groceries',
          },
          preview: { items: ['Strawberries', 'Baguette'], moreItems: 5 },
        }),
      ],
    });
    await screen.findByText('Groceries');
    const section = await screen.findByRole('region', {
      name: i18n.t('wirNotices.title'),
    });
    const tiles = [...section.querySelectorAll('li')];
    expect(section.querySelector('ul')?.className).toContain('wir-lists-row');
    expect(tiles[0].textContent).toContain('Dinner with Lena');
    expect(tiles[0].textContent).toContain(i18n.t('wirNotices.lines.allDay'));
    expect(tiles[1].textContent).toContain('Groceries');
    expect(tiles[1].textContent).toContain('Strawberries');
    expect(tiles[1].textContent).toContain(
      i18n.t('wirNotices.lines.moreItems', { count: 5 }),
    );
    // The last tile leads to every notification.
    expect(tiles.at(-1)?.querySelector('a')?.getAttribute('href')).toBe(
      MORE_NOTIFICATIONS_ROUTE,
    );
    // Lines never name the partner.
    expect(section.textContent).not.toContain('{{name}}');
  });

  it('folds comments and reactions into one tile and reads all of them when opened', async () => {
    const { client, markNotificationRead } = renderModule({
      items: [
        notice({
          id: 'n-comment',
          kind: 'COMMENT_CREATED',
          targetType: 'MEMORY',
          targetId: 'memory-1',
          target: {
            targetType: 'MEMORY',
            targetId: 'memory-1',
            title: 'Sunday by the sea',
          },
          preview: {
            text: 'I want to go back there.',
            items: [],
            moreItems: 0,
          },
        }),
        notice({
          id: 'n-reaction',
          kind: 'PHOTO_REACTION',
          targetType: 'MEMORY',
          targetId: 'memory-2',
          preview: { reaction: 'LOVE', items: [], moreItems: 0 },
        }),
      ],
    });
    client.setQueryData(notificationUnreadCountQueryKey(SPACE), {
      unreadCount: 2,
    });
    const quote = await screen.findByText('I want to go back there.');
    const tile = quote.closest('a');
    expect(tile?.textContent).toContain(
      i18n.t('wirNotices.lines.more', { count: 1 }),
    );
    if (!tile) throw new Error('missing tile');
    fireEvent.click(tile);

    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledTimes(2));
    expect(markNotificationRead).toHaveBeenCalledWith({
      spaceId: SPACE,
      notificationId: 'n-comment',
    });
    expect(markNotificationRead).toHaveBeenCalledWith({
      spaceId: SPACE,
      notificationId: 'n-reaction',
    });
    await waitFor(() =>
      expect(screen.queryByText('I want to go back there.')).toBeNull(),
    );
  });

  it('lets a card arrive once per device and never again on return', async () => {
    const items = [notice({ id: 'n-heart', kind: 'HEART_HUNT_FOUND' })];
    const first = renderModule({ items });
    const heart = await screen.findByText(i18n.t('wirNotices.titles.heart'));
    expect(heart.closest('li')?.className).toContain('wir-card-arrive');
    first.unmount();

    renderModule({ items });
    const again = await screen.findByText(i18n.t('wirNotices.titles.heart'));
    expect(again.closest('li')?.className).not.toContain('wir-card-arrive');
  });
});
