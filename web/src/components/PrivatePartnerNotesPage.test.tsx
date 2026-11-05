import { i18n } from '../i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { SpacesApi } from '../api/generated/apis/SpacesApi';
import type { ProfilesApi } from '../client/mediaApis';
import { PrivatePartnerNotesPage } from './PrivatePartnerNotesPage';

describe('Private partner-note destination', () => {
  it('reads the existing private records without mixing shared or other-subject preferences', () => {
    const client = new QueryClient();
    client.setQueryData(['space', 'space-a'], {
      partners: [
        { id: 'self', displayName: 'Lea' },
        { id: 'partner', displayName: 'Alex' },
      ],
    });
    const note = {
      id: 'existing-note',
      accountId: 'partner',
      category: 'FLOWERS',
      sentiment: 'LOVE',
      topic: 'Surprise flowers',
      value: 'Peonies in June',
      visibility: 'PRIVATE_PARTNER_NOTE',
      version: 7,
    };
    client.setQueryData(
      ['profile-preferences', 'space-a'],
      [
        note,
        {
          ...note,
          id: 'shared',
          topic: 'Shared preference',
          visibility: 'SELF_PROFILE',
        },
        {
          ...note,
          id: 'other-subject',
          topic: 'Other subject',
          accountId: 'self',
        },
      ],
    );
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <PrivatePartnerNotesPage
            profilesApi={{} as ProfilesApi}
            spacesApi={{} as SpacesApi}
            accountId="self"
            spaceId="space-a"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(html).toContain('Surprise flowers');
    expect(html).toContain('Peonies in June');
    expect(html).toContain(i18n.t('profiles.privateTitle', { name: 'Alex' }));
    expect(html).toContain('href="/more/private"');
    expect(html).not.toContain('Shared preference');
    expect(html).not.toContain('Other subject');
    expect(html).not.toContain('private-partner-notes-badge');
  });
});
