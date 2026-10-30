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

beforeEach(() => {
  vi.useRealTimers();
  vi.stubGlobal('Blob', NodeBlob);
  clearDurableMediaStore();
});
describe('App-owned media persistence', () => {
  it('reuses bytes through a fresh module instance without a network loader', async () => {
    const epoch = captureDurableMediaEpoch()!;
    await writeDurableMedia(
      'origin/account/space/photo',
      epoch,
      new Blob(['photo']),
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
    const write = writeDurableMedia(
      'photo',
      epoch,
      new Blob(['old']),
      () => true,
    );
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
      new Blob(['old']),
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
      new Blob(['a']),
      () => true,
    );
    await writeDurableMedia(
      'parent/photo/original',
      epoch,
      new Blob(['b']),
      () => true,
    );
    await writeDurableMedia('other/photo', epoch, new Blob(['c']), () => true);
    evictDurableMedia('parent/');
    await writeDurableMedia('barrier', epoch, new Blob(['d']), () => true);
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
        new Blob(['x']),
        () => true,
      );
    }
    await readDurableMedia('photo-0', epoch);
    await writeDurableMedia('new-photo', epoch, new Blob(['y']), () => true);
    expect(await readDurableMedia('photo-1', epoch)).toBeUndefined();
    expect((await readDurableMedia('photo-0', epoch))?.size).toBe(1);
    expect((await readDurableMedia('new-photo', epoch))?.size).toBe(1);
  });
  it('expires saved bytes without extending retention on reads', async () => {
    const epoch = captureDurableMediaEpoch()!;
    await writeDurableMedia('photo', epoch, new Blob(['old']), () => true);
    vi.spyOn(Date, 'now').mockReturnValue(
      Date.now() + DURABLE_MEDIA_MAX_AGE_MS + 1,
    );
    expect(await readDurableMedia('photo', epoch)).toBeUndefined();
    vi.restoreAllMocks();
  });
});
