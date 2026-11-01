import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StoryOrder } from '../api/generated/models/StoryOrder';
import type { ReferenceApis } from '../client/referenceFlow';
import {
  parseStoryFilters,
  storyCacheResourceId,
  type StoryFilters,
} from '../client/storyProduct';
import de from '../i18n/locales/de';
import { StoryProductPage } from './StoryProductPage';
import { StoryYearDetailPage, StoryYearsIndexPage } from './StoryYearsPage';

const loadMemoryImage = async () => 'blob:test-image';

function memory(id: string, title: string, effectiveDate: string) {
  const date = new Date(`${effectiveDate}T00:00:00Z`);
  return {
    kind: 'MEMORY' as const,
    effectiveDate: date,
    memory: {
      id,
      title,
      happenedOn: date,
      createdAt: date,
      author: { id: 'author-1', displayName: 'Alex Winter' },
      capabilities: { canComment: true, canDelete: true, canEdit: true },
      attachments: [],
    },
  };
}

function renderYearsIndex(cachedData: unknown): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(['story-years', 'space-1'], {
    value: cachedData,
    source: 'network',
  });

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/story/years']}>
        <StoryYearsIndexPage
          apis={{} as ReferenceApis}
          accountId="account-1"
          spaceId="space-1"
          loadMemoryImage={loadMemoryImage}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderYearDetail(year: number, cachedData: unknown): string {
  const filters: StoryFilters = {
    kind: null,
    year,
    order: StoryOrder.ASC,
  };
  const cacheKey = storyCacheResourceId(filters);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(['story-year', 'space-1', cacheKey], {
    pages: [{ value: cachedData, source: 'network' }],
    pageParams: [null],
  });

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/story/years/${year}`]}>
        <Routes>
          <Route
            path="/story/years/:year"
            element={
              <StoryYearDetailPage
                apis={{} as ReferenceApis}
                accountId="account-1"
                spaceId="space-1"
                loadMemoryImage={loadMemoryImage}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderStoryDiscover(cachedData: unknown): string {
  const route = '/story';
  const filters = parseStoryFilters(new URLSearchParams());
  const cacheKey = storyCacheResourceId(filters);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(['story', 'space-1', cacheKey], {
    pages: [{ value: cachedData, source: 'network' }],
    pageParams: [null],
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

describe('Story annual archive (#868)', () => {
  it('renders the years index from authoritative availableYears rather than loaded items', () => {
    const html = renderYearsIndex({
      items: [memory('m-2026', 'Only loaded item', '2026-09-12')],
      availableYears: [2026, 2024, 2022],
      hasMore: true,
      nextCursor: 'next',
    });

    expect(html).toContain('Unsere Jahre');
    expect(html).toContain('href="/story/years/2026"');
    expect(html).toContain('href="/story/years/2024"');
    expect(html).toContain('href="/story/years/2022"');
    expect(html).not.toContain('href="/story/years/2025"');
  });

  it('renders one year oldest-first with month structure and existing source deep links', () => {
    const html = renderYearDetail(2025, {
      items: [
        memory('jan-memory', 'Winterspaziergang', '2025-01-12'),
        memory('mar-memory', 'Erster Frühlingstag', '2025-03-08'),
      ],
      availableYears: [2026, 2025, 2024],
      hasMore: false,
      nextCursor: null,
    });

    expect(html).toContain('Unser Jahr 2025');
    expect(html).toContain('Januar 2025');
    expect(html).toContain('März 2025');
    expect(html.indexOf('Januar 2025')).toBeLessThan(html.indexOf('März 2025'));
    expect(html).toContain('href="/story/memories/jan-memory"');
    expect(html).toContain('href="/story/memories/mar-memory"');
  });

  it('keeps an unavailable deep-linked year out of the normal chronology', () => {
    const html = renderYearDetail(2023, {
      items: [],
      availableYears: [2026, 2025],
      hasMore: false,
      nextCursor: null,
    });

    expect(html).toContain(de.storyYears.unavailableTitle);
    expect(html).not.toContain('story-year-month');
  });

  it('keeps the compact Momente years entry independent of partially loaded pagination', () => {
    const html = renderStoryDiscover({
      items: [memory('m-2026', 'Aktueller Moment', '2026-09-12')],
      availableYears: [2026, 2024],
      hasMore: true,
      nextCursor: 'next',
    });

    expect(html).toContain('href="/story/years"');
    expect(html).not.toContain('href="/story/years/2026"');
    expect(html).not.toContain('href="/story/years/2024"');
    expect(html).not.toContain('momente-year-archive');
  });
});
