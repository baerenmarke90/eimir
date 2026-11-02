// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureDurableMediaEpoch,
  clearDurableMediaStore,
  readDurableMedia,
  writeDurableMedia,
  evictDurableMedia,
  DURABLE_MEDIA_MAX_AGE_MS,
  DURABLE_MEDIA_MAX_ENTRIES,
} from './durableMediaStore';

const image = (parts: BlobPart[]) => new Blob(parts, { type: 'image/jpeg' });

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
  it('reuses bytes through a fresh module instance without a network loader', async () => {
    const epoch = captureDurableMediaEpoch()!;
    await writeDurableMedia(
      'origin/account/space/photo',
      epoch,
      image(['photo']),
      () => true,
    );
    vi.resetModules();
    const restored = await import('./durableMediaStore');
    expect(
      (await restored.readDurableMedia('origin/account/space/photo', epoch))
        ?.size,
    ).toBe(5);
    expect(
      await restored.readDurableMedia('other-account/photo', epoch),
    ).toBeUndefined();
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
  it('evicts least recently used entries at the count limit', async () => {
    const epoch = captureDurableMediaEpoch()!;
    for (let index = 0; index < DURABLE_MEDIA_MAX_ENTRIES; index++) {
      await writeDurableMedia(
        `photo-${index}`,
        epoch,
        image(['x']),
        () => true,
      );
    }
    await readDurableMedia('photo-0', epoch);
    await writeDurableMedia('new-photo', epoch, image(['y']), () => true);
    expect(await readDurableMedia('photo-1', epoch)).toBeUndefined();
    expect((await readDurableMedia('photo-0', epoch))?.size).toBe(1);
    expect((await readDurableMedia('new-photo', epoch))?.size).toBe(1);
  });
  it('expires saved bytes without extending retention on reads', async () => {
    const epoch = captureDurableMediaEpoch()!;
    await writeDurableMedia('photo', epoch, image(['old']), () => true);
    vi.spyOn(Date, 'now').mockReturnValue(
      Date.now() + DURABLE_MEDIA_MAX_AGE_MS + 1,
    );
    expect(await readDurableMedia('photo', epoch)).toBeUndefined();
    vi.restoreAllMocks();
  });
});
