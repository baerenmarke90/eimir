// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SearchPage } from '../api/generated/models/SearchPage';
import type { M4ProductApis } from '../client/m4Product';
import { TaskOriginProvider, useTaskOrigin } from '../client/taskOrigin';
import { ActivityProductPage, SearchProductPage } from './M4ProductPages';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

let probeOrigin: ReturnType<typeof useTaskOrigin>;
let probeNavigate: ReturnType<typeof useNavigate>;
let probeLocation: ReturnType<typeof useLocation>;
function Probe() {
  probeOrigin = useTaskOrigin();
  probeNavigate = useNavigate();
  probeLocation = useLocation();
  return null;
}

function renderSearch(searchSpaceContent: (q: string) => Promise<SearchPage>) {
  const apis = {
    search: {
      searchSpaceContent: (params: { q: string }) =>
        searchSpaceContent(params.q),
    },
  } as unknown as M4ProductApis;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/search']}>
        <TaskOriginProvider accountId="account-1" spaceId="space-1">
          <Probe />
          <SearchProductPage apis={apis} spaceId="space-1" />
        </TaskOriginProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderActivity() {
  const apis = {
    activity: {
      getActivity: vi.fn().mockResolvedValue({
        items: [
          {
            id: 'activity-1',
            sourceEventId: 'event-1',
            kind: 'MEMORY_CREATED',
            actorId: 'partner-1',
            actor: {
              id: 'partner-1',
              displayName: 'Alex',
              profileAttachmentId: null,
            },
            targetType: 'MEMORY',
            targetId: 'mem-1',
            target: {
              targetType: 'MEMORY',
              targetId: 'mem-1',
              title: 'Our memory',
            },
            createdAt: new Date('2026-09-19T12:00:00Z'),
            occurredAt: new Date('2026-09-19T12:00:00Z'),
          },
        ],
        nextCursor: null,
        hasMore: false,
      }),
    },
  } as unknown as M4ProductApis;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/today/activity']}>
        <TaskOriginProvider accountId="account-1" spaceId="space-1">
          <Probe />
          <Routes>
            <Route
              path="/today/activity"
              element={
                <ActivityProductPage
                  apis={apis}
                  spaceId="space-1"
                  currentAccountId="account-1"
                />
              }
            />
            <Route
              path="/story/memories/:memoryId"
              element={<div>Memory detail</div>}
            />
          </Routes>
        </TaskOriginProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SearchProductPage origin/return (#966)', () => {
  it('restores the submitted query after a Search-origin round trip, never via the URL', async () => {
    const searchSpaceContent = vi.fn(
      async (_q: string): Promise<SearchPage> => ({
        items: [
          {
            id: 'mem-1',
            type: 'MEMORY',
            title: 'Our first trip',
            excerpt: 'A rainy weekend that turned lovely',
            occurredOn: new Date('2026-05-01T00:00:00Z'),
            parentId: null,
            scope: 'SHARED',
          },
        ],
        nextCursor: null,
      }),
    );
    const user = userEvent.setup();
    renderSearch(searchSpaceContent);

    const input = screen.getByLabelText(/Suchbegriff/i);
    await user.type(input, 'our first trip');
    await user.click(screen.getByRole('button', { name: /^Suchen$/i }));

    expect(await screen.findByText('Our first trip')).toBeTruthy();
    expect(searchSpaceContent).toHaveBeenCalledWith('our first trip');

    // Simulate opening the result (captures origin with the registered
    // searchQuery metadata) and then pressing Back to the exact /search
    // location — never carrying the query through the URL.
    let key: string | null = null;
    await act(async () => {
      key = probeOrigin.captureOrigin();
      probeNavigate('/story/memories/mem-1', {
        state: { taskOriginKey: key },
      });
    });
    expect(key).toMatch(/^task-/);

    await act(async () => {
      probeOrigin.requestReturn(key);
    });

    const restoredInput =
      await screen.findByLabelText<HTMLInputElement>(/Suchbegriff/i);
    expect(restoredInput.value).toBe('our first trip');
    expect(await screen.findByText('Our first trip')).toBeTruthy();
  });
});

describe('ActivityProductPage task origin (#1084)', () => {
  it('captures Activity before canonical target navigation and restores it on Back', async () => {
    const user = userEvent.setup();
    renderActivity();

    await user.click(await screen.findByRole('link', { name: /Our memory/i }));

    expect(probeLocation.pathname).toBe('/story/memories/mem-1');
    const key = (probeLocation.state as { taskOriginKey?: unknown } | null)
      ?.taskOriginKey;
    expect(key).toMatch(/^task-/);
    expect(probeOrigin.resolveOrigin(key)?.to).toBe('/today/activity');

    await act(async () => probeOrigin.requestReturn(key));
    expect(probeLocation.pathname).toBe('/today/activity');
  });
});
