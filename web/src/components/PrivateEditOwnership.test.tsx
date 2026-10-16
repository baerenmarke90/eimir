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
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GiftIdeaDetail } from '../api/generated/models/GiftIdeaDetail';
import type { PrivateAreaApi } from '../api/generated/apis/PrivateAreaApi';
import type { PrivateCollectionDetail } from '../api/generated/models/PrivateCollectionDetail';
import type { PrivateNoteDetail } from '../api/generated/models/PrivateNoteDetail';
import { privateAreaQueryKeys } from '../client/privateArea';
import { ClientProblemError } from '../client/problemDetails';
import de from '../i18n/locales/de';
import m5s3 from '../i18n/locales/m5s3';
import privateArea from '../i18n/locales/privateArea';
import { GiftIdeaEditPage } from './GiftIdeasPage';
import {
  PrivateCollectionDetailPage,
  PrivateCollectionEditPage,
} from './PrivateCollectionsPage';
import { PrivateNoteEditPage } from './PrivateNotesPage';

const accountId = 'account-1';
const spaceId = 'space-1';
const resourceId = 'resource-1';
const base = {
  id: resourceId,
  ownerId: accountId,
  spaceId,
  title: 'Private cabin idea',
  version: 1,
  capabilities: { canComment: false, canDelete: true, canEdit: true },
  createdAt: new Date('2026-10-16T09:00:00Z'),
  updatedAt: new Date('2026-10-16T09:00:00Z'),
};
type Resource = PrivateNoteDetail | GiftIdeaDetail | PrivateCollectionDetail;
const note: PrivateNoteDetail = {
  ...base,
  body: 'This private text belongs only to the authorized session.',
  pinned: false,
};
const gift: GiftIdeaDetail = {
  ...base,
  description: 'An owner-only surprise.',
  recipient: null,
  occasion: null,
  targetOn: null,
  priceText: null,
  url: null,
  status: 'IDEA',
  pinned: false,
};
const collection: PrivateCollectionDetail = { ...base, items: [] };

const definitions = [
  {
    name: 'private note',
    Editor: PrivateNoteEditPage,
    resource: note,
    route: '/more/private/notes/:noteId/edit',
    path: `/more/private/notes/${resourceId}/edit`,
    result: `/more/private/notes/${resourceId}`,
    key: privateAreaQueryKeys.note(accountId, spaceId, resourceId),
    label: privateArea.notes.titleLabel,
    idField: 'noteId',
    inline: false,
  },
  {
    name: 'gift idea',
    Editor: GiftIdeaEditPage,
    resource: gift,
    route: '/more/private/gift-ideas/:giftIdeaId/edit',
    path: `/more/private/gift-ideas/${resourceId}/edit`,
    result: `/more/private/gift-ideas/${resourceId}`,
    key: privateAreaQueryKeys.giftIdea(accountId, spaceId, resourceId),
    label: privateArea.gifts.titleLabel,
    idField: 'giftIdeaId',
    inline: false,
  },
  {
    name: 'private collection route',
    Editor: PrivateCollectionEditPage,
    resource: collection,
    route: '/more/private/collections/:collectionId/edit',
    path: `/more/private/collections/${resourceId}/edit`,
    result: `/more/private/collections/${resourceId}`,
    key: privateAreaQueryKeys.collection(accountId, spaceId, resourceId),
    label: privateArea.collections.titleLabel,
    idField: 'collectionId',
    inline: false,
  },
  {
    name: 'private collection inline',
    Editor: PrivateCollectionDetailPage,
    resource: collection,
    route: '/more/private/collections/:collectionId',
    path: `/more/private/collections/${resourceId}`,
    result: `/more/private/collections/${resourceId}`,
    key: privateAreaQueryKeys.collection(accountId, spaceId, resourceId),
    label: privateArea.collections.titleLabel,
    idField: 'collectionId',
    inline: true,
  },
] as const;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((success) => {
    resolve = success;
  });
  return { promise, resolve };
}

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

beforeEach(() => window.history.replaceState({}, '', '/'));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

