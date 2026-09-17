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
import { personInitials } from './PersonIdentity';

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

  it('offers Search and Notifications as icon utilities rather than destinations', () => {
    const html = renderShell('/story');
    const header = html.slice(
      html.indexOf('<header'),
      html.indexOf('</header>') + '</header>'.length,
    );

    expect(header).toContain('href="/search"');
    expect(header).toContain(`aria-label="${navigation.search}"`);
    expect(header).toContain('href="/more/notifications"');
    expect(header).toContain(`aria-label="${navigation.notifications}"`);
    expect(header).not.toContain('theme-preference');

    const compact = html.slice(html.indexOf('mobile-bottom-nav'));
    expect(compact).not.toContain('href="/search"');
    expect(compact).not.toContain('href="/more/notifications"');
    const primaryNavigation = html.slice(
      html.indexOf('<nav class="shell-nav"'),
      html.indexOf('</nav>', html.indexOf('<nav class="shell-nav"')),
    );
    expect(primaryNavigation).not.toContain('href="/search"');
    expect(primaryNavigation).not.toContain('href="/more/notifications"');
  });

  it('keeps Profile, Settings and Activity in the account tree rather than primary navigation', () => {
    const html = renderShell('/story');
    const header = html.slice(
      html.indexOf('<header'),
      html.indexOf('</header>') + '</header>'.length,
    );
    const primaryNavigation = html.slice(
      html.indexOf('<nav class="shell-nav"'),
      html.indexOf('</nav>', html.indexOf('<nav class="shell-nav"')),
    );

    expect(header).toContain(`aria-label="${navigation.profileMenu}"`);
    expect(header).toContain('href="/more/profile"');
    expect(header).toContain('href="/more/settings"');
    expect(header).toContain('href="/today/activity"');
    expect(header).toContain('header-profile-menu-logout');
    expect(primaryNavigation).not.toContain('href="/more/profile"');
    expect(primaryNavigation).not.toContain('href="/more/settings"');
    expect(primaryNavigation).not.toContain('href="/today/activity"');
  });

  it('shows ServerAdmin only for an authorized account capability', () => {
    expect(renderShell('/story')).not.toContain('href="/server-admin"');

    const authorized = renderShell('/story', true);
    const header = authorized.slice(
      authorized.indexOf('<header'),
      authorized.indexOf('</header>') + '</header>'.length,
    );
    expect(header).toContain('href="/server-admin"');
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

  it('renders standard bell label and no dot when unread count is zero', () => {
    const html = renderShell('/story', false, 0);

    expect(html).toContain(`aria-label="${navigation.notifications}"`);
    expect(html).not.toContain('notification-dot');
  });

  it('renders unread count accessibility label and visual dot when unread count > 0', () => {
    const html = renderShell('/story', false, 3);

    expect(html).toContain('aria-label="Benachrichtigungen, 3 ungelesen"');
    expect(html).toContain(
      '<span class="notification-dot" aria-hidden="true"></span>',
    );
  });

  it('renders "Unsere Aktivitäten" in header profile menu', () => {
    const html = renderShell('/story');

    expect(html).toContain('Unsere Aktivitäten');
  });

  it('shows only the current user profile identity in the global header, never the partner (regression #790/#791)', () => {
    const html = renderShell('/story');
    const header = html.slice(
      html.indexOf('<header'),
      html.indexOf('</header>') + '</header>'.length,
    );

    // The global header carries no partner-presence signal at all: no
    // dedicated markup, and the partner's name/initials never appear.
    expect(header).not.toContain('header-couple-presence');
    expect(header).toContain('header-profile-menu');
    expect(header).not.toContain('Sam Example');
    expect(header).not.toContain(personInitials('Sam Example'));
  });

  it('updates unread bell dot and label dynamically on /today without visiting notifications or clicking bell', async () => {
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

    const { container } = render(
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

    // Initial state on /today: API returns 0, no notification dot
    await waitFor(() => {
      expect(unreadCountCalls).toBeGreaterThanOrEqual(1);
    });
    expect(container.querySelector('.notification-dot')).toBeNull();
    let trigger = container.querySelector('.header-notifications-trigger');
    expect(trigger?.getAttribute('aria-label')).toBe(navigation.notifications);

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
    trigger = container.querySelector('.header-notifications-trigger');
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
    trigger = container.querySelector('.header-notifications-trigger');
    expect(trigger?.getAttribute('aria-label')).toBe(navigation.notifications);
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

  it('sets data-hidden="false" initially on /today, /plan, and /story (#970)', () => {
    const todayHtml = renderShell('/today');
    expect(todayHtml).toContain(
      'class="mobile-bottom-shell" data-hidden="false"',
    );

    const planHtml = renderShell('/plan');
    expect(planHtml).toContain(
      'class="mobile-bottom-shell" data-hidden="false"',
    );

    const storyHtml = renderShell('/story');
    expect(storyHtml).toContain(
      'class="mobile-bottom-shell" data-hidden="false"',
    );
  });

  it('keeps floating bottom shell persistent on /today and /plan even when scrolled (#970)', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(authorSummaryQueryKeys.space('space-1'), {
      id: 'space-1',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      partners: [],
    });

    const { container, rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/today']}>
          <AppShell
            onLogout={() => undefined}
            apiBaseUrl="http://api.example.test"
            accessToken="test-token"
            account={{ id: 'account-1', displayName: 'Alex Example' }}
            spaceId="space-1"
          >
            <div style={{ height: '3000px' }}>Long content</div>
          </AppShell>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const bottomShell = container.querySelector('.mobile-bottom-shell');
    expect(bottomShell).not.toBeNull();
    expect(bottomShell?.getAttribute('data-hidden')).toBe('false');

    // Simulate scroll down
    Object.defineProperty(window, 'scrollY', { value: 500, writable: true });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    // On /today, it must remain persistent!
    expect(bottomShell?.getAttribute('data-hidden')).toBe('false');

    // Also check on /plan
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/plan']}>
          <AppShell
            onLogout={() => undefined}
            apiBaseUrl="http://api.example.test"
            accessToken="test-token"
            account={{ id: 'account-1', displayName: 'Alex Example' }}
            spaceId="space-1"
          >
            <div style={{ height: '3000px' }}>Long content</div>
          </AppShell>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const planBottomShell = container.querySelector('.mobile-bottom-shell');
    expect(planBottomShell?.getAttribute('data-hidden')).toBe('false');

    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(planBottomShell?.getAttribute('data-hidden')).toBe('false');
  });
});
