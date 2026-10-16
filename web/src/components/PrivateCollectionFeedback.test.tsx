// @vitest-environment jsdom
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
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

afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
});

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

it('confirms completion without restoring an older independently versioned order', async () => {
  const h = setup();
  fireEvent.click(firstToggle());
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  const reordered = {
    ...sample(),
    version: 2,
    items: sample().items.map((item) => ({
      ...item,
      position: 1 - item.position,
    })),
  };
  act(() => h.queryClient.setQueryData(key, reordered));
  vi.spyOn(h.queryClient, 'invalidateQueries').mockResolvedValue();
  await act(async () =>
    h.write.resolve({ ...sample().items[0], completed: true, version: 2 }),
  );
  await waitFor(() => expect(h.queryClient.isMutating()).toBe(0));
  expect(
    h.queryClient.getQueryData<PrivateCollectionDetail>(key)?.items[0],
  ).toEqual({
    ...reordered.items[0],
    completed: true,
    version: 2,
  });
});

it('keeps an equal-version authorized item authoritative after late completion', async () => {
  const h = setup();
  fireEvent.click(firstToggle());
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  const newer = {
    ...sample(),
    items: sample().items.map((item) => ({ ...item, version: 2 })),
  };
  act(() => h.queryClient.setQueryData(key, newer));
  vi.spyOn(h.queryClient, 'invalidateQueries').mockResolvedValue();
  await act(async () =>
    h.write.resolve({ ...sample().items[0], completed: true, version: 2 }),
  );
  await waitFor(() => expect(h.queryClient.isMutating()).toBe(0));
  expect(h.queryClient.getQueryData(key)).toEqual(newer);
});

it('confirms a private item rename without restoring an older collection position', async () => {
  const h = setup();
  fireEvent.click(screen.getByRole('button', { name: de.common.edit }));
  const input = screen.getAllByLabelText(privateArea.collections.rename)[0];
  fireEvent.change(input, { target: { value: 'Reserve train tickets' } });
  fireEvent.blur(input);
  await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  expect(h.update.mock.calls[0][0].privateCollectionItemUpdate).toEqual({
    title: 'Reserve train tickets',
  });
  const reordered = {
    ...sample(),
    version: 2,
    items: sample().items.map((item) => ({
      ...item,
      position: 1 - item.position,
    })),
  };
  act(() => h.queryClient.setQueryData(key, reordered));
  vi.spyOn(h.queryClient, 'invalidateQueries').mockResolvedValue();
  await act(async () =>
    h.write.resolve({
      ...sample().items[0],
      title: 'Reserve train tickets',
      version: 2,
    }),
  );
  await waitFor(() => expect(h.queryClient.isMutating()).toBe(0));
  expect(
    h.queryClient.getQueryData<PrivateCollectionDetail>(key)?.items[0],
  ).toEqual({
    ...reordered.items[0],
    title: 'Reserve train tickets',
    version: 2,
  });
});

it.each(['success', 'failure', 'denied'] as const)(
  'leaves a replacement private Query and its recovery untouched after item %s',
  async (outcome) => {
    const h = setup();
    fireEvent.click(firstToggle());
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    h.get.mockImplementation(() => new Promise(() => {}));
    const replacement = { ...sample(), title: 'Fresh personal list' };
    act(() => {
      h.queryClient.removeQueries({ queryKey: key, exact: true });
      h.queryClient.setQueryData(key, replacement);
    });
    const invalidate = vi
      .spyOn(h.queryClient, 'invalidateQueries')
      .mockResolvedValue();
    const reset = vi.spyOn(h.queryClient, 'resetQueries').mockResolvedValue();
    await act(async () =>
      outcome === 'success'
        ? h.write.resolve({ ...sample().items[0], completed: true, version: 2 })
        : h.write.reject(
            new ClientProblemError(
              outcome === 'denied' ? 'permission' : 'server',
              outcome === 'denied' ? 403 : 500,
            ),
          ),
    );
    await waitFor(() => expect(h.queryClient.isMutating()).toBe(0));
    expect(h.queryClient.getQueryData(key)).toEqual(replacement);
    expect(invalidate).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: de.common.retry })).toBeNull();
  },
);

