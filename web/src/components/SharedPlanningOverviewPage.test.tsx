import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { i18n } from '../i18n';
import { CollectionsOverviewPage } from './CollectionsOverviewPage';
import { PlacesOverviewPage } from './PlacesOverviewPage';
import { SharedPlanningOverviewPage } from './SharedPlanningOverviewPage';

function emptyInfinitePage() {
  return {
    pages: [{ items: [], hasMore: false, nextCursor: null }],
    pageParams: [null],
  };
}

function infinitePage<T>(items: T[]) {
  return {
    pages: [{ items, hasMore: false, nextCursor: null }],
    pageParams: [null],
  };
}

const CREATOR = { id: 'account-lea', displayName: 'Lea' };

function wish(overrides: { id: string; title: string; status: string }) {
  return {
    capabilities: { canComment: true, canDelete: true, canEdit: true },
    createdAt: new Date('2026-08-01T10:00:00Z'),
    createdBy: CREATOR.id,
    creator: CREATOR,
    spaceId: 'space-1',
    updatedAt: new Date('2026-08-01T10:00:00Z'),
    version: 1,
    ...overrides,
  };
}

function plan(overrides: {
  id: string;
  title: string;
  status: string;
  plannedStart?: Date | null;
}) {
  return {
    capabilities: { canComment: true, canDelete: true, canEdit: true },
    createdAt: new Date('2026-08-01T10:00:00Z'),
    createdBy: CREATOR.id,
    creator: CREATOR,
    description: null,
    experiencedOn: null,
    placeId: null,
    plannedEnd: null,
    plannedStart: null,
    sourceWishId: null,
    spaceId: 'space-1',
    updatedAt: new Date('2026-08-01T10:00:00Z'),
    version: 1,
    ...overrides,
  };
}

