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
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardApi } from '../api/generated/apis/DashboardApi';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { ClientProblemError } from '../client/problemDetails';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { EDITOR_HISTORY_STATE_KEY } from '../client/useEditorHistoryEntry';
import { i18n } from '../i18n';
import { CollectionProductPage } from './CollectionProductPage';
import { CollectionsOverviewPage } from './CollectionsOverviewPage';

const sampleCollection = {
  capabilities: { canComment: false, canDelete: true, canEdit: true },
  createdAt: new Date('2026-08-01T10:00:00Z'),
  createdBy: 'account-1',
  creator: { id: 'account-1', displayName: 'Lea' },
  id: 'collection-1',
  items: [],
  spaceId: 'space-1',
  title: 'Packing list',
  updatedAt: new Date('2026-08-01T10:00:00Z'),
  version: 1,
};
const nextCollection = {
  ...sampleCollection,
  id: 'collection-2',
  title: 'Shared recipes',
};

function renderInteractiveCollection(
  apiOverrides: Record<string, unknown> = {},
  includeOverview = false,
  configureClient?: (client: QueryClient) => void,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(
    ['m5-s3', 'collection', 'space-1', 'collection-1'],
    sampleCollection,
  );
  configureClient?.(queryClient);
  const apis = {
    collections: {
      getCollection: vi.fn().mockResolvedValue(sampleCollection),
      listCollections: vi.fn().mockResolvedValue({
        items: [nextCollection],
        nextCursor: null,
      }),
      ...apiOverrides,
    },
  } as unknown as SharedPlanningApis;

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/plan/collections/collection-1']}>
        <Routes>
          <Route
            path="/plan/collections/:collectionId"
            element={<CollectionProductPage apis={apis} spaceId="space-1" />}
          />
          {includeOverview ? (
            <Route
              path="/more/collections"
              element={
                <CollectionsOverviewPage apis={apis} spaceId="space-1" />
              }
            />
          ) : null}
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
});

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('CollectionProductPage', () => {
  function renderReorderCollection(
    reorderCollectionItems: ReturnType<typeof vi.fn>,
  ) {
    const items = ['Passport', 'Tickets', 'Apples'].map((title, position) => ({
      capabilities: { canComment: false, canDelete: true, canEdit: true },
      collectionId: 'collection-1',
      completed: false,
      createdAt: new Date('2026-08-01T10:00:00Z'),
      createdBy: 'account-1',
      creator: sampleCollection.creator,
      id: `item-${position + 1}`,
      position,
      title,
      updatedAt: new Date('2026-08-01T10:00:00Z'),
      version: 1,
    }));
    const initial = { ...sampleCollection, items };
    let authoritative = initial;
    const key = authorSummaryQueryKeys.collectionDetail(
      'space-1',
      'collection-1',
    );
    let client!: QueryClient;
    const getCollection = vi.fn(async () => authoritative);
    renderInteractiveCollection(
      { getCollection, reorderCollectionItems },
      false,
      (queryClient) => {
        client = queryClient;
        client.setQueryData(key, initial);
      },
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('m5s3.collection.sort') }),
    );
    const order = () =>
      Array.from(document.querySelectorAll('[data-sortable-item-id]')).map(
        (element) => element.getAttribute('data-sortable-item-id'),
      );
    const moveApplesUp = () =>
      fireEvent.keyDown(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.reorderItem', { title: 'Apples' }),
        }),
        { key: 'ArrowUp' },
      );
    return {
      initial,
      key,
      client,
      getCollection,
      order,
      moveApplesUp,
      setAuthoritative(collection: typeof initial) {
        authoritative = collection;
      },
    };
  }

  it.each(['query manager', 'browser'])(
    'rejects an offline shared reorder reported by the %s without reconnect replay',
    async (source) => {
      const reorder = vi.fn();
      const fixture = renderReorderCollection(reorder);
      if (source === 'query manager') onlineManager.setOnline(false);
      else vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      fixture.moveApplesUp();
      await waitFor(() =>
        expect(screen.getByText(i18n.t('states.offline.title'))).toBeDefined(),
      );
      expect(fixture.order()).toEqual(['item-1', 'item-2', 'item-3']);
      expect(reorder).not.toHaveBeenCalled();
      expect(fixture.client.isMutating()).toBe(0);
      vi.restoreAllMocks();
      await act(async () => onlineManager.setOnline(true));
      expect(reorder).not.toHaveBeenCalled();
    },
  );

  it.each(['query manager', 'browser'])(
    'ends a shared offline checkbox attempt reported by the %s',
    async (source) => {
      const update = vi.fn();
      const fixture = renderToggleCollection(update);
      if (source === 'query manager') onlineManager.setOnline(false);
      else vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markDone', { title: 'Passport' }),
        }),
      );
      await waitFor(() =>
        expect(screen.getByText(i18n.t('states.offline.title'))).toBeDefined(),
      );
      expect(
        screen
          .getByRole('button', {
            name: i18n.t('m5s3.collection.markDone', { title: 'Passport' }),
          })
          .getAttribute('aria-pressed'),
      ).toBe('false');
      expect(fixture.queryClient.isMutating()).toBe(0);
      expect(update).not.toHaveBeenCalled();
      vi.restoreAllMocks();
      await act(async () => onlineManager.setOnline(true));
      expect(update).not.toHaveBeenCalled();
    },
  );

  it('settles shared checkbox confirmation after going offline without a paused read lock', async () => {
    let confirm!: (item: unknown) => void;
    const update = vi.fn(
      () =>
        new Promise((resolve) => {
          confirm = resolve;
        }),
    );
    const fixture = renderToggleCollection(update);
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markDone', { title: 'Passport' }),
      }),
    );
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    onlineManager.setOnline(false);
    await act(async () =>
      confirm({ ...fixture.firstItem, completed: true, version: 2 }),
    );
    await waitFor(() => expect(fixture.queryClient.isMutating()).toBe(0));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('settles shared order confirmation after going offline without a paused read lock', async () => {
    let confirm!: (collection: unknown) => void;
    const reorder = vi.fn(
      () =>
        new Promise((resolve) => {
          confirm = resolve;
        }),
    );
    const fixture = renderReorderCollection(reorder);
    fixture.moveApplesUp();
    await waitFor(() => expect(reorder).toHaveBeenCalledTimes(1));
    onlineManager.setOnline(false);
    await act(async () => confirm({ ...fixture.initial, version: 2 }));
    await waitFor(() => expect(fixture.client.isMutating()).toBe(0));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps the moved row in place while saving and reconciles the server version', async () => {
    let confirm!: (collection: unknown) => void;
    const reorderCollectionItems = vi.fn(
      () =>
        new Promise((resolve) => {
          confirm = resolve;
        }),
    );
    const fixture = renderReorderCollection(reorderCollectionItems);
    fixture.moveApplesUp();
    await waitFor(() =>
      expect(fixture.order()).toEqual(['item-1', 'item-3', 'item-2']),
    );
    expect(screen.getByRole('status').textContent).toContain(
      i18n.t('m5s3.collection.reordering'),
    );
    fixture.moveApplesUp();
    expect(reorderCollectionItems).toHaveBeenCalledTimes(1);
    expect(reorderCollectionItems).toHaveBeenCalledWith(
      expect.objectContaining({
        ifMatch: '1',
        collectionOrder: { itemIds: ['item-1', 'item-3', 'item-2'] },
      }),
    );

    const confirmed = {
      ...fixture.initial,
      version: 2,
      items: fixture.initial.items.map((item) => ({
        ...item,
        position: item.id === 'item-3' ? 1 : item.id === 'item-2' ? 2 : 0,
      })),
    };
    fixture.setAuthoritative(confirmed);
    confirm(confirmed);
    await waitFor(() =>
      expect(
        fixture.client.getQueryData<typeof confirmed>(fixture.key)?.version,
      ).toBe(2),
    );
    expect(fixture.order()).toEqual(['item-1', 'item-3', 'item-2']);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('rolls back only the order on failure and retries the intended move', async () => {
    let rejectFirst!: (error: Error) => void;
    let confirmRetry!: (collection: unknown) => void;
    const reorderCollectionItems = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            confirmRetry = resolve;
          }),
      );
    const fixture = renderReorderCollection(reorderCollectionItems);
    fixture.moveApplesUp();
    await waitFor(() =>
      expect(fixture.order()).toEqual(['item-1', 'item-3', 'item-2']),
    );
    fixture.client.setQueryData<typeof fixture.initial>(
      fixture.key,
      (current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === 'item-1'
                  ? { ...item, title: 'Passport and visa' }
                  : item,
              ),
            }
          : current,
    );
    rejectFirst(new Error('Network unavailable'));
    await waitFor(() =>
      expect(fixture.order()).toEqual(['item-1', 'item-2', 'item-3']),
    );
    expect(screen.getByText('Passport and visa')).toBeDefined();
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('common.retry') }),
    );
    await waitFor(() =>
      expect(reorderCollectionItems).toHaveBeenCalledTimes(2),
    );
    expect(fixture.order()).toEqual(['item-1', 'item-3', 'item-2']);
    const confirmed = {
      ...fixture.initial,
      version: 2,
      items: fixture.initial.items.map((item) => ({
        ...item,
        position: item.id === 'item-3' ? 1 : item.id === 'item-2' ? 2 : 0,
      })),
    };
    fixture.setAuthoritative(confirmed);
    confirmRetry(confirmed);
    await waitFor(() =>
      expect(
        fixture.client.getQueryData<typeof confirmed>(fixture.key)?.version,
      ).toBe(2),
    );
  });

  it('refreshes an authoritative conflict without replaying a stale reorder', async () => {
    let rejectWrite!: (error: Error) => void;
    const reorderCollectionItems = vi.fn(
      () =>
        new Promise((_resolve, reject) => {
          rejectWrite = reject;
        }),
    );
    const fixture = renderReorderCollection(reorderCollectionItems);
    fixture.moveApplesUp();
    await waitFor(() =>
      expect(fixture.order()).toEqual(['item-1', 'item-3', 'item-2']),
    );
    fixture.setAuthoritative({
      ...fixture.initial,
      version: 3,
      items: fixture.initial.items.map((item) => ({
        ...item,
        position: item.id === 'item-3' ? 0 : item.id === 'item-1' ? 1 : 2,
      })),
    });
    rejectWrite(new ClientProblemError('conflict', 409));
    await waitFor(() =>
      expect(fixture.order()).toEqual(['item-3', 'item-1', 'item-2']),
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('common.retry') }),
    );
    expect(reorderCollectionItems).toHaveBeenCalledTimes(1);
  });

  it.each(['failure', 'success'] as const)(
    'keeps a newer shared list order after an older reorder %s',
    async (outcome) => {
      let resolve!: (value: unknown) => void;
      let reject!: (error: Error) => void;
      const write = vi.fn(
        () =>
          new Promise((success, failure) => {
            resolve = success;
            reject = failure;
          }),
      );
      const fixture = renderReorderCollection(write);
      fixture.moveApplesUp();
      await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
      const newer = {
        ...fixture.initial,
        title: 'Newer partner list',
        version: 4,
        items: fixture.initial.items.map((item) => ({
          ...item,
          position: item.id === 'item-3' ? 0 : item.id === 'item-1' ? 1 : 2,
        })),
      };
      act(() => fixture.client.setQueryData(fixture.key, newer));
      vi.spyOn(fixture.client, 'invalidateQueries').mockResolvedValue();
      await act(async () => {
        if (outcome === 'failure') reject(new Error('Connection lost'));
        else resolve({ ...fixture.initial, version: 2 });
      });
      expect(fixture.client.getQueryData(fixture.key)).toEqual(newer);
      await waitFor(() =>
        expect(fixture.order()).toEqual(['item-3', 'item-1', 'item-2']),
      );
      expect(
        screen.getByRole('heading', { name: 'Newer partner list' }),
      ).toBeDefined();
    },
  );

  it.each(['failure', 'success'] as const)(
    'leaves a replacement Query and its feedback untouched after shared reorder %s',
    async (outcome) => {
      let resolve!: (value: unknown) => void;
      let reject!: (error: Error) => void;
      const write = vi.fn(
        () =>
          new Promise((success, failure) => {
            resolve = success;
            reject = failure;
          }),
      );
      const fixture = renderReorderCollection(write);
      fixture.moveApplesUp();
      await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
      fixture.getCollection.mockImplementation(() => new Promise(() => {}));
      fixture.client.removeQueries({ queryKey: fixture.key, exact: true });
      const replacement = {
        ...fixture.initial,
        title: 'Fresh authorized list',
        version: 8,
      };
      act(() => fixture.client.setQueryData(fixture.key, replacement));
      const invalidate = vi
        .spyOn(fixture.client, 'invalidateQueries')
        .mockResolvedValue();
      await act(async () => {
        if (outcome === 'failure') reject(new Error('Connection lost'));
        else resolve({ ...fixture.initial, version: 2 });
      });
      await waitFor(() => expect(fixture.client.isMutating()).toBe(0));
      await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
      expect(fixture.client.getQueryData(fixture.key)).toEqual(replacement);
      expect(invalidate).not.toHaveBeenCalled();
      expect(
        screen.queryByRole('button', { name: i18n.t('common.retry') }),
      ).toBeNull();
    },
  );

  for (const [kind, status] of [
    ['unauthorized', 401],
    ['permission', 403],
    ['notFound', 404],
  ] as const) {
    it.each(['success', 'failure'] as const)(
      `keeps a newer shared ${status} read authoritative after reorder %s`,
      async (outcome) => {
        let resolve!: (value: unknown) => void;
        let reject!: (error: Error) => void;
        const write = vi.fn(
          () =>
            new Promise((yes, no) => {
              resolve = yes;
              reject = no;
            }),
        );
        const fixture = renderReorderCollection(write);
        fixture.moveApplesUp();
        await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
        const denied = new ClientProblemError(kind, status);
        fixture.getCollection.mockRejectedValue(denied);
        await act(async () =>
          fixture.client.refetchQueries({ queryKey: fixture.key, exact: true }),
        );
        await waitFor(() =>
          expect(screen.queryAllByRole('textbox')).toHaveLength(0),
        );
        const invalidate = vi
          .spyOn(fixture.client, 'invalidateQueries')
          .mockResolvedValue();
        await act(async () =>
          outcome === 'success'
            ? resolve({ ...fixture.initial, version: 2 })
            : reject(new Error('Connection lost')),
        );
        await waitFor(() => expect(fixture.client.isMutating()).toBe(0));
        expect(fixture.client.getQueryState(fixture.key)?.error).toBe(denied);
        expect(invalidate).not.toHaveBeenCalled();
        expect(screen.queryAllByRole('textbox')).toHaveLength(0);
      },
    );
  }

  it('does not apply shared optimism to a Query replaced while cancellation waits', async () => {
    let release!: () => void;
    let confirm!: (value: unknown) => void;
    const write = vi.fn(
      () =>
        new Promise((resolve) => {
          confirm = resolve;
        }),
    );
    const fixture = renderReorderCollection(write);
    vi.spyOn(fixture.client, 'cancelQueries').mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    fixture.moveApplesUp();
    await waitFor(() =>
      expect(fixture.client.cancelQueries).toHaveBeenCalled(),
    );
    fixture.getCollection.mockImplementation(() => new Promise(() => {}));
    fixture.client.removeQueries({ queryKey: fixture.key, exact: true });
    const replacement = { ...fixture.initial, title: 'Fresh authorized list' };
    act(() => fixture.client.setQueryData(fixture.key, replacement));
    await act(async () => release());
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(fixture.client.getQueryData(fixture.key)).toEqual(replacement);
    const invalidate = vi
      .spyOn(fixture.client, 'invalidateQueries')
      .mockResolvedValue();
    await act(async () => confirm({ ...fixture.initial, version: 2 }));
    await waitFor(() => expect(fixture.client.isMutating()).toBe(0));
    expect(fixture.client.getQueryData(fixture.key)).toEqual(replacement);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('confirms shared order without replacing a newer item edit', async () => {
    let resolve!: (value: unknown) => void;
    const write = vi.fn(
      () =>
        new Promise((success) => {
          resolve = success;
        }),
    );
    const fixture = renderReorderCollection(write);
    fixture.moveApplesUp();
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const current = {
      ...fixture.initial,
      items: fixture.initial.items.map((item) =>
        item.id === 'item-1'
          ? {
              ...item,
              title: 'Updated passport details',
              completed: true,
              version: 3,
            }
          : item,
      ),
    };
    act(() => fixture.client.setQueryData(fixture.key, current));
    vi.spyOn(fixture.client, 'invalidateQueries').mockResolvedValue();
    const confirmed = {
      ...fixture.initial,
      version: 2,
      items: fixture.initial.items.map((item) => ({
        ...item,
        position: item.id === 'item-3' ? 1 : item.id === 'item-2' ? 2 : 0,
      })),
    };
    await act(async () => {
      resolve(confirmed);
    });
    expect(
      fixture.client.getQueryData<typeof current>(fixture.key)?.items[0],
    ).toMatchObject({
      title: 'Updated passport details',
      completed: true,
      version: 3,
    });
    expect(
      fixture.client.getQueryData<typeof current>(fixture.key)?.version,
    ).toBe(2);
    expect(fixture.order()).toEqual(['item-1', 'item-3', 'item-2']);
  });

  function renderToggleCollection(
    updateCollectionItem: ReturnType<typeof vi.fn>,
    includeNavigation = false,
    reorderCollectionItems?: ReturnType<typeof vi.fn>,
  ) {
    const firstItem = {
      capabilities: { canComment: false, canDelete: true, canEdit: true },
      collectionId: 'collection-1',
      completed: false,
      createdAt: new Date('2026-08-01T10:00:00Z'),
      createdBy: 'account-1',
      creator: sampleCollection.creator,
      id: 'item-1',
      position: 1,
      title: 'Passport',
      updatedAt: new Date('2026-08-01T10:00:00Z'),
      version: 1,
    };
    const secondItem = {
      ...firstItem,
      id: 'item-2',
      position: 2,
      title: 'Tickets',
    };
    const initial = {
      ...sampleCollection,
      items: [firstItem, secondItem],
    };
    let authoritative = initial;
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const key = authorSummaryQueryKeys.collectionDetail(
      'space-1',
      'collection-1',
    );
    queryClient.setQueryData(key, initial);
    const getCollection = vi.fn(async () => authoritative);
    const apis = {
      collections: {
        getCollection,
        updateCollectionItem,
        reorderCollectionItems,
      },
    } as unknown as SharedPlanningApis;

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/plan/collections/collection-1']}>
          {includeNavigation ? (
            <Link to="/plan/collections/collection-2">Switch collection</Link>
          ) : null}
          <Routes>
            <Route
              path="/plan/collections/:collectionId"
              element={<CollectionProductPage apis={apis} spaceId="space-1" />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    return {
      firstItem,
      secondItem,
      getCollection,
      queryClient,
      key,
      setAuthoritative(item: typeof firstItem) {
        authoritative = { ...initial, items: [item, secondItem] };
      },
    };
  }

  it.each(['failure', 'success'])(
    'preserves a newer shared item after an older checkbox %s',
    async (outcome) => {
      let resolve!: (item: unknown) => void;
      let reject!: (error: Error) => void;
      const update = vi.fn(
        () =>
          new Promise((yes, no) => {
            resolve = yes;
            reject = no;
          }),
      );
      const fixture = renderToggleCollection(update);
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markDone', { title: 'Passport' }),
        }),
      );
      await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
      const newer = {
        ...fixture.firstItem,
        title: 'Passport and visa',
        completed: false,
        version: 3,
        position: 2,
      };
      fixture.setAuthoritative(newer);
      act(() =>
        fixture.queryClient.setQueryData(fixture.key, {
          ...sampleCollection,
          items: [newer, { ...fixture.secondItem, position: 1 }],
        }),
      );
      // Isolate reconciliation from a later recovery read.
      onlineManager.setOnline(false);
      await act(async () => {
        if (outcome === 'success')
          resolve({ ...fixture.firstItem, completed: true, version: 2 });
        else reject(new Error('Network unavailable'));
      });
      await waitFor(() => expect(fixture.queryClient.isMutating()).toBe(0));
      expect(
        fixture.queryClient.getQueryData<{ items: Array<typeof newer> }>(
          fixture.key,
        )?.items[0],
      ).toEqual(newer);
      await waitFor(() => expect(screen.getByText(newer.title)).toBeDefined());
    },
  );

  for (const [kind, status] of [
    ['unauthorized', 401],
    ['permission', 403],
    ['notFound', 404],
  ] as const) {
    it.each(['success', 'failure'] as const)(
      `keeps a newer shared ${status} read authoritative after checkbox %s`,
      async (outcome) => {
        let resolve!: (item: unknown) => void;
        let reject!: (error: Error) => void;
        const update = vi.fn(
          () =>
            new Promise((yes, no) => {
              resolve = yes;
              reject = no;
            }),
        );
        const h = renderToggleCollection(update);
        fireEvent.click(
          screen.getByRole('button', {
            name: i18n.t('m5s3.collection.markDone', { title: 'Passport' }),
          }),
        );
        await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
        const denied = new ClientProblemError(kind, status);
        h.getCollection.mockRejectedValue(denied);
        await act(async () =>
          h.queryClient.refetchQueries({ queryKey: h.key, exact: true }),
        );
        await waitFor(() =>
          expect(screen.queryAllByRole('textbox')).toHaveLength(0),
        );
        const invalidate = vi
          .spyOn(h.queryClient, 'invalidateQueries')
          .mockResolvedValue();
        await act(async () =>
          outcome === 'success'
            ? resolve({ ...h.firstItem, completed: true, version: 2 })
            : reject(new Error('Connection lost')),
        );
        await waitFor(() => expect(h.queryClient.isMutating()).toBe(0));
        expect(h.queryClient.getQueryState(h.key)?.error).toBe(denied);
        expect(invalidate).not.toHaveBeenCalled();
        expect(screen.queryAllByRole('textbox')).toHaveLength(0);
      },
    );
  }

  it('rolls back only shared completion while retaining concurrent title and order changes', async () => {
    let reject!: (error: Error) => void;
    const update = vi.fn(
      () =>
        new Promise((_resolve, no) => {
          reject = no;
        }),
    );
    const fixture = renderToggleCollection(update);
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markDone', { title: 'Passport' }),
      }),
    );
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    act(() =>
      fixture.queryClient.setQueryData(fixture.key, {
        ...sampleCollection,
        items: [
          {
            ...fixture.firstItem,
            completed: true,
            title: 'Passport and visa',
            position: 2,
          },
          fixture.secondItem,
        ],
      }),
    );
    await act(async () => reject(new Error('Network unavailable')));
    await waitFor(() => expect(fixture.queryClient.isMutating()).toBe(0));
    expect(
      fixture.queryClient.getQueryData<{
        items: Array<typeof fixture.firstItem>;
      }>(fixture.key)?.items[0],
    ).toEqual({
      ...fixture.firstItem,
      title: 'Passport and visa',
      position: 2,
    });
  });

  it.each(['failure', 'success'])(
    'does not reconcile a replacement shared query after checkbox %s',
    async (outcome) => {
      let resolve!: (item: unknown) => void;
      let reject!: (error: Error) => void;
      const update = vi.fn(
        () =>
          new Promise((yes, no) => {
            resolve = yes;
            reject = no;
          }),
      );
      const fixture = renderToggleCollection(update);
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markDone', { title: 'Passport' }),
        }),
      );
      await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
      cleanup();
      fixture.queryClient.removeQueries({ queryKey: fixture.key, exact: true });
      fixture.queryClient.setQueryData(fixture.key, {
        ...sampleCollection,
        items: [
          {
            ...fixture.firstItem,
            completed: true,
            title: 'Replacement read',
            version: 3,
          },
        ],
      });
      const replacement = fixture.queryClient.getQueryData(fixture.key);
      const invalidate = vi.spyOn(fixture.queryClient, 'invalidateQueries');
      await act(async () => {
        if (outcome === 'success')
          resolve({ ...fixture.firstItem, completed: true, version: 2 });
        else reject(new Error('Network unavailable'));
      });
      await waitFor(() => expect(fixture.queryClient.isMutating()).toBe(0));
      expect(fixture.queryClient.getQueryData(fixture.key)).toBe(replacement);
      expect(invalidate).not.toHaveBeenCalled();
    },
  );

  it.each(['failure', 'success'])(
    'does not restore a deleted shared row after checkbox %s',
    async (outcome) => {
      let resolve!: (item: unknown) => void;
      let reject!: (error: Error) => void;
      const update = vi.fn(
        () =>
          new Promise((yes, no) => {
            resolve = yes;
            reject = no;
          }),
      );
      const fixture = renderToggleCollection(update);
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markDone', { title: 'Passport' }),
        }),
      );
      await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
      act(() =>
        fixture.queryClient.setQueryData(fixture.key, {
          ...sampleCollection,
          items: [fixture.secondItem],
        }),
      );
      onlineManager.setOnline(false);
      await act(async () => {
        if (outcome === 'success')
          resolve({ ...fixture.firstItem, completed: true, version: 2 });
        else reject(new Error('Network unavailable'));
      });
      await waitFor(() => expect(fixture.queryClient.isMutating()).toBe(0));
      expect(
        fixture.queryClient.getQueryData<{ items: unknown[] }>(fixture.key)
          ?.items,
      ).toEqual([fixture.secondItem]);
    },
  );

  it('reconciles confirmed completion without reverting concurrent title and position changes', async () => {
    let resolve!: (item: unknown) => void;
    const update = vi.fn(
      () =>
        new Promise((yes) => {
          resolve = yes;
        }),
    );
    const fixture = renderToggleCollection(update);
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markDone', { title: 'Passport' }),
      }),
    );
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    act(() =>
      fixture.queryClient.setQueryData(fixture.key, {
        ...sampleCollection,
        items: [
          {
            ...fixture.firstItem,
            completed: true,
            title: 'Passport and visa',
            position: 2,
          },
          fixture.secondItem,
        ],
      }),
    );
    onlineManager.setOnline(false);
    const confirmed = { ...fixture.firstItem, completed: true, version: 2 };
    await act(async () => resolve(confirmed));
    await waitFor(() => expect(fixture.queryClient.isMutating()).toBe(0));
    expect(
      fixture.queryClient.getQueryData<{ items: Array<typeof confirmed> }>(
        fixture.key,
      )?.items[0],
    ).toEqual({
      ...confirmed,
      title: 'Passport and visa',
      position: 2,
    });
  });

  it('does not apply an optimistic check to a query replaced during cancellation', async () => {
    let cancel!: () => void;
    let reject!: (error: Error) => void;
    const update = vi.fn(
      () =>
        new Promise((_yes, no) => {
          reject = no;
        }),
    );
    const fixture = renderToggleCollection(update);
    vi.spyOn(fixture.queryClient, 'cancelQueries').mockReturnValue(
      new Promise<void>((yes) => {
        cancel = yes;
      }),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markDone', { title: 'Passport' }),
      }),
    );
    await waitFor(() =>
      expect(fixture.queryClient.cancelQueries).toHaveBeenCalled(),
    );
    act(() => {
      fixture.queryClient.removeQueries({ queryKey: fixture.key, exact: true });
      fixture.queryClient.setQueryData(fixture.key, {
        ...sampleCollection,
        items: [fixture.firstItem, fixture.secondItem],
      });
    });
    const replacement = fixture.queryClient.getQueryData(fixture.key);
    await act(async () => cancel());
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(fixture.queryClient.getQueryData(fixture.key)).toBe(replacement);
    await act(async () => reject(new Error('Network unavailable')));
    await waitFor(() => expect(fixture.queryClient.isMutating()).toBe(0));
    expect(fixture.queryClient.getQueryData(fixture.key)).toBe(replacement);
    expect(
      screen.queryByRole('button', { name: i18n.t('common.retry') }),
    ).toBeNull();
  });

  it.each(['success', 'failure'] as const)(
    'keeps reorder settlement, feedback and the newer write lock in the submitted collection after route change (%s)',
    async (outcome) => {
      let resolve!: (value: unknown) => void;
      let reject!: (error: Error) => void;
      let confirmNew!: (value: unknown) => void;
      const reorder = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((yes, no) => {
              resolve = yes;
              reject = no;
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise((yes) => {
              confirmNew = yes;
            }),
        );
      const fixture = renderToggleCollection(vi.fn(), true, reorder);
      fireEvent.click(
        screen.getByRole('button', { name: i18n.t('m5s3.collection.sort') }),
      );
      fireEvent.keyDown(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.reorderItem', { title: 'Tickets' }),
        }),
        { key: 'ArrowUp' },
      );
      await waitFor(() => expect(reorder).toHaveBeenCalledTimes(1));
      const nextItems = [
        {
          ...fixture.firstItem,
          collectionId: nextCollection.id,
          id: 'next-1',
          title: 'Tea',
          position: 0,
        },
        {
          ...fixture.secondItem,
          collectionId: nextCollection.id,
          id: 'next-2',
          title: 'Coffee',
          position: 1,
        },
      ];
      fixture.getCollection.mockResolvedValue({
        ...nextCollection,
        items: nextItems,
      });
      await userEvent
        .setup()
        .click(screen.getByRole('link', { name: 'Switch collection' }));
      await screen.findByRole('heading', { name: nextCollection.title });
      expect(screen.queryByRole('status')).toBeNull();
      fireEvent.click(
        screen.getByRole('button', { name: i18n.t('m5s3.collection.sort') }),
      );
      const nextHandle = screen.getByRole('button', {
        name: i18n.t('m5s3.collection.reorderItem', { title: 'Coffee' }),
      });
      expect(nextHandle.hasAttribute('disabled')).toBe(false);
      fireEvent.keyDown(nextHandle, { key: 'ArrowUp' });
      await waitFor(() => expect(reorder).toHaveBeenCalledTimes(2));
      const destinationKey = authorSummaryQueryKeys.collectionDetail(
        'space-1',
        'collection-2',
      );
      const destination = fixture.queryClient.getQueryData(destinationKey);
      vi.spyOn(fixture.queryClient, 'invalidateQueries').mockResolvedValue();
      await act(async () =>
        outcome === 'success'
          ? resolve({
              ...sampleCollection,
              version: 2,
              items: [
                { ...fixture.firstItem, position: 1 },
                { ...fixture.secondItem, position: 0 },
              ],
            })
          : reject(new Error('Connection lost')),
      );
      await waitFor(() => expect(fixture.queryClient.isMutating()).toBe(1));
      expect(fixture.queryClient.getQueryData(destinationKey)).toBe(
        destination,
      );
      expect(
        screen.queryByRole('button', { name: i18n.t('common.retry') }),
      ).toBeNull();
      expect(screen.getByRole('status').textContent).toContain(
        i18n.t('m5s3.collection.reordering'),
      );
      expect(nextHandle.hasAttribute('disabled')).toBe(true);
      fireEvent.keyDown(nextHandle, { key: 'ArrowDown' });
      expect(reorder).toHaveBeenCalledTimes(2);
      await act(async () =>
        confirmNew({
          ...nextCollection,
          version: 2,
          items: nextItems.map((item) => ({
            ...item,
            position: 1 - item.position,
          })),
        }),
      );
      await waitFor(() => expect(fixture.queryClient.isMutating()).toBe(0));
      await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
      expect(
        fixture.queryClient.getQueryData<{ version: number }>(destinationKey)
          ?.version,
      ).toBe(2);
      expect(reorder).toHaveBeenCalledTimes(2);
    },
  );

  it('keeps late checkbox failure feedback in the initiating collection after route change', async () => {
    let reject!: (error: Error) => void;
    const update = vi.fn(
      () =>
        new Promise((_yes, no) => {
          reject = no;
        }),
    );
    const fixture = renderToggleCollection(update, true);
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markDone', { title: 'Passport' }),
      }),
    );
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    fixture.getCollection.mockResolvedValue({ ...nextCollection, items: [] });
    await userEvent
      .setup()
      .click(screen.getByRole('link', { name: 'Switch collection' }));
    await screen.findByRole('heading', { name: nextCollection.title });
    await act(async () => reject(new Error('Network unavailable')));
    await waitFor(() => expect(fixture.queryClient.isMutating()).toBe(0));
    expect(
      screen.queryByRole('button', { name: i18n.t('common.retry') }),
    ).toBeNull();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('checks a shared item immediately, blocks duplicate taps, and reconciles the confirmed version', async () => {
    let confirm!: (item: unknown) => void;
    const updateCollectionItem = vi.fn(
      () =>
        new Promise((resolve) => {
          confirm = resolve;
        }),
    );
    const fixture = renderToggleCollection(updateCollectionItem);
    const toggle = screen.getByRole('button', {
      name: i18n.t('m5s3.collection.markDone', { title: 'Passport' }),
    });

    fireEvent.click(toggle);
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', {
            name: i18n.t('m5s3.collection.markOpen', { title: 'Passport' }),
          })
          .getAttribute('aria-pressed'),
      ).toBe('true'),
    );
    expect(screen.getByRole('status').textContent).toContain(
      i18n.t('m5s3.common.saving'),
    );
    expect(toggle.hasAttribute('disabled')).toBe(true);
    fireEvent.click(toggle);
    expect(updateCollectionItem).toHaveBeenCalledTimes(1);
    expect(updateCollectionItem).toHaveBeenCalledWith(
      expect.objectContaining({
        ifMatch: '1',
        collectionItemUpdate: { title: undefined, completed: true },
      }),
    );

    const confirmed = { ...fixture.firstItem, completed: true, version: 2 };
    fixture.setAuthoritative(confirmed);
    confirm(confirmed);
    await waitFor(() =>
      expect(
        fixture.queryClient.getQueryData<{
          items: Array<{ version: number; completed: boolean }>;
        }>(fixture.key)?.items[0]?.version,
      ).toBe(2),
    );
    expect(
      fixture.queryClient.getQueryData<{
        items: Array<{ version: number; completed: boolean }>;
      }>(fixture.key)?.items[1]?.completed,
    ).toBe(false);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('rolls back a failed check and retries from the confirmed item version', async () => {
    let rejectFirst!: (error: Error) => void;
    let confirmRetry!: (item: unknown) => void;
    const updateCollectionItem = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            confirmRetry = resolve;
          }),
      );
    const fixture = renderToggleCollection(updateCollectionItem);
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markDone', { title: 'Passport' }),
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markOpen', { title: 'Passport' }),
        }),
      ).toBeDefined(),
    );
    rejectFirst(new Error('Network unavailable'));
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', {
            name: i18n.t('m5s3.collection.markDone', { title: 'Passport' }),
          })
          .getAttribute('aria-pressed'),
      ).toBe('false'),
    );
    expect(
      screen.getByRole('button', { name: i18n.t('common.retry') }),
    ).toBeDefined();
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('common.retry') }),
    );
    await waitFor(() => expect(updateCollectionItem).toHaveBeenCalledTimes(2));
    expect(updateCollectionItem.mock.calls[1]?.[0].ifMatch).toBe('1');
    const confirmed = { ...fixture.firstItem, completed: true, version: 2 };
    fixture.setAuthoritative(confirmed);
    confirmRetry(confirmed);
    await waitFor(() =>
      expect(
        fixture.queryClient.getQueryData<{
          items: Array<{ version: number; completed: boolean }>;
        }>(fixture.key)?.items[0]?.version,
      ).toBe(2),
    );
    expect(
      screen.queryByRole('button', { name: i18n.t('common.retry') }),
    ).toBeNull();
  });

  it('refreshes a conflicting item instead of replaying the stale write', async () => {
    let rejectWrite!: (error: ClientProblemError) => void;
    const updateCollectionItem = vi.fn(
      () =>
        new Promise((_resolve, reject) => {
          rejectWrite = reject;
        }),
    );
    const fixture = renderToggleCollection(updateCollectionItem);
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.collection.markDone', { title: 'Passport' }),
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: i18n.t('m5s3.collection.markOpen', { title: 'Passport' }),
        }),
      ).toBeDefined(),
    );
    fixture.setAuthoritative({
      ...fixture.firstItem,
      completed: true,
      version: 3,
    });
    rejectWrite(new ClientProblemError('conflict', 409));
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', {
            name: i18n.t('m5s3.collection.markDone', { title: 'Passport' }),
          })
          .getAttribute('aria-pressed'),
      ).toBe('false'),
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('common.retry') }),
    );
    await waitFor(() =>
      expect(
        fixture.queryClient.getQueryData<{
          items: Array<{ version: number; completed: boolean }>;
        }>(fixture.key)?.items[0],
      ).toMatchObject({ version: 3, completed: true }),
    );
    expect(updateCollectionItem).toHaveBeenCalledTimes(1);
  });

  it('shows collection title cleanly without icon prefix or edit field (#373)', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(
      ['m5-s3', 'collection', 'space-1', 'collection-1'],
      {
        capabilities: { canComment: false, canDelete: true, canEdit: true },
        createdAt: new Date('2026-08-01T10:00:00Z'),
        createdBy: 'account-1',
        creator: { id: 'account-1', displayName: 'Lea' },
        id: 'collection-1',
        items: [],
        spaceId: 'space-1',
        title: 'Packing list',
        updatedAt: new Date('2026-08-01T10:00:00Z'),
        version: 1,
      },
    );

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/plan/collections/collection-1']}>
          <Routes>
            <Route
              path="/plan/collections/:collectionId"
              element={
                <CollectionProductPage
                  apis={{} as SharedPlanningApis}
                  spaceId="space-1"
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('Packing list');
    expect(html).not.toContain('collection-edit-icon');
  });

  it('renders compact list interaction with add icon and without per-item save buttons', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(
      ['m5-s3', 'collection', 'space-1', 'collection-1'],
      {
        capabilities: { canComment: false, canDelete: true, canEdit: true },
        createdAt: new Date('2026-08-01T10:00:00Z'),
        createdBy: 'account-1',
        creator: { id: 'account-1', displayName: 'Lea' },
        id: 'collection-1',
        items: [
          {
            capabilities: { canComment: false, canDelete: true, canEdit: true },
            completed: false,
            createdAt: new Date('2026-08-01T10:00:00Z'),
            createdBy: 'account-1',
            id: 'item-1',
            position: 1,
            title: 'Passport',
            updatedAt: new Date('2026-08-01T10:00:00Z'),
            version: 1,
          },
        ],
        spaceId: 'space-1',
        title: 'Packing list',
        updatedAt: new Date('2026-08-01T10:00:00Z'),
        version: 1,
      },
    );

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/plan/collections/collection-1']}>
          <Routes>
            <Route
              path="/plan/collections/:collectionId"
              element={
                <CollectionProductPage
                  apis={{} as SharedPlanningApis}
                  spaceId="space-1"
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Title input row has compact save button disabled initially
    // (Removed because title row is now inside edit mode)
    // Add button is rendered
    expect(html).toContain('planning-inline-create');
    // Item row has item title, checkbox, reorder, delete, but no per-item save button
    expect(html).toContain('Passport');
    expect(html).toContain('checklist-toggle');
    // Check that there is no submit button inside the items list
    expect(html).not.toContain('planning-item-title-form button');
  });

  it('resets isEditing and confirmDelete on successful title update', async () => {
    const updateCollectionMock = vi
      .fn()
      .mockImplementation(async ({ collectionUpdate }) => ({
        ...sampleCollection,
        title: collectionUpdate.title,
        version: 2,
      }));

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(
      ['m5-s3', 'collection', 'space-1', 'collection-1'],
      sampleCollection,
    );

    const mockApis = {
      collections: {
        getCollection: vi.fn().mockResolvedValue(sampleCollection),
        updateCollection: updateCollectionMock,
      },
    } as unknown as SharedPlanningApis;

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/plan/collections/collection-1']}>
          <Routes>
            <Route
              path="/plan/collections/:collectionId"
              element={
                <CollectionProductPage apis={mockApis} spaceId="space-1" />
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Click edit button to enter edit mode
    const editBtn = screen.getByRole('button', {
      name: /common\.edit|bearbeiten/i,
    });
    fireEvent.click(editBtn);

    // isEditing is true: input and delete trigger are visible
    const input = screen.getByRole('textbox', { name: /titel/i });
    expect(input).toBeDefined();

    const deleteTrigger = screen.getByRole('button', { name: /^löschen$/i });
    fireEvent.click(deleteTrigger);

    // confirmDelete is true: danger confirmation zone is visible
    expect(
      screen.getByRole('button', {
        name: i18n.t('m5s3.common.confirmDelete'),
      }),
    ).toBeDefined();

    // Update title
    fireEvent.change(input, { target: { value: 'New Packing list' } });

    // Save changes
    const saveBtn = screen.getByRole('button', {
      name: /änderungen speichern/i,
    });
    fireEvent.click(saveBtn);

    // Wait for mutation to finish
    await waitFor(() => {
      expect(updateCollectionMock).toHaveBeenCalled();
    });

    // Verify isEditing is reset to false: input is gone, edit button is back
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: /titel/i })).toBeNull();
    });
    expect(
      screen.getByRole('button', { name: /common\.edit|bearbeiten/i }),
    ).toBeDefined();

    // Verify confirmDelete is reset to false: danger zone with confirm delete button is gone
    expect(
      screen.queryByRole('button', {
        name: i18n.t('m5s3.common.confirmDelete'),
      }),
    ).toBeNull();
  });

  it('focuses the editor and protects a dirty draft through Escape', async () => {
    const user = userEvent.setup();
    renderInteractiveCollection();
    const edit = screen.getByRole('button', { name: i18n.t('common.edit') });

    await user.click(edit);
    const title = screen.getByRole('textbox', {
      name: i18n.t('m5s3.common.title'),
    });
    expect(document.activeElement).toBe(title);
    expect(window.history.state?.[EDITOR_HISTORY_STATE_KEY]).toBeTruthy();

    await user.clear(title);
    await user.type(title, 'Holiday packing');
    await user.keyboard('{Escape}');
    const discard = screen.getByRole('alertdialog');
    expect(document.activeElement).toBe(
      discard.querySelector('[tabindex="-1"]'),
    );

    await user.click(
      screen.getByRole('button', { name: i18n.t('m5s3.common.keepEditing') }),
    );
    expect((title as HTMLInputElement).value).toBe('Holiday packing');

    await user.keyboard('{Escape}');
    await user.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.common.discardConfirm'),
      }),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: i18n.t('common.edit') }),
    );
    expect(window.history.state?.[EDITOR_HISTORY_STATE_KEY]).toBeUndefined();
  });

  it('closes a clean editor through Browser Back', async () => {
    const user = userEvent.setup();
    renderInteractiveCollection();
    await user.click(
      screen.getByRole('button', { name: i18n.t('common.edit') }),
    );
    expect(window.history.state?.[EDITOR_HISTORY_STATE_KEY]).toBeTruthy();

    window.history.back();

    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: i18n.t('m5s3.common.title') }),
      ).toBeNull(),
    );
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: i18n.t('common.edit') }),
    );

    await user.click(
      screen.getByRole('button', { name: i18n.t('common.edit') }),
    );
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: i18n.t('m5s3.common.title') }),
      ).toBeNull(),
    );
  });

  it('restores delete-trigger focus and blocks dismissal while delete is pending', async () => {
    const user = userEvent.setup();
    const never = new Promise<void>(() => undefined);
    renderInteractiveCollection({
      deleteCollection: vi.fn().mockReturnValue(never),
    });

    await user.click(
      screen.getByRole('button', { name: i18n.t('common.edit') }),
    );
    const deleteTrigger = screen.getByRole('button', {
      name: i18n.t('m5s3.common.delete'),
    });
    await user.click(deleteTrigger);
    expect(document.activeElement?.id).toBe(
      'collection-delete-confirmation-heading',
    );

    const deleteCancel = screen
      .getAllByRole('button', { name: i18n.t('common.cancel') })
      .at(-1);
    expect(deleteCancel).toBeDefined();
    await user.click(deleteCancel as HTMLButtonElement);
    const restoredDeleteTrigger = screen.getByRole('button', {
      name: i18n.t('m5s3.common.delete'),
    });
    expect(document.activeElement).toBe(restoredDeleteTrigger);

    await user.click(restoredDeleteTrigger);
    await user.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.common.confirmDelete'),
      }),
    );
    await user.keyboard('{Escape}');
    window.history.back();
    expect(
      (
        screen.getByRole('button', {
          name: i18n.t('m5s3.common.deleting'),
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('pins the current shared list to Wir through the personal Dashboard preference', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(
      ['m5-s3', 'collection', 'space-1', 'collection-1'],
      sampleCollection,
    );
    const updateDashboardModulePreference = vi.fn().mockResolvedValue({
      moduleKey: 'pinned_collection',
      visible: true,
      selectedCollectionId: 'collection-1',
    });
    const dashboardApi = {
      listDashboardModulePreferences: vi.fn().mockResolvedValue({ items: [] }),
      updateDashboardModulePreference,
    } as unknown as DashboardApi;
    const apis = {
      collections: {
        getCollection: vi.fn().mockResolvedValue(sampleCollection),
      },
    } as unknown as SharedPlanningApis;

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/plan/collections/collection-1']}>
          <Routes>
            <Route
              path="/plan/collections/:collectionId"
              element={
                <CollectionProductPage
                  apis={apis}
                  spaceId="space-1"
                  dashboardApi={dashboardApi}
                  accountId="account-1"
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const pin = await screen.findByRole('button', {
      name: i18n.t('m5s3.collection.pinToToday'),
    });
    await userEvent.setup().click(pin);

    await waitFor(() =>
      expect(updateDashboardModulePreference).toHaveBeenCalledWith({
        moduleKey: 'pinned_collection',
        spaceId: 'space-1',
        dashboardModulePreferenceUpdate: {
          selectedCollectionId: 'collection-1',
          visible: true,
        },
      }),
    );
  });

  it('refreshes a failed Wir pin before another explicit selection', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(
      ['m5-s3', 'collection', 'space-1', 'collection-1'],
      sampleCollection,
    );
    const updateDashboardModulePreference = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValue({
        moduleKey: 'pinned_collection',
        visible: true,
        selectedCollectionId: 'collection-1',
      });
    const listDashboardModulePreferences = vi
      .fn()
      .mockResolvedValue({ items: [] });
    const dashboardApi = {
      listDashboardModulePreferences,
      updateDashboardModulePreference,
    } as unknown as DashboardApi;
    const apis = {
      collections: {
        getCollection: vi.fn().mockResolvedValue(sampleCollection),
      },
    } as unknown as SharedPlanningApis;

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/plan/collections/collection-1']}>
          <Routes>
            <Route
              path="/plan/collections/:collectionId"
              element={
                <CollectionProductPage
                  apis={apis}
                  spaceId="space-1"
                  dashboardApi={dashboardApi}
                  accountId="account-1"
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: i18n.t('m5s3.collection.pinToToday'),
      }),
    );

    const retry = await screen.findByRole('button', {
      name: i18n.t('common.retry'),
    });
    expect(updateDashboardModulePreference).toHaveBeenCalledTimes(1);

    const readsBeforeRetry = listDashboardModulePreferences.mock.calls.length;
    await user.click(retry);
    await waitFor(() =>
      expect(listDashboardModulePreferences).toHaveBeenCalledTimes(
        readsBeforeRetry + 1,
      ),
    );
    expect(updateDashboardModulePreference).toHaveBeenCalledTimes(1);
    const recoveredPin = screen.getByRole('button', {
      name: i18n.t('m5s3.collection.pinToToday'),
    });
    await waitFor(() =>
      expect(recoveredPin.hasAttribute('disabled')).toBe(false),
    );
    await user.click(recoveredPin);
    await waitFor(() =>
      expect(updateDashboardModulePreference).toHaveBeenCalledTimes(2),
    );
    expect(updateDashboardModulePreference).toHaveBeenLastCalledWith({
      moduleKey: 'pinned_collection',
      spaceId: 'space-1',
      dashboardModulePreferenceUpdate: {
        selectedCollectionId: 'collection-1',
        visible: true,
      },
    });
  });

  it('focuses the successor after a successful Collection delete', async () => {
    const user = userEvent.setup();
    renderInteractiveCollection(
      { deleteCollection: vi.fn().mockResolvedValue(undefined) },
      true,
      (queryClient) => {
        queryClient.setQueryData(
          authorSummaryQueryKeys.collections('space-1'),
          {
            pages: [
              {
                items: [sampleCollection, nextCollection],
                nextCursor: null,
                hasMore: false,
              },
            ],
            pageParams: [null],
          },
        );
      },
    );
    await user.click(
      screen.getByRole('button', { name: i18n.t('common.edit') }),
    );
    await user.click(
      screen.getByRole('button', { name: i18n.t('m5s3.common.delete') }),
    );
    await user.click(
      screen.getByRole('button', {
        name: i18n.t('m5s3.common.confirmDelete'),
      }),
    );

    const successor = (await screen.findByText(nextCollection.title)).closest(
      'a',
    );
    expect(successor).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(successor));
  });
});
