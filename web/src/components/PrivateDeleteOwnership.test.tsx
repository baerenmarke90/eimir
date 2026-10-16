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
import { useState } from 'react';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrivateAreaApi } from '../api/generated/apis/PrivateAreaApi';
import { privateAreaQueryKeys } from '../client/privateArea';
import { ClientProblemError } from '../client/problemDetails';
import de from '../i18n/locales/de';
import m5s3 from '../i18n/locales/m5s3';
import privateArea from '../i18n/locales/privateArea';
import { GiftIdeaEditPage } from './GiftIdeasPage';
import { PrivateCollectionDetailPage } from './PrivateCollectionsPage';
import { PrivateNoteEditPage } from './PrivateNotesPage';

const accountId = 'account-1';
const spaceId = 'space-1';
const resourceId = 'resource-1';
const base = {
  id: resourceId,
  ownerId: accountId,
  spaceId,
  title: 'Owner-only cabin idea',
  version: 1,
  capabilities: { canComment: false, canDelete: true, canEdit: true },
  createdAt: new Date('2026-10-16T09:00:00Z'),
  updatedAt: new Date('2026-10-16T09:00:00Z'),
};
const definitions = [
  {
    name: 'private note',
    Editor: PrivateNoteEditPage,
    resource: { ...base, body: 'Private text', pinned: false },
    path: `/more/private/notes/${resourceId}/edit`,
    route: '/more/private/notes/:noteId/edit',
    home: '/more/private/notes',
    key: privateAreaQueryKeys.note(accountId, spaceId, resourceId),
    listKey: privateAreaQueryKeys.notes(accountId, spaceId),
    idField: 'noteId',
    inline: false,
  },
  {
    name: 'gift idea',
    Editor: GiftIdeaEditPage,
    resource: {
      ...base,
      description: 'Private surprise',
      status: 'IDEA',
      pinned: false,
    },
    path: `/more/private/gift-ideas/${resourceId}/edit`,
    route: '/more/private/gift-ideas/:giftIdeaId/edit',
    home: '/more/private/gift-ideas',
    key: privateAreaQueryKeys.giftIdea(accountId, spaceId, resourceId),
    listKey: privateAreaQueryKeys.giftIdeas(accountId, spaceId),
    idField: 'giftIdeaId',
    inline: false,
  },
  {
    name: 'private collection',
    Editor: PrivateCollectionDetailPage,
    resource: { ...base, items: [] },
    path: `/more/private/collections/${resourceId}`,
    route: '/more/private/collections/:collectionId',
    home: '/more/private/collections',
    key: privateAreaQueryKeys.collection(accountId, spaceId, resourceId),
    listKey: privateAreaQueryKeys.collections(accountId, spaceId),
    idField: 'collectionId',
    inline: true,
  },
] as const;

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return { promise, resolve, reject };
}
function Navigation() {
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="location">{useLocation().pathname}</output>
      <button type="button" onClick={() => navigate('/another-task')}>
        Another task
      </button>
    </>
  );
}
beforeEach(() => window.history.replaceState({}, '', '/'));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