for (const definition of definitions) {
  describe(`${definition.name} private settlement ownership`, () => {
    function setup() {
      const write = deferred<Resource>();
      const update = vi.fn((_request: unknown) => write.promise);
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: Infinity },
          mutations: { retry: false },
        },
      });
      queryClient.setQueryData(definition.key, definition.resource);
      const get = vi.fn(async () => definition.resource);
      const api = {
        getPrivateNote: get,
        getGiftIdea: get,
        getPrivateCollection: get,
        updatePrivateNote: update,
        updateGiftIdea: update,
        updatePrivateCollection: update,
      } as unknown as PrivateAreaApi;
      const Editor = definition.Editor;
      let hideEditor!: () => void;
      function Harness() {
        const [visible, setVisible] = useState(true);
        hideEditor = () => setVisible(false);
        return (
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[definition.path]}>
            <Location />
            <Routes>
              <Route path={definition.route} element={
                visible ? <Editor api={api} accountId={accountId} spaceId={spaceId} /> : <p>Session ended</p>
              } />
              {!definition.inline ? (
                <Route path={definition.result} element={<p>Authorized saved result</p>} />
              ) : null}
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
        );
      }
      render(<Harness />);
      async function submit() {
        if (definition.inline) {
          fireEvent.click(screen.getByRole('button', { name: de.common.edit }));
        }
        fireEvent.change(screen.getByLabelText(definition.label), {
          target: { value: 'Submitted private title' },
        });
        fireEvent.click(screen.getByRole('button', {
          name: definition.inline ? m5s3.common.saveChanges : privateArea.save,
          exact: true,
        }));
        await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
      }
      const saved = { ...definition.resource, title: 'Submitted private title', version: 2 };
      return { queryClient, write, update, submit, saved, hideEditor };
    }

    it.each(['removed', 'replaced'])(
      'does not restore private content into a %s session query after unmount',
      async (state) => {
        const h = setup();
        await h.submit();
        act(() => h.hideEditor());
        h.queryClient.clear();
        const replacement = { ...definition.resource, title: 'Fresh authorized session' };
        if (state === 'replaced') h.queryClient.setQueryData(definition.key, replacement);
        const invalidate = vi.spyOn(h.queryClient, 'invalidateQueries');
        await act(async () => h.write.resolve(h.saved));
        expect(h.queryClient.getQueryData(definition.key)).toEqual(
          state === 'replaced' ? replacement : undefined,
        );
        expect(invalidate).not.toHaveBeenCalled();
        expect(screen.getByTestId('location').textContent).toBe(definition.path);
      },
    );

    it.each([
      ['unauthorized', 401],
      ['permission', 403],
      ['notFound', 404],
    ] as const)('preserves a current %s read instead of reviving private content', async (kind, status) => {
      const h = setup();
      await h.submit();
      const denied = new ClientProblemError(kind, status);
      await act(async () => {
        await h.queryClient.fetchQuery({
          queryKey: definition.key,
          queryFn: () => Promise.reject(denied),
          staleTime: 0,
          retry: false,
        }).catch(() => undefined);
      });
      expect(h.queryClient.getQueryState(definition.key)?.error).toBe(denied);
      const invalidate = vi.spyOn(h.queryClient, 'invalidateQueries');
      await act(async () => h.write.resolve(h.saved));
      expect(h.queryClient.getQueryState(definition.key)?.error).toBe(denied);
      expect(h.queryClient.getQueryState(definition.key)?.status).toBe('error');
      expect(invalidate).not.toHaveBeenCalled();
      expect(screen.getByTestId('location').textContent).toBe(definition.path);
      expect(screen.queryByDisplayValue('Submitted private title')).toBeNull();
    });

    it('does not overwrite a newer authorized resource version', async () => {
      const h = setup();
      await h.submit();
      const newer = { ...definition.resource, title: 'Newer authorized content', version: 5 };
      act(() => h.queryClient.setQueryData(definition.key, newer));
      const invalidate = vi.spyOn(h.queryClient, 'invalidateQueries');
      await act(async () => h.write.resolve(h.saved));
      expect(h.queryClient.getQueryData(definition.key)).toEqual(newer);
      expect(invalidate).not.toHaveBeenCalled();
    });

    it('reconciles a current authorized save and keeps the existing result continuation', async () => {
      const h = setup();
      await h.submit();
      expect(h.update).toHaveBeenCalledWith(expect.objectContaining({
        spaceId, ifMatch: '1', [definition.idField]: resourceId,
      }));
      await act(async () => h.write.resolve(h.saved));
      await waitFor(() => expect(h.queryClient.isMutating()).toBe(0));
      expect(h.queryClient.getQueryData(definition.key)).toEqual(h.saved);
      await waitFor(() => expect(screen.getByTestId('location').textContent).toBe(definition.result));
      if (definition.inline) {
        expect(screen.getByRole('heading', { name: /Submitted private title/ })).toBeDefined();
      } else {
        expect(screen.getByText('Authorized saved result')).toBeDefined();
      }
    });

    if (!definition.inline) it('does not continue into a cleared session after awaited list recovery', async () => {
      const h = setup();
      await h.submit();
      const recovery = deferred<void>();
      vi.spyOn(h.queryClient, 'invalidateQueries').mockReturnValue(recovery.promise);
      await act(async () => h.write.resolve(h.saved));
      expect(h.queryClient.getQueryData(definition.key)).toEqual(h.saved);
      act(() => { h.hideEditor(); h.queryClient.clear(); });
      await act(async () => recovery.resolve());
      expect(h.queryClient.getQueryData(definition.key)).toBeUndefined();
      if (!definition.inline) {
        expect(screen.getByTestId('location').textContent).toBe(definition.path);
      }
    });
  });
}
