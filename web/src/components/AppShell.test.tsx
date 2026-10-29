// @vitest-environment jsdom
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import navigation from '../i18n/locales/navigation';
import { AppShell } from './AppShell';

/** Opening anchor tags, so attribute order in the markup does not matter. */
function anchorTags(html: string): string[] {
  return html.match(/<a\b[^>]*>/g) ?? [];
}

/** The navigation link for a destination, not the brand link that shares its href. */
function navigationLinkFor(html: string, href: string): string {
  const tag = anchorTags(html).find(
    (candidate) =>
      candidate.includes(`href="${href}"`) &&
      candidate.includes('shell-nav-link'),
  );
  if (!tag) throw new Error(`No navigation link renders href="${href}".`);
  return tag;
}

function renderShell(
  route: string,
  serverAdmin = false,
  unreadCount = 0,
  partners: Array<{ id: string; displayName: string }> = [
    { id: 'account-1', displayName: 'Alex Example' },
    { id: 'partner-1', displayName: 'Sam Example' },
  ],
): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(['profile-identity', 'space-1', 'account-1'], {
    accountId: 'account-1',
    displayName: 'Alex Example',
    profileAttachmentId: null,
    version: 1,
  });
  queryClient.setQueryData(['m5-s5', 'notification-unread-count', 'space-1'], {
    unreadCount,
  });
  queryClient.setQueryData(authorSummaryQueryKeys.space('space-1'), {
    id: 'space-1',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    partners,
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AppShell
          onLogout={() => undefined}
          apiBaseUrl="http://api.example.test"
          accessToken="test-token"
          account={{ id: 'account-1', displayName: 'Alex Example' }}
          spaceId="space-1"
          serverAdmin={serverAdmin}
        >
          <h1>Content fixture</h1>
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AppShell', () => {
  it('renders skip navigation, landmarks and the primary destinations', () => {
    const html = renderShell('/story');

    expect(html).toContain('href="#main-content"');
    expect(html).toContain('id="main-content"');
    expect(html).toContain('<main');
    expect(html).toContain('<nav');
    expect(html).not.toContain('<aside');
    expect(html.indexOf('<nav')).toBeLessThan(html.indexOf('</header>'));
    expect(html).toContain('href="/today"');
    expect(html).toContain(`>${navigation.today}<`);
    expect(html).toContain('href="/story"');
    expect(html).toContain('href="/plan"');
    expect(html).not.toContain('href="/games"');
    expect(html).toContain('href="/more"');
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('/reminders');
    expect(html).not.toContain('/rules');
  });

  it('keeps the landing destination first in primary navigation', () => {
    const html = renderShell('/story');
    const primaryNavigation = html.slice(
      html.indexOf('<nav class="shell-nav"'),
      html.indexOf('</nav>', html.indexOf('<nav class="shell-nav"')),
    );

    expect(primaryNavigation.indexOf('href="/today"')).toBeGreaterThanOrEqual(
      0,
    );
    expect(primaryNavigation.indexOf('href="/today"')).toBeLessThan(
      primaryNavigation.indexOf('href="/story"'),
    );
  });

  it('keeps the retired primary Discover destination out of the shell', () => {
    expect(renderShell('/story')).not.toContain('href="/discover"');
  });

  it('keeps Expanded navigation and creation while utilities live under More', () => {
    const html = renderShell('/story', true);
    const header = html.slice(
      html.indexOf('<header'),
      html.indexOf('</header>'),
    );
    for (const href of ['/today', '/story', '/plan', '/more']) {
      expect(header).toContain(`href="${href}"`);
    }
    expect(header).toContain('shell-primary-action');
    for (const retired of [
      'href="/search"',
      'href="/more/notifications"',
      'header-profile-menu',
      'href="/server-admin"',
      'brand-mark',
    ]) {
      expect(header).not.toContain(retired);
    }
  });

  it('keeps contextual Story return controls separate from mobile global chrome', () => {
    const html = renderShell('/story/memories/memory-1');
    expect(html).toContain('shell-detail-context');
    expect(
      html.match(/class="shell-utility-link shell-detail-back"/g),
    ).toHaveLength(1);
    expect(renderShell('/story')).not.toContain('shell-detail-context');
  });

  it('offers global quick-create triggers for expanded and compact shells', () => {
    const html = renderShell('/story');
    const quickCreateButtons =
      html.match(/<button\b[^>]*quick-create-trigger[^>]*>/g) ?? [];
    const menuIds = quickCreateButtons.map(
      (button) => button.match(/aria-controls="([^"]+)"/)?.[1],
    );

    expect(html.slice(0, html.indexOf('</header>'))).toContain(
      'shell-primary-action',
    );
    expect(html).toContain('mobile-quick-create');
    expect(quickCreateButtons).toHaveLength(2);
    expect(menuIds.every(Boolean)).toBe(true);
    expect(new Set(menuIds).size).toBe(2);
    expect(html).toContain(`>${navigation.newContent}<`);
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');

    const compact = html.slice(html.indexOf('mobile-bottom-nav'));
    for (const path of ['/today', '/story', '/plan', '/more']) {
      expect(compact).toContain(`href="${path}"`);
    }
    expect(compact).not.toContain('href="/games"');
  });

  it('renders a nested Games route through the normal route content seam', () => {
    const html = renderShell('/games/our-moments');

    expect(html).toContain('Content fixture');
    expect(html).not.toContain('games-product-page');
  });

  it.each([
    ['/today', '/today'],
    ['/today/activity', '/today'],
    ['/story', '/story'],
    ['/plan', '/plan'],
    ['/plan/wishes/wish-1', '/plan'],
    ['/games', '/more'],
    ['/games/our-moments', '/more'],
    ['/more', '/more'],
    ['/search', '/more'],
    ['/more/people', '/more'],
    ['/more/profile', '/more'],
    ['/more/settings', '/more'],
    ['/more/private/notes', '/more'],
  ])('marks %s as inside the %s destination', (route, destination) => {
    const html = renderShell(route);
    const active = navigationLinkFor(html, destination);

    expect(active).toContain('aria-current="page"');
    expect(active).toContain('shell-nav-link-active');
  });

  it.each([
    ['/story', '/today'],
    ['/story', '/plan'],
    ['/story', '/more'],
    ['/more/people', '/today'],
    ['/today/activity', '/story'],
  ])('does not mark %s as inside the %s destination', (route, sibling) => {
    const inactive = navigationLinkFor(renderShell(route), sibling);

    expect(inactive).not.toContain('aria-current="page"');
    expect(inactive).not.toContain('shell-nav-link-active');
  });

  it('does not show an unread dot when the authoritative count is zero', () => {
    expect(renderShell('/story', false, 0)).not.toContain('notification-dot');
  });

  it('shows unread state only on More with an accessible count', () => {
    const html = renderShell('/story', false, 3);
    expect(navigationLinkFor(html, '/more')).toContain(
      'aria-label="Mehr, 3 ungelesene Benachrichtigungen"',
    );
    expect(navigationLinkFor(html, '/story')).not.toContain('ungelesen');
    expect(html.match(/class="notification-dot"/g)).toHaveLength(2);
  });

  it('updates More unread state on refocus without visiting the inbox', async () => {
    window.matchMedia =
      window.matchMedia ||
      vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

    let unreadCountResponse = 0;
    let unreadCountCalls = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('/api/v1/spaces/space-1/notifications/unread-count')) {
        unreadCountCalls += 1;
        return Promise.resolve(
          new Response(JSON.stringify({ unreadCount: unreadCountResponse }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 15_000 } },
    });
    queryClient.setQueryData(['profile-identity', 'space-1', 'account-1'], {
      accountId: 'account-1',
      displayName: 'Alex Example',
      profileAttachmentId: null,
      version: 1,
    });
    queryClient.setQueryData(authorSummaryQueryKeys.space('space-1'), {
      id: 'space-1',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      partners: [
        { id: 'account-1', displayName: 'Alex Example' },
        { id: 'partner-1', displayName: 'Sam Example' },
      ],
    });

    const { container, unmount } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/today']}>
          <AppShell
            onLogout={() => undefined}
            apiBaseUrl="http://api.example.test"
            accessToken="test-token"
            account={{ id: 'account-1', displayName: 'Alex Example' }}
            spaceId="space-1"
          >
            <h1>Today Content</h1>
          </AppShell>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // The shell uses one authoritative polling query on all destinations.
    await waitFor(() => {
      expect(unreadCountCalls).toBeGreaterThanOrEqual(1);
    });
    expect(container.querySelector('.notification-dot')).toBeNull();
    let trigger = container.querySelector('.mobile-bottom-nav a[href="/more"]');
    expect(trigger?.getAttribute('aria-label')).toBeNull();

    const initialCalls = unreadCountCalls;

    // Server receives unread notification while user stays on /today.
    // On next poll/refocus (simulating window focus / tab switch back to app):
    unreadCountResponse = 1;
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    // API is queried again and dot appears dynamically
    await waitFor(() => {
      expect(unreadCountCalls).toBeGreaterThan(initialCalls);
    });
    await waitFor(() => {
      expect(container.querySelector('.notification-dot')).not.toBeNull();
    });
    trigger = container.querySelector('.mobile-bottom-nav a[href="/more"]');
    expect(trigger?.getAttribute('aria-label')).toContain('1 ungelesen');

    const secondCalls = unreadCountCalls;

    // Server unread count returns to 0 on next refocus/poll
    unreadCountResponse = 0;
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() => {
      expect(unreadCountCalls).toBeGreaterThan(secondCalls);
    });
    await waitFor(() => {
      expect(container.querySelector('.notification-dot')).toBeNull();
    });
    trigger = container.querySelector('.mobile-bottom-nav a[href="/more"]');
    expect(trigger?.getAttribute('aria-label')).toBeNull();
    unmount();
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it('integrates Quick Create into floating bottom shell with four primary destinations (#882/#905)', () => {
    const html = renderShell('/today');
    const shellIndex = html.indexOf('mobile-bottom-shell');
    expect(shellIndex).toBeGreaterThanOrEqual(0);
    const bottomShell = html.slice(shellIndex);

    // Navigation landmark has exactly the 4 primary product destinations.
    const navMatch = bottomShell.match(
      /<nav\b[^>]*class="mobile-bottom-nav"[^>]*>([\s\S]*?)<\/nav>/,
    );
    expect(navMatch).not.toBeNull();
    const navContent = navMatch?.[1] ?? '';

    const navLinks =
      navContent.match(/<a\b[^>]*class="shell-nav-link[^"]*"[^>]*>/g) ?? [];
    expect(navLinks).toHaveLength(4);

    expect(navContent).toContain('href="/today"');
    expect(navContent).toContain(`>${navigation.today}<`);
    expect(navContent).toContain('href="/story"');
    expect(navContent).toContain(`>${navigation.story}<`);
    expect(navContent).toContain('href="/plan"');
    expect(navContent).toContain(`>${navigation.plan}<`);
    expect(navContent).not.toContain('href="/games"');
    expect(navContent).toContain('href="/more"');
    expect(navContent).toContain(`>${navigation.more}<`);

    // Quick Create is a button action sibling inside the bottom shell, not a nav link.
    expect(navContent).not.toContain('quick-create-trigger');

    const quickCreateSlot = bottomShell.slice(
      bottomShell.indexOf('mobile-quick-create'),
    );
    expect(quickCreateSlot).toContain('<button');
    expect(quickCreateSlot).toContain('quick-create-trigger');
    expect(quickCreateSlot).toContain(`aria-label="${navigation.newContent}"`);
    expect(quickCreateSlot).toContain('aria-haspopup="dialog"');

    // No standalone FAB outside the mobile-bottom-shell.
    const htmlBeforeShell = html.slice(0, shellIndex);
    expect(htmlBeforeShell).not.toContain('mobile-quick-create');
  });

  it('keeps focused create tasks free of normal shell navigation', () => {
    for (const path of [
      '/story/memories/new',
      '/plan/plans/new',
      '/plan/wishes/new',
    ]) {
      const html = renderShell(path);
      expect(html).not.toContain('product-topbar');
      expect(html).not.toContain('mobile-bottom-shell');
    }
  });

  it('renders persistent bottom navigation without scroll-state attributes on main surfaces', () => {
    for (const path of ['/today', '/story', '/plan', '/more']) {
      const html = renderShell(path);
      expect(html).toContain('class="mobile-bottom-shell"');
      expect(html).not.toContain('data-hidden=');
    }
  });

  it('marks only Today for the shared header and hero surface', () => {
    expect(renderShell('/today')).toContain('data-top-surface="today"');

    for (const path of ['/story', '/plan', '/more']) {
      expect(renderShell(path)).not.toContain('data-top-surface="today"');
    }
  });
});
