import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientProblemError } from './problemDetails';
import {
  __PRODUCT_READ_CACHE_CONTEXT_STORAGE_KEY_FOR_TESTS,
  __resetProductReadCacheStateForTests,
  __setProductReadCacheStorageForTests,
  __waitForProductReadCacheMutationsForTests,
  PRODUCT_READ_CACHE_MAX_AGE_MS,
  canPersistProductReadPayload,
  clearProductReadCache,
  captureSharedListCacheWrite,
  deleteProductReadCacheKind,
  isFreshProductCacheTimestamp,
  loadProductWithReadCache,
  mayUseOfflineProductCache,
  saveProductReadCacheEntry,
  revokeSharedListCache,
  type ProductReadCacheStorage,
} from './productReadCache';

class MemoryLocalStorage implements Storage {
  private readonly values = new Map<string, string>();
  failNextSet = false;
  failRemoves = false;

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
    if (this.failRemoves) throw new Error('marker remove failed');
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.failNextSet) {
      this.failNextSet = false;
      throw new Error('marker write failed');
    }
    this.values.set(key, value);
  }
}

class MemoryProductReadCacheStorage implements ProductReadCacheStorage {
  readonly records = new Map<string, unknown>();
  failNextClear = false;
  failNextRemove = false;

  async read(key: string): Promise<unknown> {
    return this.records.get(key) ?? null;
  }

  async write(record: unknown): Promise<void> {
    const key = (record as { key?: unknown }).key;
    if (typeof key !== 'string') throw new Error('Cache record has no key');
    this.records.set(key, record);
  }

