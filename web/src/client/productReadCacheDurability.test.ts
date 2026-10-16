import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientProblemError } from './problemDetails';
import {
  __PRODUCT_READ_CACHE_CONTEXT_STORAGE_KEY_FOR_TESTS,
  __resetProductReadCacheStateForTests,
  __setProductReadCacheStorageForTests,
  __waitForProductReadCacheMutationsForTests,
  clearProductReadCache,
  clearProductReadCacheInBackground,
  loadProductWithReadCache,
  type ProductReadCacheStorage,
} from './productReadCache';

/** Browser storage whose three operations fail independently.
 *
 * They are separate switches because the interesting states are the asymmetric
 * ones: a store that answers reads but refuses to remove is what leaves a
 * pointer to invalidated data behind.
 */
class FallibleLocalStorage implements Storage {
  private readonly values = new Map<string, string>();
  failReads = false;
  failRemoves = false;
  failWrites = false;

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    if (this.failReads) throw new Error('marker read failed');
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
    if (this.failWrites) throw new Error('marker write failed');
    this.values.set(key, value);
  }

  /** What a following start would find on disk, bypassing the failure switches. */
  peek(key: string): string | null {
    return this.values.get(key) ?? null;
  }
}

class FalliblePersistentStore implements ProductReadCacheStorage {
  readonly records = new Map<string, unknown>();
  failClear = false;
  failDestroy = false;
  destroyCalls = 0;

  async read(key: string): Promise<unknown> {
    return this.records.get(key) ?? null;
  }

  async write(record: unknown): Promise<void> {
    this.records.set((record as { key: string }).key, record);
  }

  async remove(key: string): Promise<void> {
    this.records.delete(key);
  }

  async clear(): Promise<void> {
    if (this.failClear) throw new Error('clear failed');
    this.records.clear();
  }

  async destroy(): Promise<void> {
    this.destroyCalls += 1;
    if (this.failDestroy) throw new Error('destroy failed');
    this.records.clear();
  }
}

type RejectionListener = (reason: unknown) => void;

interface RejectionObservableRuntime {
  on(event: 'unhandledRejection', listener: RejectionListener): void;
  off(event: 'unhandledRejection', listener: RejectionListener): void;
}

/** The test runner's process, typed locally so the Web project keeps its
 * browser-only type surface.
 */
function nodeRuntime(): RejectionObservableRuntime | undefined {
  return (globalThis as { process?: RejectionObservableRuntime }).process;
}

function nextMacrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

type Payload = { id: string; label: string };

const ACCOUNT = 'account-a';
const SPACE = 'space-a';
const RESOURCE = 'shared-memory';

