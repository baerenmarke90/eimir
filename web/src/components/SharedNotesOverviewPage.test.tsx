// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SharedNoteDetail } from '../api/generated/models/SharedNoteDetail';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { i18n } from '../i18n';
import copy from '../i18n/locales/sharedNotes';
import { SharedNotesOverviewPage } from './SharedNotesOverviewPage';
import { sharedNote } from './sharedNoteFixtures';

const text = copy.sharedNotes;

function renderPage({
  notes,
  initialEntry = '/more/notes',
  list,
}: {
  notes?: SharedNoteDetail[];
  initialEntry?: string;
  list?: ReturnType<typeof vi.fn>;
}) {
  const listSharedNotes =
    list ??
    vi.fn(async () => ({
      items: notes ?? [],
      nextCursor: null,
      hasMore: false,
    }));
  const apis = {
    sharedNotes: { listSharedNotes },
  } as unknown as SharedPlanningApis;
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/more/notes"
            element={
              <SharedNotesOverviewPage
                apis={apis}
                spaceId="space-1"
                accountId="account-1"
              />
            }
          />
          <Route path="/more/notes/new" element={<p>create page</p>} />
          <Route path="/more/notes/:noteId" element={<p>read page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { listSharedNotes };
}

afterEach(cleanup);

describe('SharedNotesOverviewPage', () => {
  it('leads with the pinned notes and then lists the others by last edit', async () => {
    renderPage({
      notes: [
        sharedNote({ id: 'recent', title: 'Restaurant tips' }),
        sharedNote({ id: 'pinned', title: 'Door code', pinned: true }),
      ],
    });

    const pinnedHeading = await screen.findByRole('heading', {
      name: text.sectionPinned,
    });
    const recentHeading = screen.getByRole('heading', {
      name: text.sectionRecent,
    });
    expect(
      pinnedHeading.compareDocumentPosition(recentHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: /Door code/ })).toBeTruthy();
    // The reading excerpt joins the lines, and the last editor is named.
    expect(
      screen.getAllByText(/Key box left of the door · bins on Monday/).length,
    ).toBe(2);
    expect(
      screen.getAllByText(/Jonas/, { selector: 'span' }).length,
    ).toBeGreaterThan(0);
  });

  it('shows a pinned note under pinned even when it is not on the loaded page', async () => {
    const list = vi.fn(async (request: { pinned?: boolean }) => ({
      items: request.pinned
        ? [
            sharedNote({
              id: 'old-pinned',
              title: 'Old door code',
              pinned: true,
              editedAt: new Date('2026-01-01T10:00:00Z'),
            }),
          ]
        : [sharedNote({ id: 'recent', title: 'Restaurant tips' })],
      nextCursor: null,
      hasMore: false,
    }));
    renderPage({ list });

    const pinnedHeading = await screen.findByRole('heading', {
      name: text.sectionPinned,
    });
    const pinnedLink = await screen.findByRole('link', {
      name: /Old door code/,
    });
    const recentHeading = screen.getByRole('heading', {
      name: text.sectionRecent,
    });
    expect(
      pinnedHeading.compareDocumentPosition(pinnedLink) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      pinnedLink.compareDocumentPosition(recentHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 'space-1', pinned: true }),
      expect.anything(),
    );
  });

  it('keeps listing the notes when the extra pinned read fails', async () => {
    const list = vi.fn(async (request: { pinned?: boolean }) => {
      if (request.pinned) throw new Error('network');
      return {
        items: [sharedNote({ id: 'a', title: 'Restaurant tips' })],
        nextCursor: null,
        hasMore: false,
      };
    });
    renderPage({ list });
    expect(
      await screen.findByRole('link', { name: /Restaurant tips/ }),
    ).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('requests the notes in pages of one hundred', async () => {
    const { listSharedNotes } = renderPage({
      notes: [sharedNote({ id: 'a' })],
    });
    await screen.findByRole('link', { name: /Holiday flat/ });
    expect(listSharedNotes).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 'space-1', limit: 100 }),
      expect.anything(),
    );
  });

  it('filters the loaded notes while typing and can clear the search', async () => {
    const user = userEvent.setup();
    renderPage({
      notes: [
        sharedNote({ id: 'a', title: 'Restaurant tips', body: 'Fish place' }),
        sharedNote({ id: 'b', title: 'Door code', body: 'Key box' }),
      ],
    });
    await screen.findByRole('link', { name: /Restaurant tips/ });

    await user.type(
      screen.getByRole('searchbox', { name: text.search }),
      'fish',
    );
    expect(screen.queryByRole('link', { name: /Door code/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Restaurant tips/ })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe(
      i18n.t('sharedNotes.results', { count: 1 }),
    );

    await user.clear(screen.getByRole('searchbox', { name: text.search }));
    await user.type(
      screen.getByRole('searchbox', { name: text.search }),
      'nothing here',
    );
    expect(
      screen.getByText(
        i18n.t('sharedNotes.noMatch.title', { query: 'nothing here' }),
      ),
    ).toBeTruthy();
    await user.click(
      within(screen.getByRole('status')).getByRole('button', {
        name: text.searchClear,
      }),
    );
    expect(screen.getAllByRole('link').length).toBe(2);
  });

  it('shows only pinned notes in the pinned scope and explains when there are none', async () => {
    renderPage({
      initialEntry: '/more/notes?scope=PINNED',
      notes: [sharedNote({ id: 'a', title: 'Restaurant tips' })],
    });
    expect(await screen.findByText(text.noPinned.title)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Restaurant tips/ })).toBeNull();
  });

  it('invites the first note and opens the writing page from it', async () => {
    const user = userEvent.setup();
    renderPage({ notes: [] });
    expect(await screen.findByText(text.empty.title)).toBeTruthy();
    // The heading action is replaced by the one filled call to action.
    expect(
      screen.getAllByRole('button', { name: text.createFirst }).length,
    ).toBe(1);
    await user.click(screen.getByRole('button', { name: text.createFirst }));
    expect(await screen.findByText('create page')).toBeTruthy();
  });

  it('opens a note from its card', async () => {
    const user = userEvent.setup();
    renderPage({ notes: [sharedNote({ id: 'a' })] });
    await user.click(await screen.findByRole('link', { name: /Holiday flat/ }));
    expect(await screen.findByText('read page')).toBeTruthy();
  });

  it('keeps the filled create action next to a populated list', async () => {
    renderPage({ notes: [sharedNote({ id: 'a' })] });
    expect(
      await screen.findByRole('button', { name: text.create }),
    ).toBeTruthy();
  });

  it('reports a failed read with a retry that loads again', async () => {
    const user = userEvent.setup();
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({
        items: [sharedNote({ id: 'a' })],
        nextCursor: null,
        hasMore: false,
      });
    renderPage({ list });
    await user.click(
      await screen.findByRole('button', { name: i18n.t('common.retry') }),
    );
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Holiday flat/ })).toBeTruthy(),
    );
  });
});
