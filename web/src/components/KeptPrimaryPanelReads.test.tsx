// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RecapsApi } from '../api/generated/apis/RecapsApi';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { setPrimaryTabPeek } from '../client/primaryTabPeek';
import type { ReferenceApis } from '../client/referenceFlow';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import {
  parseStoryFilters,
  storyCacheResourceId,
} from '../client/storyProduct';
import { SharedPlanningOverviewPage } from './SharedPlanningOverviewPage';
import { StoryProductPage } from './StoryProductPage';

/**
 * A primary panel that is kept mounted while another tab is shown keeps its
 * own view and reads nothing it did not read before. It previews the page a
 * primary selection opens (Discover, Plans) only while a swipe reveals it.
 */

afterEach(() => {
  cleanup();
  setPrimaryTabPeek(null);
});
beforeEach(() => setPrimaryTabPeek(null));

function storyClient(route: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const filters = parseStoryFilters(new URLSearchParams(route.split('?')[1]));
  client.setQueryData(['story', 'space', storyCacheResourceId(filters)], {
    pages: [
      {
        value: { items: [], hasMore: false, nextCursor: null },
        source: 'network',
      },
    ],
    pageParams: [null],
  });
  client.setQueryData(authorSummaryQueryKeys.discover('account', 'space'), {
    value: {
      items: [],
      lead: null,
      leadContext: null,
      selectionDate: new Date('2026-10-31'),
    },
    source: 'network',
  });
  return client;
}

function renderStory(route: string, active: boolean) {
  const getRecapOverview = vi.fn(async () => ({
    canCompose: false,
    editions: [],
  }));
  const client = storyClient(route);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <StoryProductPage
          apis={
            {
              attachments: { contentBaseUrl: 'https://eimir.test' },
            } as unknown as ReferenceApis
          }
          accountId="account"
          spaceId="space"
          active={active}
          loadMemoryImage={async () => ''}
          recapsApi={{ getRecapOverview } as unknown as RecapsApi}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { getRecapOverview };
}

const discoverPanel = () => document.getElementById('momente-panel-discover');
const timelinePanel = () => document.getElementById('momente-panel-timeline');

it('keeps a parked Timeline from reading the Discover recap', async () => {
  const { getRecapOverview } = renderStory('/story?tab=timeline', false);
  await act(async () => {
    await Promise.resolve();
  });
  expect(timelinePanel()?.hidden).toBe(false);
  expect(discoverPanel()?.hidden).toBe(true);
  expect(getRecapOverview).not.toHaveBeenCalled();
});

it('previews Discover only while a swipe reveals the parked Story', async () => {
  const { getRecapOverview } = renderStory('/story?tab=timeline', false);
  act(() => setPrimaryTabPeek('/plan'));
  expect(discoverPanel()?.hidden).toBe(true);
  expect(getRecapOverview).not.toHaveBeenCalled();

  act(() => setPrimaryTabPeek('/story'));
  expect(discoverPanel()?.hidden).toBe(false);
  expect(timelinePanel()?.hidden).toBe(true);
  await waitFor(() => expect(getRecapOverview).toHaveBeenCalledTimes(1));

  // A cancelled swipe returns the parked panel to its own view.
  act(() => setPrimaryTabPeek(null));
  expect(timelinePanel()?.hidden).toBe(false);
  expect(discoverPanel()?.hidden).toBe(true);
});

it('keeps the active Timeline from reading the Discover recap', async () => {
  const { getRecapOverview } = renderStory('/story?tab=timeline', true);
  await act(async () => {
    await Promise.resolve();
  });
  expect(timelinePanel()?.hidden).toBe(false);
  expect(getRecapOverview).not.toHaveBeenCalled();
});

function planningApis() {
  const listPlans = vi.fn(async () => ({
    items: [],
    hasMore: false,
    nextCursor: null,
  }));
  const reads = new Proxy(
    {},
    {
      get: () => async () => ({ items: [], hasMore: false, nextCursor: null }),
    },
  );
  const apis = new Proxy(
    { plans: { listPlans } },
    {
      get: (target, group: string) =>
        (target as Record<string, unknown>)[group] ?? reads,
    },
  );
  return { apis: apis as unknown as SharedPlanningApis, listPlans };
}

function renderPlanning(active: boolean) {
  const { apis, listPlans } = planningApis();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/plan#wishes']}>
        <SharedPlanningOverviewPage
          active={active}
          apis={apis}
          spaceId="space"
          accountId="account"
          apiBaseUrl="https://eimir.test"
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { listPlans };
}

const selectedSegment = () =>
  document.querySelector('[role="tab"][aria-selected="true"]')?.textContent;

it('keeps parked Wishes from reading the Plans overview', async () => {
  const { listPlans } = renderPlanning(false);
  await act(async () => {
    await Promise.resolve();
  });
  expect(selectedSegment()).toMatch(/^W/u);
  expect(listPlans).not.toHaveBeenCalled();
});

it('previews Plans while a swipe reveals the parked Planen', async () => {
  const { listPlans } = renderPlanning(false);
  act(() => setPrimaryTabPeek('/plan'));
  await waitFor(() => expect(listPlans).toHaveBeenCalledTimes(1));
  expect(selectedSegment()).toMatch(/^Pl/u);
});
