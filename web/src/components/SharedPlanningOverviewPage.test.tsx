import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, vi } from 'vitest';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { MEMORY_CREATE_ROUTE, planDetailPath } from '../client/routes';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { wishPlanDateLabel } from '../client/wishJourney';
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

afterEach(() => vi.useRealTimers());

describe('SharedPlanningOverviewPage', () => {
  it('sorts deduplicated wishes across pages by localized title without overview bylines', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['m5-s3', 'wishes', 'space-1'], {
      pages: [
        {
          items: [
            wish({ id: 'z', title: 'Zoo', status: 'OPEN' }),
            wish({ id: 'o', title: 'Österreich', status: 'OPEN' }),
          ],
          nextCursor: 'next',
        },
        {
          items: [
            wish({ id: 'a', title: 'Ägypten', status: 'OPEN' }),
            wish({ id: 'o', title: 'Österreich', status: 'OPEN' }),
            wish({ id: 'b10', title: 'Berg 10', status: 'OPEN' }),
            wish({ id: 'b2', title: 'berg 2', status: 'OPEN' }),
          ],
          nextCursor: null,
        },
      ],
      pageParams: [null, 'next'],
    });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/plan#wishes']}>
          <SharedPlanningOverviewPage
            apis={{} as SharedPlanningApis}
            spaceId="space-1"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const titles = [...html.matchAll(/<strong>([^<]+)<\/strong>/g)].map(
      (match) => match[1],
    );
    expect(titles).toEqual([
      'Ägypten',
      'berg 2',
      'Berg 10',
      'Österreich',
      'Zoo',
    ]);
    expect(html).not.toContain(
      i18n.t('m5s3.overview.createdBy', { name: 'Lea' }),
    );
  });
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
    queryClient.setQueryData(
      authorSummaryQueryKeys.collectionOverview('space-1', 'OPEN'),
      {
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
      },
    );

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

    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(3);

    // Pläne is the default/left segment (#892): selected and its panel visible.
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html.match(/aria-selected="false"/g)).toHaveLength(2);
    expect(html.match(/ hidden=""/g)).toHaveLength(2);
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
      ['m5-s3', 'plans', 'space-1', 'overview', 'OPEN'],
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
    expect(planningHtml).toContain(i18n.t('m5s3.overview.openPlansEmpty'));
    expect(planningHtml).not.toContain(i18n.t('m5s3.wish.createIntro'));

    const collectionsClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    collectionsClient.setQueryData(
      authorSummaryQueryKeys.collectionOverview('space-1', 'OPEN'),
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
    expect(collectionsHtml).toContain(i18n.t('m5s3.collection.emptyScope'));

    const placesClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    placesClient.setQueryData(
      authorSummaryQueryKeys.placesOverview('space-1', 'ACTIVE'),
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

  it('keeps Wishes separate and composes only open focal, later and undated Plans', () => {
    // Both dated fixtures must remain in the future for this composition case.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-02T10:00:00Z'));
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
      ['m5-s3', 'plans', 'space-1', 'overview', 'OPEN'],
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

    // Completed Plans have their own explicit scope; open planning stays focused.
    expect(html).not.toContain('Already experienced');
    const soonIndex = html.indexOf('Autumn hike');
    const laterIndex = html.indexOf('Concert in October');
    const ideaIndex = html.indexOf('Try a new recipe');
    expect(soonIndex).toBeGreaterThan(-1);
    expect(soonIndex).toBeLessThan(laterIndex);
    expect(laterIndex).toBeLessThan(ideaIndex);
    expect(plansPanelHtml).not.toContain('wish-selection-entry');
    expect(wishesPanelHtml).toContain('wish-selection-entry');
    expect(plansPanelHtml).toContain('planen-agenda-copy');

    // Wishes lead with the shared intention; detail still owns attribution.
    expect(wishesPanelHtml).not.toContain(
      i18n.t('m5s3.overview.createdBy', { name: 'Lea' }),
    );
  });
});

