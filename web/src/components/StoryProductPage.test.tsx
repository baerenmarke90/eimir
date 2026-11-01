import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter, MemoryRouter } from 'react-router-dom';
import type { DashboardApi } from '../api/generated/apis/DashboardApi';
import { StoryKind } from '../api/generated/models/StoryKind';
import { StoryOrder } from '../api/generated/models/StoryOrder';
import type { ReferenceApis } from '../client/referenceFlow';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { dashboardQueryKey } from '../client/dashboardQueries';
import {
  parseStoryFilters,
  storyCacheResourceId,
} from '../client/storyProduct';
import de from '../i18n/locales/de';
import m5s5 from '../i18n/locales/m5s5';
import storyProducts from '../i18n/locales/storyProducts';
import { StoryProductPage } from './StoryProductPage';

const loadMemoryImage = async () => 'blob:test-image';

function renderStoryPage(
  route: string,
  cachedData: unknown,
  options?: { dashboard?: unknown; selectionDate?: Date },
): string {
  const query = route.includes('?') ? route.slice(route.indexOf('?') + 1) : '';
  const filters = parseStoryFilters(new URLSearchParams(query));
  const cacheKey = storyCacheResourceId(filters);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(['story', 'space-1', cacheKey], {
    pages: [
      {
        value: cachedData,
        source: 'network',
      },
    ],
    pageParams: [null],
  });
  queryClient.setQueryData(
    authorSummaryQueryKeys.discover('space-1', 'account-1'),
    {
      value: {
        items: (cachedData as { items?: unknown[] }).items ?? [],
        lead: (cachedData as { items?: unknown[] }).items?.[0] ?? null,
        leadContext: null,
        selectionDate: options?.selectionDate,
      },
      source: 'network',
    },
  );
  if (options?.dashboard) {
    queryClient.setQueryData(dashboardQueryKey('space-1'), options.dashboard);
  }

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <StoryProductPage
          apis={{} as ReferenceApis}
          accountId="account-1"
          spaceId="space-1"
          loadMemoryImage={loadMemoryImage}
          dashboardApi={options?.dashboard ? ({} as DashboardApi) : undefined}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Momente retrospective integration (#601)', () => {
  const selectionDate = new Date('2026-08-24T00:00:00Z');
  const lead = {
    kind: 'MEMORY',
    effectiveDate: selectionDate,
    memory: {
      id: 'discover-lead',
      title: 'Unser aktueller Moment',
      happenedOn: selectionDate,
      createdAt: selectionDate,
      attachments: [],
      author: { id: 'author-1', displayName: 'Lea' },
      capabilities: { canEdit: true, canDelete: true, canComment: true },
    },
  };
  const discover = { items: [lead], hasMore: false, nextCursor: null };
  const retrospective = {
    id: 'historic-memory',
    type: 'MEMORY',
    titleOrText: 'That day by the lake',
    occurredOn: new Date('2025-08-24T00:00:00Z'),
    createdAt: null,
    scheduledAt: null,
    previewAttachmentId: 'lake-ready-photo',
    previewIsSensitive: false,
  };
  const dashboard = {
    viewerLocalDate: selectionDate,
    retrospective,
  };

  it('shows the real Today candidate alongside Discover without reselecting Story items', () => {
    const html = renderStoryPage('/story?tab=discover', discover, {
      selectionDate,
      dashboard,
    });
    expect(html).toContain('momente-retrospective');
    expect(html).toContain('That day by the lake');
    expect(html).toContain('href="/story/memories/historic-memory"');
    expect(html).toContain('data-media-deferred="true"');
    expect(html).toContain('Unser aktueller Moment');
  });

  it('does not render the same authorized content twice when it is already the featured lead', () => {
    const html = renderStoryPage(
      '/story?tab=discover',
      {
        ...discover,
        items: [{ ...lead, memory: { ...lead.memory, id: retrospective.id } }],
      },
      { selectionDate, dashboard },
    );
    expect(html).not.toContain('momente-retrospective');
    expect(html).toContain('momente-hero-highlight');
  });

  it('shows the complete authorized selection without duplicating the lead or retrospective', () => {
    const items = Array.from({ length: 8 }, (_, index) => ({
      ...lead,
      memory: {
        ...lead.memory,
        id: `memory-${index}`,
        title: `Keepsake ${index}`,
      },
    }));
    const html = renderStoryPage(
      '/story',
      { ...discover, items },
      {
        selectionDate,
        dashboard: {
          ...dashboard,
          retrospective: { ...retrospective, id: 'memory-4' },
        },
      },
    );
    const discovery = html.slice(
      html.indexOf('class="momente-discover-page"'),
      html.indexOf('id="momente-diary"'),
    );
    const destinations = Array.from(
      discovery.matchAll(/href="(\/story\/memories\/[^"\s]+)"/g),
      (match) => match[1],
    );
    expect(destinations).toHaveLength(8);
    expect(new Set(destinations).size).toBe(8);
    for (const item of items)
      expect(destinations).toContain(`/story/memories/${item.memory.id}`);
  });

  it('suppresses stale or absent candidates rather than inventing a moment', () => {
    const stale = renderStoryPage('/story?tab=discover', discover, {
      selectionDate: new Date('2026-08-23T00:00:00Z'),
      dashboard,
    });
    const absent = renderStoryPage('/story?tab=discover', discover, {
      selectionDate,
      dashboard: { ...dashboard, retrospective: null },
    });
    const missingCalendarContext = renderStoryPage(
      '/story?tab=discover',
      discover,
      { dashboard: { retrospective } },
    );
    expect(stale).not.toContain('momente-retrospective');
    expect(absent).not.toContain('momente-retrospective');
    expect(missingCalendarContext).not.toContain('momente-retrospective');
    expect(stale).toContain('Unser aktueller Moment');
    expect(absent).toContain('Unser aktueller Moment');
  });

  it('keeps Timeline independent from the Today retrospective', () => {
    const html = renderStoryPage('/story?tab=timeline', discover, {
      selectionDate,
      dashboard,
    });
    expect(html).not.toContain('momente-retrospective');
    expect(html).toContain('role="tablist"');
    expect(html).not.toContain('momente-diary-title');
    expect(html).not.toContain('momente-discover-title');
  });
});

