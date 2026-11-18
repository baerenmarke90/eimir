// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResponseError } from '../api/generated/runtime';
import type { SharedNoteDetail } from '../api/generated/models/SharedNoteDetail';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { i18n } from '../i18n';
import copy from '../i18n/locales/sharedNotes';
import { sharedNote } from './sharedNoteFixtures';
import { SharedNoteReadPage } from './SharedNoteReadPage';

const text = copy.sharedNotes;

function renderRead(
  note: SharedNoteDetail | Error,
  api: Record<string, ReturnType<typeof vi.fn>> = {},
) {
  const getSharedNote = vi.fn(async () => {
    if (note instanceof Error) throw note;
    return note;
  });
  const apis = {
    sharedNotes: { getSharedNote, ...api },
  } as unknown as SharedPlanningApis;
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={['/more/notes/note-1']}>
        <Routes>
          <Route
            path="/more/notes/:noteId"
            element={
              <SharedNoteReadPage
                apis={apis}
                spaceId="space-1"
                accountId="account-1"
              />
            }
          />
          <Route path="/more/notes/:noteId/edit" element={<p>editor page</p>} />
          <Route path="/more/notes" element={<p>overview page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { getSharedNote };
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SharedNoteReadPage', () => {
  it('shows the note for reading with the writer and the partner who last changed it', async () => {
    renderRead(sharedNote({ id: 'note-1' }));
    expect(
      await screen.findByRole('heading', { name: 'Holiday flat' }),
    ).toBeTruthy();
    // Bullet lines read as a list, not as lines of text.
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(expect.arrayContaining(['bins on Monday', 'quiet hours at ten']));
    // The page header already says it is a shared note; no audience badge.
    expect(document.querySelector('.visibility-badge')).toBeNull();
    // account-1 wrote it, the partner changed it last: both lines appear, and
    // only the partner carries a marker.
    expect(screen.getByText(text.writtenByYou)).toBeTruthy();
    expect(screen.getByText(/Jonas/, { selector: 'span' })).toBeTruthy();
    expect(document.querySelectorAll('.partner-marker').length).toBe(1);
    // Editing lives in the menu, like every other detail page.
    expect(screen.queryByRole('button', { name: text.read.edit })).toBeNull();
  });

  it('keeps only one quiet line for a note nobody else changed', async () => {
    renderRead(
      sharedNote({
        id: 'note-1',
        creator: { id: 'account-1', displayName: 'Alex Example' },
        editor: { id: 'account-1', displayName: 'Alex Example' },
      }),
    );
    await screen.findByRole('heading', { name: 'Holiday flat' });
    expect(screen.queryByText(text.writtenByYou)).toBeNull();
    expect(document.querySelectorAll('.partner-marker').length).toBe(0);
    expect(document.querySelectorAll('.shared-note-meta').length).toBe(1);
  });

  it('opens the full editor from the menu', async () => {
    const user = userEvent.setup();
    renderRead(sharedNote({ id: 'note-1' }));
    await user.click(
      await screen.findByRole('button', { name: text.read.menu }),
    );
    await user.click(screen.getByText(text.read.edit));
    expect(await screen.findByText('editor page')).toBeTruthy();
  });

  it('does not offer editing or deleting without permission', async () => {
    const user = userEvent.setup();
    renderRead(
      sharedNote({
        id: 'note-1',
        capabilities: { canComment: false, canDelete: false, canEdit: false },
      }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Holiday flat' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: text.read.edit })).toBeNull();
    await user.click(screen.getByRole('button', { name: text.read.menu }));
    expect(screen.queryByText(text.menu.pin)).toBeNull();
    expect(screen.queryByText(text.menu.delete)).toBeNull();
  });

  it('pins from the menu with one idempotent state set', async () => {
    const user = userEvent.setup();
    const note = sharedNote({ id: 'note-1' });
    const setSharedNotePresentation = vi.fn(async () => ({
      ...note,
      pinned: true,
      version: 2,
    }));
    renderRead(note, { setSharedNotePresentation });
    await user.click(
      await screen.findByRole('button', { name: text.read.menu }),
    );
    // The title-only choice only exists for a pinned note.
    expect(screen.queryByText(text.menu.wirTitleOnly)).toBeNull();
    await user.click(screen.getByText(text.menu.pin));
    await waitFor(() =>
      expect(setSharedNotePresentation).toHaveBeenCalledWith({
        spaceId: 'space-1',
        sharedNoteId: 'note-1',
        sharedNotePresentation: { pinned: true, wirTitleOnly: undefined },
      }),
    );
  });

  it('offers title only on Wir for a pinned note', async () => {
    const user = userEvent.setup();
    const note = sharedNote({ id: 'note-1', pinned: true });
    const setSharedNotePresentation = vi.fn(async () => ({
      ...note,
      wirTitleOnly: true,
    }));
    renderRead(note, { setSharedNotePresentation });
    await user.click(
      await screen.findByRole('button', { name: text.read.menu }),
    );
    expect(screen.getByText(text.menu.unpin)).toBeTruthy();
    await user.click(screen.getByText(text.menu.wirTitleOnly));
    await waitFor(() =>
      expect(setSharedNotePresentation).toHaveBeenCalledWith(
        expect.objectContaining({
          sharedNotePresentation: { pinned: undefined, wirTitleOnly: true },
        }),
      ),
    );
  });

  it('names the consequence before deleting and sends the version it read', async () => {
    const user = userEvent.setup();
    const deleteSharedNote = vi.fn(async () => undefined);
    renderRead(sharedNote({ id: 'note-1', version: 7 }), { deleteSharedNote });
    await user.click(
      await screen.findByRole('button', { name: text.read.menu }),
    );
    await user.click(screen.getByText(text.menu.delete));

    expect(deleteSharedNote).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        i18n.t('sharedNotes.delete.body', { title: 'Holiday flat' }),
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: text.delete.confirm }));
    await waitFor(() =>
      expect(deleteSharedNote).toHaveBeenCalledWith({
        spaceId: 'space-1',
        sharedNoteId: 'note-1',
        ifMatch: '7',
      }),
    );
    expect(await screen.findByText('overview page')).toBeTruthy();
  });

  it('shows a missing note as unavailable instead of an empty page', async () => {
    renderRead(
      new ResponseError(
        new Response(
          JSON.stringify({
            type: 'about:blank',
            title: 'Not found',
            status: 404,
            detail: 'missing',
            code: 'NOT_FOUND',
          }),
          { status: 404 },
        ),
      ),
    );
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });
});
