// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import type { SharedNoteDetail } from '../api/generated/models/SharedNoteDetail';
import { i18n } from '../i18n';
import copy from '../i18n/locales/sharedNotes';
import { sharedNote } from './sharedNoteFixtures';
import { WirNotes } from './WirNotes';

const text = copy.sharedNotes;

function renderTiles(notes: SharedNoteDetail[], hasMore = false) {
  const { container } = render(
    <MemoryRouter initialEntries={['/today']}>
      <Routes>
        <Route
          path="/today"
          element={
            <WirNotes notes={notes} hasMore={hasMore} accountId="account-1" />
          }
        />
        <Route path="/more/notes" element={<p>overview page</p>} />
        <Route path="/more/notes/:noteId" element={<p>read page</p>} />
        <Route path="/more/notes/:noteId/edit" element={<p>editor page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return container;
}

afterEach(cleanup);

describe('WirNotes', () => {
  it('shows one pinned note as one wide tile with the add action inside', async () => {
    const user = userEvent.setup();
    const container = renderTiles([sharedNote({ id: 'a', pinned: true })]);
    expect(container.querySelector('.wir-lists-single')).not.toBeNull();
    expect(container.querySelector('.wir-lists-row')).toBeNull();
    // The action sits in the tile, not beside it.
    const add = screen.getByRole('link', { name: text.wir.add });
    expect(add.closest('.wir-note-tile')).not.toBeNull();
    await user.click(add);
    expect(await screen.findByText('editor page')).toBeTruthy();
  });

  it('shows several pinned notes as tiles in a row without per-tile add actions', () => {
    const container = renderTiles([
      sharedNote({ id: 'a', title: 'First', pinned: true }),
      sharedNote({ id: 'b', title: 'Second', pinned: true }),
    ]);
    expect(container.querySelector('.wir-lists-row')).not.toBeNull();
    expect(container.querySelectorAll('.wir-note-tile').length).toBe(2);
    expect(screen.queryByRole('link', { name: text.wir.add })).toBeNull();
  });

  it('hides the excerpt and says so when only the title is wanted on Wir', () => {
    renderTiles([
      sharedNote({
        id: 'a',
        title: 'Door code',
        body: 'Secret 4172',
        pinned: true,
        wirTitleOnly: true,
      }),
    ]);
    expect(screen.getByText(text.wir.hiddenExcerpt)).toBeTruthy();
    expect(screen.queryByText(/Secret 4172/)).toBeNull();
    expect(screen.getByText('Door code')).toBeTruthy();
  });

  it('does not name an untitled note by its first line when only the title is wanted on Wir', () => {
    renderTiles([
      sharedNote({
        id: 'a',
        title: '',
        body: 'Door code 4172\n• bins on Monday',
        pinned: true,
        wirTitleOnly: true,
      }),
    ]);
    expect(screen.queryByText(/4172/)).toBeNull();
    expect(screen.queryByRole('link', { name: /4172/ })).toBeNull();
    expect(screen.getByRole('heading', { name: text.untitled })).toBeTruthy();
    expect(screen.getByText(text.wir.hiddenExcerpt)).toBeTruthy();
  });

  it('still names an untitled note by its first line when the text may show', () => {
    renderTiles([
      sharedNote({
        id: 'a',
        title: '',
        body: 'Door code 4172\n• bins on Monday',
        pinned: true,
      }),
    ]);
    expect(
      screen.getByRole('heading', { name: 'Door code 4172' }),
    ).toBeTruthy();
  });

  it('shows the excerpt by default and opens the note from the tile', async () => {
    const user = userEvent.setup();
    renderTiles([sharedNote({ id: 'a', title: 'Flat', pinned: true })]);
    expect(screen.getByText(/Key box left of the door/)).toBeTruthy();
    await user.click(
      screen.getByRole('link', {
        name: i18n.t('sharedNotes.wir.open', { title: 'Flat' }),
      }),
    );
    expect(await screen.findByText('read page')).toBeTruthy();
  });

  it('ends the row with a quiet all-notes tile only when more notes are pinned', async () => {
    const five = Array.from({ length: 5 }, (_, index) =>
      sharedNote({ id: `n${index}`, title: `Note ${index}`, pinned: true }),
    );
    const user = userEvent.setup();
    const container = renderTiles(five, true);
    expect(container.querySelectorAll('.wir-note-tile').length).toBe(6);
    expect(container.querySelector('.wir-note-more')).not.toBeNull();
    await user.click(screen.getByRole('link', { name: text.wir.allNotes }));
    expect(await screen.findByText('overview page')).toBeTruthy();
  });

  it('adds no extra tile when nothing more is pinned', () => {
    const container = renderTiles(
      [
        sharedNote({ id: 'a', pinned: true }),
        sharedNote({ id: 'b', pinned: true }),
      ],
      false,
    );
    expect(container.querySelector('.wir-note-more')).toBeNull();
  });

  it('renders nothing without pinned notes', () => {
    const container = renderTiles([]);
    expect(container.querySelector('ul')).toBeNull();
  });
});
