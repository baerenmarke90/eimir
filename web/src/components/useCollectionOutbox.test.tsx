// @vitest-environment jsdom
import { QueryClient, onlineManager } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectionDetail } from '../api/generated/models/CollectionDetail';
import type { CollectionItemDetail } from '../api/generated/models/CollectionItemDetail';
import {
  OUTBOX_ADD_MAX_AGE_MS,
  emptyOutbox,
  enqueueAdd,
  parseOutbox,
} from '../client/collectionOutbox';
import { ClientProblemError } from '../client/problemDetails';
import {
  __resetProductReadCacheStateForTests,
  __setProductReadCacheStorageForTests,
  __waitForProductReadCacheMutationsForTests,
  type ProductReadCacheStorage,
  readCollectionOutbox,
  writeCollectionOutbox,
} from '../client/productReadCache';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import {
  OUTBOX_RETRY_DELAYS_MS,
  useCollectionOutbox,
} from './useCollectionOutbox';

let online = true;
vi.mock('../client/connectivity', () => ({
  isClientOnline: () => online,
  assertOnlineWrite: () => undefined,
}));

class MemoryLocalStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class MemoryStorage implements ProductReadCacheStorage {
  readonly records = new Map<string, unknown>();
  failWrites = false;
  async read(key: string): Promise<unknown> {
    return this.records.get(key) ?? null;
  }
  async write(record: unknown): Promise<void> {
    if (this.failWrites) throw new Error('quota exceeded');
    this.records.set((record as { key: string }).key, record);
  }
  async remove(key: string): Promise<void> {
    this.records.delete(key);
  }
  async clear(): Promise<void> {
    this.records.clear();
  }
}

const NOW = new Date('2026-11-14T10:00:00Z');
const ANNA = { id: 'anna', displayName: 'Anna' };
const KEY = ['collection-detail', 'space-1', 'list-1'] as const;

function item(
  overrides: Partial<CollectionItemDetail> = {},
): CollectionItemDetail {
  return {
    id: 'item-1',
    collectionId: 'list-1',
    createdBy: 'ben',
    title: 'Milch',
    quantity: null,
    completed: false,
    completedBy: null,
    completedAt: null,
    position: 0,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    creator: { id: 'ben', displayName: 'Ben' },
    completer: null,
    capabilities: { canEdit: true, canDelete: true, canComment: false },
    ...overrides,
  };
}

function list(items: CollectionItemDetail[] = [item()]): CollectionDetail {
  return {
    id: 'list-1',
    spaceId: 'space-1',
    createdBy: 'ben',
    kind: 'SHOPPING',
    title: 'Einkauf',
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    creator: { id: 'ben', displayName: 'Ben' },
    capabilities: { canEdit: true, canDelete: true, canComment: false },
    items,
  };
}

