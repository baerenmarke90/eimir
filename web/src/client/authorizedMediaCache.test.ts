import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  captureMediaCacheLease,
  clearAuthorizedMediaCache,
  evictAuthorizedMedia,
  loadCachedMediaBlob,
  MEDIA_CACHE_MAX_AGE_MS,
  MEDIA_CACHE_MAX_BYTES,
  MEDIA_CACHE_MAX_ENTRIES,
  mediaCacheScopeForOwner,
  registerMediaClient,
} from './authorizedMediaCache';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

beforeEach(clearAuthorizedMediaCache);
afterEach(() => {
  clearAuthorizedMediaCache();
  vi.restoreAllMocks();
});

it('shares simultaneous downloads while retaining bytes after all views leave', async () => {
  const lease = captureMediaCacheLease({}, 'space');
  const result = deferred<Blob>();
  const load = vi.fn(() => result.promise);
  const first = loadCachedMediaBlob(lease, ['photo'], load);
  const second = loadCachedMediaBlob(lease, ['photo'], load);
  await Promise.resolve();
  expect(load).toHaveBeenCalledTimes(1);
  const photo = new Blob(['photo']);
  result.resolve(photo);
  expect(await first).toBe(photo);
  expect(await second).toBe(photo);
  expect(await loadCachedMediaBlob(lease, ['photo'], load)).toBe(photo);
  expect(load).toHaveBeenCalledTimes(1);
});

it('cancels one consumer without interrupting another consumer of the same bytes', async () => {
  const lease = captureMediaCacheLease({}, 'space');
  const result = deferred<Blob>();
  const load = vi.fn((_signal: AbortSignal) => result.promise);
  const controller = new AbortController();
  const first = loadCachedMediaBlob(lease, ['photo'], load, controller.signal);
  const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
  const second = loadCachedMediaBlob(lease, ['photo'], load);
  await Promise.resolve();
  controller.abort();
  await rejected;
  expect(load.mock.calls[0][0].aborted).toBe(false);
  const photo = new Blob(['photo']);
  result.resolve(photo);
  expect(await second).toBe(photo);
});

it('cancels the last consumer and cannot cache a transport result that ignores abort', async () => {
  const lease = captureMediaCacheLease({}, 'space');
  const result = deferred<Blob>();
  const load = vi.fn((_signal: AbortSignal) => result.promise);
  const controller = new AbortController();
  const first = loadCachedMediaBlob(lease, ['photo'], load, controller.signal);
  const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
  await Promise.resolve();
  controller.abort();
  await rejected;
  expect(load.mock.calls[0][0].aborted).toBe(true);
  result.resolve(new Blob(['obsolete']));
  const replacement = vi.fn(async () => new Blob(['current']));
  await loadCachedMediaBlob(lease, ['photo'], replacement);
  await loadCachedMediaBlob(lease, ['photo'], replacement);
  expect(replacement).toHaveBeenCalledTimes(1);
});

it('rejects a wipe race and the old lease even if the network completes successfully', async () => {
  const client = {};
  const lease = captureMediaCacheLease(client, 'space');
  const result = deferred<Blob>();
  const load = vi.fn(() => result.promise);
  const read = loadCachedMediaBlob(lease, ['photo'], load);
  const rejected = expect(read).rejects.toMatchObject({ name: 'AbortError' });
  await Promise.resolve();
  clearAuthorizedMediaCache();
  result.resolve(new Blob(['obsolete']));
  await rejected;
  await expect(
    loadCachedMediaBlob(lease, ['photo'], load),
  ).rejects.toMatchObject({ name: 'AbortError' });
  const replacement = vi.fn(async () => new Blob(['current']));
  await loadCachedMediaBlob(
    captureMediaCacheLease(client, 'space'),
    ['photo'],
    replacement,
  );
  expect(replacement).toHaveBeenCalledTimes(1);
});

it('does not retain a rejected download and admits a later retry', async () => {
  const lease = captureMediaCacheLease({}, 'space');
  const load = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('Offline'))
    .mockResolvedValue(new Blob(['photo']));
  await expect(loadCachedMediaBlob(lease, ['photo'], load)).rejects.toThrow(
    'Offline',
  );
  await loadCachedMediaBlob(lease, ['photo'], load);
  await loadCachedMediaBlob(lease, ['photo'], load);
  expect(load).toHaveBeenCalledTimes(2);
});

