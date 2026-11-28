// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import type { SharedNoteDetail } from '../api/generated/models/SharedNoteDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { postSnackbar } from '../client/snackbar';
import { i18n } from '../i18n';
import copy from '../i18n/locales/sharedNotes';
import { PlanNoteLinks } from './PlanNoteLinks';
import { sharedNote } from './sharedNoteFixtures';
import germanUi from '../i18n/locales/de';

vi.mock('../client/snackbar', () => ({ postSnackbar: vi.fn() }));

const text = copy.sharedNotes;
const plan = { id: 'plan-1', capabilities: { canEdit: true } } as PlanDetail;

function Where() {
  const location = useLocation();
  return (
    <p data-testid="where">
      {location.pathname}|{JSON.stringify(location.state)}
    </p>
  );
}

function setup({
  editing = true,
  linked = [],
  all = [],
  onNavigate,
  failWrites = false,
}: {
  editing?: boolean;
  linked?: SharedNoteDetail[];
  all?: SharedNoteDetail[];
  onNavigate?: (destination: () => void) => void;
  failWrites?: boolean;
}) {
  let current = linked;
  const listPlanNotes = vi.fn(async () => [...current]);
  const linkPlanNote = vi.fn(
    async ({ sharedNoteId }: { sharedNoteId: string }) => {
      if (failWrites) throw new Error('network');
      current = [...current, ...all.filter((note) => note.id === sharedNoteId)];
    },
  );
  const unlinkPlanNote = vi.fn(
    async ({ sharedNoteId }: { sharedNoteId: string }) => {
      if (failWrites) throw new Error('network');
      current = current.filter((note) => note.id !== sharedNoteId);
    },
  );
  const listSharedNotes = vi.fn(async () => ({
    items: all,
    nextCursor: null,
    hasMore: false,
  }));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(
    authorSummaryQueryKeys.planDetail('space-1', plan.id),
    plan,
  );
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/plan/plans/plan-1']}>
        <Where />
        <Routes>
          <Route
            path="/plan/plans/:planId"
            element={
              <PlanNoteLinks
                spaceId="space-1"
                accountId="account-1"
                plan={plan}
                disabled={false}
                editing={editing}
                onNavigate={onNavigate}
                renderTrigger={(open) => (
                  <button type="button" onClick={open}>
                    {text.plan.tool}
                  </button>
                )}
                apis={
                  {
                    plans: { listPlanNotes, linkPlanNote, unlinkPlanNote },
                    sharedNotes: { listSharedNotes },
                  } as unknown as SharedPlanningApis
                }
              />
            }
          />
          <Route path="/more/notes/new" element={<p>create page</p>} />
          <Route path="/more/notes/:noteId/edit" element={<p>editor page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { linkPlanNote, unlinkPlanNote, listSharedNotes, listPlanNotes };
}

beforeEach(() => {
  vi.mocked(postSnackbar).mockClear();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(cleanup);

describe('PlanNoteLinks', () => {
  it('shows linked notes for reading without any way to change the links', async () => {
    const note = sharedNote({ id: 'a', title: 'Restaurant tips' });
    const api = setup({ editing: false, linked: [note], all: [note] });
    expect(
      await screen.findByRole('heading', { name: text.plan.heading }),
    ).toBeTruthy();
    expect(
      await screen.findByRole('button', {
        name: i18n.t('sharedNotes.plan.openNote', { title: 'Restaurant tips' }),
      }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: text.plan.tool })).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: i18n.t('sharedNotes.plan.unlink', { title: 'Restaurant tips' }),
      }),
    ).toBeNull();
    expect(api.listSharedNotes).not.toHaveBeenCalled();
  });

  it('renders no section at all when nothing is linked and the plan is not being edited', async () => {
    const api = setup({ editing: false, linked: [] });
    await waitFor(() => expect(api.listPlanNotes).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: text.plan.heading }),
      ).toBeNull(),
    );
  });

  it('opens a linked note in a sheet and leads to the full editor from there', async () => {
    const user = userEvent.setup();
    const note = sharedNote({ id: 'a', title: 'Restaurant tips' });
    setup({ editing: false, linked: [note], all: [note] });
    await user.click(
      await screen.findByRole('button', {
        name: i18n.t('sharedNotes.plan.openNote', { title: 'Restaurant tips' }),
      }),
    );
    expect(await screen.findByText('bins on Monday')).toBeTruthy();
    await user.click(
      screen.getByRole('button', { name: germanUi.common.edit }),
    );
    expect(await screen.findByText('editor page')).toBeTruthy();
    expect(screen.getByTestId('where').textContent).toContain(
      '/more/notes/a/edit',
    );
  });

  it('unlinks at once while the plan is edited', async () => {
    const user = userEvent.setup();
    const note = sharedNote({ id: 'a', title: 'Restaurant tips' });
    const api = setup({ linked: [note], all: [note] });
    await user.click(
      await screen.findByRole('button', {
        name: i18n.t('sharedNotes.plan.unlink', { title: 'Restaurant tips' }),
      }),
    );
    await waitFor(() =>
      expect(api.unlinkPlanNote).toHaveBeenCalledWith({
        spaceId: 'space-1',
        planId: 'plan-1',
        sharedNoteId: 'a',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText('Restaurant tips')).toBeNull(),
    );
  });

  it('offers only unlinked shared notes and links the chosen ones', async () => {
    const user = userEvent.setup();
    const linked = sharedNote({ id: 'a', title: 'Already linked' });
    const first = sharedNote({ id: 'b', title: 'Door code' });
    const second = sharedNote({ id: 'c', title: 'Restaurant tips' });
    const api = setup({ linked: [linked], all: [linked, first, second] });
    await user.click(
      await screen.findByRole('button', { name: text.plan.tool }),
    );

    expect(await screen.findByText(text.plan.hint)).toBeTruthy();
    const choices = await screen.findAllByRole('checkbox');
    expect(choices.length).toBe(2);
    expect(
      screen.queryByRole('checkbox', { name: /Already linked/ }),
    ).toBeNull();
    // Nothing can be linked before something is chosen.
    expect(
      (
        screen.getByRole('button', {
          name: text.plan.link,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    await user.click(screen.getByRole('checkbox', { name: /Door code/ }));
    await user.click(screen.getByRole('button', { name: text.plan.link }));
    await waitFor(() =>
      expect(api.linkPlanNote).toHaveBeenCalledWith({
        spaceId: 'space-1',
        planId: 'plan-1',
        sharedNoteId: 'b',
      }),
    );
    expect(api.linkPlanNote).toHaveBeenCalledTimes(1);
  });

  it('confirms an unlink and a link only after the change was sent', async () => {
    const user = userEvent.setup();
    const linked = sharedNote({ id: 'a', title: 'Restaurant tips' });
    const other = sharedNote({ id: 'b', title: 'Door code' });
    const api = setup({ linked: [linked], all: [linked, other] });
    await user.click(
      await screen.findByRole('button', {
        name: i18n.t('sharedNotes.plan.unlink', { title: 'Restaurant tips' }),
      }),
    );
    await waitFor(() =>
      expect(postSnackbar).toHaveBeenCalledWith('sharedNotes.plan.unlinked', {
        title: 'Restaurant tips',
      }),
    );
    await user.click(
      await screen.findByRole('button', { name: text.plan.tool }),
    );
    await user.click(
      await screen.findByRole('checkbox', { name: /Door code/ }),
    );
    await user.click(screen.getByRole('button', { name: text.plan.link }));
    await waitFor(() =>
      expect(postSnackbar).toHaveBeenCalledWith('sharedNotes.plan.linked', {
        count: 1,
      }),
    );
    expect(api.linkPlanNote).toHaveBeenCalledTimes(1);
  });

  it('does not confirm a change that failed', async () => {
    const user = userEvent.setup();
    const note = sharedNote({ id: 'a', title: 'Restaurant tips' });
    const api = setup({ linked: [note], all: [note], failWrites: true });
    await user.click(
      await screen.findByRole('button', {
        name: i18n.t('sharedNotes.plan.unlink', { title: 'Restaurant tips' }),
      }),
    );
    await waitFor(() => expect(api.unlinkPlanNote).toHaveBeenCalledTimes(1));
    await screen.findByRole('alert');
    expect(postSnackbar).not.toHaveBeenCalled();
  });

  it('confirms once when the same unlink is triggered twice before it settles', async () => {
    const note = sharedNote({ id: 'a', title: 'Restaurant tips' });
    const api = setup({ linked: [note], all: [note] });
    const button = await screen.findByRole('button', {
      name: i18n.t('sharedNotes.plan.unlink', { title: 'Restaurant tips' }),
    });
    // The second activation is skipped while the first is in flight, so it
    // must not announce a change that was never sent.
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(postSnackbar).toHaveBeenCalledTimes(1));
    expect(api.unlinkPlanNote).toHaveBeenCalledTimes(1);
  });

  it('starts a new note for the plan through the plan discard guard', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn((destination: () => void) => destination());
    setup({ all: [], onNavigate });
    await user.click(
      await screen.findByRole('button', { name: text.plan.tool }),
    );
    await user.click(
      await screen.findByRole('button', { name: text.plan.createNew }),
    );
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('create page')).toBeTruthy();
    expect(screen.getByTestId('where').textContent).toContain(
      '"linkPlanId":"plan-1"',
    );
  });
});
