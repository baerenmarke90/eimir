// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import type { ReferenceApis } from '../client/referenceFlow';
import {
  parseStoryFilters,
  storyCacheResourceId,
} from '../client/storyProduct';
import de from '../i18n/locales/de';
import { StoryProductPage } from './StoryProductPage';

afterEach(cleanup);

it.each([
  ['timeline', ['ArrowRight', 'ArrowRight'], 'timeline'],
  ['discover', ['ArrowLeft', 'ArrowLeft'], 'discover'],
  ['timeline', ['Home', 'End', 'Home'], 'discover'],
  ['discover', ['End', 'Home', 'End'], 'timeline'],
] as const)(
  'honors navigation from %s via %j while route commits are held',
  async (initialView, keys, finalView) => {
    const context = 'type=MEMORY&year=2026&order=ASC';
    const initial = `/story?tab=${initialView}&${context}`;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let hold = false;
    const loader = vi.fn(() => (hold ? held : null));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const filters = parseStoryFilters(
      new URLSearchParams(initial.split('?')[1]),
    );
    client.setQueryData(['story', 'space', storyCacheResourceId(filters)], {
      pages: [
        {
          value: { items: [], hasMore: false, nextCursor: null },
          source: 'network',
        },
      ],
      pageParams: [null],
    });
    client.setQueryData(authorSummaryQueryKeys.discover('space', 'account'), {
      value: {
        items: [],
        lead: null,
        leadContext: null,
        selectionDate: new Date('2026-10-31'),
      },
      source: 'network',
    });
    const router = createMemoryRouter(
      [
        {
          id: 'story',
          path: '/story',
          loader,
          element: (
            <StoryProductPage
              apis={{} as ReferenceApis}
              accountId="account"
              spaceId="space"
              loadMemoryImage={async () => ''}
            />
          ),
        },
      ],
      {
        initialEntries: [initial],
        hydrationData: { loaderData: { story: null } },
      },
    );
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    const diary = await screen.findByRole('tab', {
      name: de.story.tabTimeline,
    });
    const discover = screen.getByRole('tab', { name: de.story.tabDiscover });
    hold = true;
    const tabs = { discover, timeline: diary };
    let focused = initialView;
    tabs[focused].focus();
    for (const key of keys) {
      fireEvent.keyDown(tabs[focused], { key });
      focused =
        key === 'Home'
          ? 'discover'
          : key === 'End'
            ? 'timeline'
            : focused === 'discover'
              ? 'timeline'
              : 'discover';
      expect(document.activeElement).toBe(tabs[focused]);
      expect(router.state.location.search).toBe(
        `?tab=${initialView}&${context}`,
      );
      expect(router.state.navigation.state).toBe('loading');
    }
    await act(async () => {
      release();
    });
    await waitFor(() => expect(router.state.navigation.state).toBe('idle'));
    expect(router.state.location.search).toBe(`?tab=${finalView}&${context}`);
    const selected = tabs[finalView];
    const other = tabs[finalView === 'discover' ? 'timeline' : 'discover'];
    expect(selected.getAttribute('aria-selected')).toBe('true');
    expect(selected.tabIndex).toBe(0);
    expect(other.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(selected);
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);

    hold = false;
    fireEvent.click(other);
    await waitFor(() =>
      expect(other.getAttribute('aria-selected')).toBe('true'),
    );
    await act(async () => {
      await router.navigate(-1);
    });
    expect(router.state.location.search).toBe(`?tab=${finalView}&${context}`);
    expect(selected.getAttribute('aria-selected')).toBe('true');
    // Activating the current tab must not add a duplicate history entry.
    const locationKey = router.state.location.key;
    fireEvent.click(selected);
    expect(router.state.location.key).toBe(locationKey);
    router.dispose();
    client.clear();
  },
);