describe('SharedPlanningOverviewPage wish journey (#1790 F2)', () => {
  function renderPlanning(client: QueryClient, entry: string) {
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[entry]}>
          <SharedPlanningOverviewPage
            apis={{} as SharedPlanningApis}
            spaceId="space-1"
            accountId="account-lea"
            apiBaseUrl="https://eimir.test"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }
  const journeyPlan = (id: string, overrides = {}) => ({
    id,
    status: 'PLANNED',
    plannedOn: null,
    plannedStart: null,
    experiencedOn: null,
    ...overrides,
  });

  it('keeps planned wishes visible in date order with a link to their plan', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const day = new Date('2026-11-21T00:00:00Z');
    client.setQueryData(
      ['m5-s3', 'wishes', 'space-1', 'PLANNED'],
      infinitePage([
        {
          ...wish({ id: 'night-train', title: 'Ans Meer', status: 'PLANNED' }),
          plan: journeyPlan('plan-train'),
          hasMemory: false,
        },
        {
          ...wish({ id: 'cooking', title: 'Kochkurs', status: 'PLANNED' }),
          plan: journeyPlan('plan-cooking', { plannedOn: day }),
          hasMemory: false,
        },
      ]),
    );

    const html = renderPlanning(client, '/plan#planned-wishes');
    const dated = i18n.t('wishJourney.plannedOn', {
      date: wishPlanDateLabel({ plannedOn: day, plannedStart: null }),
    });
    const undated = i18n.t('wishJourney.plannedUndated');

    expect(html).toContain(i18n.t('wishJourney.plannedIntro'));
    expect(html).toContain(`href="${planDetailPath('plan-cooking')}"`);
    expect(html).toContain(`href="${planDetailPath('plan-train')}"`);
    expect(html.indexOf(dated)).toBeGreaterThan(-1);
    expect(html.indexOf(dated)).toBeLessThan(html.indexOf(undated));
    expect(html).toContain(`aria-label="${dated} – Kochkurs"`);
    // Wish selection stays an open-wish flow.
    expect(html).not.toContain(i18n.t('wishSelection.compactEntryAction'));
    expect(html).toContain(
      `aria-pressed="true">${i18n.t('wishJourney.scopePlanned')}<`,
    );
  });

  it('shows remembered wishes and gently offers to capture the others', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(
      ['m5-s3', 'wishes', 'space-1', 'COMPLETED'],
      infinitePage([
        {
          ...wish({ id: 'concert', title: 'Konzert', status: 'COMPLETED' }),
          plan: journeyPlan('plan-concert', { status: 'COMPLETED' }),
          hasMemory: true,
        },
        {
          ...wish({ id: 'lake', title: 'Wochenende', status: 'COMPLETED' }),
          plan: journeyPlan('plan-lake', { status: 'COMPLETED' }),
          hasMemory: false,
        },
      ]),
    );

    const html = renderPlanning(client, '/plan#fulfilled-wishes');

    expect(html).toContain(
      `aria-label="${i18n.t('wishJourney.remembered')} – Konzert"`,
    );
    expect(html).toContain(`href="${planDetailPath('plan-concert')}"`);
    expect(html).toContain(
      `aria-label="${i18n.t('wishJourney.captureMoment')} – Wochenende"`,
    );
    expect(html).toContain(`href="${MEMORY_CREATE_ROUTE}"`);
    expect(html).not.toContain(i18n.t('wishJourney.plannedIntro'));
  });

  it('marks plans from a wish and shows one quiet hint above the list', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(
      ['m5-s3', 'plans', 'space-1', 'overview', 'OPEN'],
      infinitePage([
        {
          ...plan({
            id: 'flea-market',
            title: 'Flohmarkt',
            status: 'PLANNED',
            plannedStart: new Date('2099-11-24T09:00:00Z'),
          }),
          sourceWishId: 'wish-flea',
        },
        plan({ id: 'recipe', title: 'Neues Rezept', status: 'IDEA' }),
      ]),
    );
    client.setQueryData(
      ['m5-s3', 'wishes', 'space-1', 'journey-hint'],
      [
        {
          ...wish({ id: 'a', title: 'A', status: 'PLANNED' }),
          plan: journeyPlan('p-a'),
          hasMemory: false,
        },
        {
          ...wish({ id: 'b', title: 'B', status: 'PLANNED' }),
          plan: journeyPlan('p-b'),
          hasMemory: false,
        },
      ],
    );

    const html = renderPlanning(client, '/plan');

    expect(html).toContain(i18n.t('wishJourney.hintUnderway', { count: 2 }));
    expect(html).toContain('href="#planned-wishes"');
    expect(html.match(/wish-origin-mark/g)).toHaveLength(2);
    expect(html.indexOf('planen-wish-journey-hint')).toBeLessThan(
      html.indexOf('planen-next-heading'),
    );
  });

  it('points to fulfilled wishes only when a plan memory is still missing', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(
      ['m5-s3', 'plans', 'space-1', 'overview', 'OPEN'],
      emptyInfinitePage(),
    );
    const completed = {
      ...wish({ id: 'c', title: 'C', status: 'COMPLETED' }),
      plan: journeyPlan('p-c', { status: 'COMPLETED' }),
      hasMemory: false,
    };
    client.setQueryData(
      ['m5-s3', 'wishes', 'space-1', 'journey-hint'],
      [completed],
    );
    const waiting = renderPlanning(client, '/plan');
    expect(waiting).toContain(
      i18n.t('wishJourney.hintAwaitingMemory', { count: 1 }),
    );
    expect(waiting).toContain('href="#fulfilled-wishes"');

    client.setQueryData(
      ['m5-s3', 'wishes', 'space-1', 'journey-hint'],
      [{ ...completed, hasMemory: true }],
    );
    expect(renderPlanning(client, '/plan')).not.toContain(
      'planen-wish-journey-hint',
    );
  });
});
