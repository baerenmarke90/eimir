// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { STORY_OURS_ROUTE } from '../client/routes';
import { ShellUtilitiesContext } from '../client/shellUtilities';
import dailyInsights from '../i18n/locales/dailyInsights';
import de from '../i18n/locales/de';
import games from '../i18n/locales/games';
import navigation from '../i18n/locales/navigation';
import relationshipReflections from '../i18n/locales/relationshipReflections';
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
      STORY_OURS_ROUTE,
      '/story/years',
      '/story/photos',
      '/story/chapters',
      '/more/profile',
      '/more/private',
      '/more/people',
      '/more/places',
      '/more/collections',
      '/more/notes',
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
    expect(html).not.toContain('href="/story/recaps"');
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

    // The couple's own story overview leads the story group, ahead of the
    // media, chapter and year destinations.
    expect(STORY_OURS_ROUTE).toBe('/story/our-story');
    const storyOursIndex = html.indexOf(`href="${STORY_OURS_ROUTE}"`);
    expect(storyOursIndex).toBeGreaterThan(-1);
    for (const laterHref of [
      '/story/photos',
      '/story/chapters',
      '/story/years',
    ]) {
      expect(storyOursIndex).toBeLessThan(html.indexOf(`href="${laterHref}"`));
    }
    const storyOursRow = html.slice(
      storyOursIndex,
      html.indexOf('</a>', storyOursIndex),
    );
    expect(storyOursRow).toContain(relationshipReflections.passport.title);
    expect(storyOursRow).toContain(relationshipReflections.passport.intro);
    expect(storyOursRow).toContain(
      `class="more-destination-badge">${relationshipReflections.passport.pro}`,
    );

    const rowMatches = html.match(
      /class="more-destination(?: more-profile-destination)?"/g,
    );
    expect(rowMatches).toHaveLength(15);
    expect(html).toContain('more-profile-avatar');
    expect(html).toContain('person-identity-avatar-medium');

    const badgeMatches = html.match(/class="more-destination-badge"/g);
    expect(badgeMatches).toHaveLength(3);
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
    ['2026-11-06.draft-2', true],
    [null, false],
  ])(
    'links the Cloud legal texts only where they apply (%s)',
    (version, shown) => {
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
      expect(html.includes('href="/legal/privacy"')).toBe(shown);
    },
  );
});

describe('account ID copy on More', () => {
  const ACCOUNT_ID = '0195b3c1-7a4e-7c2f-9d11-3f5a6b7c8d9e';

  function renderMore() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(['profile-identity', 'space-1', ACCOUNT_ID], {
      accountId: ACCOUNT_ID,
      displayName: 'Alex',
      profileAttachmentId: null,
      version: 1,
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <MoreOverviewPage
            apiBaseUrl="http://api.example.test"
            accessToken="test-token"
            account={{ id: ACCOUNT_ID, displayName: 'Alex' }}
            spaceId="space-1"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('copies the ID without showing it, confirms quietly and returns to rest', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const { container, unmount } = renderMore();
    const action = container.querySelector('.more-account-id-action');
    if (!(action instanceof HTMLButtonElement))
      throw new Error('The account ID action is missing');

    // The ID is a support aid: it sits below sign-out and is never displayed.
    expect(action.textContent).toBe(de.more.accountId.copy);
    expect(container.textContent).not.toContain(ACCOUNT_ID);
    expect(
      container.querySelector('.more-account-actions .more-account-id'),
    ).not.toBeNull();

    await act(async () => {
      fireEvent.click(action);
    });

    expect(writeText).toHaveBeenCalledWith(ACCOUNT_ID);
    expect(action.textContent).toBe(de.more.accountId.copied);
    expect(screen.getByRole('status').textContent).toBe(
      de.more.accountId.copied,
    );
    expect(container.textContent).not.toContain(ACCOUNT_ID);

    act(() => {
      vi.advanceTimersByTime(2400);
    });
    expect(action.textContent).toBe(de.more.accountId.copy);
    expect(screen.getByRole('status').textContent).toBe('');
    unmount();
  });

  it('shows the ID to select by hand only when the device cannot copy', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    const { container, unmount } = renderMore();
    const action = screen.getByRole('button', {
      name: de.more.accountId.copy,
    });

    await act(async () => {
      fireEvent.click(action);
    });

    const fallback = screen.getByRole('alert');
    expect(fallback.textContent).toContain(de.more.accountId.failed);
    expect(fallback.querySelector('code')?.textContent).toBe(ACCOUNT_ID);
    expect(
      container.querySelector('.more-account-id-action')?.textContent,
    ).toBe(de.more.accountId.copy);
    unmount();
  });
});
