import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter, MemoryRouter } from 'react-router-dom';
import type { DashboardApi } from '../api/generated/apis/DashboardApi';
import { StoryKind } from '../api/generated/models/StoryKind';
import { StoryOrder } from '../api/generated/models/StoryOrder';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { dashboardQueryKey } from '../client/dashboardQueries';
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

function renderStoryPage(
  route: string,
  cachedData: unknown,
  options?: {
    dashboard?: unknown;
    selectionDate?: Date;
    leadRediscovery?: unknown;
  },
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
        leadRediscovery: options?.leadRediscovery ?? null,
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

describe('Momente #1790 C2 featured rediscovery wording', () => {
  const selectionDate = new Date('2026-08-24T00:00:00Z');
  const untitled = {
    kind: 'MEMORY',
    effectiveDate: new Date('2025-08-24T00:00:00Z'),
    memory: {
      id: 'untitled-lead',
      title: '',
      happenedOn: new Date('2025-08-24T00:00:00Z'),
      createdAt: selectionDate,
      attachments: [],
      author: { id: 'author-1', displayName: 'Lea' },
      capabilities: { canEdit: true, canDelete: true, canComment: true },
    },
  };
  const leadRediscovery = {
    placeName: 'Lake Phoenix',
    photoCount: 0,
    videoCount: 0,
  };

  function headline(html: string): string {
    return (
      html.match(/<h3 class="momente-hero-title">([^<]*)<\/h3>/u)?.[1] ?? ''
    );
  }

  it('gives an untitled entry a variant headline and moves the date to the meta line', () => {
    const html = renderStoryPage(
      '/story?tab=discover',
      { items: [untitled], hasMore: false, nextCursor: null },
      { selectionDate, leadRediscovery },
    );
    const title = headline(html);
    expect(title).toBeTruthy();
    // Never the bare date that the meta line now carries.
    expect(html).not.toContain(
      `<h3 class="momente-hero-title">${html.match(/dateTime="2025-08-24">([^<]*)</u)?.[1]}</h3>`,
    );
    expect(title).not.toMatch(/^\d/u);
    expect(html).toContain(
      '<time class="rediscovery-date" dateTime="2025-08-24">',
    );
    // The story's open action names the lead with its visible headline.
    expect(html).toContain(
      `aria-label="${storyProducts.discoverStory.openName
        .replace('{{kind}}', de.story.featuredHighlight)
        .replace('{{title}}', title)}"`,
    );
  });

  it('is stable when the same selection is rendered again', () => {
    const render = () =>
      headline(
        renderStoryPage(
          '/story?tab=discover',
          { items: [untitled], hasMore: false, nextCursor: null },
          { selectionDate, leadRediscovery },
        ),
      );
    expect(render()).toBe(render());
  });
});

describe('Momente and the Wir retrospective', () => {
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

  it('keeps the dashboard-only retrospective out of Momente', () => {
    const html = renderStoryPage('/story?tab=discover', discover, {
      selectionDate,
      dashboard,
    });
    expect(html).not.toContain('momente-retrospective');
    expect(html).not.toContain('That day by the lake');
    expect(html).not.toContain('href="/story/memories/historic-memory"');
    expect(html).toContain('Unser aktueller Moment');
  });

  it('includes the same memory in the Fotostory when Discover selects it', () => {
    const historicMemory = {
      ...lead,
      effectiveDate: retrospective.occurredOn,
      memory: {
        ...lead.memory,
        id: retrospective.id,
        title: retrospective.titleOrText,
        happenedOn: retrospective.occurredOn,
      },
    };
    const html = renderStoryPage(
      '/story?tab=discover',
      { ...discover, items: [lead, historicMemory] },
      { selectionDate, dashboard },
    );
    expect(html).not.toContain('momente-retrospective');
    const story = html.slice(html.indexOf('class="momente-story"'));
    expect(story).toContain('That day by the lake');
    // The lead plays first and opens itself; the selected memory follows as
    // a curated slide, and the lead is not repeated among the themes.
    expect(story).toContain('data-story-slide="lead" data-state="current"');
    expect(story).toContain('href="/story/memories/discover-lead"');
    expect(story).toContain('data-story-slide="words" data-state="upcoming"');
    expect(story).not.toContain(
      '<h3 class="momente-story-title">Unser aktueller Moment',
    );
    expect(story).toContain(
      `, ${storyProducts.discoverStory.themeCount_one.replace('{{count}}', '1')}`,
    );
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
    expect(html).toContain('class="momente-story"');
    expect(html).toContain('I love you more each day');
  });

  it('renders the curated Discover selection as a Fotostory, not equal cards or the Tagebuch list (regression #790)', () => {
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

    // Direction C: theme bubbles above one story viewer replace the tapestry.
    expect(html).not.toContain('momente-tapestry');
    expect(html).toContain('momente-story-viewer');
    expect(
      Array.from(
        html.matchAll(/data-story-theme="([a-zA-Z]+)"/g),
        (match) => match[1],
      ),
    ).toEqual(['remember', 'heartMoments', 'milestones', 'remember']);

    // The "Wisst ihr noch?" lead is the first slide, then each content type
    // keeps a distinct slide, not one shared card shell (regression #790):
    // the Heart Moment as a quote, the Milestone behind its stamp bubble.
    expect(html).toContain('data-story-slide="lead" data-state="current"');
    expect(html).toContain('momente-hero-media');
    expect(html).toContain('data-story-slide="heart" data-state="upcoming"');
    expect(html).toContain('momente-story-quote');
    expect(html).toContain('momente-keepsake-stamp-mark');
    // Only the visible and the next slide are mounted.
    expect(html).not.toContain('data-story-slide="milestone"');
  });

  describe('issue #1784: Discover HeartMoment note follows its emotion', () => {
    const lead = {
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
    };
    const heartMoment = (emotion?: string) => ({
      kind: 'HEART_MOMENT',
      effectiveDate: new Date('2026-08-25T00:00:00Z'),
      heartMoment: {
        id: 'heart-1',
        text: 'I love you more each day',
        emotion,
        createdAt: new Date('2026-08-25T00:00:00Z'),
        author: { id: 'author-2', displayName: 'Taylor' },
        creator: { id: 'author-2', displayName: 'Taylor' },
      },
    });
    const renderHeartSlide = (emotion?: string): string => {
      const html = renderStoryPage('/story', {
        items: [lead, heartMoment(emotion)],
        hasMore: false,
        nextCursor: null,
      });
      const slide =
        /<article [^>]*momente-story-slide-heart[^>]*>[\s\S]*?<\/article>/.exec(
          html,
        );
      if (!slide) throw new Error('The Discover heart slide did not render.');
      return slide[0];
    };

    it('fills the slide with the emotion surface and names the feeling with the shared badge', () => {
      const slide = renderHeartSlide('LOVED');

      expect(slide).toContain('data-heart-emotion="LOVED"');
      expect(slide).toContain('heart-emotion-badge');
      expect(slide).toContain(
        `aria-label="${storyProducts.heartMomentProduct.emotionLabel}: ${storyProducts.heartEmotion.LOVED}"`,
      );
      expect(slide).toContain('I love you more each day');
      expect(slide).toContain(
        storyProducts.discoverStory.from.replace('{{name}}', 'Taylor'),
      );
    });

    it('opens the lead first and keeps the Heart Moment as the next slide', () => {
      const html = renderStoryPage('/story', {
        items: [lead, heartMoment('SEEN')],
        hasMore: false,
        nextCursor: null,
      });
      // The visible open action names the slide that is shown: the lead.
      // How a current Heart Moment is named is covered in DiscoverStory.
      const open = /<a [^>]*momente-story-open[^>]*>/.exec(html)?.[0] ?? '';
      expect(open).toContain('href="/story/memories/mem-1"');
      expect(open).toContain(
        `aria-label="${storyProducts.discoverStory.open}: ${de.story.featuredHighlight} „Summer Lake Vacation“"`,
      );
      expect(html).toContain('data-story-slide="heart" data-state="upcoming"');
    });

    it('keeps a neutral surface without an emotion', () => {
      const slide = renderHeartSlide();

      expect(slide).not.toContain('data-heart-emotion');
      expect(slide).not.toContain('heart-emotion-badge');
      expect(slide).toContain('momente-story-quote');
    });
  });

  describe('issue #977: curated reveal and viewport-aware media loading', () => {
    it('mounts only the visible and the next story slide and defers their media until near the viewport, while the Discover page wrapper no longer replays a generic mount animation', () => {
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
          ...[
            ['mem-3', 'Evening Swim'],
            ['mem-4', 'Morning Run'],
          ].map(([id, title], index) => ({
            kind: 'MEMORY',
            effectiveDate: new Date(Date.UTC(2026, 7, 18 - index)),
            memory: {
              id,
              title,
              occurredOn: new Date(Date.UTC(2026, 7, 18 - index)),
              createdAt: new Date(Date.UTC(2026, 7, 18 - index)),
              attachments: [
                {
                  id: `att-${id}`,
                  mediaType: 'image/jpeg',
                  isSensitive: false,
                },
              ],
              author: { id: 'author-1', displayName: 'Alex' },
              creator: { id: 'author-1', displayName: 'Alex' },
              capabilities: {
                canComment: true,
                canDelete: true,
                canEdit: true,
              },
            },
          })),
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

      // The lead slide's media loads eagerly: no deferred skeleton.
      const storyStart = html.indexOf('class="momente-story"');
      const heroStart = html.indexOf('momente-hero-media');
      const firstCurated = html.indexOf('momente-story-slide-photo');
      expect(storyStart).toBeGreaterThan(-1);
      expect(heroStart).toBeGreaterThan(storyStart);
      const heroHtml = html.slice(heroStart, firstCurated);
      expect(heroHtml).not.toContain('data-media-deferred="true"');

      // Only the visible slide (the lead) and the next one are mounted and
      // may load.
      const storyHtml = html.slice(
        storyStart,
        html.indexOf('id="momente-diary"'),
      );
      expect(storyHtml).toContain('Weekend Hike');
      expect(storyHtml).not.toContain('Evening Swim');
      expect(storyHtml).not.toContain('Morning Run');
      expect(storyHtml).not.toContain('data-timeline-reveal-key');
      expect(storyHtml).not.toContain('story-timeline-progressive-reveal');

      // Story media is viewport-aware: it renders the deferred skeleton
      // instead of eagerly resolving the authenticated loader.
      expect(storyHtml).toContain('data-media-deferred="true"');
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
    expect(html).toContain(de.story.addMoment);
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain('new-space-cta');
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

          const storyStart = html.indexOf('class="momente-story"');
          expect(storyStart).toBeGreaterThan(-1);

          // Canonical backend order: Spring Picnic is BEFORE Late August Vacation
          const springPicnicIndex = html.indexOf('Spring Picnic');
          const lateAugustIndex = html.indexOf(
            'Late August Vacation',
            storyStart,
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

      const storyStart = html.indexOf('class="momente-story"');
      expect(storyStart).toBeGreaterThan(-1);
      const storyHtml = html.slice(storyStart);

      // The lead plays once as its own first slide, outside the uncapped
      // backend selection; the curated themes hold all 13 remaining entries,
      // and the first of them is the next slide.
      expect(storyHtml).toContain('<h3 class="momente-hero-title">Moment 0<');
      expect(storyHtml).not.toContain(
        '<h3 class="momente-story-title">Moment 0<',
      );
      expect(storyHtml).toContain('>Moment 1<');
      expect(storyHtml).toContain(
        `, ${storyProducts.discoverStory.themeCount_other.replace('{{count}}', '13')}`,
      );
      // The lead's own theme shows a single progress segment.
      expect(
        storyHtml.match(/class="momente-story-segment"/g) ?? [],
      ).toHaveLength(1);
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