for (const [kind, status] of [
  ['unauthorized', 401],
  ['permission', 403],
  ['notFound', 404],
] as const) {
  it.each(['success', 'failure'] as const)(
    `keeps a newer private ${status} read authoritative after item %s`,
    async (outcome) => {
      const h = setup();
      fireEvent.click(firstToggle());
      await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
      const denied = new ClientProblemError(kind, status);
      h.get.mockRejectedValue(denied);
      await act(async () =>
        h.queryClient.refetchQueries({ queryKey: key, exact: true }),
      );
      await waitFor(() =>
        expect(screen.queryByText('Book tickets')).toBeNull(),
      );
      const invalidate = vi
        .spyOn(h.queryClient, 'invalidateQueries')
        .mockResolvedValue();
      await act(async () =>
        outcome === 'success'
          ? h.write.resolve({
              ...sample().items[0],
              completed: true,
              version: 2,
            })
          : h.write.reject(new ClientProblemError('server', 500)),
      );
      await waitFor(() => expect(h.queryClient.isMutating()).toBe(0));
      expect(h.queryClient.getQueryState(key)?.error).toBe(denied);
      expect(invalidate).not.toHaveBeenCalled();
      expect(screen.queryByText('Book tickets')).toBeNull();
    },
  );
}

it.each(['replacement', 'newer item'] as const)(
  'does not apply private completion optimism over a %s admitted during cancellation',
  async (change) => {
    const h = setup();
    const cancellation = deferred<void>();
    vi.spyOn(h.queryClient, 'cancelQueries').mockReturnValue(
      cancellation.promise,
    );
    fireEvent.click(firstToggle());
    await waitFor(() => expect(h.queryClient.cancelQueries).toHaveBeenCalled());
    const current = {
      ...sample(),
      title: 'New authorized read',
      items: sample().items.map((item) => ({
        ...item,
        version: change === 'newer item' ? 4 : 1,
      })),
    };
    act(() => {
      if (change === 'replacement')
        h.queryClient.removeQueries({ queryKey: key, exact: true });
      h.queryClient.setQueryData(key, current);
    });
    await act(async () => cancellation.resolve());
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    expect(h.queryClient.getQueryData(key)).toEqual(current);
    expect(firstToggle().getAttribute('aria-pressed')).toBe('false');
    vi.spyOn(h.queryClient, 'invalidateQueries').mockResolvedValue();
    await act(async () =>
      h.write.reject(new ClientProblemError('server', 500)),
    );
    await waitFor(() => expect(h.queryClient.isMutating()).toBe(0));
    expect(h.queryClient.getQueryData(key)).toEqual(current);
  },
);

it.each(['query manager', 'browser'])(
  'ends an offline update reported by the %s without reconnect replay',
  async (source) => {
    const h = setup();
    if (source === 'query manager') onlineManager.setOnline(false);
    else vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    fireEvent.click(firstToggle());
    await waitFor(() =>
      expect(screen.getByText(de.states.offline.title)).toBeDefined(),
    );
    expect(firstToggle().getAttribute('aria-pressed')).toBe('false');
    expect(h.update).not.toHaveBeenCalled();
    expect(h.queryClient.isMutating()).toBe(0);
    expect(screen.queryByText(de.common.saving)).toBeNull();
    vi.restoreAllMocks();
    await act(async () => onlineManager.setOnline(true));
    fireEvent.click(screen.getByRole('button', { name: de.common.retry }));
    await waitFor(() => expect(h.get).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByText(de.states.offline.title)).toBeNull(),
    );
    expect(h.update).not.toHaveBeenCalled();
    fireEvent.click(firstToggle());
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  },
);

it('rejects a update when connectivity is lost during query cancellation', async () => {
  const h = setup();
  const cancellation = deferred<void>();
  vi.spyOn(h.queryClient, 'cancelQueries').mockReturnValue(
    cancellation.promise,
  );
  fireEvent.click(firstToggle());
  await act(async () => {
    onlineManager.setOnline(false);
    cancellation.resolve();
  });
  await waitFor(() =>
    expect(screen.getByText(de.states.offline.title)).toBeDefined(),
  );
  expect(firstToggle().getAttribute('aria-pressed')).toBe('false');
  expect(h.queryClient.isMutating()).toBe(0);
  expect(h.update).not.toHaveBeenCalled();
  await act(async () => onlineManager.setOnline(true));
  expect(h.update).not.toHaveBeenCalled();
});

it.each(['success', 'failure'])(
  'releases a update with %s after connectivity is lost without a paused recovery lock',
  async (outcome) => {
    const h = setup();
    fireEvent.click(firstToggle());
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    onlineManager.setOnline(false);
    await act(async () => {
      if (outcome === 'success') {
        h.write.resolve({
          ...h.current().items[0],
          completed: true,
          version: 2,
        });
      } else h.write.reject(new ClientProblemError('server', 500));
    });
    await waitFor(() => expect(h.queryClient.isMutating()).toBe(0));
    expect(screen.queryByText(de.common.saving)).toBeNull();
    expect(h.get).not.toHaveBeenCalled();
    await act(async () => onlineManager.setOnline(true));
    await waitFor(() => expect(h.get).toHaveBeenCalled());
    expect(h.update).toHaveBeenCalledTimes(1);
  },
);