it('keeps original, thumbnail, parent, Space, origin and login identities separate', async () => {
  const client = {};
  const owner = {};
  const sameOwnerClient = {};
  registerMediaClient(
    client,
    mediaCacheScopeForOwner(owner, 'https://a.example', () => true),
  );
  registerMediaClient(
    sameOwnerClient,
    mediaCacheScopeForOwner(owner, 'https://b.example', () => true),
  );
  const load = vi.fn(async () => new Blob(['photo']));
  const identity = ['MEMORY', 'parent', 'photo', 'original'];
  await loadCachedMediaBlob(
    captureMediaCacheLease(client, 'space'),
    identity,
    load,
  );
  await loadCachedMediaBlob(
    captureMediaCacheLease(client, 'space'),
    ['MEMORY', 'parent', 'photo', 'thumbnail'],
    load,
  );
  await loadCachedMediaBlob(
    captureMediaCacheLease(client, 'space'),
    ['HEART_MOMENT', 'parent', 'photo', 'original'],
    load,
  );
  await loadCachedMediaBlob(
    captureMediaCacheLease(client, 'other-space'),
    identity,
    load,
  );
  await loadCachedMediaBlob(
    captureMediaCacheLease(sameOwnerClient, 'space'),
    identity,
    load,
  );
  await loadCachedMediaBlob(
    captureMediaCacheLease({}, 'space'),
    identity,
    load,
  );
  expect(load).toHaveBeenCalledTimes(6);
});

it('rejects reuse when the login/Space owner has expired', async () => {
  let current = true;
  const client = {};
  registerMediaClient(
    client,
    mediaCacheScopeForOwner({}, '', () => current),
  );
  const lease = captureMediaCacheLease(client, 'space');
  const load = vi.fn(async () => new Blob(['photo']));
  await loadCachedMediaBlob(lease, ['photo'], load);
  current = false;
  await expect(
    loadCachedMediaBlob(lease, ['photo'], load),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(load).toHaveBeenCalledTimes(1);
});

it('does not let a late authorization overwrite a revoked parent or evict an unrelated parent', async () => {
  const client = {};
  const prefix = ['attachment', 'HEART_MOMENT', 'parent'];
  const old = captureMediaCacheLease(client, 'space', prefix);
  const otherPrefix = ['attachment', 'HEART_MOMENT', 'other-parent'];
  const other = captureMediaCacheLease(client, 'space', otherPrefix);
  const load = vi.fn(async () => new Blob(['photo']));
  await loadCachedMediaBlob(old, [...prefix, 'photo', 'original'], load);
  await loadCachedMediaBlob(other, [...otherPrefix, 'photo', 'original'], load);
  evictAuthorizedMedia(old, prefix);
  await expect(
    loadCachedMediaBlob(old, [...prefix, 'photo', 'thumbnail'], load),
  ).rejects.toMatchObject({ name: 'AbortError' });
  await loadCachedMediaBlob(
    captureMediaCacheLease(client, 'space', prefix),
    [...prefix, 'photo', 'original'],
    load,
  );
  await loadCachedMediaBlob(other, [...otherPrefix, 'photo', 'original'], load);
  expect(load).toHaveBeenCalledTimes(3);
});

it('expires a hot entry at its original age rather than extending retention on every hit', async () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const lease = captureMediaCacheLease({}, 'space');
  const load = vi.fn(async () => new Blob(['photo']));
  await loadCachedMediaBlob(lease, ['photo'], load);
  now = MEDIA_CACHE_MAX_AGE_MS - 1;
  await loadCachedMediaBlob(lease, ['photo'], load);
  expect(load).toHaveBeenCalledTimes(1);
  now += 1;
  await loadCachedMediaBlob(lease, ['photo'], load);
  expect(load).toHaveBeenCalledTimes(2);
});

it('evicts the least recently used bytes and never retains an oversized original', async () => {
  const lease = captureMediaCacheLease({}, 'space');
  const load = vi.fn(async () => ({ size: MEDIA_CACHE_MAX_BYTES / 2 }) as Blob);
  await loadCachedMediaBlob(lease, ['a'], load);
  await loadCachedMediaBlob(lease, ['b'], load);
  await loadCachedMediaBlob(lease, ['a'], load);
  await loadCachedMediaBlob(lease, ['c'], load);
  await loadCachedMediaBlob(lease, ['a'], load);
  expect(load).toHaveBeenCalledTimes(3);
  await loadCachedMediaBlob(lease, ['b'], load);
  expect(load).toHaveBeenCalledTimes(4);
  const oversized = vi.fn(
    async () => ({ size: MEDIA_CACHE_MAX_BYTES + 1 }) as Blob,
  );
  await loadCachedMediaBlob(lease, ['large'], oversized);
  await loadCachedMediaBlob(lease, ['large'], oversized);
  expect(oversized).toHaveBeenCalledTimes(2);
});

it('also bounds the number of tiny preview entries', async () => {
  const lease = captureMediaCacheLease({}, 'space');
  const load = vi.fn(async () => new Blob(['tiny']));
  for (let i = 0; i <= MEDIA_CACHE_MAX_ENTRIES; i += 1) {
    await loadCachedMediaBlob(lease, [String(i)], load);
  }
  await loadCachedMediaBlob(lease, [String(MEDIA_CACHE_MAX_ENTRIES)], load);
  expect(load).toHaveBeenCalledTimes(MEDIA_CACHE_MAX_ENTRIES + 1);
  await loadCachedMediaBlob(lease, ['0'], load);
  expect(load).toHaveBeenCalledTimes(MEDIA_CACHE_MAX_ENTRIES + 2);
});
