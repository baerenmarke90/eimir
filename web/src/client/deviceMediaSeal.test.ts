// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// PO decision (2026-11-16): the Android app seals every stored image, shared
// and private, under a per-login key that Android Keystore wraps.
const native = vi.hoisted(() => ({
  android: true,
  key: new Uint8Array(32).fill(7),
  reads: 0,
  clears: 0,
}));
vi.mock('./config', async (original) => ({
  ...(await original<typeof import('./config')>()),
  isAndroidApp: () => native.android,
}));
vi.mock('./nativeSessionStorage', async (original) => ({
  ...(await original<typeof import('./nativeSessionStorage')>()),
  readNativeMediaKey: async () => {
    native.reads += 1;
    return Uint8Array.from(native.key);
  },
  clearNativeMediaKey: async () => {
    native.clears += 1;
  },
}));

const {
  captureMediaCacheLease,
  clearAuthorizedMediaCache,
  loadCachedMediaBlob,
  mediaCacheScopeForOwner,
  registerMediaClient,
} = await import('./authorizedMediaCache');
const { captureDurableMediaEpoch, readDurableMedia, writeDurableMedia } =
  await import('./durableMediaStore');

type RawRow = { key: string; blob?: unknown; sealed?: { data: ArrayBuffer } };

function rawRows(): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('eimir-authorized-media-v1', 3);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const rows = db.transaction('media').objectStore('media').getAll();
      rows.onsuccess = () => {
        db.close();
        resolve(rows.result as RawRow[]);
      };
      rows.onerror = () => reject(rows.error);
    };
  });
}

const image = (text: string) =>
  new NodeBlob([text], { type: 'image/jpeg' }) as unknown as Blob;

async function written(key: string, blob: Blob): Promise<string> {
  const epoch = captureDurableMediaEpoch();
  if (!epoch) throw new Error('No media epoch');
  await writeDurableMedia(key, epoch, blob, () => true);
  return epoch;
}

beforeEach(async () => {
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('crypto', webcrypto);
  native.android = true;
  native.key = new Uint8Array(32).fill(7);
  clearAuthorizedMediaCache();
  // Let the queued native key deletion and row clearing settle first.
  await new Promise((resolve) => setTimeout(resolve, 20));
  native.reads = 0;
  native.clears = 0;
});
afterEach(() => {
  clearAuthorizedMediaCache();
  vi.unstubAllGlobals();
});

it('stores only ciphertext on Android and reads the original bytes back', async () => {
  const epoch = await written(
    '["e","a","s","photo","original"]',
    image('secret pixels'),
  );

  const [row] = await rawRows();
  expect(row.blob).toBeUndefined();
  const stored = new TextDecoder().decode(row.sealed?.data);
  expect(stored).not.toContain('secret pixels');

  const read = await readDurableMedia(
    '["e","a","s","photo","original"]',
    epoch,
  );
  expect(read?.type).toBe('image/jpeg');
  expect(await read?.text()).toBe('secret pixels');
  expect(native.reads).toBe(1);
});

it('keeps private images on Android because they are sealed', async () => {
  const client = {};
  registerMediaClient(
    client,
    mediaCacheScopeForOwner({}, 'https://api.example', () => true, 'viewer'),
  );
  const parent = ['attachment', 'HEART_MOMENT', 'private-moment'];
  await loadCachedMediaBlob(
    captureMediaCacheLease(client, 'space', parent),
    [...parent, 'private-photo', 'thumbnail'],
    async () => image('private pixels'),
    undefined,
    undefined,
    { persist: false },
  );
  await vi.waitFor(async () => {
    const rows = await rawRows();
    expect(rows.some((row) => row.key.includes('private-photo'))).toBe(true);
  });
  const rows = await rawRows();
  expect(rows.every((row) => row.sealed && row.blob === undefined)).toBe(true);
});

it('cannot read rows once the key is gone and drops them', async () => {
  const key = '["e","a","s","photo","thumbnail"]';
  const epoch = await written(key, image('before logout'));
  // A lost or replaced key: the login's rows are unreadable from now on.
  clearAuthorizedMediaCache();
  await vi.waitFor(() => expect(native.clears).toBe(1));
  native.key = new Uint8Array(32).fill(9);
  expect(await readDurableMedia(key, epoch)).toBeUndefined();
  await vi.waitFor(async () => expect(await rawRows()).toEqual([]));
});

it('drops a row sealed under an earlier key without a logout', async () => {
  const key = '["e","a","s","photo","thumbnail"]';
  const epoch = await written(key, image('old key'));
  vi.resetModules();
  native.key = new Uint8Array(32).fill(3);
  const fresh = await import('./durableMediaStore');
  expect(await fresh.readDurableMedia(key, epoch)).toBeUndefined();
  await vi.waitFor(async () => expect(await rawRows()).toEqual([]));
});

it('writes nothing on Android when the Keystore key is unavailable', async () => {
  vi.resetModules();
  vi.doMock('./nativeSessionStorage', async (original) => ({
    ...(await original<typeof import('./nativeSessionStorage')>()),
    readNativeMediaKey: async () => {
      throw new Error('Keystore unavailable');
    },
    clearNativeMediaKey: async () => undefined,
  }));
  const fresh = await import('./durableMediaStore');
  const epoch = fresh.captureDurableMediaEpoch();
  if (!epoch) throw new Error('No media epoch');
  await fresh.writeDurableMedia(
    '["e","a","s","p","t"]',
    epoch,
    image('x'),
    () => true,
  );
  expect(await rawRows()).toEqual([]);
  vi.doUnmock('./nativeSessionStorage');
});

it('keeps plaintext rows in a browser, where nothing is sealed', async () => {
  native.android = false;
  const epoch = await written(
    '["e","a","s","shared","original"]',
    image('shared'),
  );
  const [row] = await rawRows();
  expect(row.sealed).toBeUndefined();
  expect(await (await readDurableMedia(row.key, epoch))?.text()).toBe('shared');
  expect(native.reads).toBe(0);
});
