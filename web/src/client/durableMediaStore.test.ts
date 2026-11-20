// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureDurableMediaEpoch,
  clearDurableMediaStore,
  DURABLE_MEDIA_MAX_ENTRIES,
  evictDurableMedia,
  readDurableMedia,
  writeDurableMedia,
} from './durableMediaStore';

const image = (parts: BlobPart[]) => new Blob(parts, { type: 'image/jpeg' });

function withMetadata<T>(
  run: (store: IDBObjectStore, done: (value: T) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('eimir-authorized-media-v1', 3);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('metadata', 'readwrite');
      let value: T;
      run(tx.objectStore('metadata'), (next) => {
        value = next;
      });
      tx.oncomplete = () => {
        db.close();
        resolve(value);
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}
const seedMetadataRows = (rows: object[]) =>
  withMetadata<void>((store, done) => {
    for (const row of rows) store.put(row);
    done();
  });
const countMetadataRows = () =>
  withMetadata<number>((store, done) => {
    const request = store.count();
    request.onsuccess = () => done(request.result);
  });
const hasMetadataRow = (key: string) =>
  withMetadata<boolean>((store, done) => {
    const request = store.get(key);
    request.onsuccess = () => done(request.result !== undefined);
  });

beforeEach(() => {
  vi.useRealTimers();
  vi.stubGlobal('Blob', NodeBlob);
  clearDurableMediaStore();
});
describe('App-owned media persistence', () => {
  it('evicts using metadata without reading every cached image payload', async () => {
    const epoch = captureDurableMediaEpoch()!;
    const scan = vi.spyOn(IDBObjectStore.prototype, 'getAll');
    await writeDurableMedia('first', epoch, image(['one']), () => true);
    await writeDurableMedia('second', epoch, image(['two']), () => true);
    expect((await readDurableMedia('first', epoch))?.size).toBe(3);
    await writeDurableMedia('barrier', epoch, image(['x']), () => true);
    expect((await readDurableMedia('second', epoch))?.size).toBe(3);
    expect(
      scan.mock.contexts.every(
        (store) => store instanceof IDBObjectStore && store.name === 'metadata',
      ),
    ).toBe(true);
    scan.mockRestore();
  });
  it('does not persist videos, read grants or untyped payloads in the image store', async () => {
    const epoch = captureDurableMediaEpoch()!;
    for (const type of ['video/mp4', 'application/json', '']) {
      await writeDurableMedia(
        type,
        epoch,
        new Blob(['bytes'], { type }),
        () => true,
      );
      expect(await readDurableMedia(type, epoch)).toBeUndefined();
    }
  });
  it('reuses authorized image bytes on day eight, scoped to the original account', async () => {
    const epoch = captureDurableMediaEpoch()!;
    await writeDurableMedia(
      'origin/account/space/photo',
      epoch,
      image(['photo']),
      () => true,
    );
    const clock = vi
      .spyOn(Date, 'now')
      .mockReturnValue(Date.now() + 8 * 86_400_000);
    vi.resetModules();
    const restored = await import('./durableMediaStore');
    expect(
      (await restored.readDurableMedia('origin/account/space/photo', epoch))
        ?.size,
    ).toBe(5);
    expect(
      await restored.readDurableMedia('other-account/photo', epoch),
    ).toBeUndefined();
    clock.mockRestore();
  });
  it('fences queued writes and old reads at logout', async () => {
    const epoch = captureDurableMediaEpoch()!;
    const write = writeDurableMedia('photo', epoch, image(['old']), () => true);
    clearDurableMediaStore();
    await write;
    expect(await readDurableMedia('photo', epoch)).toBeUndefined();
    expect(
      await readDurableMedia('photo', captureDurableMediaEpoch()!),
    ).toBeUndefined();
  });
  it('never persists a resource revoked while its write was queued', async () => {
    const epoch = captureDurableMediaEpoch()!;
    let current = true;
    const write = writeDurableMedia(
      'photo',
      epoch,
      image(['old']),
      () => current,
    );
    current = false;
    await write;
    expect(await readDurableMedia('photo', epoch)).toBeUndefined();
  });
  it('evicts all variants under a denied parent, retaining other parents', async () => {
    const epoch = captureDurableMediaEpoch()!;
    await writeDurableMedia(
      'parent/photo/thumb',
      epoch,
      image(['a']),
      () => true,
    );
    await writeDurableMedia(
      'parent/photo/original',
      epoch,
      image(['b']),
      () => true,
    );
    await writeDurableMedia('other/photo', epoch, image(['c']), () => true);
    evictDurableMedia('parent/');
    await writeDurableMedia('barrier', epoch, image(['d']), () => true);
    expect(await readDurableMedia('parent/photo/thumb', epoch)).toBeUndefined();
    expect(
      await readDurableMedia('parent/photo/original', epoch),
    ).toBeUndefined();
    expect((await readDurableMedia('other/photo', epoch))?.size).toBe(1);
  });
  it('keeps 2000 media items without a byte cap and evicts the least recently used item', async () => {
    const epoch = captureDurableMediaEpoch()!;
    const item = (index: number, variant = 'thumbnail') =>
      JSON.stringify(['epoch', 'account', 'space', 'photo-' + index, variant]);
    // Seed one row below the limit directly; 2000 sequential writes are slow.
    await writeDurableMedia(item(0), epoch, image(['x']), () => true);
    await seedMetadataRows(
      Array.from({ length: DURABLE_MEDIA_MAX_ENTRIES - 2 }, (_, index) => ({
        key: item(index + 1),
        epoch,
        bytes: 64 * 1024 * 1024,
        savedAt: Date.now() - 60_000,
        usedAt: Date.now() - 60_000 + index,
      })),
    );
    await writeDurableMedia(
      item(0, 'original'),
      epoch,
      image(['y']),
      () => true,
    );
    // Thumbnail and original share one slot: nothing was evicted yet.
    expect((await readDurableMedia(item(0), epoch))?.size).toBe(1);
    expect(await countMetadataRows()).toBe(DURABLE_MEDIA_MAX_ENTRIES);
    // The 2000th item still fits, although the rows claim far beyond 128 MB.
    await writeDurableMedia('new-photo', epoch, image(['z']), () => true);
    expect(await hasMetadataRow(item(1))).toBe(true);
    await writeDurableMedia('newer-photo', epoch, image(['z']), () => true);
    // The 2001st item evicts the least recently used one (item 1).
    expect(await hasMetadataRow(item(1))).toBe(false);
    expect(await countMetadataRows()).toBe(DURABLE_MEDIA_MAX_ENTRIES + 1);
    expect((await readDurableMedia(item(0, 'original'), epoch))?.size).toBe(1);
    expect((await readDurableMedia('new-photo', epoch))?.size).toBe(1);
  });
  it('keeps saved bytes without an age limit until the item limit or logout', async () => {
    const epoch = captureDurableMediaEpoch()!;
    await writeDurableMedia('photo', epoch, image(['old']), () => true);
    const tenYears = 10 * 365 * 24 * 60 * 60 * 1000;
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + tenYears);
    expect((await readDurableMedia('photo', epoch))?.size).toBe(3);
    vi.restoreAllMocks();
    clearDurableMediaStore();
    expect(await readDurableMedia('photo', epoch)).toBeUndefined();
  });
});
