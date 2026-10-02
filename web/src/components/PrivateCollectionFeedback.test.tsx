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
import type { PrivateCollectionItemDetail } from '../api/generated/models/PrivateCollectionItemDetail';
import { privateAreaQueryKeys } from '../client/privateArea';
import { ClientProblemError } from '../client/problemDetails';
import de from '../i18n/locales/de';
import privateArea from '../i18n/locales/privateArea';
import { PrivateCollectionDetailPage } from './PrivateCollectionsPage';

afterEach(cleanup);

const capabilities = { canComment: false, canDelete: true, canEdit: true };
const accountId = 'owner-1';
const spaceId = 'space-1';
const collectionId = 'list-1';
const key = privateAreaQueryKeys.collection(accountId, spaceId, collectionId);

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
    items: ['Book tickets', 'Pack the album'].map((title, position) => ({
      id: `item-${position}`,
      collectionId,
      title,
      position,
      completed: false,
      createdAt,
      updatedAt: createdAt,
      version: 1,
      capabilities,
    })),
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

function setup() {
  let current = sample();
  const write = deferred<PrivateCollectionItemDetail>();
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(key, current);
  const get = vi.fn(async () => current);
  const update = vi.fn(
    (_request: Parameters<PrivateAreaApi['updatePrivateCollectionItem']>[0]) =>
      write.promise.then((item) => {
        current = {
          ...current,
          items: current.items.map((entry) =>
            entry.id === item.id ? item : entry,
          ),
        };
        return item;
      }),
  );
  const api = {
    getPrivateCollection: get,
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
  return {
    queryClient,
    write,
    get,
    update,
    view,
    tree,
    current: () => current,
    replace: (next: PrivateCollectionDetail) => {
      current = next;
    },
  };
}

function firstToggle() {
  return screen.getAllByRole('button', {
    name: privateArea.collections.markComplete,
  })[0];
}

it('shows completion before response, blocks duplicates, and uses the returned version for reopening', async () => {
  const harness = setup();
  const toggle = firstToggle();
  fireEvent.click(toggle);
  fireEvent.click(toggle);
  await waitFor(() => expect(toggle.getAttribute('aria-pressed')).toBe('true'));
  expect(toggle.hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('status').textContent).toBe(de.common.saving);
  expect(toggle.getAttribute('aria-describedby')).toBe(
    screen.getByRole('status').id,
  );
  expect(harness.update).toHaveBeenCalledTimes(1);
  expect(harness.update.mock.calls[0][0]).toMatchObject({
    ifMatch: '1',
    privateCollectionItemUpdate: { completed: true },
  });
  expect(
    harness.queryClient.getQueryData<PrivateCollectionDetail>(key)?.items[0]
      .version,
  ).toBe(1);

  await act(async () =>
    harness.write.resolve({
      ...harness.current().items[0],
      completed: true,
      version: 2,
    }),
  );
  await waitFor(() => expect(toggle.hasAttribute('disabled')).toBe(false));
  expect(screen.queryByRole('status')).toBeNull();
  fireEvent.click(toggle);
  await waitFor(() => expect(harness.update).toHaveBeenCalledTimes(2));
  expect(harness.update.mock.calls[1][0]).toMatchObject({
    ifMatch: '2',
    privateCollectionItemUpdate: { completed: false },
  });
});

it('keeps pending feedback across a background read and rolls back only its item on failure', async () => {
  const harness = setup();
  const toggle = firstToggle();
  fireEvent.click(toggle);
  await waitFor(() => expect(harness.update).toHaveBeenCalledTimes(1));
  const refreshed = {
    ...harness.current(),
    title: 'Updated travel preparations',
    items: harness
      .current()
      .items.map((item, index) =>
        index === 1 ? { ...item, completed: true, version: 2 } : item,
      ),
  };
  harness.replace(refreshed);
  await act(async () =>
    harness.queryClient.invalidateQueries({ queryKey: key, exact: true }),
  );
  expect(toggle.getAttribute('aria-pressed')).toBe('true');
  await act(async () =>
    harness.write.reject(new ClientProblemError('server', 500)),
  );
  await waitFor(() =>
    expect(toggle.getAttribute('aria-pressed')).toBe('false'),
  );
  const result = harness.queryClient.getQueryData<PrivateCollectionDetail>(key);
  expect(result?.title).toBe(refreshed.title);
  expect(result?.items[1]).toEqual(refreshed.items[1]);
  expect(screen.getByRole('button', { name: de.common.retry })).toBeDefined();
  expect(harness.update).toHaveBeenCalledTimes(1);
});

it('recovers the authoritative version after a conflict without replaying the failed write', async () => {
  const harness = setup();
  const toggle = firstToggle();
  fireEvent.click(toggle);
  await waitFor(() => expect(harness.update).toHaveBeenCalledTimes(1));
  harness.replace({
    ...harness.current(),
    items: harness
      .current()
      .items.map((item, index) =>
        index === 0 ? { ...item, completed: true, version: 7 } : item,
      ),
  });
  await act(async () =>
    harness.write.reject(new ClientProblemError('conflict', 409)),
  );
  await waitFor(() => expect(toggle.hasAttribute('disabled')).toBe(false));
  expect(toggle.getAttribute('aria-pressed')).toBe('true');
  expect(harness.update).toHaveBeenCalledTimes(1);
  fireEvent.click(toggle);
  await waitFor(() => expect(harness.update).toHaveBeenCalledTimes(2));
  expect(harness.update.mock.calls[1][0]).toMatchObject({
    ifMatch: '7',
    privateCollectionItemUpdate: { completed: false },
  });
});

it('keeps the list readable when write and recovery are offline, and retry only refreshes it', async () => {
  const harness = setup();
  const toggle = firstToggle();
  fireEvent.click(toggle);
  await waitFor(() => expect(harness.update).toHaveBeenCalledTimes(1));
  harness.get.mockRejectedValue(new ClientProblemError('offline'));
  await act(async () =>
    harness.write.reject(new ClientProblemError('offline')),
  );
  await waitFor(() =>
    expect(
      screen.getAllByRole('button', { name: de.common.retry }).length,
    ).toBeGreaterThan(0),
  );
  expect(screen.getByText('Book tickets')).toBeDefined();
  expect(toggle.getAttribute('aria-pressed')).toBe('false');
  expect(toggle.hasAttribute('disabled')).toBe(true);
  harness.get.mockResolvedValue(harness.current());
  fireEvent.click(screen.getAllByRole('button', { name: de.common.retry })[0]);
  await waitFor(() => expect(toggle.hasAttribute('disabled')).toBe(false));
  expect(harness.update).toHaveBeenCalledTimes(1);
});

it('does not replace a newer item version with a late successful response', async () => {
  const harness = setup();
  const toggle = firstToggle();
  fireEvent.click(toggle);
  await waitFor(() => expect(harness.update).toHaveBeenCalledTimes(1));
  const newer = {
    ...harness.current(),
    items: harness
      .current()
      .items.map((item, index) =>
        index === 0
          ? { ...item, title: 'Updated tickets', completed: false, version: 5 }
          : item,
      ),
  };
  await act(async () => {
    harness.queryClient.setQueryData(key, newer);
  });
  const recovery = deferred<PrivateCollectionDetail>();
  harness.get.mockReturnValue(recovery.promise);
  await act(async () =>
    harness.write.resolve({
      ...sample().items[0],
      completed: true,
      version: 2,
    }),
  );
  await waitFor(() => expect(harness.get).toHaveBeenCalledTimes(1));
  expect(
    harness.queryClient.getQueryData<PrivateCollectionDetail>(key)?.items[0],
  ).toEqual(newer.items[0]);
  await act(async () => recovery.resolve(newer));
  await waitFor(() => expect(toggle.hasAttribute('disabled')).toBe(false));
  expect(
    harness.queryClient.getQueryData<PrivateCollectionDetail>(key)?.items[0],
  ).toEqual(newer.items[0]);
});

it('keeps a late result in its initiating scope and does not recreate a cleared private cache', async () => {
  const harness = setup();
  fireEvent.click(firstToggle());
  await waitFor(() => expect(harness.update).toHaveBeenCalledTimes(1));
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
  harness.queryClient.setQueryData(nextKey, next);
  harness.view.rerender(harness.tree('owner-2', 'space-2'));
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: next.title })).toBeDefined(),
  );
  harness.queryClient.removeQueries({ queryKey: key, exact: true });
  await act(async () =>
    harness.write.resolve({
      ...sample().items[0],
      completed: true,
      version: 2,
    }),
  );
  expect(harness.queryClient.getQueryData(key)).toBeUndefined();
  expect(harness.queryClient.getQueryData(nextKey)).toEqual(next);
  expect(harness.update.mock.calls[0][0]).toMatchObject({
    spaceId,
    collectionId,
  });
  expect(screen.queryByRole('status')).toBeNull();
});

it('hides private content immediately on a denied write and denied recovery', async () => {
  const harness = setup();
  fireEvent.click(firstToggle());
  await waitFor(() => expect(harness.update).toHaveBeenCalledTimes(1));
  harness.get.mockRejectedValue(new ClientProblemError('permission', 403));
  await act(async () =>
    harness.write.reject(new ClientProblemError('permission', 403)),
  );
  await waitFor(() => expect(screen.queryByText('Book tickets')).toBeNull());
  expect(harness.queryClient.getQueryData(key)).toBeUndefined();
});