describe('useCollectionOutbox (#1808)', () => {
  let storage: MemoryStorage;
  let queryClient: QueryClient;
  let createCollectionItem: ReturnType<typeof vi.fn>;
  let updateCollectionItem: ReturnType<typeof vi.fn>;
  let getCollection: ReturnType<typeof vi.fn>;

  function options(overrides: { enabled?: boolean } = {}) {
    const apis = {
      collections: {
        createCollectionItem,
        updateCollectionItem,
        getCollection,
      },
    } as unknown as Pick<SharedPlanningApis, 'collections'>;
    return {
      apis,
      queryClient,
      queryKey: KEY,
      accountId: 'anna',
      spaceId: 'space-1',
      collectionId: 'list-1',
      enabled: overrides.enabled ?? true,
    };
  }

  function setOnline(value: boolean) {
    online = value;
    act(() => onlineManager.setOnline(value));
  }

  beforeEach(() => {
    __resetProductReadCacheStateForTests();
    storage = new MemoryStorage();
    __setProductReadCacheStorageForTests(storage);
    vi.stubGlobal('localStorage', new MemoryLocalStorage());
    queryClient = new QueryClient();
    queryClient.setQueryData(KEY, list());
    createCollectionItem = vi.fn(
      async (request: {
        idempotencyKey: string;
        collectionItemCreate: { title: string };
      }) =>
        item({
          id: `server-${request.idempotencyKey}`,
          title: request.collectionItemCreate.title,
        }),
    );
    updateCollectionItem = vi.fn(async (request: { itemId: string }) =>
      item({ id: request.itemId, version: 2, completed: true }),
    );
    getCollection = vi.fn(async () => list());
    online = false;
    onlineManager.setOnline(false);
  });

  afterEach(async () => {
    cleanup();
    vi.useRealTimers();
    await __waitForProductReadCacheMutationsForTests();
    __resetProductReadCacheStateForTests();
    vi.unstubAllGlobals();
    onlineManager.setOnline(true);
    online = true;
  });

  async function mount(overrides?: { enabled?: boolean }) {
    const hook = renderHook(() => useCollectionOutbox(options(overrides)));
    await waitFor(() => expect(hook.result.current.loaded).toBe(true));
    return hook;
  }

  it('keeps an add made without a connection, shows it and stores it for later', async () => {
    const { result } = await mount();

    await act(async () => {
      await result.current.addItem({ title: 'Hafermilch', quantity: '2 Pack' });
    });

    expect(result.current.pendingCount).toBe(1);
    expect(createCollectionItem).not.toHaveBeenCalled();
    const shown = result.current.apply(list(), ANNA).collection.items;
    expect(shown.map((entry) => entry.title)).toEqual(['Milch', 'Hafermilch']);
    expect(shown[1].quantity).toBe('2 Pack');
    const stored = parseOutbox(
      await readCollectionOutbox('anna', 'space-1', 'list-1'),
    );
    expect(stored.ops).toHaveLength(1);
  });

  it('sends the waiting add once the connection is back and updates the list', async () => {
    const { result } = await mount();
    await act(async () => {
      await result.current.addItem({ title: 'Hafermilch' });
    });

    setOnline(true);

    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(createCollectionItem).toHaveBeenCalledTimes(1);
    expect(createCollectionItem.mock.calls[0][0]).toMatchObject({
      spaceId: 'space-1',
      collectionId: 'list-1',
      collectionItemCreate: { title: 'Hafermilch', completed: false },
    });
    const cached = queryClient.getQueryData<CollectionDetail>(KEY);
    expect(cached?.items.map((entry) => entry.title)).toEqual([
      'Milch',
      'Hafermilch',
    ]);
    expect(await readCollectionOutbox('anna', 'space-1', 'list-1')).toBeNull();
  });

  it('sends right away when a change is made while online', async () => {
    online = true;
    onlineManager.setOnline(true);
    const { result } = await mount();

    await act(async () => {
      await result.current.setCompleted('item-1', true);
    });

    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(updateCollectionItem).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'item-1',
        ifMatch: '1',
        collectionItemUpdate: { completed: true, quantity: undefined },
      }),
    );
  });

  it('is still there after the app was closed and sends with the same request identity', async () => {
    const first = await mount();
    await act(async () => {
      await first.result.current.addItem({ title: 'Brot' });
    });
    const storedKey = (
      parseOutbox(await readCollectionOutbox('anna', 'space-1', 'list-1'))
        .ops[0] as { idempotencyKey: string }
    ).idempotencyKey;
    first.unmount();

    const second = await mount();
    expect(second.result.current.pendingCount).toBe(1);
    setOnline(true);

    await waitFor(() => expect(second.result.current.pendingCount).toBe(0));
    expect(createCollectionItem.mock.calls[0][0].idempotencyKey).toBe(
      storedKey,
    );
  });

  it('folds a check of a waiting add into that add', async () => {
    const { result } = await mount();
    await act(async () => {
      await result.current.addItem({ title: 'Brot' });
    });
    const local = (result.current.ops[0] as { localId: string }).localId;

    await act(async () => {
      await result.current.setCompleted(local, true);
    });

    expect(result.current.pendingCount).toBe(1);
    const shown = result.current.apply(list(), ANNA).collection.items;
    expect(shown[1]).toMatchObject({ title: 'Brot', completed: true });
  });

  it('tries again with the same request identity after a failed attempt', async () => {
    createCollectionItem.mockRejectedValueOnce(
      new ClientProblemError('server', 503),
    );
    const { result } = await mount();
    await act(async () => {
      await result.current.addItem({ title: 'Brot' });
    });

    setOnline(true);
    await waitFor(() => expect(createCollectionItem).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.syncing).toBe(false));
    expect(result.current.pendingCount).toBe(1);

    await act(async () => {
      result.current.replayNow();
    });

    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    const keys = createCollectionItem.mock.calls.map(
      ([request]) => request.idempotencyKey,
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('waits and tries again on its own while something stays unsent', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    createCollectionItem.mockRejectedValueOnce(
      new ClientProblemError('server', 503),
    );
    const { result } = await mount();
    await act(async () => {
      await result.current.addItem({ title: 'Brot' });
    });
    setOnline(true);
    await waitFor(() => expect(createCollectionItem).toHaveBeenCalledTimes(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(OUTBOX_RETRY_DELAYS_MS[0] + 50);
    });

    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(createCollectionItem).toHaveBeenCalledTimes(2);
  });

  it('does not send an add that waited longer than its request identity can be replayed', async () => {
    const old = enqueueAdd(emptyOutbox(), {
      opId: 'op-old',
      idempotencyKey: 'key-old',
      localId: 'local-old',
      title: 'Alt',
      quantity: null,
      completed: false,
      now: new Date(Date.now() - OUTBOX_ADD_MAX_AGE_MS - 60_000),
    });
    await writeCollectionOutbox('anna', 'space-1', 'list-1', old);
    online = true;
    onlineManager.setOnline(true);

    const { result } = await mount();

    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(createCollectionItem).not.toHaveBeenCalled();
    expect(result.current.notices).toEqual([
      expect.objectContaining({
        kind: 'addDropped',
        reason: 'expired',
        title: 'Alt',
      }),
    ]);
  });

  it('says so when the device refuses to keep the changes for later', async () => {
    storage.failWrites = true;
    const { result } = await mount();

    await act(async () => {
      await result.current.addItem({ title: 'Brot' });
    });

    expect(result.current.storageFailed).toBe(true);
    expect(result.current.pendingCount).toBe(1);
  });

  it('keeps a change another tab stored in the meantime', async () => {
    const { result } = await mount();
    const other = enqueueAdd(emptyOutbox(), {
      opId: 'op-other',
      idempotencyKey: 'key-other',
      localId: 'local-other',
      title: 'From the other tab',
      quantity: null,
      completed: false,
      now: new Date(),
    });
    await writeCollectionOutbox('anna', 'space-1', 'list-1', other);

    await act(async () => {
      await result.current.addItem({ title: 'Here' });
    });

    const stored = parseOutbox(
      await readCollectionOutbox('anna', 'space-1', 'list-1'),
    );
    expect(stored.ops.map((op) => (op.kind === 'add' ? op.title : ''))).toEqual(
      ['From the other tab', 'Here'],
    );
  });

  it('does nothing for a list that does not queue its changes', async () => {
    const { result } = await mount({ enabled: false });

    expect(result.current.active).toBe(false);
    expect(result.current.pendingCount).toBe(0);
    expect(await readCollectionOutbox('anna', 'space-1', 'list-1')).toBeNull();
  });

  it('reports a list that was deleted meanwhile and drops what was waiting', async () => {
    createCollectionItem.mockRejectedValue(
      new ClientProblemError('notFound', 404),
    );
    const { result } = await mount();
    await act(async () => {
      await result.current.addItem({ title: 'Brot' });
    });

    setOnline(true);

    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(result.current.notices).toEqual([
      expect.objectContaining({ kind: 'collectionGone' }),
    ]);
  });
});
