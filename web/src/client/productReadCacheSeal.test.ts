import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The Android app keeps cached text sealed under the per-login device key that
// already seals its stored images; browsers keep their rows as before.
const native = vi.hoisted(() => ({
  android: true,
  key: new Uint8Array(32).fill(7),
  failing: false,
}));
vi.mock('./config', async (original) => ({
  ...(await original<typeof import('./config')>()),
  isAndroidApp: () => native.android,
}));
vi.mock('./nativeSessionStorage', async (original) => ({
  ...(await original<typeof import('./nativeSessionStorage')>()),
  readNativeMediaKey: async () => {
    if (native.failing) throw new Error('keystore unavailable');
    return Uint8Array.from(native.key);
  },
  clearNativeMediaKey: async () => undefined,
}));

const { forgetDeviceMediaKey } = await import('./deviceMediaSeal');
const {
  __resetProductReadCacheStateForTests,
  __setProductReadCacheStorageForTests,
  __waitForProductReadCacheMutationsForTests,
  readCollectionOutbox,
  writeCollectionOutbox,
} = await import('./productReadCache');
type ProductReadCacheStorage =
  import('./productReadCache').ProductReadCacheStorage;

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

type StoredRow = Record<string, unknown> & { key: string };

class MemoryStorage implements ProductReadCacheStorage {
  readonly records = new Map<string, StoredRow>();
  async read(key: string): Promise<unknown> {
    return this.records.get(key) ?? null;
  }
  async write(record: unknown): Promise<void> {
    const row = record as StoredRow;
    this.records.set(row.key, row);
  }
  async remove(key: string): Promise<void> {
    this.records.delete(key);
  }
  async clear(): Promise<void> {
    this.records.clear();
  }
}

const QUEUE = {
  version: 1,
  ops: [{ opId: 'op-1', kind: 'add', title: 'A very private shopping item' }],
};

/** Everything a raw look at the stored rows could reveal as text. */
function visibleText(storage: MemoryStorage): string {
  return [...storage.records.values()]
    .map((row) =>
      JSON.stringify(row, (_name, value: unknown) =>
        value instanceof ArrayBuffer || ArrayBuffer.isView(value)
          ? new TextDecoder('latin1').decode(value as ArrayBuffer)
          : value,
      ),
    )
    .join('\n');
}

describe('sealed read cache rows on a sealing device', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    native.android = true;
    native.key = new Uint8Array(32).fill(7);
    native.failing = false;
    forgetDeviceMediaKey();
    __resetProductReadCacheStateForTests();
    storage = new MemoryStorage();
    __setProductReadCacheStorageForTests(storage);
    vi.stubGlobal('localStorage', new MemoryLocalStorage());
  });

  afterEach(async () => {
    await __waitForProductReadCacheMutationsForTests();
    __resetProductReadCacheStateForTests();
    forgetDeviceMediaKey();
    vi.unstubAllGlobals();
  });

  it('stores no readable content and still reads its own row back', async () => {
    expect(
      await writeCollectionOutbox('account-a', 'space-a', 'list-1', QUEUE),
    ).toBe(true);

    const [row] = [...storage.records.values()];
    expect(row).not.toHaveProperty('payload');
    expect(row).toHaveProperty('sealed');
    // Routing fields stay readable so rows can be found and purged.
    expect(row).toMatchObject({
      accountId: 'account-a',
      spaceId: 'space-a',
      kind: 'collection-outbox',
      resourceId: 'list-1',
    });
    expect(visibleText(storage)).not.toContain('private shopping item');

    expect(
      await readCollectionOutbox('account-a', 'space-a', 'list-1'),
    ).toEqual(QUEUE);
  });

  it('drops a row that was sealed under an earlier login', async () => {
    await writeCollectionOutbox('account-a', 'space-a', 'list-1', QUEUE);
    forgetDeviceMediaKey();
    native.key = new Uint8Array(32).fill(9);

    expect(
      await readCollectionOutbox('account-a', 'space-a', 'list-1'),
    ).toBeNull();
    await __waitForProductReadCacheMutationsForTests();
    expect(storage.records.size).toBe(0);
  });

  it('does not accept the sealed content of another row', async () => {
    await writeCollectionOutbox('account-a', 'space-a', 'list-1', QUEUE);
    await writeCollectionOutbox('account-a', 'space-a', 'list-2', {
      version: 1,
      ops: [],
    });
    const [first, second] = [...storage.records.values()];
    storage.records.set(second.key, { ...second, sealed: first.sealed });

    expect(
      await readCollectionOutbox('account-a', 'space-a', 'list-2'),
    ).toBeNull();
  });

  it('discards a plaintext row left from before sealing', async () => {
    native.android = false;
    await writeCollectionOutbox('account-a', 'space-a', 'list-1', QUEUE);
    expect([...storage.records.values()][0]).toHaveProperty('payload');
    native.android = true;

    expect(
      await readCollectionOutbox('account-a', 'space-a', 'list-1'),
    ).toBeNull();
    await __waitForProductReadCacheMutationsForTests();
    expect(storage.records.size).toBe(0);
  });

  it('writes nothing when the device key is unavailable', async () => {
    native.failing = true;

    expect(
      await writeCollectionOutbox('account-a', 'space-a', 'list-1', QUEUE),
    ).toBe(false);
    expect(storage.records.size).toBe(0);
  });

  it('keeps a sealed row when the key is only temporarily unavailable', async () => {
    await writeCollectionOutbox('account-a', 'space-a', 'list-1', QUEUE);
    forgetDeviceMediaKey();
    native.failing = true;

    expect(
      await readCollectionOutbox('account-a', 'space-a', 'list-1'),
    ).toBeNull();
    await __waitForProductReadCacheMutationsForTests();
    expect(storage.records.size).toBe(1);
  });

  it('leaves browser rows unsealed', async () => {
    native.android = false;

    await writeCollectionOutbox('account-a', 'space-a', 'list-1', QUEUE);

    const [row] = [...storage.records.values()];
    expect(row).toHaveProperty('payload', QUEUE);
    expect(row).not.toHaveProperty('sealed');
    expect(
      await readCollectionOutbox('account-a', 'space-a', 'list-1'),
    ).toEqual(QUEUE);
  });
});
