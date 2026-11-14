import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientProblemError } from './problemDetails';
import {
  __resetProductReadCacheStateForTests,
  __setProductReadCacheStorageForTests,
  __waitForProductReadCacheMutationsForTests,
  canPersistProductReadPayload,
  clearProductReadCache,
  deleteCollectionOutbox,
  deleteProductReadCacheKind,
  loadProductWithReadCache,
  readCollectionOutbox,
  writeCollectionOutbox,
  type ProductReadCacheStorage,
} from './productReadCache';

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
  async removeKind(
    accountId: string,
    spaceId: string,
    kind: string,
  ): Promise<void> {
    for (const [key, value] of this.records) {
      const record = value as {
        accountId: string;
        spaceId: string;
        kind: string;
      };
      if (
        record.accountId === accountId &&
        record.spaceId === spaceId &&
        record.kind === kind
      )
        this.records.delete(key);
    }
  }
  async clear(): Promise<void> {
    this.records.clear();
  }
}

const QUEUE = {
  version: 1,
  ops: [{ opId: 'op-1', kind: 'add', title: 'Milch' }],
};

describe('collection outbox storage (#1808)', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    __resetProductReadCacheStateForTests();
    storage = new MemoryStorage();
    __setProductReadCacheStorageForTests(storage);
    vi.stubGlobal('localStorage', new MemoryLocalStorage());
  });

  afterEach(async () => {
    await __waitForProductReadCacheMutationsForTests();
    __resetProductReadCacheStateForTests();
    vi.unstubAllGlobals();
  });

  it('stores and reads the waiting changes of one list', async () => {
    expect(
      await writeCollectionOutbox('account-a', 'space-a', 'list-1', QUEUE),
    ).toBe(true);

    expect(
      await readCollectionOutbox('account-a', 'space-a', 'list-1'),
    ).toEqual(QUEUE);
    expect(
      await readCollectionOutbox('account-a', 'space-a', 'list-2'),
    ).toBeNull();
  });

  it('keeps the queue of one account and space away from another', async () => {
    await writeCollectionOutbox('account-a', 'space-a', 'list-1', QUEUE);

    expect(
      await readCollectionOutbox('account-b', 'space-a', 'list-1'),
    ).toBeNull();
    expect(
      await readCollectionOutbox('account-a', 'space-b', 'list-1'),
    ).toBeNull();
  });

  it('reports a storage failure instead of pretending the changes were kept', async () => {
    storage.failWrites = true;

    expect(
      await writeCollectionOutbox('account-a', 'space-a', 'list-1', QUEUE),
    ).toBe(false);
    expect(
      await readCollectionOutbox('account-a', 'space-a', 'list-1'),
    ).toBeNull();
  });

  it('refuses a payload that is too large to store', async () => {
    const huge = { version: 1, ops: [{ title: 'x'.repeat(300 * 1024) }] };

    expect(canPersistProductReadPayload('collection-outbox', huge)).toBe(false);
    expect(
      await writeCollectionOutbox('account-a', 'space-a', 'list-1', huge),
    ).toBe(false);
  });

  it('removes the record when nothing is left to send', async () => {
    await writeCollectionOutbox('account-a', 'space-a', 'list-1', QUEUE);

    await deleteCollectionOutbox('account-a', 'space-a', 'list-1');

    expect(
      await readCollectionOutbox('account-a', 'space-a', 'list-1'),
    ).toBeNull();
  });

  it('is wiped with the cache on sign-out and cannot be reached afterwards', async () => {
    await writeCollectionOutbox('account-a', 'space-a', 'list-1', QUEUE);

    await clearProductReadCache();

    expect(storage.records.size).toBe(0);
    expect(
      await readCollectionOutbox('account-a', 'space-a', 'list-1'),
    ).toBeNull();
  });

  it('is not removed by revoking other cached kinds', async () => {
    await writeCollectionOutbox('account-a', 'space-a', 'list-1', QUEUE);

    await deleteProductReadCacheKind('account-a', 'space-a', 'shared-list');
    await deleteProductReadCacheKind('account-a', 'space-a', 'collection');

    expect(
      await readCollectionOutbox('account-a', 'space-a', 'list-1'),
    ).toEqual(QUEUE);
  });

  it('opens a list from its last saved copy when the network is gone', async () => {
    const detail = {
      id: 'list-1',
      title: 'Einkauf',
      kind: 'SHOPPING',
      items: [],
    };
    const options = {
      accountId: 'account-a',
      spaceId: 'space-a',
      kind: 'collection' as const,
      resourceId: 'list-1',
      serialize: (value: typeof detail) => value,
      deserialize: (payload: unknown) => payload as typeof detail,
    };
    await loadProductWithReadCache({ ...options, load: async () => detail });

    const offline = await loadProductWithReadCache({
      ...options,
      load: async () => {
        throw new ClientProblemError('offline');
      },
    });

    expect(offline.source).toBe('cache');
    expect(offline.value).toEqual(detail);
  });

  it('refuses to cache a collection snapshot that claims to be private', () => {
    expect(
      canPersistProductReadPayload('collection', {
        id: 'x',
        privacyClass: 'OWNER_ONLY',
      }),
    ).toBe(false);
    expect(
      canPersistProductReadPayload('collection', { id: 'x', items: [] }),
    ).toBe(true);
  });
});