  async remove(key: string): Promise<void> {
    if (this.failNextRemove) {
      this.failNextRemove = false;
      throw new Error('remove failed');
    }
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
    if (this.failNextClear) {
      this.failNextClear = false;
      throw new Error('clear failed');
    }
    this.records.clear();
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

type MemoryPayload = { id: string; label: string };

function loadMemory(
  accountId: string,
  spaceId: string,
  resourceId: string,
  load: () => Promise<MemoryPayload>,
) {
  return loadProductWithReadCache<MemoryPayload>({
    accountId,
    spaceId,
    kind: 'memory',
    resourceId,
    load,
    serialize: (value) => value,
    deserialize: (payload) => payload as MemoryPayload,
  });
}

function contextMarker(): {
  accountId: string;
  spaceId: string;
  generation: string;
} | null {
  const raw = localStorage.getItem(
    __PRODUCT_READ_CACHE_CONTEXT_STORAGE_KEY_FOR_TESTS,
  );
  return raw ? JSON.parse(raw) : null;
}

function storedRecords(storage: MemoryProductReadCacheStorage) {
  return Array.from(storage.records.values()) as Array<{
    schemaVersion: number;
    accountId: string;
    spaceId: string;
    generation: string;
    privacyScope: string;
    kind: string;
    resourceId: string;
    payload: unknown;
  }>;
}

describe('M5 Web S6 persistent read cache policy', () => {
  let storage: MemoryProductReadCacheStorage;
  let browserStorage: MemoryLocalStorage;

  beforeEach(() => {
    __resetProductReadCacheStateForTests();
    storage = new MemoryProductReadCacheStorage();
    browserStorage = new MemoryLocalStorage();
    __setProductReadCacheStorageForTests(storage);
    vi.stubGlobal('localStorage', browserStorage);
  });

  afterEach(async () => {
    await __waitForProductReadCacheMutationsForTests();
    __resetProductReadCacheStateForTests();
    vi.unstubAllGlobals();
  });

  it('revokes derived diary snapshots without removing unrelated detail reads', async () => {
    await loadMemory('account-a', 'space-a', 'memory-1', async () => ({
      id: 'memory-1',
      label: 'Retained source',
    }));
    const options = {
      accountId: 'account-a',
      spaceId: 'space-a',
      kind: 'story' as const,
      resourceId: 'diary-v2:ALL:ALL:DESC',
      serialize: (value: unknown) => value,
      deserialize: (value: unknown) => value,
    };
    await loadProductWithReadCache({
      ...options,
      load: async () => ({ chapterMarkers: [{ id: 'removed-chapter' }] }),
    });
    await deleteProductReadCacheKind('account-a', 'space-a', 'story');
    await expect(
      loadProductWithReadCache({
        ...options,
        load: async () => {
          throw new ClientProblemError('offline');
        },
      }),
    ).rejects.toMatchObject({ kind: 'offline' });
    const memory = await loadMemory(
      'account-a',
      'space-a',
      'memory-1',
      async () => {
        throw new ClientProblemError('offline');
      },
    );
    expect(memory.value.label).toBe('Retained source');
  });

  it('does not repersist a collection read that started before its group was revoked', async () => {
    const pending = deferred<{ id: string }>();
    const load = loadProductWithReadCache({
      accountId: 'account-a',
      spaceId: 'space-a',
      kind: 'story',
      resourceId: 'diary-v2:ALL:ALL:DESC',
      load: () => pending.promise,
      serialize: (value) => value,
      deserialize: (value) => value as { id: string },
    });
    await deleteProductReadCacheKind('account-a', 'space-a', 'story');
    pending.resolve({ id: 'stale-chapter' });
    await load;
    expect(
      storedRecords(storage).filter((record) => record.kind === 'story'),
    ).toEqual([]);
  });

  it('revokes loaded lists and diary markers through the same scoped storage contract', async () => {
    await loadMemory('account-a', 'space-a', 'memory-1', async () => ({
      id: 'memory-1',
      label: 'Retained source',
    }));
    for (const kind of ['story', 'shared-list'] as const) {
      await saveProductReadCacheEntry({
        accountId: 'account-a',
        spaceId: 'space-a',
        kind,
        resourceId: 'chapters',
        value: {
          pages: [{ items: [{ id: 'old-chapter' }] }],
          pageParams: [null],
        },
        serialize: (value) => value,
      });
    }
    const remove = vi.spyOn(storage, 'removeKind');
    const listLease = captureSharedListCacheWrite('account-a', 'space-a');
    expect(listLease()).toBe(true);
    const diary = deferred<{ id: string }>();
    const pending = loadProductWithReadCache({
      accountId: 'account-a',
      spaceId: 'space-a',
      kind: 'story',
      resourceId: 'late-diary',
      load: () => diary.promise,
      serialize: (value) => value,
      deserialize: (value) => value as { id: string },
    });

    revokeSharedListCache('space-a');
    await deleteProductReadCacheKind('account-a', 'space-a', 'story');
    diary.resolve({ id: 'old-chapter' });
    await pending;
    await __waitForProductReadCacheMutationsForTests();

    expect(remove.mock.calls).toEqual([
      ['account-a', 'space-a', 'shared-list'],
      ['account-a', 'space-a', 'story'],
    ]);
    expect(listLease()).toBe(false);
    expect(storedRecords(storage).map((record) => record.kind)).toEqual([
      'memory',
    ]);
  });

  it('allows cache fallback only for transport and server availability failures', () => {
    expect(mayUseOfflineProductCache(new ClientProblemError('offline'))).toBe(
      true,
    );
    expect(
      mayUseOfflineProductCache(new ClientProblemError('server', 503)),
    ).toBe(true);
    expect(
      mayUseOfflineProductCache(new ClientProblemError('permission', 403)),
    ).toBe(false);
    expect(
      mayUseOfflineProductCache(new ClientProblemError('notFound', 404)),
    ).toBe(false);
    expect(
      mayUseOfflineProductCache(new ClientProblemError('unauthorized', 401)),
    ).toBe(false);
    expect(
      mayUseOfflineProductCache(new ClientProblemError('conflict', 409)),
    ).toBe(false);
  });

  it('enforces the hard seven-day maximum age before a cache hit', () => {
    const now = Date.parse('2026-08-31T12:00:00.000Z');
    expect(
      isFreshProductCacheTimestamp(
        new Date(now - PRODUCT_READ_CACHE_MAX_AGE_MS).toISOString(),
        now,
      ),
    ).toBe(true);
    expect(
      isFreshProductCacheTimestamp(
        new Date(now - PRODUCT_READ_CACHE_MAX_AGE_MS - 1).toISOString(),
        now,
      ),
    ).toBe(false);
    expect(
      isFreshProductCacheTimestamp(new Date(now + 1).toISOString(), now),
    ).toBe(false);
    expect(isFreshProductCacheTimestamp('not-a-date', now)).toBe(false);
  });

  it('never persists private HeartMoment payloads in the Web cache', () => {
    expect(
      canPersistProductReadPayload('heartMoment', { visibility: 'SHARED' }),
    ).toBe(true);
    expect(
      canPersistProductReadPayload('heartMoment', { visibility: 'PRIVATE' }),
    ).toBe(false);
    expect(canPersistProductReadPayload('heartMoment', {})).toBe(false);
    expect(
      canPersistProductReadPayload('memory', { visibility: 'PRIVATE' }),
    ).toBe(true);
  });

  it('drops a Space A write that resolves after the cache switched to Space B', async () => {
    const spaceA = deferred<MemoryPayload>();
    const spaceB = deferred<MemoryPayload>();

    const readA = loadMemory(
      'account-1',
      'space-a',
      'memory-a',
      () => spaceA.promise,
    );
    const readB = loadMemory(
      'account-1',
      'space-b',
      'memory-b',
      () => spaceB.promise,
    );

    await __waitForProductReadCacheMutationsForTests();
    expect(storage.records.size).toBe(0);

    spaceA.resolve({ id: 'memory-a', label: 'from A' });
    await readA;

    expect(storedRecords(storage)).toEqual([]);
    expect(contextMarker()).toMatchObject({
      accountId: 'account-1',
      spaceId: 'space-b',
    });

    spaceB.resolve({ id: 'memory-b', label: 'from B' });
    await readB;
    expect(storedRecords(storage)).toMatchObject([
      {
        accountId: 'account-1',
        spaceId: 'space-b',
        privacyScope: 'SPACE_SHARED',
      },
    ]);

    await expect(
      loadMemory('account-1', 'space-a', 'memory-a', async () => {
        throw new ClientProblemError('offline');
      }),
    ).rejects.toMatchObject({ kind: 'offline' });
    await __waitForProductReadCacheMutationsForTests();
    expect(
      storedRecords(storage).some((record) => record.spaceId === 'space-a'),
    ).toBe(false);
  });

  it('keeps a logout or Account transition from being repopulated by an old read', async () => {
    const accountA = deferred<MemoryPayload>();
    const readA = loadMemory(
      'account-a',
      'space-a',
      'memory-a',
      () => accountA.promise,
    );

    const clear = clearProductReadCache();
    expect(contextMarker()).toBeNull();
    await clear;
    expect(storage.records.size).toBe(0);

    accountA.resolve({ id: 'memory-a', label: 'old account' });
    await readA;
    expect(storage.records.size).toBe(0);
    expect(contextMarker()).toBeNull();

    await loadMemory('account-b', 'space-b', 'memory-b', async () => ({
      id: 'memory-b',
      label: 'new account',
    }));
    expect(storedRecords(storage)).toMatchObject([
      { accountId: 'account-b', spaceId: 'space-b' },
    ]);
  });

  it('serializes concurrent A/B reads so the old request cannot restore the A marker', async () => {
    const spaceA = deferred<MemoryPayload>();
    const spaceB = deferred<MemoryPayload>();

    const readA = loadMemory(
      'account-1',
      'space-a',
      'memory-a',
      () => spaceA.promise,
    );
    const readB = loadMemory(
      'account-1',
      'space-b',
      'memory-b',
      () => spaceB.promise,
    );
    await __waitForProductReadCacheMutationsForTests();

    spaceB.resolve({ id: 'memory-b', label: 'new context' });
    await readB;
    spaceA.resolve({ id: 'memory-a', label: 'stale context' });
    await readA;

    expect(storedRecords(storage)).toMatchObject([
      { accountId: 'account-1', spaceId: 'space-b' },
    ]);
    expect(contextMarker()).toMatchObject({
      accountId: 'account-1',
      spaceId: 'space-b',
    });
  });

  it('makes explicit clear atomic against every operation that started before it', async () => {
    await loadMemory('account-1', 'space-a', 'seed', async () => ({
      id: 'seed',
      label: 'seed',
    }));
    expect(storage.records.size).toBe(1);

    const pending = deferred<MemoryPayload>();
    const oldRead = loadMemory(
      'account-1',
      'space-a',
      'pending',
      () => pending.promise,
    );

    const clear = clearProductReadCache();
    expect(contextMarker()).toBeNull();
    await clear;
    expect(storage.records.size).toBe(0);

    pending.resolve({ id: 'pending', label: 'late result' });
    await oldRead;
    expect(storage.records.size).toBe(0);
    expect(contextMarker()).toBeNull();
  });

  it('fails a broken physical clear while keeping the invalidated generation unreachable', async () => {
    await loadMemory('account-a', 'space-a', 'seed', async () => ({
      id: 'seed',
      label: 'seed',
    }));
    const oldGeneration = contextMarker()?.generation;
    expect(oldGeneration).toBeTruthy();

    const pending = deferred<MemoryPayload>();
    const oldRead = loadMemory(
      'account-a',
      'space-a',
      'late',
      () => pending.promise,
    );

    storage.failNextClear = true;
    const clear = clearProductReadCache();
    expect(contextMarker()).toBeNull();
    await expect(clear).rejects.toThrow('clear failed');
    expect(storage.records.size).toBe(1);

    pending.resolve({ id: 'late', label: 'late' });
    await oldRead;
    expect(storage.records.size).toBe(1);

    await expect(
      loadMemory('account-a', 'space-a', 'seed', async () => {
        throw new ClientProblemError('offline');
      }),
    ).rejects.toMatchObject({ kind: 'offline' });
    expect(contextMarker()?.generation).not.toBe(oldGeneration);
  });

  it('does not revive an invalidated generation when marker removal fails', async () => {
    await loadMemory('account-a', 'space-a', 'seed', async () => ({
      id: 'seed',
      label: 'seed',
    }));
    const oldGeneration = contextMarker()?.generation;
    expect(oldGeneration).toBeTruthy();

    const pending = deferred<MemoryPayload>();
    const oldRead = loadMemory(
      'account-a',
      'space-a',
      'late',
      () => pending.promise,
    );

    browserStorage.failRemoves = true;
    await clearProductReadCache();
    // A marker that resists removal is overwritten instead, so it can no
    // longer name the invalidated generation to a later start.
    expect(contextMarker()?.generation).toBeUndefined();
    expect(storage.records.size).toBe(0);

    pending.resolve({ id: 'late', label: 'late' });
    await oldRead;
    expect(storage.records.size).toBe(0);

    await loadMemory('account-a', 'space-a', 'fresh', async () => ({
      id: 'fresh',
      label: 'fresh',
    }));
    const freshMarker = contextMarker();
    expect(freshMarker?.generation).not.toBe(oldGeneration);
    expect(storedRecords(storage)).toMatchObject([
      {
        accountId: 'account-a',
        spaceId: 'space-a',
        generation: freshMarker?.generation,
      },
    ]);
  });

  it('fails closed when a context switch cannot persist its new marker', async () => {
    await loadMemory('account-1', 'space-a', 'seed', async () => ({
      id: 'seed',
      label: 'seed',
    }));
    const oldGeneration = contextMarker()?.generation;
    expect(oldGeneration).toBeTruthy();

    const spaceA = deferred<MemoryPayload>();
    const spaceB = deferred<MemoryPayload>();
    const readA = loadMemory(
      'account-1',
      'space-a',
      'late-a',
      () => spaceA.promise,
    );

    browserStorage.failNextSet = true;
    const readB = loadMemory(
      'account-1',
      'space-b',
      'memory-b',
      () => spaceB.promise,
    );
    await __waitForProductReadCacheMutationsForTests();
    // The marker could not be claimed for Space B, so it is neutralized rather
    // than left naming the generation this switch just invalidated.
    expect(contextMarker()?.generation).not.toBe(oldGeneration);

    spaceA.resolve({ id: 'late-a', label: 'stale A' });
    spaceB.resolve({ id: 'memory-b', label: 'B without marker' });
    await Promise.all([readA, readB]);
    expect(storage.records.size).toBe(0);

    await loadMemory('account-1', 'space-b', 'fresh-b', async () => ({
      id: 'fresh-b',
      label: 'fresh B',
    }));
    expect(contextMarker()).toMatchObject({
      accountId: 'account-1',
      spaceId: 'space-b',
    });
    expect(contextMarker()?.generation).not.toBe(oldGeneration);
    expect(storedRecords(storage)).toMatchObject([
      { accountId: 'account-1', spaceId: 'space-b' },
    ]);
  });

  it('rejects malformed rows and removes them instead of using them offline', async () => {
    await loadMemory('account-1', 'space-a', 'memory-a', async () => ({
      id: 'memory-a',
      label: 'valid',
    }));

    const [key, record] = Array.from(storage.records.entries())[0];
    storage.records.set(key, { ...(record as object), schemaVersion: 2 });

    await expect(
      loadMemory('account-1', 'space-a', 'memory-a', async () => {
        throw new ClientProblemError('offline');
      }),
    ).rejects.toMatchObject({ kind: 'offline' });
    expect(storage.records.size).toBe(0);
  });

  it('keeps valid offline fallback scoped to the active generation', async () => {
    await loadMemory('account-1', 'space-a', 'memory-a', async () => ({
      id: 'memory-a',
      label: 'network',
    }));

    const result = await loadMemory(
      'account-1',
      'space-a',
      'memory-a',
      async () => {
        throw new ClientProblemError('offline');
      },
    );

    expect(result).toMatchObject({
      source: 'cache',
      value: { id: 'memory-a', label: 'network' },
    });
  });

  it('makes private HeartMoment eviction strict instead of silently succeeding', async () => {
    await loadProductWithReadCache({
      accountId: 'account-1',
      spaceId: 'space-a',
      kind: 'heartMoment',
      resourceId: 'heart-1',
      load: async () => ({ id: 'heart-1', visibility: 'SHARED' }),
      serialize: (value) => value,
      deserialize: (payload) =>
        payload as { id: string; visibility: 'SHARED' | 'PRIVATE' },
    });
    expect(storage.records.size).toBe(1);

    await saveProductReadCacheEntry({
      accountId: 'account-1',
      spaceId: 'space-a',
      kind: 'heartMoment',
      resourceId: 'heart-1',
      value: { id: 'heart-1', visibility: 'PRIVATE' as const },
      serialize: (value) => value,
    });
    expect(storage.records.size).toBe(0);

    await loadProductWithReadCache({
      accountId: 'account-1',
      spaceId: 'space-a',
      kind: 'heartMoment',
      resourceId: 'heart-1',
      load: async () => ({ id: 'heart-1', visibility: 'SHARED' }),
      serialize: (value) => value,
      deserialize: (payload) =>
        payload as { id: string; visibility: 'SHARED' | 'PRIVATE' },
    });
    storage.failNextRemove = true;

    await expect(
      saveProductReadCacheEntry({
        accountId: 'account-1',
        spaceId: 'space-a',
        kind: 'heartMoment',
        resourceId: 'heart-1',
        value: { id: 'heart-1', visibility: 'PRIVATE' as const },
        serialize: (value) => value,
      }),
    ).rejects.toThrow('remove failed');
    expect(storage.records.size).toBe(1);
  });
});