for (const d of definitions) {
  describe(`${d.name} deletion ownership`, () => {
    function setup(withList = true) {
      const write = deferred();
      let deleted = false;
      const remove = vi.fn(async () => {
        await write.promise;
        deleted = true;
      });
      const client = new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: Infinity },
          mutations: { retry: false },
        },
      });
      client.setQueryData(d.key, d.resource);
      if (withList)
        client.setQueryData(d.listKey, { pages: [], pageParams: [] });
      const get = async () => {
        if (deleted) throw new ClientProblemError('notFound', 404, 'NOT_FOUND');
        return d.resource;
      };
      const update = vi.fn(() => new Promise<unknown>(() => {}));
      const api = {
        getPrivateNote: get,
        getGiftIdea: get,
        getPrivateCollection: get,
        deletePrivateNote: remove,
        deleteGiftIdea: remove,
        deletePrivateCollection: remove,
        updatePrivateNote: update,
        updateGiftIdea: update,
        updatePrivateCollection: update,
      } as unknown as PrivateAreaApi;
      let hide!: () => void;
      function Harness() {
        const [visible, setVisible] = useState(true);
        hide = () => setVisible(false);
        const Editor = d.Editor;
        return (
          <QueryClientProvider client={client}>
            <MemoryRouter initialEntries={[d.path]}>
              <Navigation />
              <Routes>
                <Route
                  path={d.route}
                  element={
                    visible ? (
                      <Editor
                        api={api}
                        accountId={accountId}
                        spaceId={spaceId}
                      />
                    ) : (
                      <p>Session ended</p>
                    )
                  }
                />
                <Route
                  path={d.home}
                  element={<p>Private list after delete</p>}
                />
                <Route
                  path="/another-task"
                  element={<p>Current independent task</p>}
                />
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>
        );
      }
      render(<Harness />);
      async function submit() {
        if (d.inline)
          fireEvent.click(screen.getByRole('button', { name: de.common.edit }));
        fireEvent.click(
          screen.getByRole('button', {
            name: d.inline ? m5s3.common.delete : privateArea.delete,
          }),
        );
        fireEvent.click(
          screen.getByRole('button', {
            name: d.inline
              ? m5s3.common.confirmDelete
              : privateArea.deleteConfirm,
          }),
        );
        await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
        expect(remove).toHaveBeenCalledWith({
          spaceId,
          [d.idField]: resourceId,
          ifMatch: '1',
        });
      }
      return { client, write, remove, update, submit, hide };
    }

    it.each([true, false])(
      'completes an ordinary confirmed delete (list cached: %s)',
      async (withList) => {
        const h = setup(withList);
        await h.submit();
        await act(async () => h.write.resolve());
        await screen.findByText('Private list after delete');
        expect(h.client.getQueryData(d.key)).toBeUndefined();
        expect(h.remove).toHaveBeenCalledTimes(1);
      },
    );

    it.each(['removed', 'replaced'])(
      'preserves a %s session cache after unmount',
      async (state) => {
        const h = setup();
        await h.submit();
        act(() => h.hide());
        h.client.clear();
        const replacement = {
          ...d.resource,
          title: 'Fresh authorized session',
        };
        if (state === 'replaced') {
          h.client.setQueryData(d.key, replacement);
          h.client.setQueryData(d.listKey, { pages: [], pageParams: [] });
        }
        const invalidate = vi.spyOn(h.client, 'invalidateQueries');
        await act(async () => h.write.resolve());
        expect(h.client.getQueryData(d.key)).toEqual(
          state === 'replaced' ? replacement : undefined,
        );
        expect(invalidate).not.toHaveBeenCalled();
        expect(screen.getByTestId('location').textContent).toBe(d.path);
      },
    );

    it('recovers the original list without redirecting an abandoned task', async () => {
      const h = setup();
      await h.submit();
      fireEvent.click(screen.getByRole('button', { name: 'Another task' }));
      await screen.findByText('Current independent task');
      await act(async () => h.write.resolve());
      expect(h.client.getQueryData(d.key)).toBeUndefined();
      expect(h.client.getQueryState(d.listKey)?.isInvalidated).toBe(true);
      expect(screen.getByTestId('location').textContent).toBe('/another-task');
    });

    it.each([
      ['unauthorized', 401],
      ['permission', 403],
      ['notFound', 404],
    ] as const)(
      'preserves a newer %s read after confirmed deletion',
      async (kind, status) => {
        const h = setup();
        await h.submit();
        const query = h.client
          .getQueryCache()
          .find({ queryKey: d.key, exact: true });
        const error = new ClientProblemError(kind, status);
        act(() => query?.setState({ status: 'error', error }));
        await waitFor(() =>
          expect(
            screen.queryByRole('button', { name: privateArea.deleteConfirm }),
          ).toBeNull(),
        );
        const invalidate = vi.spyOn(h.client, 'invalidateQueries');
        await act(async () => h.write.resolve());
        expect(h.client.getQueryState(d.key)?.error).toBe(error);
        expect(h.client.getQueryData(d.key)).toEqual(d.resource);
        expect(invalidate).not.toHaveBeenCalled();
        expect(screen.getByTestId('location').textContent).toBe(d.path);
      },
    );

    it.each(['session', 'detail'])(
      'rechecks %s ownership after delayed list recovery',
      async (replacement) => {
        const h = setup();
        await h.submit();
        const recovery = deferred();
        const invalidate = vi
          .spyOn(h.client, 'invalidateQueries')
          .mockImplementation(() => recovery.promise);
        await act(async () => h.write.resolve());
        await waitFor(() => expect(invalidate).toHaveBeenCalled());
        act(() => h.hide());
        if (replacement === 'session') h.client.clear();
        else h.client.removeQueries({ queryKey: d.key, exact: true });
        const fresh = { ...d.resource, title: 'Fresh read during recovery' };
        h.client.setQueryData(d.key, fresh);
        if (replacement === 'session')
          h.client.setQueryData(d.listKey, { pages: [], pageParams: [] });
        await act(async () => recovery.resolve());
        expect(h.client.getQueryData(d.key)).toEqual(fresh);
        expect(screen.getByTestId('location').textContent).toBe(d.path);
      },
    );

    it('does not invalidate a replacement list or an unrelated detail', async () => {
      const h = setup();
      await h.submit();
      h.client.removeQueries({ queryKey: d.listKey, exact: true });
      h.client.setQueryData(d.listKey, { pages: [], pageParams: [] });
      const siblingKey = [...d.listKey, 'sibling'];
      h.client.setQueryData(siblingKey, { ...d.resource, id: 'sibling' });
      await act(async () => h.write.resolve());
      expect(h.client.getQueryState(d.listKey)?.isInvalidated).toBe(false);
      expect(h.client.getQueryState(siblingKey)?.isInvalidated).toBe(false);
      expect(screen.getByTestId('location').textContent).toBe(d.path);
    });

    it.each([
      ['unauthorized', 401],
      ['permission', 403],
      ['notFound', 404],
    ] as const)(
      'does not refresh over a newer %s list read',
      async (kind, status) => {
        const h = setup();
        await h.submit();
        const list = h.client
          .getQueryCache()
          .find({ queryKey: d.listKey, exact: true });
        const error = new ClientProblemError(kind, status);
        list?.setState({ status: 'error', error });
        const invalidate = vi.spyOn(h.client, 'invalidateQueries');
        await act(async () => h.write.resolve());
        await screen.findByText('Private list after delete');
        expect(h.client.getQueryState(d.listKey)?.error).toBe(error);
        expect(invalidate).not.toHaveBeenCalled();
      },
    );

    it('refreshes only its original list, preserving sibling detail freshness', async () => {
      const h = setup();
      const siblingKey = [...d.listKey, 'sibling'];
      h.client.setQueryData(siblingKey, { ...d.resource, id: 'sibling' });
      await h.submit();
      await act(async () => h.write.resolve());
      await screen.findByText('Private list after delete');
      expect(h.client.getQueryState(d.listKey)?.isInvalidated).toBe(true);
      expect(h.client.getQueryState(siblingKey)?.isInvalidated).toBe(false);
    });

    it('rejects edit submission while deletion is pending', async () => {
      const h = setup();
      await h.submit();
      const input = screen.getByLabelText(
        d.inline
          ? privateArea.collections.titleLabel
          : d.idField === 'noteId'
            ? privateArea.notes.titleLabel
            : privateArea.gifts.titleLabel,
      );
      fireEvent.change(input, { target: { value: 'Conflicting edit' } });
      fireEvent.submit(input.closest('form')!);
      await act(async () => {});
      expect(h.update).not.toHaveBeenCalled();
      await act(async () => h.write.resolve());
    });

    it.each([false, true])(
      'blocks deletion while an edit is pending (confirmation open: %s)',
      async (confirmFirst) => {
        const h = setup();
        if (d.inline)
          fireEvent.click(screen.getByRole('button', { name: de.common.edit }));
        if (confirmFirst)
          fireEvent.click(
            screen.getByRole('button', {
              name: d.inline ? m5s3.common.delete : privateArea.delete,
            }),
          );
        const input = screen.getByLabelText(
          d.inline
            ? privateArea.collections.titleLabel
            : d.idField === 'noteId'
              ? privateArea.notes.titleLabel
              : privateArea.gifts.titleLabel,
        );
        fireEvent.change(input, { target: { value: 'Submitted edit' } });
        fireEvent.submit(input.closest('form')!);
        await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
        const trigger = screen.getByRole('button', {
          name: confirmFirst
            ? d.inline
              ? m5s3.common.confirmDelete
              : privateArea.deleteConfirm
            : d.inline
              ? m5s3.common.delete
              : privateArea.delete,
        });
        expect((trigger as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(trigger);
        const confirm = screen.queryByRole('button', {
          name: d.inline
            ? m5s3.common.confirmDelete
            : privateArea.deleteConfirm,
        });
        if (confirm) fireEvent.click(confirm);
        await act(async () => {});
        expect(h.remove).not.toHaveBeenCalled();
      },
    );

    it('leaves content and navigation intact when deletion fails', async () => {
      const h = setup();
      await h.submit();
      await act(async () => h.write.reject(new Error('Delete failed')));
      expect(h.client.getQueryData(d.key)).toEqual(d.resource);
      expect(h.client.getQueryState(d.listKey)?.isInvalidated).toBe(false);
      expect(screen.getByTestId('location').textContent).toBe(d.path);
      expect(
        (
          (await screen.findByRole('button', {
            name: d.inline
              ? m5s3.common.confirmDelete
              : privateArea.deleteConfirm,
          })) as HTMLButtonElement
        ).disabled,
      ).toBe(false);
    });
  });
}
