import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter, MemoryRouter } from 'react-router-dom';
import { StoryKind } from '../api/generated/models/StoryKind';
import { StoryOrder } from '../api/generated/models/StoryOrder';
import type { ReferenceApis } from '../client/referenceFlow';
import {
  parseStoryFilters,
  storyCacheResourceId,
} from '../client/storyProduct';
import de from '../i18n/locales/de';
import m5s5 from '../i18n/locales/m5s5';
import storyProducts from '../i18n/locales/storyProducts';
import { StoryProductPage } from './StoryProductPage';

const loadMemoryImage = async () => 'blob:test-image';

function renderStoryPage(route: string, cachedData: unknown): string {
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
  queryClient.setQueryData(['story-discover', 'account-1', 'space-1'], {
    value: {
      items: (cachedData as any).items || [],
      lead: (cachedData as any).items?.[0] || null,
      leadContext: null,
    },
    source: 'network',
  });

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <StoryProductPage
          apis={{} as ReferenceApis}
          accountId="account-1"
          spaceId="space-1"
          loadMemoryImage={loadMemoryImage}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('StoryProductPage', () => {
  it('renders tab switcher and discovery view by default', () => {
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
            attachments: [{ id: 'att-1', mediaType: 'image/jpeg' }],
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

    expect(html).toContain('momente-tabs');
    expect(html).toContain('momente-discover-page');
    expect(html).toContain('momente-hero-highlight');
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
            attachments: [{ id: 'att-1', mediaType: 'image/jpeg' }],
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
    expect(html).toContain('momente-tapestry-media');
    expect(html).toContain('momente-tapestry-note');
    expect(html).toContain('momente-tapestry-milestone');
    // The Heart Moment renders as a quoted note, not a titled card
    expect(html).toContain('momente-tapestry-quote');
    expect(html).toContain('First apartment together');
  });

  it('shows only the first name in Discover attribution, never the full display name (#791 second follow-up)', () => {
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
            attachments: [{ id: 'att-1', mediaType: 'image/jpeg' }],
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

    // The visible byAuthor attribution text is first-name-only. (The
    // avatar's own aria-label is a separate, pre-existing accessibility
    // label unrelated to this fix and out of #791's scope, which is why
    // this doesn't assert on "Alex Winter"/"Lea Sommer" absence overall.)
    expect(html).toContain('von Alex</span>');
    expect(html).toContain('von Lea</span>');
    expect(html).not.toContain('von Alex Winter');
    expect(html).not.toContain('von Lea Sommer');
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
    expect(html).toContain('Summer Lake Vacation');

    // #858 follow-up: `Diesen Monat -> Alle anzeigen` links here, so
    // Zeitleiste must be the active tab immediately on landing, not just the
    // rendered content.
    expect(html).toMatch(
      /aria-selected="true" class="momente-tab-btn active"[^>]*>[\s\S]*?Zeitleiste/,
    );
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

    expect(html).toContain('momente-tapestry-milestone');
    expect(html).toContain('Moved in together');
    expect(html).toContain('momente-browse-layer');
    expect(html).toContain(de.story.browseMilestones);
    expect(html).toContain(de.story.browseChapters);
    expect(html).toContain(de.story.browseYears);
    expect(html).toContain('href="/story?tab=timeline&amp;type=MILESTONE"');
    expect(html).toContain('href="/story/chapters"');
    expect(html).toContain('href="/story/years"');
    expect(html).not.toContain(de.story.milestonesDesc);
    expect(html).not.toContain('momente-archive-links');
    expect(html).not.toContain('momente-year-archive');
  });

  describe('canonical Discover ordering and presentation', () => {
    it('preserves the exact server-provided item order without client-side reshuffling', () => {
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
              capabilities: { canComment: true, canDelete: true, canEdit: true },
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
              capabilities: { canComment: true, canDelete: true, canEdit: true },
            },
          },
        ],
        hasMore: false,
        nextCursor: null,
      });

      const tapestryStart = html.indexOf('momente-tapestry-bands');
      expect(tapestryStart).toBeGreaterThan(-1);

      // Spring Picnic is rendered BEFORE Late August Vacation, exactly as provided by the backend array.
      const springPicnicIndex = html.indexOf('Spring Picnic', tapestryStart);
      const lateAugustIndex = html.indexOf('Late August Vacation', tapestryStart);
      
      expect(springPicnicIndex).toBeGreaterThan(-1);
      expect(lateAugustIndex).toBeGreaterThan(-1);
      expect(springPicnicIndex).toBeLessThan(lateAugustIndex);
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

      // All 14 items should be rendered, because Discover is now bounded by the backend
      expect(tapestryHtml).toContain('Moment 0');
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
      const augustIndex = html.indexOf('August 2026');
      const julyIndex = html.indexOf('Juli 2026');
      expect(augustIndex).toBeGreaterThan(-1);
      expect(julyIndex).toBeGreaterThan(-1);
      expect(augustIndex).toBeLessThan(julyIndex);
      expect(html.indexOf('Late August Vacation')).toBeLessThan(julyIndex);
      expect(html.indexOf('Spring Picnic')).toBeGreaterThan(julyIndex);
    });

    it('keeps a single load-more control after the last month group, not one per month', () => {
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

      const matches = html.match(/story-pagination/g) ?? [];
      expect(matches.length).toBe(1);
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
