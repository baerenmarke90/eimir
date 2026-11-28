// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharedNoteDetail } from '../api/generated/models/SharedNoteDetail';
import { ResponseError } from '../api/generated/runtime';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { i18n } from '../i18n';
import copy from '../i18n/locales/sharedNotes';
import { SharedNoteEditorPage } from './SharedNoteEditorPage';
import { sharedNote } from './sharedNoteFixtures';
import germanUi from '../i18n/locales/de';

const text = copy.sharedNotes;

function conflictError() {
  return new ResponseError(
    new Response(
      JSON.stringify({
        type: 'about:blank',
        title: 'Conflict',
        status: 409,
        detail: 'stale',
        code: 'RESOURCE_VERSION_CONFLICT',
      }),
      { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
    ),
  );
}

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}</p>;
}

function renderEditor({
  mode,
  note,
  state,
  api,
}: {
  mode: 'create' | 'edit';
  note?: SharedNoteDetail;
  state?: Record<string, unknown>;
  api: Record<string, ReturnType<typeof vi.fn>>;
}) {
  const apis = {
    sharedNotes: {
      getSharedNote: vi.fn(async () => note),
      ...api,
    },
    plans: { linkPlanNote: api.linkPlanNote ?? vi.fn(async () => undefined) },
  } as unknown as SharedPlanningApis;
  const entry = {
    pathname: mode === 'create' ? '/more/notes/new' : '/more/notes/note-1/edit',
    state,
  };
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[entry]}>
        <Where />
        <Routes>
          <Route
            path="/more/notes/new"
            element={
              <SharedNoteEditorPage
                apis={apis}
                spaceId="space-1"
                mode="create"
              />
            }
          />
          <Route
            path="/more/notes/:noteId/edit"
            element={
              <SharedNoteEditorPage apis={apis} spaceId="space-1" mode="edit" />
            }
          />
          <Route path="/more/notes/:noteId" element={<p>read page</p>} />
          <Route path="/plan/plans/:planId" element={<p>plan page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const body = () =>
  screen.getByRole('textbox', {
    name: text.edit.bodyLabel,
  }) as HTMLTextAreaElement;
const title = () =>
  screen.getByRole('textbox', {
    name: germanUi.common.title,
  }) as HTMLInputElement;
const save = () => screen.getByRole('button', { name: germanUi.common.save });

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

describe('SharedNoteEditorPage', () => {
  it('writes the changed text with the version the note was read at and returns to the note', async () => {
    const user = userEvent.setup();
    const note = sharedNote({ id: 'note-1', version: 3 });
    const updateSharedNote = vi.fn(async () => ({ ...note, version: 4 }));
    renderEditor({ mode: 'edit', note, api: { updateSharedNote } });

    await waitFor(() => expect(body().value).toBe(note.body));
    await user.type(body(), '\nextra line');
    await user.click(save());

    await waitFor(() => expect(screen.getByText('read page')).toBeTruthy());
    expect(updateSharedNote).toHaveBeenCalledWith(
      expect.objectContaining({
        sharedNoteId: 'note-1',
        ifMatch: '3',
        sharedNoteUpdate: {
          title: 'Holiday flat',
          body: `${note.body}\nextra line`,
        },
      }),
    );
  });

  it('stops typing at the length the server accepts', async () => {
    const note = sharedNote({ id: 'note-1' });
    renderEditor({ mode: 'edit', note, api: {} });
    await waitFor(() => expect(body().value).toBe(note.body));
    expect(title().maxLength).toBe(200);
    expect(body().maxLength).toBe(20_000);
  });

  it('saves on the new version without asking when only pinning changed meanwhile', async () => {
    const user = userEvent.setup();
    const note = sharedNote({ id: 'note-1', version: 1 });
    const getSharedNote = vi
      .fn()
      .mockResolvedValueOnce(note)
      .mockResolvedValue({ ...note, version: 2, pinned: true });
    const updateSharedNote = vi
      .fn()
      .mockRejectedValueOnce(conflictError())
      .mockResolvedValue({ ...note, version: 3 });
    renderEditor({
      mode: 'edit',
      note,
      api: { getSharedNote, updateSharedNote },
    });

    await waitFor(() => expect(body().value).toBe(note.body));
    await user.type(body(), ' more');
    await user.click(save());

    await waitFor(() => expect(screen.getByText('read page')).toBeTruthy());
    expect(updateSharedNote).toHaveBeenCalledTimes(2);
    expect(updateSharedNote.mock.calls[1][0]).toMatchObject({ ifMatch: '2' });
    expect(
      screen.queryByText(/./, { selector: '.shared-note-notice' }),
    ).toBeNull();
  });

  it('keeps the writer text on a real conflict and offers see, take theirs and save mine', async () => {
    const user = userEvent.setup();
    const note = sharedNote({ id: 'note-1', version: 1 });
    const theirs = sharedNote({
      id: 'note-1',
      version: 2,
      body: 'Partner rewrote everything',
    });
    const getSharedNote = vi
      .fn()
      .mockResolvedValueOnce(note)
      .mockResolvedValue(theirs);
    const updateSharedNote = vi
      .fn()
      .mockRejectedValueOnce(conflictError())
      .mockResolvedValue({ ...theirs, version: 3 });
    renderEditor({
      mode: 'edit',
      note,
      api: { getSharedNote, updateSharedNote },
    });

    await waitFor(() => expect(body().value).toBe(note.body));
    await user.type(body(), ' mine');
    await user.click(save());

    expect(
      await screen.findByText(
        i18n.t('sharedNotes.conflict.message', { name: 'Jonas' }),
      ),
    ).toBeTruthy();
    // Nothing is lost and nothing is sent until the writer decides.
    expect(body().value).toBe(`${note.body} mine`);
    expect(updateSharedNote).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole('button', { name: text.conflict.seeChanges }),
    );
    expect(screen.getByText(/Partner rewrote everything/)).toBeTruthy();

    await user.click(
      screen.getByRole('button', { name: text.conflict.keepMine }),
    );
    await waitFor(() => expect(screen.getByText('read page')).toBeTruthy());
    expect(updateSharedNote.mock.calls[1][0]).toMatchObject({
      ifMatch: '2',
      sharedNoteUpdate: expect.objectContaining({ body: `${note.body} mine` }),
    });
  });

  it('takes the other version over after a conflict', async () => {
    const user = userEvent.setup();
    const note = sharedNote({ id: 'note-1', version: 1 });
    const theirs = sharedNote({ id: 'note-1', version: 2, body: 'Their text' });
    renderEditor({
      mode: 'edit',
      note,
      api: {
        getSharedNote: vi
          .fn()
          .mockResolvedValueOnce(note)
          .mockResolvedValue(theirs),
        updateSharedNote: vi.fn().mockRejectedValue(conflictError()),
      },
    });
    await waitFor(() => expect(body().value).toBe(note.body));
    await user.type(body(), ' mine');
    await user.click(save());
    await user.click(
      await screen.findByRole('button', { name: text.conflict.seeChanges }),
    );
    await user.click(
      screen.getByRole('button', { name: text.conflict.takeTheirs }),
    );
    expect(body().value).toBe('Their text');
    expect(screen.queryByText(text.conflict.keepMine)).toBeNull();
  });

  it('says it was not saved while offline, keeps the text and saves after a retry', async () => {
    const user = userEvent.setup();
    const note = sharedNote({ id: 'note-1' });
    const updateSharedNote = vi.fn(async () => ({ ...note, version: 2 }));
    renderEditor({ mode: 'edit', note, api: { updateSharedNote } });
    await waitFor(() => expect(body().value).toBe(note.body));
    await user.type(body(), ' more');

    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await user.click(save());
    expect(await screen.findByText(text.edit.offline)).toBeTruthy();
    expect(updateSharedNote).not.toHaveBeenCalled();
    expect(body().value).toBe(`${note.body} more`);

    online.mockReturnValue(true);
    await user.click(
      screen.getByRole('button', { name: germanUi.common.retry }),
    );
    await waitFor(() => expect(screen.getByText('read page')).toBeTruthy());
    expect(updateSharedNote).toHaveBeenCalledTimes(1);
  });

  it('does not send a note without a title or text', async () => {
    const user = userEvent.setup();
    const createSharedNote = vi.fn();
    renderEditor({ mode: 'create', api: { createSharedNote } });
    await user.click(save());
    expect((await screen.findByRole('alert')).textContent).toBe(
      text.edit.needsContent,
    );
    expect(createSharedNote).not.toHaveBeenCalled();
  });

  it('creates a note with only text and opens it for reading', async () => {
    const user = userEvent.setup();
    const created = sharedNote({ id: 'note-9', title: '', body: 'Only text' });
    const createSharedNote = vi.fn(async () => created);
    renderEditor({ mode: 'create', api: { createSharedNote } });
    await user.type(body(), 'Only text');
    await user.click(save());
    await waitFor(() =>
      expect(screen.getByTestId('where').textContent).toBe(
        '/more/notes/note-9',
      ),
    );
    expect(createSharedNote).toHaveBeenCalledWith(
      expect.objectContaining({
        sharedNoteCreate: { title: '', body: 'Only text' },
      }),
    );
  });

  it('links a note created from a Plan to that Plan and returns there', async () => {
    const user = userEvent.setup();
    const created = sharedNote({ id: 'note-9' });
    const linkPlanNote = vi.fn(async () => undefined);
    renderEditor({
      mode: 'create',
      state: { linkPlanId: 'plan-7' },
      api: { createSharedNote: vi.fn(async () => created), linkPlanNote },
    });
    await user.type(title(), 'Tips');
    await user.click(save());
    await waitFor(() =>
      expect(screen.getByTestId('where').textContent).toBe(
        '/plan/plans/plan-7',
      ),
    );
    expect(linkPlanNote).toHaveBeenCalledWith({
      spaceId: 'space-1',
      planId: 'plan-7',
      sharedNoteId: 'note-9',
    });
  });

  it('starts a bullet line with the list tool and continues it on Enter', async () => {
    const user = userEvent.setup();
    renderEditor({ mode: 'create', api: {} });
    await user.type(body(), 'Plan');
    await user.click(screen.getByRole('button', { name: text.edit.bullets }));
    expect(body().value).toBe('• Plan');
    await user.type(body(), '{Enter}next');
    expect(body().value).toBe('• Plan\n• next');
  });

  it('asks before discarding typed text', async () => {
    const user = userEvent.setup();
    renderEditor({ mode: 'create', api: {} });
    await user.type(body(), 'Draft');
    await user.click(
      screen.getByRole('button', { name: germanUi.common.close }),
    );
    expect(
      await screen.findByText(i18n.t('taskBoundary.discardTitle')),
    ).toBeTruthy();
    expect(body().value).toBe('Draft');
  });
});
