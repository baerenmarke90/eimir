// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReferenceApis } from '../client/referenceFlow';
import { EDITOR_HISTORY_STATE_KEY } from '../client/useEditorHistoryEntry';
import de from '../i18n/locales/de';
import storyProducts from '../i18n/locales/storyProducts';
import taskSheets from '../i18n/locales/taskSheets';
import { StoryProductPage } from './StoryProductPage';

let search = '';
function LocationProbe() {
  search = useLocation().search;
  return null;
}
const filters = storyProducts.storyFilters;
const empty = {
  items: [],
  availableYears: [2025, 2024],
  hasMore: false,
  nextCursor: null,
};
function setup() {
  const getStoryTimeline = vi.fn().mockResolvedValue(empty);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  for (const key of ['timeline:MEMORY:2025:DESC', 'timeline:ALL:ALL:DESC']) {
    queryClient.setQueryData(['story', 'space', key], {
      pages: [{ value: empty, source: 'network' }],
      pageParams: [null],
    });
  }
  render(
    <MemoryRouter
      initialEntries={['/story?tab=timeline&type=MEMORY&year=2025']}
    >
      <QueryClientProvider client={queryClient}>
        <LocationProbe />
        <StoryProductPage
          apis={{ story: { getStoryTimeline } } as unknown as ReferenceApis}
          accountId="account"
          spaceId="space"
          loadMemoryImage={async () => ''}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return getStoryTimeline;
}
async function openFilters() {
  fireEvent.click(screen.getByRole('button', { name: filters.toggleButton }));
  await waitFor(() =>
    expect(window.history.state?.[EDITOR_HISTORY_STATE_KEY]).toBeTruthy(),
  );
  return screen.getByRole('dialog', { name: filters.aria });
}
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(async () => {
  cleanup();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
});

describe('Timeline filter task', () => {
  it('uses icon-only Timeline chrome, exposes active scope without colour alone and removes manual refresh', () => {
    setup();
    const trigger = screen.getByRole('button', {
      name: filters.toggleButton,
    });
    expect(trigger.classList.contains('story-filter-icon-button')).toBe(true);
    expect(trigger.textContent?.trim()).toBe('2');
    expect(
      trigger.querySelector('.story-filter-active-badge')?.textContent,
    ).toBe('2');
    expect(screen.queryByText(de.common.refresh)).toBeNull();
  });

  it('keeps edits as drafts, offers authoritative years and cancels without changing applied scope', async () => {
    const load = setup();
    const dialog = await openFilters();
    const year = within(dialog).getByLabelText(filters.year);
    expect(
      Array.from((year as HTMLSelectElement).options).map(
        (option) => option.value,
      ),
    ).toEqual(['', '2025', '2024']);
    fireEvent.change(year, { target: { value: '2024' } });
    expect(search).toContain('year=2025');
    expect(load).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole('button', { name: taskSheets.filterCancel }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(search).toContain('year=2025');
    const reopened = await openFilters();
    expect(
      (within(reopened).getByLabelText(filters.year) as HTMLSelectElement)
        .value,
    ).toBe('2025');
  });

  it('applies once after removing modal history and preserves a visible no-match scope', async () => {
    const load = setup();
    const dialog = await openFilters();
    fireEvent.change(within(dialog).getByLabelText(filters.year), {
      target: { value: '2024' },
    });
    fireEvent.change(within(dialog).getByLabelText(filters.type), {
      target: { value: 'MILESTONE' },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: filters.apply }),
    );
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    expect(load.mock.calls[0][0]).toMatchObject({
      type: ['MILESTONE'],
      year: 2024,
    });
    expect(window.history.state?.[EDITOR_HISTORY_STATE_KEY]).toBeUndefined();
    expect(search).toContain('year=2024');
    expect(screen.getByText(filters.noMatches)).toBeDefined();
    expect(
      screen.getByRole('button', { name: `${filters.removeFilter}: 2024` }),
    ).toBeDefined();
  });

  it('keeps Discover independent, hides its Timeline filter and retains scope for the return tab', async () => {
    const load = setup();
    expect(
      screen.getByRole('button', { name: filters.toggleButton }),
    ).toBeDefined();

    fireEvent.click(screen.getByRole('tab', { name: de.story.tabDiscover }));
    expect(search).toContain('tab=discover');
    expect(search).toContain('year=2025');
    expect(load).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: filters.toggleButton }),
    ).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: de.story.tabTimeline }));
    expect(search).toContain('tab=timeline');
    expect(
      screen.getByRole('button', { name: filters.toggleButton }),
    ).toBeDefined();
    expect(
      screen.getByRole('button', { name: `${filters.removeFilter}: 2025` }),
    ).toBeDefined();
  });
});