describe('StoryProductPage', () => {
  it('defaults to Discover with the independent Diary panel hidden', () => {
    const html = renderStoryPage('/story', {
      items: [
        {
          kind: 'MEMORY',
          effectiveDate: new Date('2026-08-26T00:00:00Z'),
          memory: {
            id: 'mem-1',
            title: 'Summer Lake Vacation',
            notes: 'Wonderful sunset together',
            occurredOn: new Date('2026-08-26T00:00:00Z'),
            createdAt: new Date('2026-08-26T00:00:00Z'),
            attachments: [
              { id: 'att-1', mediaType: 'image/jpeg', isSensitive: false },
            ],
            author: { id: 'author-1', displayName: 'Alex' },
            creator: { id: 'author-1', displayName: 'Alex' },
            capabilities: { canComment: true, canDelete: true, canEdit: true },
          },
        },
        {
          kind: 'HEART_MOMENT',
          effectiveDate: new Date('2026-08-25T00:00:00Z'),
          heartMoment: {
            id: 'heart-1',
            text: 'I love you more each day',
            createdAt: new Date('2026-08-25T00:00:00Z'),
            author: { id: 'author-2', displayName: 'Taylor' },
            creator: { id: 'author-2', displayName: 'Taylor' },
          },
        },
      ],
      hasMore: false,
      nextCursor: null,
    });

    expect(html).toContain('role="tablist"');
    expect(html).not.toContain('momente-diary-title');
    expect(html).not.toContain('momente-discover-title');
    expect(html).toContain('momente-discover-page');
    expect(html).toContain('momente-hero-highlight');
    expect(html).toContain('aria-labelledby="momente-tab-timeline" hidden=""');
    expect(html).not.toContain('class="story-timeline"');
    expect(html).toContain('Summer Lake Vacation');
    expect(html).toContain('momente-tapestry');
    expect(html).toContain('I love you more each day');
  });

  it('renders Discover as an asymmetric tapestry, not a fixed-width horizontal carousel of equal cards (regression #790)', () => {
    const html = renderStoryPage('/story', {
      items: [
        {
          kind: 'MEMORY',
          effectiveDate: new Date('2026-08-26T00:00:00Z'),
          memory: {
            id: 'mem-1',
            title: 'Summer Lake Vacation',
            notes: 'Wonderful sunset together',
            occurredOn: new Date('2026-08-26T00:00:00Z'),
            createdAt: new Date('2026-08-26T00:00:00Z'),
            attachments: [
              { id: 'att-1', mediaType: 'image/jpeg', isSensitive: false },
            ],
            author: { id: 'author-1', displayName: 'Alex' },
            creator: { id: 'author-1', displayName: 'Alex' },
            capabilities: { canComment: true, canDelete: true, canEdit: true },
          },
        },
        {
          kind: 'HEART_MOMENT',
          effectiveDate: new Date('2026-08-25T00:00:00Z'),
          heartMoment: {
            id: 'heart-1',
            text: 'I love you more each day',
            createdAt: new Date('2026-08-25T00:00:00Z'),
            author: { id: 'author-2', displayName: 'Taylor' },
            creator: { id: 'author-2', displayName: 'Taylor' },
          },
        },
        {
          kind: 'MILESTONE',
          effectiveDate: new Date('2026-08-01T00:00:00Z'),
          milestone: {
            id: 'milestone-1',
            title: 'First apartment together',
            body: null,
            createdAt: new Date('2026-08-01T00:00:00Z'),
            author: { id: 'author-1', displayName: 'Alex' },
            creator: { id: 'author-1', displayName: 'Alex' },
          },
        },
      ],
      hasMore: false,
      nextCursor: null,
    });

    // No fixed-width horizontal carousel contract remains
    expect(html).not.toContain('momente-stream-track');
    expect(html).not.toContain('momente-stream-card');

    // The asymmetric multi-column tapestry replaces it
    expect(html).toContain('momente-tapestry"');

    // Each content type keeps a distinct presentation role, not one shared
    // equal-sized card shell (regression #790)
    expect(html).toContain('momente-hero-media');
    expect(html).toContain('momente-tapestry-note');
    expect(html).toContain('momente-tapestry-milestone');
    // The Heart Moment renders as a quoted note, not a titled card
    expect(html).toContain('momente-tapestry-quote');
    expect(html).toContain('First apartment together');
  });

  describe('issue #977: curated reveal and viewport-aware media loading', () => {
    it('gives tapestry entries a reveal key/class and defers their media until near the viewport, while the Discover page wrapper no longer replays a generic mount animation', () => {
      const html = renderStoryPage('/story', {
        items: [
          {
            kind: 'MEMORY',
            effectiveDate: new Date('2026-08-26T00:00:00Z'),
            memory: {
              id: 'mem-1',
              title: 'Summer Lake Vacation',
              notes: 'Wonderful sunset together',
              occurredOn: new Date('2026-08-26T00:00:00Z'),
              createdAt: new Date('2026-08-26T00:00:00Z'),
              attachments: [
                { id: 'att-1', mediaType: 'image/jpeg', isSensitive: false },
              ],
              author: { id: 'author-1', displayName: 'Alex' },
              creator: { id: 'author-1', displayName: 'Alex' },
              capabilities: {
                canComment: true,
                canDelete: true,
                canEdit: true,
              },
            },
          },
          {
            kind: 'MEMORY',
            effectiveDate: new Date('2026-08-20T00:00:00Z'),
            memory: {
              id: 'mem-2',
              title: 'Weekend Hike',
              notes: 'Fresh air, quiet trail',
              occurredOn: new Date('2026-08-20T00:00:00Z'),
              createdAt: new Date('2026-08-20T00:00:00Z'),
              attachments: [
                { id: 'att-2', mediaType: 'image/jpeg', isSensitive: false },
              ],
              author: { id: 'author-1', displayName: 'Alex' },
              creator: { id: 'author-1', displayName: 'Alex' },
              capabilities: {
                canComment: true,
                canDelete: true,
                canEdit: true,
              },
            },
          },
        ],
        hasMore: false,
        nextCursor: null,
      });

      // The Discover page wrapper no longer carries the generic
      // eimir-motion-reveal mount animation, which would otherwise replay
      // on every remount and compete with the controlled tapestry reveal.
      const discoverPageStart = html.indexOf('momente-discover-page');
      expect(discoverPageStart).toBeGreaterThan(-1);
      const wrapperOpenTag = html.slice(
        html.lastIndexOf('<div', discoverPageStart),
        html.indexOf('>', discoverPageStart) + 1,
      );
      expect(wrapperOpenTag).not.toContain('eimir-motion-reveal');

      // The lead highlight's media loads eagerly: no deferred skeleton.
      const heroStart = html.indexOf('momente-hero-media');
      const tapestryStart = html.indexOf('momente-tapestry-bands');
      const heroHtml = html.slice(heroStart, tapestryStart);
      expect(heroHtml).not.toContain('data-media-deferred="true"');

      // Tapestry entries carry their own reveal key/class...
      const tapestryHtml = html.slice(
        tapestryStart,
        html.indexOf('id="momente-diary"'),
      );
      expect(tapestryHtml).toContain('momente-tapestry-reveal');
      expect(tapestryHtml).toContain(
        'data-discover-reveal-key="item:memory-mem-2"',
      );
      // ...and never the Timeline's own reveal attribute/class.
      expect(tapestryHtml).not.toContain('data-timeline-reveal-key');
      expect(tapestryHtml).not.toContain('story-timeline-progressive-reveal');

      // Tapestry media is viewport-aware: it renders the deferred skeleton
      // instead of eagerly resolving the authenticated loader.
      expect(tapestryHtml).toContain('data-media-deferred="true"');
    });
  });

  it('omits author avatars and names in the Memories overview', () => {
    const html = renderStoryPage('/story', {
      items: [
        {
          kind: 'MEMORY',
          effectiveDate: new Date('2026-08-26T00:00:00Z'),
          memory: {
            id: 'mem-1',
            title: 'Summer Lake Vacation',
            notes: 'Wonderful sunset together',
            occurredOn: new Date('2026-08-26T00:00:00Z'),
            createdAt: new Date('2026-08-26T00:00:00Z'),
            attachments: [
              { id: 'att-1', mediaType: 'image/jpeg', isSensitive: false },
            ],
            author: { id: 'author-1', displayName: 'Alex Winter' },
            creator: { id: 'author-1', displayName: 'Alex Winter' },
            capabilities: { canComment: true, canDelete: true, canEdit: true },
          },
        },
        {
          kind: 'HEART_MOMENT',
          effectiveDate: new Date('2026-08-25T00:00:00Z'),
          heartMoment: {
            id: 'heart-1',
            text: 'I love you more each day',
            createdAt: new Date('2026-08-25T00:00:00Z'),
            author: { id: 'author-2', displayName: 'Lea Sommer' },
            creator: { id: 'author-2', displayName: 'Lea Sommer' },
          },
        },
      ],
      hasMore: false,
      nextCursor: null,
    });

    // Overview identity stays in the canonical detail.
    expect(html).not.toContain('>von Alex</span>');
    expect(html).not.toContain('>von Lea</span>');
    expect(html).not.toContain('class="sr-only">von Alex</span>');
    expect(html).not.toContain('class="sr-only">von Lea</span>');
    expect(html).not.toContain('role="img" aria-label="Alex Winter"');
    expect(html).not.toContain('role="img" aria-label="Lea Sommer"');
  });

  it('omits the current account avatar in the Memories overview', () => {
    const html = renderStoryPage('/story', {
      items: [
        {
          kind: 'MEMORY',
          effectiveDate: new Date('2026-08-26T00:00:00Z'),
          memory: {
            id: 'mem-own',
            title: 'Our own moment',
            notes: 'A small memory',
            occurredOn: new Date('2026-08-26T00:00:00Z'),
            createdAt: new Date('2026-08-26T00:00:00Z'),
            attachments: [],
            author: { id: 'account-1', displayName: 'Alex Winter' },
            creator: { id: 'account-1', displayName: 'Alex Winter' },
            capabilities: { canComment: true, canDelete: true, canEdit: true },
          },
        },
      ],
      hasMore: false,
      nextCursor: null,
    });

    expect(html).not.toContain(
      de.story.byAuthor.replace('{{author}}', de.story.authorSelf),
    );
    expect(html).not.toContain('class="sr-only">von Alex</span>');
    expect(html).not.toContain('role="img" aria-label="Alex Winter"');
  });

  it('renders timeline view when requested via query parameter', () => {
    const html = renderStoryPage('/story?tab=timeline', {
      items: [
        {
          kind: 'MEMORY',
          effectiveDate: new Date('2026-08-26T00:00:00Z'),
          memory: {
            id: 'mem-1',
            title: 'Summer Lake Vacation',
            occurredOn: new Date('2026-08-26T00:00:00Z'),
            createdAt: new Date('2026-08-26T00:00:00Z'),
            attachments: [],
            author: { id: 'author-1', displayName: 'Alex' },
            creator: { id: 'author-1', displayName: 'Alex' },
            capabilities: { canComment: true, canDelete: true, canEdit: true },
          },
        },
      ],
      hasMore: false,
      nextCursor: null,
    });

    expect(html).toContain('story-timeline');
    expect(html).toContain('story-filter-container');
    expect(html).not.toContain('momente-hero-highlight');
    expect(html).toContain('aria-labelledby="momente-tab-discover" hidden=""');
    expect(html).toContain('Summer Lake Vacation');

    expect(html).toContain('id="momente-diary"');
    expect(html).toContain('role="tablist"');
  });

  it('renders empty welcoming state when no moments exist', () => {
    const html = renderStoryPage('/story', {
      items: [],
      hasMore: false,
      nextCursor: null,
    });

    expect(html).toContain('new-space-experience');
    expect(html).toContain('/story/memories/new');
  });

  it('keeps milestone story content distinct from the compact structural navigation', () => {
    const html = renderStoryPage('/story', {
      items: [
        {
          kind: 'MILESTONE',
          effectiveDate: new Date('2026-08-20T00:00:00Z'),
          milestone: {
            id: 'mile-1',
            title: 'Moved in together',
            happenedOn: new Date('2026-08-20T00:00:00Z'),
            createdAt: new Date('2026-08-20T00:00:00Z'),
            author: { id: 'author-1', displayName: 'Alex' },
            creator: { id: 'author-1', displayName: 'Alex' },
          },
        },
      ],
      availableYears: [2026],
      hasMore: false,
      nextCursor: null,
    });

    expect(html).toContain('momente-hero-highlight');
    expect(html).toContain('Moved in together');
    expect(html).not.toContain('momente-diary-title');
    expect(html).not.toContain('momente-discover-title');
    expect(html).not.toContain(storyProducts.storyFilters.toggleButton);
    expect(html).toContain('role="tablist"');
  });

  describe('canonical Discover ordering and presentation', () => {
    it('preserves canonical DOM order across 1-, 2-, and 3-column responsive breakpoints', () => {
      const originalWindow = globalThis.window;
      try {
        [1, 2, 3].forEach((columns) => {
          // Mock matchMedia for responsive breakpoints
          globalThis.window = {
            matchMedia: (query: string) => ({
              matches:
                columns === 3
                  ? query === '(min-width: 1024px)'
                  : columns === 2
                    ? query === '(min-width: 640px)'
                    : false,
              addEventListener: () => {},
              removeEventListener: () => {},
            }),
          } as unknown as Window & typeof globalThis;

          const html = renderStoryPage('/story', {
            items: [
              {
                kind: 'MEMORY',
                effectiveDate: new Date('2026-07-05T00:00:00Z'),
                memory: {
                  id: 'mem-july',
                  title: 'Spring Picnic',
                  occurredOn: new Date('2026-07-05T00:00:00Z'),
                  createdAt: new Date('2026-07-05T00:00:00Z'),
                  attachments: [],
                  author: { id: 'author-1', displayName: 'Alex' },
                  creator: { id: 'author-1', displayName: 'Alex' },
                  capabilities: {
                    canComment: true,
                    canDelete: true,
                    canEdit: true,
                  },
                },
              },
              {
                kind: 'MEMORY',
                effectiveDate: new Date('2026-08-26T00:00:00Z'),
                memory: {
                  id: 'mem-late-august',
                  title: 'Late August Vacation',
                  occurredOn: new Date('2026-08-26T00:00:00Z'),
                  createdAt: new Date('2026-08-26T00:00:00Z'),
                  attachments: [],
                  author: { id: 'author-1', displayName: 'Alex' },
                  creator: { id: 'author-1', displayName: 'Alex' },
                  capabilities: {
                    canComment: true,
                    canDelete: true,
                    canEdit: true,
                  },
                },
              },
            ],
            hasMore: false,
            nextCursor: null,
          });

          const tapestryStart = html.indexOf('momente-tapestry-bands');
          expect(tapestryStart).toBeGreaterThan(-1);

          // Canonical backend order: Spring Picnic is BEFORE Late August Vacation
          const springPicnicIndex = html.indexOf('Spring Picnic');
          const lateAugustIndex = html.indexOf(
            'Late August Vacation',
            tapestryStart,
          );

          expect(springPicnicIndex).toBeGreaterThan(-1);
          expect(lateAugustIndex).toBeGreaterThan(-1);
          expect(springPicnicIndex).toBeLessThan(lateAugustIndex);
        });
      } finally {
        globalThis.window = originalWindow;
      }
    });

    it('renders all backend-provided items without applying an arbitrary client-side cap', () => {
      const items = Array.from({ length: 14 }, (_, index) => ({
        kind: 'MEMORY' as const,
        effectiveDate: new Date(Date.UTC(2026, 7, 28 - index)),
        memory: {
          id: `mem-${index}`,
          title: `Moment ${index}`,
          occurredOn: new Date(Date.UTC(2026, 7, 28 - index)),
          createdAt: new Date(Date.UTC(2026, 7, 28 - index)),
          attachments: [],
          author: { id: 'author-1', displayName: 'Alex' },
          creator: { id: 'author-1', displayName: 'Alex' },
          capabilities: { canComment: true, canDelete: true, canEdit: true },
        },
      }));

      const html = renderStoryPage('/story', {
        items,
        hasMore: false,
        nextCursor: null,
      });

      const tapestryStart = html.indexOf('momente-tapestry-bands');
      expect(tapestryStart).toBeGreaterThan(-1);
      const tapestryHtml = html.slice(tapestryStart);

      // The lead appears once, outside the uncapped backend selection.
      expect(html).toContain('Moment 0');
      expect(tapestryHtml).not.toContain('Moment 0');
      expect(tapestryHtml).toContain('Moment 11');
      expect(tapestryHtml).toContain('Moment 12');
      expect(tapestryHtml).toContain('Moment 13');
    });
  });

  describe('issue #966: real chronological month headings in Timeline', () => {
    it('groups Timeline items under real month headings instead of one flat list', () => {
      const html = renderStoryPage('/story?tab=timeline', {
        items: [
          {
            kind: 'MEMORY',
            effectiveDate: new Date('2026-08-26T00:00:00Z'),
            memory: {
              id: 'mem-august',
              title: 'Late August Vacation',
              occurredOn: new Date('2026-08-26T00:00:00Z'),
              createdAt: new Date('2026-08-26T00:00:00Z'),
              attachments: [],
              author: { id: 'author-1', displayName: 'Alex' },
              creator: { id: 'author-1', displayName: 'Alex' },
              capabilities: {
                canComment: true,
                canDelete: true,
                canEdit: true,
              },
            },
          },
          {
            kind: 'MEMORY',
            effectiveDate: new Date('2026-07-05T00:00:00Z'),
            memory: {
              id: 'mem-july',
              title: 'Spring Picnic',
              occurredOn: new Date('2026-07-05T00:00:00Z'),
              createdAt: new Date('2026-07-05T00:00:00Z'),
              attachments: [],
              author: { id: 'author-1', displayName: 'Alex' },
              creator: { id: 'author-1', displayName: 'Alex' },
              capabilities: {
                canComment: true,
                canDelete: true,
                canEdit: true,
              },
            },
          },
        ],
        hasMore: false,
        nextCursor: null,
      });

      // Real semantic month headings, not another surrounding card.
      expect(html).toContain('story-year-month"');
      expect(html).toContain('story-year-month-header');
      expect(html).toContain('August 2026');
      expect(html).toContain('Juli 2026');

      // Server order (DESC by default) is preserved: newer month heads first.
      const diaryStart = html.indexOf('id="momente-diary"');
      const augustIndex = html.indexOf('August 2026', diaryStart);
      const julyIndex = html.indexOf('Juli 2026', diaryStart);
      expect(augustIndex).toBeGreaterThan(-1);
      expect(julyIndex).toBeGreaterThan(-1);
      expect(augustIndex).toBeLessThan(julyIndex);
      expect(html.indexOf('Late August Vacation', augustIndex)).toBeLessThan(
        julyIndex,
      );
      expect(html.indexOf('Spring Picnic', julyIndex)).toBeGreaterThan(
        julyIndex,
      );
    });

    it('keeps one near-end pagination sentinel after the last month group without permanent pagination chrome', () => {
      const html = renderStoryPage('/story?tab=timeline', {
        items: [
          {
            kind: 'MEMORY',
            effectiveDate: new Date('2026-08-26T00:00:00Z'),
            memory: {
              id: 'mem-august',
              title: 'Late August Vacation',
              occurredOn: new Date('2026-08-26T00:00:00Z'),
              createdAt: new Date('2026-08-26T00:00:00Z'),
              attachments: [],
              author: { id: 'author-1', displayName: 'Alex' },
              creator: { id: 'author-1', displayName: 'Alex' },
              capabilities: {
                canComment: true,
                canDelete: true,
                canEdit: true,
              },
            },
          },
          {
            kind: 'MEMORY',
            effectiveDate: new Date('2026-07-05T00:00:00Z'),
            memory: {
              id: 'mem-july',
              title: 'Spring Picnic',
              occurredOn: new Date('2026-07-05T00:00:00Z'),
              createdAt: new Date('2026-07-05T00:00:00Z'),
              attachments: [],
              author: { id: 'author-1', displayName: 'Alex' },
              creator: { id: 'author-1', displayName: 'Alex' },
              capabilities: {
                canComment: true,
                canDelete: true,
                canEdit: true,
              },
            },
          },
        ],
        hasMore: true,
        nextCursor: 'cursor-2',
      });

      const sentinels = html.match(/story-pagination-sentinel/g) ?? [];
      expect(sentinels.length).toBe(1);
      expect(html).not.toContain(storyProducts.storyFilters.loadMore);
      expect(html.indexOf('story-pagination-sentinel')).toBeGreaterThan(
        html.indexOf('Spring Picnic'),
      );
    });
  });

  describe('issue #618: data-aware and recoverable timeline filters', () => {
    it('offers a bounded filter task while leaving the Timeline visible', () => {
      const html = renderStoryPage('/story?tab=timeline', {
        items: [],
        availableYears: [2026, 2024, 2021],
        hasMore: false,
        nextCursor: null,
      });

      expect(html).toContain('story-filter-container');
      expect(html).toContain('aria-haspopup="dialog"');
      expect(html).toContain('aria-expanded="false"');
      expect(html).not.toContain('story-year-options');
      expect(html).not.toContain('type="number"');
      expect(html).not.toContain(storyProducts.storyFilters.apply);
    });

    it('renders active filter chips with remove buttons and reset action', () => {
      const html = renderStoryPage(
        '/story?tab=timeline&type=MILESTONE&year=2026&order=ASC',
        {
          items: [],
          availableYears: [2026],
          hasMore: false,
          nextCursor: null,
        },
      );

      expect(html).toContain('story-active-chips');
      expect(html).toContain(m5s5.kind.MILESTONE);
      expect(html).toContain('2026');
      expect(html).toContain(storyProducts.storyFilters.oldest);
      expect(html).toContain('chip-remove');
      expect(html).toContain(storyProducts.storyFilters.noMatchesAction);
    });

    it('keeps filter controls and reset visible on 0 hits with active filters (no dead-end)', () => {
      const html = renderStoryPage(
        '/story?tab=timeline&type=MILESTONE&year=1997',
        {
          items: [],
          availableYears: [2026],
          hasMore: false,
          nextCursor: null,
        },
      );

      expect(html).not.toContain('new-space-experience');
      expect(html).toContain('story-filter-container');
      expect(html).toContain('story-filter-empty-state');
      expect(html).toContain(storyProducts.storyFilters.noMatches);
      expect(html).toContain(storyProducts.storyFilters.noMatchesAction);
      expect(html).toContain('story-task-active-scope');
    });

    it('retains an applied year visibly when that scope has no matches', () => {
      const html = renderStoryPage(
        '/story?tab=timeline&type=MILESTONE&year=1997',
        {
          items: [],
          availableYears: [2026],
          hasMore: false,
          nextCursor: null,
        },
      );

      // No-match is a recoverable scope, never a silently reset filter.
      expect(html).toContain('story-task-active-scope');
      expect(html).toContain('1997');
      expect(html).toContain(storyProducts.storyFilters.noMatches);
    });

    it('tracks filter updates as browser history push and restores states across back and forward navigation', async () => {
      const router = createMemoryRouter(
        [
          {
            path: '/story',
            element: (
              <StoryProductPage
                apis={{} as ReferenceApis}
                accountId="account-1"
                spaceId="space-1"
                loadMemoryImage={loadMemoryImage}
              />
            ),
          },
        ],
        { initialEntries: ['/story?tab=timeline'] },
      );

      expect(router.state.location.search).toBe('?tab=timeline');

      // 1. User changes content filter to MILESTONE -> pushes history
      const params1 = new URLSearchParams('tab=timeline');
      params1.set('type', StoryKind.MILESTONE);
      await router.navigate(`/story?${params1.toString()}`);
      expect(router.state.location.search).toBe('?tab=timeline&type=MILESTONE');

      // 2. User selects year 2026 -> pushes history
      const params2 = new URLSearchParams(params1);
      params2.set('year', '2026');
      await router.navigate(`/story?${params2.toString()}`);
      expect(router.state.location.search).toBe(
        '?tab=timeline&type=MILESTONE&year=2026',
      );

      // 3. User changes order to ASC -> pushes history
      const params3 = new URLSearchParams(params2);
      params3.set('order', StoryOrder.ASC);
      await router.navigate(`/story?${params3.toString()}`);
      expect(router.state.location.search).toBe(
        '?tab=timeline&type=MILESTONE&year=2026&order=ASC',
      );

      // 4. Browser Back -> restores order DESC
      await router.navigate(-1);
      expect(router.state.location.search).toBe(
        '?tab=timeline&type=MILESTONE&year=2026',
      );

      // 5. Browser Back -> restores any year
      await router.navigate(-1);
      expect(router.state.location.search).toBe('?tab=timeline&type=MILESTONE');

      // 6. Browser Back -> restores all types
      await router.navigate(-1);
      expect(router.state.location.search).toBe('?tab=timeline');

      // 7. Browser Forward -> restores MILESTONE
      await router.navigate(1);
      expect(router.state.location.search).toBe('?tab=timeline&type=MILESTONE');

      // 8. Browser Forward -> restores year 2026
      await router.navigate(1);
      expect(router.state.location.search).toBe(
        '?tab=timeline&type=MILESTONE&year=2026',
      );
    });
  });
});