describe('SharedPlanningOverviewPage', () => {
  it('renders only the shared M3 planning product areas', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <SharedPlanningOverviewPage
            apis={{} as SharedPlanningApis}
            spaceId="space-1"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('Wünsche');
    expect(html).toContain('Pläne');
    expect(html).not.toContain('PrivateNote');
    expect(html).not.toContain('GiftIdea');
    expect(html).not.toContain('PrivateCollection');
  });

  it('shows a Collection title cleanly without legacy emoji icon (#373)', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['m5-s3', 'collections', 'space-1'], {
      pages: [
        {
          items: [
            {
              capabilities: {
                canComment: false,
                canDelete: true,
                canEdit: true,
              },
              createdAt: new Date('2026-08-01T10:00:00Z'),
              createdBy: 'account-1',
              creator: { id: 'account-1', displayName: 'Lea' },
              id: 'collection-1',
              items: [],
              spaceId: 'space-1',
              title: 'Packing list',
              updatedAt: new Date('2026-08-01T10:00:00Z'),
              version: 1,
            },
          ],
          hasMore: false,
          nextCursor: null,
        },
      ],
      pageParams: [null],
    });

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CollectionsOverviewPage
            apis={{} as SharedPlanningApis}
            spaceId="space-1"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // #373: collection icon removed end-to-end
    expect(html).toContain('Packing list');
    expect(html).not.toContain('🧳');
    expect(html).not.toContain('collection-icon');
  });

  it('renders an accessible Pläne/Wünsche segmented control defaulting to Pläne (#892)', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <SharedPlanningOverviewPage
            apis={{} as SharedPlanningApis}
            spaceId="space-1"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(2);

    // Pläne is the default/left segment (#892): selected and its panel visible.
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html.match(/aria-selected="false"/g)).toHaveLength(1);
    expect(html.match(/ hidden=""/g)).toHaveLength(1);
    expect(html.indexOf('Pläne')).toBeLessThan(html.indexOf('Wünsche'));
    expect(html.indexOf('aria-selected="true"')).toBeLessThan(
      html.indexOf('aria-selected="false"'),
    );
  });

  it('uses relationship-native empty states for planning, collections, and places', () => {
    const planningClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    planningClient.setQueryData(
      ['m5-s3', 'plans', 'space-1'],
      emptyInfinitePage(),
    );
    planningClient.setQueryData(
      ['m5-s3', 'wishes', 'space-1'],
      emptyInfinitePage(),
    );
    planningClient.setQueryData(
      authorSummaryQueryKeys.placeOptions('space-1'),
      [],
    );

    const planningHtml = renderToStaticMarkup(
      <QueryClientProvider client={planningClient}>
        <MemoryRouter>
          <SharedPlanningOverviewPage
            apis={{} as SharedPlanningApis}
            spaceId="space-1"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(planningHtml).toContain(i18n.t('m5s3.overview.wishesEmpty'));
    expect(planningHtml).toContain(i18n.t('m5s3.overview.plansEmpty'));

    const collectionsClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    collectionsClient.setQueryData(
      ['m5-s3', 'collections', 'space-1'],
      emptyInfinitePage(),
    );
    const collectionsHtml = renderToStaticMarkup(
      <QueryClientProvider client={collectionsClient}>
        <MemoryRouter>
          <CollectionsOverviewPage
            apis={{} as SharedPlanningApis}
            spaceId="space-1"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(collectionsHtml).toContain(i18n.t('m5s3.collection.emptyOverview'));

    const placesClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    placesClient.setQueryData(
      authorSummaryQueryKeys.placesOverview('space-1'),
      emptyInfinitePage(),
    );
    const placesHtml = renderToStaticMarkup(
      <QueryClientProvider client={placesClient}>
        <MemoryRouter>
          <PlacesOverviewPage
            apis={{} as SharedPlanningApis}
            spaceId="space-1"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(placesHtml).toContain(i18n.t('m5s3.place.emptyOverview'));
  });

  it('keeps Wishes and Plans separate and composes focal, later, undated, and receded history', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(
      ['m5-s3', 'wishes', 'space-1'],
      infinitePage([
        wish({ id: 'wish-1', title: 'See the aurora', status: 'OPEN' }),
        // A defensively-tested rogue historical row must never reach the UI
        // (#892): the Wünsche panel is the active idea backlog, not a
        // lifecycle archive.
        wish({
          id: 'wish-planned',
          title: 'Already turned into a plan',
          status: 'PLANNED',
        }),
        wish({
          id: 'wish-completed',
          title: 'Already come true',
          status: 'COMPLETED',
        }),
      ]),
    );
    queryClient.setQueryData(
      ['m5-s3', 'plans', 'space-1'],
      infinitePage([
        plan({ id: 'plan-idea', title: 'Try a new recipe', status: 'IDEA' }),
        // Completed Plans remain discoverable only in the receded history.
        plan({
          id: 'plan-completed',
          title: 'Already experienced',
          status: 'COMPLETED',
        }),
        plan({
          id: 'plan-later',
          title: 'Concert in October',
          status: 'PLANNED',
          plannedStart: new Date('2026-10-20T18:00:00Z'),
        }),
        plan({
          id: 'plan-soon',
          title: 'Autumn hike',
          status: 'PLANNED',
          plannedStart: new Date('2026-10-05T09:00:00Z'),
        }),
      ]),
    );

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <SharedPlanningOverviewPage
            apis={{} as SharedPlanningApis}
            spaceId="space-1"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Pläne is now the first, visible-by-default panel (#892); Wünsche never
    // mixes in Plan IDEA items - scope to the Wünsche panel, since it is
    // rendered-but-hidden (not unmounted) beside Pläne.
    const secondPanelStart = html.indexOf(
      'role="tabpanel"',
      html.indexOf('role="tabpanel"') + 1,
    );
    const plansPanelHtml = html.slice(0, secondPanelStart);
    const wishesPanelHtml = html.slice(secondPanelStart);
    expect(plansPanelHtml).not.toContain('See the aurora');
    expect(wishesPanelHtml).toContain('See the aurora');
    expect(wishesPanelHtml).not.toContain('Try a new recipe');

    // Historical Wishes (#892) are excluded from the active Wünsche panel:
    // it is the active idea backlog, not a lifecycle archive.
    expect(wishesPanelHtml).not.toContain('Already turned into a plan');
    expect(wishesPanelHtml).not.toContain('Already come true');

    // Plans: dated PLANNED items lead, soonest first, then the undated group;
    // completed history remains present behind the receded disclosure.
    expect(html).toContain('Already experienced');
    const soonIndex = html.indexOf('Autumn hike');
    const laterIndex = html.indexOf('Concert in October');
    const ideaIndex = html.indexOf('Try a new recipe');
    expect(soonIndex).toBeGreaterThan(-1);
    expect(soonIndex).toBeLessThan(laterIndex);
    expect(laterIndex).toBeLessThan(ideaIndex);
    expect(ideaIndex).toBeLessThan(html.indexOf('Already experienced'));

    // Creator attribution is real domain data, not a hardcoded name.
    expect(html).toContain(i18n.t('m5s3.overview.createdBy', { name: 'Lea' }));
  });
});