describe('durable fail-closed behavior when persistent cache clearing fails', () => {
  let storage: FalliblePersistentStore;
  let browserStorage: FallibleLocalStorage;

  function read(load: () => Promise<Payload>) {
    return loadProductWithReadCache<Payload>({
      accountId: ACCOUNT,
      spaceId: SPACE,
      kind: 'memory',
      resourceId: RESOURCE,
      load,
      serialize: (value) => value,
      deserialize: (payload) => payload as Payload,
    });
  }

  function readOffline() {
    return read(async () => {
      throw new ClientProblemError('offline');
    });
  }

  function storedLabels(): string[] {
    return Array.from(storage.records.values()).map(
      (record) => (record as { payload: Payload }).payload.label,
    );
  }

  async function seedCachedRow(): Promise<void> {
    await read(async () => ({ id: RESOURCE, label: 'shared before the wipe' }));
    expect(storage.records.size).toBe(1);
  }

  /** Restart the runtime against the very same browser storage.
   *
   * Only module state is discarded, which is exactly what a reload does: the
   * in-memory invalidation set is what stops being available, while everything
   * on disk survives unchanged.
   */
  function restartRuntime(): void {
    __resetProductReadCacheStateForTests();
    __setProductReadCacheStorageForTests(storage);
  }

  async function expectNoOfflineCacheHit(): Promise<void> {
    await expect(readOffline()).rejects.toMatchObject({ kind: 'offline' });
  }

  beforeEach(() => {
    __resetProductReadCacheStateForTests();
    storage = new FalliblePersistentStore();
    browserStorage = new FallibleLocalStorage();
    __setProductReadCacheStorageForTests(storage);
    vi.stubGlobal('localStorage', browserStorage);
  });

  afterEach(async () => {
    await __waitForProductReadCacheMutationsForTests().catch(() => undefined);
    __resetProductReadCacheStateForTests();
    vi.unstubAllGlobals();
  });

  it('keeps an invalidated generation unreadable after a restart when the marker cannot be removed', async () => {
    await seedCachedRow();

    browserStorage.failRemoves = true;
    storage.failClear = true;
    storage.failDestroy = true;
    await expect(clearProductReadCache()).rejects.toThrow('clear failed');
    expect(storage.records.size).toBe(1);

    restartRuntime();
    browserStorage.failRemoves = false;
    storage.failClear = false;
    storage.failDestroy = false;

    await expectNoOfflineCacheHit();
  });

  it('keeps an invalidated generation unreadable after a restart when the store cannot be cleared', async () => {
    await seedCachedRow();

    storage.failClear = true;
    storage.failDestroy = true;
    await expect(clearProductReadCache()).rejects.toThrow('clear failed');
    expect(storage.records.size).toBe(1);

    restartRuntime();
    storage.failClear = false;
    storage.failDestroy = false;

    await expectNoOfflineCacheHit();
  });

  it('settles the rows a failed wipe left behind once the store works again', async () => {
    await seedCachedRow();

    storage.failClear = true;
    storage.failDestroy = true;
    await expect(clearProductReadCache()).rejects.toThrow('clear failed');
    // Unreachable, but not yet deleted: a wipe that rejects owes a deletion
    // rather than having done one.
    expect(storage.records.size).toBe(1);

    storage.failClear = false;
    storage.failDestroy = false;
    await read(async () => ({ id: RESOURCE, label: 'after recovery' }));
    await __waitForProductReadCacheMutationsForTests();

    expect(storedLabels()).toEqual(['after recovery']);
  });

  it('keeps an invalidated generation unreadable after a restart when marker removal and store clearing both fail', async () => {
    await seedCachedRow();
    const survivingRow = Array.from(storage.records.values())[0];

    browserStorage.failRemoves = true;
    storage.failClear = true;
    storage.failDestroy = true;
    await expect(clearProductReadCache()).rejects.toThrow('clear failed');

    // Neither effect landed: the row and a marker are both still on disk.
    expect(storage.records.size).toBe(1);
    expect(
      browserStorage.peek(__PRODUCT_READ_CACHE_CONTEXT_STORAGE_KEY_FOR_TESTS),
    ).not.toBeNull();

    restartRuntime();
    browserStorage.failRemoves = false;
    storage.failClear = false;
    storage.failDestroy = false;

    // The row physically survived, so this proves the pointer to it is dead
    // rather than the data being gone.
    expect(Array.from(storage.records.values())).toContain(survivingRow);
    await expectNoOfflineCacheHit();
  });

  it('drops the whole store when clearing fails and no marker mutation is possible', async () => {
    await seedCachedRow();

    browserStorage.failRemoves = true;
    browserStorage.failWrites = true;
    storage.failClear = true;
    await clearProductReadCache();

    expect(storage.destroyCalls).toBe(1);
    expect(storage.records.size).toBe(0);

    restartRuntime();
    await expectNoOfflineCacheHit();
  });

  it('reports a wipe that could not be recorded at all and stays fail closed in this runtime', async () => {
    // The acknowledged residual: browser storage answers reads but accepts no
    // mutation, and the store refuses both clearing and being dropped. Nothing
    // durable can be written, so this runtime is the only thing keeping the
    // generation unreachable, and the caller is told the wipe failed.
    await seedCachedRow();

    browserStorage.failRemoves = true;
    browserStorage.failWrites = true;
    storage.failClear = true;
    storage.failDestroy = true;

    await expect(clearProductReadCache()).rejects.toThrow('clear failed');
    expect(storage.records.size).toBe(1);
    await expectNoOfflineCacheHit();
  });

  it('does not adopt a persisted marker that could not be read while invalidating', async () => {
    await seedCachedRow();

    // A restart before the wipe: the disk still holds the marker and the row,
    // while nothing in memory knows which generation that is.
    restartRuntime();

    browserStorage.failReads = true;
    browserStorage.failRemoves = true;
    browserStorage.failWrites = true;
    storage.failClear = true;
    storage.failDestroy = true;
    await expect(clearProductReadCache()).rejects.toThrow('clear failed');

    // Browser storage recovers inside the same runtime.
    browserStorage.failReads = false;
    browserStorage.failRemoves = false;
    browserStorage.failWrites = false;
    storage.failClear = false;
    storage.failDestroy = false;

    await expectNoOfflineCacheHit();
  });

  it('recovers into a usable cache after a failed wipe without reviving invalidated rows', async () => {
    await seedCachedRow();
    const invalidatedRow = Array.from(storage.records.values())[0];

    browserStorage.failRemoves = true;
    storage.failClear = true;
    storage.failDestroy = true;
    await expect(clearProductReadCache()).rejects.toThrow('clear failed');

    restartRuntime();
    browserStorage.failRemoves = false;
    storage.failClear = false;
    storage.failDestroy = false;

    // The next generation is established normally and clears the debt left by
    // the failed wipe.
    const refreshed = await read(async () => ({
      id: RESOURCE,
      label: 'after recovery',
    }));
    expect(refreshed.source).toBe('network');
    await __waitForProductReadCacheMutationsForTests();
    expect(Array.from(storage.records.values())).not.toContain(invalidatedRow);

    // Caching works again, and only for the new generation.
    const offline = await readOffline();
    expect(offline).toMatchObject({
      source: 'cache',
      value: { id: RESOURCE, label: 'after recovery' },
    });
  });

  it('leaves nothing readable after an ordinary successful wipe and restart', async () => {
    await seedCachedRow();

    await clearProductReadCache();
    expect(storage.records.size).toBe(0);
    expect(
      browserStorage.peek(__PRODUCT_READ_CACHE_CONTEXT_STORAGE_KEY_FOR_TESTS),
    ).toBeNull();

    restartRuntime();
    await expectNoOfflineCacheHit();
  });

  it('starts a lifecycle wipe without leaving an unhandled rejection behind', async () => {
    // Guards the property, not one mechanism. Two things currently provide it:
    // the mutation queue keeps a settled handler on every operation it hands
    // out, and the background entry point observes the result itself. The
    // second half of this test is what fails without the durable invalidation.
    await seedCachedRow();
    const unhandled = vi.fn();
    const runtime = nodeRuntime();
    runtime?.on('unhandledRejection', unhandled);

    try {
      browserStorage.failRemoves = true;
      storage.failClear = true;
      storage.failDestroy = true;
      clearProductReadCacheInBackground();

      await __waitForProductReadCacheMutationsForTests().catch(() => undefined);
      // Two macrotask turns: one for the wipe to reject, one for an unhandled
      // rejection to have been reported if nothing observed it.
      await nextMacrotask();
      await nextMacrotask();

      expect(runtime).toBeDefined();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      runtime?.off('unhandledRejection', unhandled);
    }

    // The failure is not silently treated as a completed wipe: the generation
    // stays unreachable across the restart that follows such a lifecycle.
    restartRuntime();
    browserStorage.failRemoves = false;
    storage.failClear = false;
    storage.failDestroy = false;
    await expectNoOfflineCacheHit();
  });

  it('keeps an awaited wipe honest about surviving rows', async () => {
    await seedCachedRow();

    storage.failClear = true;
    storage.failDestroy = true;
    await expect(clearProductReadCache()).rejects.toThrow('clear failed');
    expect(storage.records.size).toBe(1);
  });
});
