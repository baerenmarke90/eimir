import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClientProblemError } from './problemDetails';
import {
  __resetProductReadCacheStateForTests,
  __setProductReadCacheStorageForTests,
  __waitForProductReadCacheMutationsForTests,
  deleteProductReadCacheEntry,
  loadProductWithReadCache,
  type ProductReadCacheStorage,
} from './productReadCache';

/**
 * Covers issue #691: a shared HeartMoment that transitions to PRIVATE must
 * have its persisted Web snapshot evicted synchronously, independent of any
 * refetch, and that eviction must be race-safe against a read that began
 * before the transition and resolves after it.
 */

class MemoryProductReadCacheStorage implements ProductReadCacheStorage {
  readonly records = new Map<string, unknown>();

  async read(key: string): Promise<unknown> {
    return this.records.get(key) ?? null;
  }

  async write(record: unknown): Promise<void> {
    const key = (record as { key?: unknown }).key;
    if (typeof key !== 'string') throw new Error('Cache record has no key');
    this.records.set(key, record);
  }

  async remove(key: string): Promise<void> {
    this.records.delete(key);
  }

  async clear(): Promise<void> {
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

type HeartMomentPayload = { id: string; visibility: 'SHARED' | 'PRIVATE' };

const ACCOUNT = 'account-1';
const SPACE = 'space-a';
const HEART_MOMENT = 'heart-1';

function loadHeartMoment(
  load: () => Promise<HeartMomentPayload>,
): Promise<{ value: HeartMomentPayload; source: 'network' | 'cache' }> {
  return loadProductWithReadCache<HeartMomentPayload>({
    accountId: ACCOUNT,
    spaceId: SPACE,
    kind: 'heartMoment',
    resourceId: HEART_MOMENT,
    load,
    serialize: (value) => value,
    deserialize: (payload) => payload as HeartMomentPayload,
  });
}

function seedSharedSnapshot(): Promise<unknown> {
  return loadHeartMoment(async () => ({
    id: HEART_MOMENT,
    visibility: 'SHARED',
  }));
}

describe('#691 - HeartMoment visibility revocation in the Web read cache', () => {
  let storage: MemoryProductReadCacheStorage;

  beforeEach(() => {
    __resetProductReadCacheStateForTests();
    storage = new MemoryProductReadCacheStorage();
    __setProductReadCacheStorageForTests(storage);
  });

  afterEach(async () => {
    await __waitForProductReadCacheMutationsForTests();
    __resetProductReadCacheStateForTests();
  });

  it('evicts the persisted SHARED snapshot immediately once SHARED -> PRIVATE succeeds', async () => {
    await seedSharedSnapshot();
    expect(storage.records.size).toBe(1);

    await deleteProductReadCacheEntry(
      ACCOUNT,
      SPACE,
      'heartMoment',
      HEART_MOMENT,
    );

    expect(storage.records.size).toBe(0);
  });

  it('keeps the entry evicted even when every subsequent refetch fails', async () => {
    await seedSharedSnapshot();
    await deleteProductReadCacheEntry(
      ACCOUNT,
      SPACE,
      'heartMoment',
      HEART_MOMENT,
    );
    expect(storage.records.size).toBe(0);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        loadHeartMoment(async () => {
          throw new ClientProblemError('offline');
        }),
      ).rejects.toMatchObject({ kind: 'offline' });
      expect(storage.records.size).toBe(0);
    }
  });

  it('does not let an old SHARED read repersist after a PRIVATE mutation wins the race', async () => {
    const staleRead = deferred<HeartMomentPayload>();
    const readStarted = loadHeartMoment(() => staleRead.promise);

    // The mutation completes, deleting the resource, before the older read's
    // network response ever arrives.
    await deleteProductReadCacheEntry(
      ACCOUNT,
      SPACE,
      'heartMoment',
      HEART_MOMENT,
    );
    expect(storage.records.size).toBe(0);

    // The stale request now resolves with the pre-transition SHARED payload.
    staleRead.resolve({ id: HEART_MOMENT, visibility: 'SHARED' });
    const result = await readStarted;

    // The caller still gets the value it asked for...
    expect(result.value).toEqual({ id: HEART_MOMENT, visibility: 'SHARED' });
    // ...but it must never have been written back to persistent storage.
    expect(storage.records.size).toBe(0);
  });

  it.each([
    ['unauthorized' as const, 401],
    ['permission' as const, 403],
    ['notFound' as const, 404],
  ])(
    'evicts a formerly cached HeartMoment on an authoritative %s denial',
    async (kind, status) => {
      await seedSharedSnapshot();
      expect(storage.records.size).toBe(1);

      await expect(
        loadHeartMoment(async () => {
          throw new ClientProblemError(kind, status);
        }),
      ).rejects.toMatchObject({ kind });

      expect(storage.records.size).toBe(0);
    },
  );

  it('does not let a later offline fallback resurrect content evicted by an authoritative denial', async () => {
    await seedSharedSnapshot();

    await expect(
      loadHeartMoment(async () => {
        throw new ClientProblemError('permission', 403);
      }),
    ).rejects.toMatchObject({ kind: 'permission' });
    expect(storage.records.size).toBe(0);

    await expect(
      loadHeartMoment(async () => {
        throw new ClientProblemError('offline');
      }),
    ).rejects.toMatchObject({ kind: 'offline' });
    expect(storage.records.size).toBe(0);
  });

  it('only becomes cacheable again from a fresh authoritative SHARED response, never from the revoked snapshot', async () => {
    await seedSharedSnapshot();
    await deleteProductReadCacheEntry(
      ACCOUNT,
      SPACE,
      'heartMoment',
      HEART_MOMENT,
    );
    expect(storage.records.size).toBe(0);

    // Simulate the PRIVATE -> SHARED direction: nothing repopulates the cache
    // until a new, successful network response arrives.
    await expect(
      loadHeartMoment(async () => {
        throw new ClientProblemError('offline');
      }),
    ).rejects.toMatchObject({ kind: 'offline' });
    expect(storage.records.size).toBe(0);

    await loadHeartMoment(async () => ({
      id: HEART_MOMENT,
      visibility: 'SHARED',
    }));
    expect(storage.records.size).toBe(1);
  });
});
