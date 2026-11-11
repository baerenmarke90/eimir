// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import navigation from '../i18n/locales/navigation';
import { PlanningCreatePage } from './PlanningCreatePage';
import { QuickCreateMenu } from './QuickCreateMenu';
import { RouteEntryHandoff } from './RouteEntryHandoff';
import { SharedPlanningOverviewPage } from './SharedPlanningOverviewPage';

afterEach(async () => {
  cleanup();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
});

describe('QuickCreateMenu - Desktop Popover', () => {
  it('renders desktop menu popover when opened with title and 9 actions', () => {
    render(
      <MemoryRouter initialEntries={['/today']}>
        <QuickCreateMenu />
      </MemoryRouter>,
    );

    const trigger = screen.getByRole('button', { name: navigation.newContent });
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(trigger);

    const menu = screen.getByRole('menu');
    expect(menu).toBeDefined();
    expect(menu.className).toContain('quick-create-menu');
    expect(screen.getByText(navigation.quickCreateTitle)).toBeDefined();

    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(9);

    // Existing capture entries keep their relative order around the optional Pro action.
    expect(items.map((item) => item.getAttribute('href'))).toEqual([
      '/story/memories/new',
      '/story/heart-moments/new',
      '/today/only-you/new',
      '/story/milestones/new',
      '/plan/wishes/new',
      '/more/collections/new',
      '/plan/plans/new',
      '/more/private/notes/new',
      '/more/private/gift-ideas/new',
    ]);

    // Verify sublines exist
    expect(screen.getByText(navigation.quickCreateMemorySubline)).toBeDefined();
    expect(screen.getByText(navigation.quickCreateWishSubline)).toBeDefined();
    expect(
      screen.getByText(navigation.quickCreateGiftIdeaSubline),
    ).toBeDefined();
    expect(screen.getByText(navigation.quickCreateForMe)).toBeDefined();
  });

  it('dismisses the desktop menu on outside pointer input', () => {
    render(
      <MemoryRouter initialEntries={['/today']}>
        <QuickCreateMenu />
      </MemoryRouter>,
    );

    const trigger = screen.getByRole('button', { name: navigation.newContent });
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeDefined();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('does not let stale Escape focus restoration steal focus after a rapid reopen', async () => {
    render(
      <MemoryRouter initialEntries={['/today']}>
        <QuickCreateMenu />
      </MemoryRouter>,
    );

    const trigger = screen.getByRole('button', { name: navigation.newContent });
    fireEvent.click(trigger);
    screen.getAllByRole('menuitem')[0].focus();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    const reopenedFirstItem = screen.getAllByRole('menuitem')[0];
    reopenedFirstItem.focus();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.activeElement).toBe(reopenedFirstItem);
  });

  it('supports arrow key navigation on desktop', () => {
    render(
      <MemoryRouter initialEntries={['/today']}>
        <QuickCreateMenu />
      </MemoryRouter>,
    );

    const trigger = screen.getByRole('button', { name: navigation.newContent });
    fireEvent.click(trigger);

    const menu = screen.getByRole('menu');
    const items = screen.getAllByRole('menuitem');
    items[0].focus();
    expect(document.activeElement).toBe(items[0]);

    // Arrow down moves to next
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);

    // End key moves to last item (gift idea)
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(items.at(-1));

    // Home key moves to first item (memory)
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(items[0]);
  });
});

describe('QuickCreateMenu -> shared route-entry handoff (#810/#839)', () => {
  beforeAll(() => {
    // jsdom does not implement scrollIntoView; the real API is exercised by
    // browser QA, this stub only keeps the DOM assertions below runnable.
    Element.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    window.scrollTo = vi.fn();
  });

  function renderQuickCreateWithPlanningComposer(initialPath: string) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialPath]}>
          <QuickCreateMenu />
          <RouteEntryHandoff />
          <Routes>
            <Route
              path="/today"
              element={
                <SharedPlanningOverviewPage
                  apis={{} as SharedPlanningApis}
                  spaceId="space-1"
                />
              }
            />
            <Route
              path="/plan"
              element={
                <SharedPlanningOverviewPage
                  apis={{} as SharedPlanningApis}
                  spaceId="space-1"
                />
              }
            />
            <Route
              path="/plan/wishes/new"
              element={
                <PlanningCreatePage
                  kind="wish"
                  apis={{} as SharedPlanningApis}
                  spaceId="space-1"
                />
              }
            />
            <Route
              path="/plan/plans/new"
              element={
                <PlanningCreatePage
                  kind="plan"
                  apis={{} as SharedPlanningApis}
                  spaceId="space-1"
                />
              }
            />
            <Route
              path="/more/private/gift-ideas/new"
              element={<p>Gift idea task</p>}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('Quick Create -> Wish opens the focused task without forcing focus into its input', () => {
    renderQuickCreateWithPlanningComposer('/today');

    fireEvent.click(
      screen.getByRole('button', { name: navigation.newContent }),
    );
    fireEvent.click(screen.getByText(navigation.quickCreateWish));

    expect(screen.queryByRole('dialog')).toBeNull();
    const titleInput = document.getElementById('planning-create-title');
    expect(titleInput).not.toBeNull();
    expect(document.activeElement).not.toBe(titleInput);
  });

  it('Quick Create -> Plan opens the focused task without forcing focus into its input', () => {
    renderQuickCreateWithPlanningComposer('/today');

    fireEvent.click(
      screen.getByRole('button', { name: navigation.newContent }),
    );
    fireEvent.click(screen.getByText(navigation.quickCreatePlan));

    expect(screen.queryByRole('dialog')).toBeNull();

    const titleInput = document.getElementById('planning-create-title');
    expect(titleInput).not.toBeNull();
    expect(document.activeElement).not.toBe(titleInput);
  });

  it('Quick Create -> Notiz/Geschenkidee navigation lands at the top of the new page', () => {
    renderQuickCreateWithPlanningComposer('/today');

    fireEvent.click(
      screen.getByRole('button', { name: navigation.newContent }),
    );
    fireEvent.click(screen.getByText(navigation.quickCreateGiftIdea));

    // No hash target on this destination: the shared handoff lands the
    // user at the top of the freshly mounted create page rather than
    // wherever /today happened to be scrolled to.
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('a normal /plan visit without a hash does not force focus into either composer', () => {
    renderQuickCreateWithPlanningComposer('/plan');

    expect(document.activeElement).not.toBe(
      document.getElementById('planning-create-title'),
    );
  });

  it('an irrelevant/unknown hash does not force focus into either composer', () => {
    renderQuickCreateWithPlanningComposer('/plan#does-not-exist');

    expect(document.activeElement).not.toBe(
      document.getElementById('planning-create-title'),
    );
  });
});
