import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import de from '../i18n/locales/de';
import games from '../i18n/locales/games';
import { MoreOverviewPage } from './MoreOverviewPage';

describe('MoreOverviewPage', () => {
  it('renders named personal, shared, and utility destinations from More', () => {
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
    expect(html).toContain(de.more.groups.personal);
    expect(html).toContain(de.more.groups.shared);
    expect(html).toContain(de.more.groups.utility);

    for (const href of [
      '/more/profile',
      '/more/private',
      '/more/people',
      '/more/places',
      '/more/collections',
      '/games',
      '/more/notifications',
      '/today/activity',
      '/more/settings',
    ]) {
      expect(html).toContain(`href="${href}"`);
    }

    expect(html).toContain('Alex');
    expect(html).not.toContain('href="/more/private/notes"');

    const rowMatches = html.match(/class="more-destination"/g);
    expect(rowMatches).toHaveLength(9);

    const badgeMatches = html.match(/class="more-destination-badge"/g);
    expect(badgeMatches).toHaveLength(1);
    expect(html).toContain(games.status.premium);
    expect(html).toContain(de.more.intro);
  });
});
