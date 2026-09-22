import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

    expect(html).toContain('Alex');
    expect(html).not.toContain('href="/more/private/notes"');
    expect(html).not.toContain('more-destination-description');
    expect(html).not.toContain(de.more.intro);

    const rowMatches = html.match(/class="more-destination"/g);
    expect(rowMatches).toHaveLength(10);

    const badgeMatches = html.match(/class="more-destination-badge"/g);
    expect(badgeMatches).toHaveLength(2);
    expect(html).toContain(games.status.premium);
    expect(html).toContain(dailyInsights.week.title);
    expect(html).toContain(dailyInsights.pro);
    expect(html).not.toContain(dailyInsights.week.subtitle);
  });
});
