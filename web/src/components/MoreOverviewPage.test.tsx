// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ShellUtilitiesContext } from '../client/shellUtilities';
import dailyInsights from '../i18n/locales/dailyInsights';
import de from '../i18n/locales/de';
import games from '../i18n/locales/games';
import navigation from '../i18n/locales/navigation';
import { MoreOverviewPage } from './MoreOverviewPage';

describe('MoreOverviewPage', () => {
  it('renders the grouped destination overview with short secondary lines', () => {
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
    expect(html).toContain(de.more.groups.moments);

    for (const href of [
      '/story/years',
      '/story/photos',
      '/story/chapters',
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

    // #1790 E1: years and recaps share one destination that opens the years.
    expect(html).not.toContain('href="/more/passport"');
    expect(html).toContain(
      de.more.destinations.yearsAndRecaps.replaceAll('&', '&amp;'),
    );
    for (const subtitle of [
      de.more.subtitles.media,
      de.more.subtitles.chapters,
      de.more.subtitles.yearsAndRecaps,
      de.more.subtitles.insights,
      de.more.subtitles.lists,
      de.more.subtitles.places,
      de.more.subtitles.people,
      de.more.subtitles.games,
    ]) {
      expect(html).toContain(subtitle);
    }
    // #1790 E2: the private area follows the profile and says who sees it.
    expect(html).toContain(
      de.more.subtitles.private.replace(
        '{{visibility}}',
        de.more.visibility.onlyYou,
      ),
    );
    expect(html.indexOf('href="/more/profile"')).toBeLessThan(
      html.indexOf('href="/more/private"'),
    );
    expect(html.indexOf('href="/more/private"')).toBeLessThan(
      html.indexOf('href="/more/notifications"'),
    );
    expect(html.indexOf('href="/more/settings"')).toBeLessThan(
      html.indexOf('href="/today/activity"'),
    );
    expect(html).toContain('Alex');
    expect(html).not.toContain('href="/more/private/notes"');
    expect(html).not.toContain('more-destination-description');
    expect(html).not.toContain(de.more.intro);
    expect(html).not.toContain(de.more.notifications.description);

    const rowMatches = html.match(
      /class="more-destination(?: more-profile-destination)?"/g,
    );
    expect(rowMatches).toHaveLength(13);
    expect(html).toContain('more-profile-avatar');
    expect(html).toContain('person-identity-avatar-medium');

    const badgeMatches = html.match(/class="more-destination-badge"/g);
    expect(badgeMatches).toHaveLength(2);
    expect(html).toContain(games.status.premium);
    expect(html).toContain(de.more.destinations.insights);
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
  it.each([
    ['2026-11-05.draft-1', true],
    [null, false],
  ])('links the terms of use only where they apply (%s)', (version, shown) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['instance-status', 'http://api.example.test'], {
      availability: 'available',
      auth: null,
      accountCreation: version ? 'self_service' : 'invitation',
      selfServiceSignupAvailable: Boolean(version),
      maintenanceMode: false,
      registrationAvailable: true,
      termsOfUseVersion: version,
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

    expect(html.includes('href="/legal/terms"')).toBe(shown);
  });
});
