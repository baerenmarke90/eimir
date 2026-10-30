// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { ShellUtilitiesContext } from '../client/shellUtilities';
import navigation from '../i18n/locales/navigation';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import de from '../i18n/locales/de';
import dailyInsights from '../i18n/locales/dailyInsights';
import games from '../i18n/locales/games';
import { MoreOverviewPage } from './MoreOverviewPage';

describe('MoreOverviewPage', () => {
  it('renders a compact destination overview without descriptive sublines', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['profile-identity', 'space-1', 'account-1'], {
      accountId: 'account-1',
      displayName: 'Alex',
      profileAttachmentId: null,
      version: 1,
    });

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <MoreOverviewPage
            apiBaseUrl="http://api.example.test"
            accessToken="test-token"
            account={{ id: 'account-1', displayName: 'Alex' }}
            spaceId="space-1"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('more-groups');
    expect(html).toContain('page-heading-root');
    expect(html).not.toContain(`class="eyebrow">${de.more.eyebrow}`);
    expect(html).toContain(de.more.groups.personal);
    expect(html).toContain(de.more.groups.shared);
    expect(html).toContain(de.more.groups.utility);

    for (const href of [
      '/more/profile',
      '/more/private',
      '/more/people',
      '/more/places',
      '/more/collections',
      '/more/insights',
      '/games',
      '/more/notifications',
      '/today/activity',
      '/more/settings',
    ]) {
      expect(html).toContain(`href="${href}"`);
    }

    const weeklyInsightsIndex = html.indexOf('href="/more/insights"');
    const peopleIndex = html.indexOf('href="/more/people"');
    expect(weeklyInsightsIndex).toBeGreaterThan(-1);
    expect(weeklyInsightsIndex).toBeLessThan(peopleIndex);

    expect(html).toContain('Alex');
    expect(html).not.toContain('href="/more/private/notes"');
    expect(html).not.toContain('more-destination-description');
    expect(html).not.toContain(de.more.intro);

    const rowMatches = html.match(/class="more-destination"/g);
    expect(rowMatches).toHaveLength(11);

    const badgeMatches = html.match(/class="more-destination-badge"/g);
    expect(badgeMatches).toHaveLength(3);
    expect(html).toContain(games.status.premium);
    expect(html).toContain(dailyInsights.week.title);
    expect(html).toContain(dailyInsights.pro);
    expect(html).not.toContain(dailyInsights.week.subtitle);
  });
  it.each([false, true])(
    'keeps account actions and unread state in More (admin=%s)',
    (serverAdmin) => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      });
      queryClient.setQueryData(['profile-identity', 'space-1', 'account-1'], {
        accountId: 'account-1',
        displayName: 'Alex',
        profileAttachmentId: null,
        version: 1,
      });
      const onLogout = vi.fn();
      const { container, rerender, unmount } = render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <ShellUtilitiesContext.Provider
              value={{ unreadCount: 3, serverAdmin, onLogout }}
            >
              <MoreOverviewPage
                apiBaseUrl="http://api.example.test"
                accessToken="test-token"
                account={{ id: 'account-1', displayName: 'Alex' }}
                spaceId="space-1"
              />
            </ShellUtilitiesContext.Provider>
          </MemoryRouter>
        </QueryClientProvider>,
      );
      expect(
        screen
          .getByRole('link', { name: navigation.searchAll })
          .getAttribute('href'),
      ).toBe('/search');
      expect(
        screen
          .getByRole('link', { name: 'Benachrichtigungen, 3 ungelesen' })
          .getAttribute('href'),
      ).toBe('/more/notifications');
      expect(container.querySelector('.more-unread-count')?.textContent).toBe(
        '3',
      );
      expect(container.querySelector('a[href="/server-admin"]') !== null).toBe(
        serverAdmin,
      );
      expect(
        container.querySelector('.more-footer .brand-mark'),
      ).not.toBeNull();
      fireEvent.click(screen.getByRole('button', { name: de.header.logout }));
      expect(onLogout).toHaveBeenCalledTimes(1);
      rerender(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <ShellUtilitiesContext.Provider
              value={{ unreadCount: 0, serverAdmin, onLogout }}
            >
              <MoreOverviewPage
                apiBaseUrl="http://api.example.test"
                accessToken="test-token"
                account={{ id: 'account-1', displayName: 'Alex' }}
                spaceId="space-1"
              />
            </ShellUtilitiesContext.Provider>
          </MemoryRouter>
        </QueryClientProvider>,
      );
      expect(container.querySelector('.more-unread-count')).toBeNull();
      expect(
        screen
          .getByRole('link', { name: navigation.notifications })
          .getAttribute('href'),
      ).toBe('/more/notifications');
      unmount();
      queryClient.clear();
    },
  );
});
