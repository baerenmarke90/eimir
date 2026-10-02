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
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import type { PrivateAreaApi } from '../api/generated/apis/PrivateAreaApi';
import type { PrivateCollectionDetail } from '../api/generated/models/PrivateCollectionDetail';
import { privateAreaQueryKeys } from '../client/privateArea';
import { ClientProblemError } from '../client/problemDetails';
import de from '../i18n/locales/de';
import privateArea from '../i18n/locales/privateArea';
import { PrivateCollectionDetailPage } from './PrivateCollectionsPage';

afterEach(cleanup);

const accountId = 'owner-1';
const spaceId = 'space-1';
const collectionId = 'list-1';
const key = privateAreaQueryKeys.collection(accountId, spaceId, collectionId);
const capabilities = { canComment: false, canDelete: true, canEdit: true };

function sample(): PrivateCollectionDetail {
  const createdAt = new Date('2026-09-01T10:00:00Z');
  return {
    id: collectionId,
    ownerId: accountId,
    spaceId,
    title: 'Travel preparations',
    createdAt,
    updatedAt: createdAt,
    version: 1,
    capabilities,
    items: ['Book tickets', 'Pack the album', 'Bring snacks'].map(
      (title, position) => ({
        id: `item-${position}`,
        collectionId,
        title,
        position,
        completed: position === 2,
        createdAt,
        updatedAt: createdAt,
        version: 1,
        capabilities,
      }),
    ),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return { promise, resolve, reject };
}

function ordered(
  collection: PrivateCollectionDetail,
  ids: string[],
  version: number,
) {
  return {
    ...collection,
    version,
    items: collection.items.map((item) => ({
      ...item,
      position: ids.indexOf(item.id),
    })),
  };
}

function setup() {
  let current = sample();
  const write = deferred<PrivateCollectionDetail>();
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(key, current);
  const get = vi.fn(async () => current);
  const reorder = vi.fn(
    (
      _request: Parameters<PrivateAreaApi['reorderPrivateCollectionItems']>[0],
    ) => write.promise,
  );
  const update = vi.fn();
  const api = {
    getPrivateCollection: get,
    reorderPrivateCollectionItems: reorder,
    updatePrivateCollectionItem: update,
  } as unknown as PrivateAreaApi;
  const tree = (owner = accountId, space = spaceId) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/private/collections/${collectionId}`]}>
        <Routes>
          <Route
            path="/private/collections/:collectionId"
            element={
              <PrivateCollectionDetailPage
                api={api}
                accountId={owner}
                spaceId={space}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(tree());
  fireEvent.click(screen.getByRole('button', { name: de.common.edit }));
  return {
    queryClient,
    write,
    get,
    reorder,
    update,
    view,
    tree,
    current: () => current,
    replace: (next: PrivateCollectionDetail) => {
      current = next;
    },
  };
}

function titles() {
  return screen
    .getAllByLabelText(privateArea.collections.rename)
    .map((input) => (input as HTMLInputElement).value);
}
function handles() {
  return screen.getAllByRole('button', {
    name: privateArea.collections.reorderItem,
  });
}
function moveAlbumFirst() {
  fireEvent.keyDown(handles()[1], { key: 'ArrowUp' });
}
const moved = ['item-1', 'item-0', 'item-2'];

it('keeps the released order immediately, blocks rapid writes and uses the confirmed root version', async () => {
  const h = setup();
  const handle = handles()[1];
  fireEvent.keyDown(handle, { key: 'ArrowUp' });
  fireEvent.keyDown(handle, { key: 'ArrowDown' });
  fireEvent.click(
    screen.getAllByRole('button', {
      name: privateArea.collections.markComplete,
    })[0],
  );
  await waitFor(() => expect(h.reorder).toHaveBeenCalledTimes(1));
  expect(titles()).toEqual(['Pack the album', 'Book tickets', 'Bring snacks']);
  expect(screen.getByRole('status').textContent).toBe(
    privateArea.collections.reordering,
  );
  expect(handles().every((handle) => handle.hasAttribute('disabled'))).toBe(
    true,
  );
  expect(h.update).not.toHaveBeenCalled();
  expect(h.reorder.mock.calls[0][0]).toMatchObject({
    spaceId,
    collectionId,
    ifMatch: '1',
    privateCollectionOrder: { itemIds: moved },
  });
  expect(
    h.queryClient.getQueryData<PrivateCollectionDetail>(key)?.version,
  ).toBe(1);
  const confirmed = ordered(sample(), moved, 2);
  h.replace(confirmed);
  await act(async () => h.write.resolve(confirmed));
  await waitFor(() =>
    expect(handles()[0].hasAttribute('disabled')).toBe(false),
  );
  expect(screen.queryByRole('status')).toBeNull();
  const nextWrite = deferred<PrivateCollectionDetail>();
  h.reorder.mockReturnValueOnce(nextWrite.promise);
  fireEvent.keyDown(handles()[0], { key: 'ArrowDown' });
  await waitFor(() => expect(h.reorder).toHaveBeenCalledTimes(2));
  expect(h.reorder.mock.calls[1][0].ifMatch).toBe('2');
  h.replace({ ...sample(), version: 3 });
  await act(async () => nextWrite.resolve(h.current()));
});

it('keeps the pending order across reads and narrowly rolls back without erasing item content or the title draft', async () => {
  const h = setup();
  const title = screen.getByLabelText(
    privateArea.collections.titleLabel,
  ) as HTMLInputElement;
  fireEvent.change(title, { target: { value: 'My travel draft' } });
  moveAlbumFirst();
  await waitFor(() => expect(h.reorder).toHaveBeenCalledTimes(1));
  const refreshed = {
    ...sample(),
    items: sample().items.map((item) =>
      item.id === 'item-0'
        ? { ...item, title: 'Updated tickets', completed: true, version: 5 }
        : item,
    ),
  };
  h.replace(refreshed);
  await act(async () =>
    h.queryClient.invalidateQueries({ queryKey: key, exact: true }),
  );
  await waitFor(() =>
    expect(
      h.queryClient.getQueryData<PrivateCollectionDetail>(key)?.items[0]
        .version,
    ).toBe(5),
  );
  expect(titles()[0]).toBe('Pack the album');
  const recovery = deferred<PrivateCollectionDetail>();
  h.get.mockReturnValue(recovery.promise);
  await act(async () => h.write.reject(new ClientProblemError('server', 500)));
  await waitFor(() => expect(h.get).toHaveBeenCalledTimes(2));
  expect(h.queryClient.getQueryData<PrivateCollectionDetail>(key)).toEqual(
    refreshed,
  );
  await waitFor(() => expect(titles()[0]).toBe('Book tickets'));
  expect(title.value).toBe('My travel draft');
  await act(async () => recovery.resolve(refreshed));
  await waitFor(() =>
    expect(handles()[0].hasAttribute('disabled')).toBe(false),
  );
  expect(h.reorder).toHaveBeenCalledTimes(1);
});

it('reconciles returned positions while preserving newer independently versioned item content', async () => {
  const h = setup();
  moveAlbumFirst();
  await waitFor(() => expect(h.reorder).toHaveBeenCalledTimes(1));
  const newer = {
    ...sample(),
    items: sample().items.map((item) =>
      item.id === 'item-0'
        ? { ...item, title: 'New tickets', completed: true, version: 5 }
        : item,
    ),
  };
  await act(async () => {
    h.queryClient.setQueryData(key, newer);
  });
  const recovery = deferred<PrivateCollectionDetail>();
  h.get.mockReturnValue(recovery.promise);
  await act(async () => h.write.resolve(ordered(sample(), moved, 2)));
  await waitFor(() => expect(h.get).toHaveBeenCalledTimes(1));
  const result = h.queryClient.getQueryData<PrivateCollectionDetail>(key);
  expect(result?.version).toBe(2);
  expect(result?.items.find((item) => item.id === 'item-0')).toEqual({
    ...newer.items[0],
    position: 1,
  });
  await act(async () => recovery.resolve(ordered(newer, moved, 2)));
});

it.each(['success', 'failure'] as const)(
  'preserves a newer root and item set when a late %s arrives',
  async (outcome) => {
    const h = setup();
    moveAlbumFirst();
    await waitFor(() => expect(h.reorder).toHaveBeenCalledTimes(1));
    const newer = {
      ...sample(),
      version: 9,
      items: [
        ...sample().items,
        {
          ...sample().items[0],
          id: 'new-item',
          title: 'A new entry',
          position: 3,
        },
      ],
    };
    await act(async () => {
      h.queryClient.setQueryData(key, newer);
    });
    await waitFor(() =>
      expect(titles()).toEqual([
        'Pack the album',
        'Book tickets',
        'Bring snacks',
        'A new entry',
      ]),
    );
    const recovery = deferred<PrivateCollectionDetail>();
    h.get.mockReturnValue(recovery.promise);
    await act(async () =>
      outcome === 'success'
        ? h.write.resolve(ordered(sample(), moved, 2))
        : h.write.reject(new ClientProblemError('server', 500)),
    );
    await waitFor(() => expect(h.get).toHaveBeenCalledTimes(1));
    expect(h.queryClient.getQueryData(key)).toEqual(newer);
    await act(async () => recovery.resolve(newer));
  },
);

it('refreshes a conflict without replay and uses the recovered root version for a new decision', async () => {
  const h = setup();
  moveAlbumFirst();
  await waitFor(() => expect(h.reorder).toHaveBeenCalledTimes(1));
  h.replace({ ...sample(), version: 7 });
  await act(async () =>
    h.write.reject(new ClientProblemError('conflict', 409)),
  );
  await waitFor(() =>
    expect(handles()[0].hasAttribute('disabled')).toBe(false),
  );
  expect(titles()).toEqual(['Book tickets', 'Pack the album', 'Bring snacks']);
  fireEvent.click(screen.getByRole('button', { name: de.common.retry }));
  await waitFor(() => expect(h.get).toHaveBeenCalledTimes(2));
  expect(h.reorder).toHaveBeenCalledTimes(1);
  const nextWrite = deferred<PrivateCollectionDetail>();
  h.reorder.mockReturnValueOnce(nextWrite.promise);
  await waitFor(() =>
    expect(handles()[0].hasAttribute('disabled')).toBe(false),
  );
  moveAlbumFirst();
  await waitFor(() => expect(h.reorder).toHaveBeenCalledTimes(2));
  expect(h.reorder.mock.calls[1][0].ifMatch).toBe('7');
  h.replace(ordered(sample(), moved, 8));
  await act(async () => nextWrite.resolve(h.current()));
});

it('keeps authorized content readable and blocks writes until failed recovery succeeds', async () => {
  const h = setup();
  moveAlbumFirst();
  await waitFor(() => expect(h.reorder).toHaveBeenCalledTimes(1));
  h.get.mockRejectedValue(new ClientProblemError('offline'));
  await act(async () => h.write.reject(new ClientProblemError('offline')));
  await waitFor(() =>
    expect(
      screen.getAllByRole('button', { name: de.common.retry }),
    ).toHaveLength(2),
  );
  expect(titles()).toEqual(['Book tickets', 'Pack the album', 'Bring snacks']);
  expect(handles()[0].hasAttribute('disabled')).toBe(true);
  h.get.mockResolvedValue(h.current());
  fireEvent.click(screen.getAllByRole('button', { name: de.common.retry })[0]);
  await waitFor(() =>
    expect(handles()[0].hasAttribute('disabled')).toBe(false),
  );
  expect(h.reorder).toHaveBeenCalledTimes(1);
});

it('keeps late callbacks scoped and never recreates a removed private cache', async () => {
  const h = setup();
  moveAlbumFirst();
  await waitFor(() => expect(h.reorder).toHaveBeenCalledTimes(1));
  const next = {
    ...sample(),
    ownerId: 'owner-2',
    spaceId: 'space-2',
    title: 'Another personal list',
  };
  const nextKey = privateAreaQueryKeys.collection(
    'owner-2',
    'space-2',
    collectionId,
  );
  h.queryClient.setQueryData(nextKey, next);
  h.view.rerender(h.tree('owner-2', 'space-2'));
  await waitFor(() =>
    expect(
      (
        screen.getByLabelText(
          privateArea.collections.titleLabel,
        ) as HTMLInputElement
      ).value,
    ).toBe(next.title),
  );
  h.queryClient.removeQueries({ queryKey: key, exact: true });
  await act(async () => h.write.resolve(ordered(sample(), moved, 2)));
  expect(h.queryClient.getQueryData(key)).toBeUndefined();
  expect(h.queryClient.getQueryData(nextKey)).toEqual(next);
  expect(h.get).not.toHaveBeenCalled();
  expect(screen.queryByRole('status')).toBeNull();
});

it('hides owner-only data on a denied reorder and denied recovery', async () => {
  const h = setup();
  moveAlbumFirst();
  await waitFor(() => expect(h.reorder).toHaveBeenCalledTimes(1));
  h.get.mockRejectedValue(new ClientProblemError('permission', 403));
  await act(async () =>
    h.write.reject(new ClientProblemError('permission', 403)),
  );
  await waitFor(() =>
    expect(
      screen.queryAllByLabelText(privateArea.collections.rename),
    ).toHaveLength(0),
  );
  expect(h.queryClient.getQueryData(key)).toBeUndefined();
});
