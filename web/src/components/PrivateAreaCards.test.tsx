import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { PrivateAreaApi } from '../api/generated/apis/PrivateAreaApi';
import { privateAreaQueryKeys } from '../client/privateArea';
import { GiftIdeasListPage } from './GiftIdeasPage';
import { PrivateNotesListPage } from './PrivateNotesPage';

const ACCOUNT_ID = 'account-1';
const SPACE_ID = 'space-1';

describe('issue #619: private area cards unified navigation', () => {
  it('renders private notes as whole-card clickable links without separate edit buttons', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(privateAreaQueryKeys.notes(ACCOUNT_ID, SPACE_ID), {
      pages: [
        {
          items: [
            {
              id: 'note-1',
              ownerId: ACCOUNT_ID,
              spaceId: SPACE_ID,
              title: 'Secret anniversary plans',
              body: 'Look into cabin rentals by the lake',
              pinned: true,
              version: 1,
              capabilities: {
                canEdit: true,
                canDelete: true,
                canComment: false,
              },
              createdAt: new Date('2026-08-01T10:00:00Z'),
              updatedAt: new Date('2026-08-01T10:00:00Z'),
            },
          ],
          nextCursor: null,
        },
      ],
      pageParams: [null],
    });

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PrivateNotesListPage
            api={{} as PrivateAreaApi}
            accountId={ACCOUNT_ID}
            spaceId={SPACE_ID}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('href="/more/private"');
    // Entire card is the link
    expect(html).toContain('private-area-card-clickable');
    expect(html).toContain('href="/more/private/notes/note-1"');
    expect(html).toContain('Secret anniversary plans');
    expect(html).toContain('Look into cabin rentals by the lake');
    expect(html).toContain('private-area-badge');
    expect(html).toContain('Angeheftet');
    expect(html).toContain('private-area-card-arrow');
    // Redundant separate edit button removed
    expect(html).not.toContain('button-link secondary-link');
  });

  it('renders gift ideas as whole-card clickable links without separate edit buttons', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(
      privateAreaQueryKeys.giftIdeas(ACCOUNT_ID, SPACE_ID),
      {
        pages: [
          {
            items: [
              {
                id: 'gift-1',
                ownerId: ACCOUNT_ID,
                spaceId: SPACE_ID,
                title: 'Vintage record player',
                recipient: 'Alex',
                description: 'Found a restored 1970s turntable',
                status: 'IDEA',
                version: 1,
                capabilities: {
                  canEdit: true,
                  canDelete: true,
                  canComment: false,
                },
                createdAt: new Date('2026-08-01T10:00:00Z'),
                updatedAt: new Date('2026-08-01T10:00:00Z'),
              },
            ],
            nextCursor: null,
          },
        ],
        pageParams: [null],
      },
    );

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <GiftIdeasListPage
            api={{} as PrivateAreaApi}
            accountId={ACCOUNT_ID}
            spaceId={SPACE_ID}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('href="/more/private"');
    // Entire card is the link
    expect(html).toContain('private-area-card-clickable');
    expect(html).toContain('href="/more/private/gift-ideas/gift-1"');
    expect(html).toContain('Vintage record player');
    expect(html).toContain('Alex');
    expect(html).toContain('Found a restored 1970s turntable');
    expect(html).toContain('private-area-badge');
    expect(html).toContain('private-area-card-arrow');
    // Redundant separate edit button removed
    expect(html).not.toContain('button-link secondary-link');
  });
});
