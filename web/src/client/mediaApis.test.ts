// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Configuration } from './apiConfiguration';
import { AttachmentsApi, ProfilesApi } from './mediaApis';
import {
  captureMediaCacheLease,
  loadCachedMediaBlob,
} from './authorizedMediaCache';
import {
  clearStoredSession,
  refreshSessionTokens,
  storeSession,
} from './sessionPersistence';
import { clearProductReadCacheInBackground } from './productReadCache';

const account = { id: 'account', displayName: 'Alex' };
const tokens = {
  accessToken: 'access-a',
  refreshToken: 'refresh-a',
  accessExpiresAt: new Date(Date.now() + 900_000),
  refreshExpiresAt: new Date(Date.now() + 86_400_000),
};
const configuration = (
  accessToken = tokens.accessToken,
  basePath = 'https://api.example',
) =>
  new Configuration({
    basePath,
    headers: { Authorization: `Bearer ${accessToken}` },
  });

beforeEach(async () => {
  await clearStoredSession();
  await storeSession({ account, tokens, spaceId: 'space' });
});
afterEach(async () => {
  await clearStoredSession();
  vi.unstubAllGlobals();
});

it('shares media across generated client instances and its own token rotation', async () => {
  const first = new AttachmentsApi(configuration());
  const second = new AttachmentsApi(configuration());
  const load = vi.fn(async () => new Blob(['photo']));
  await loadCachedMediaBlob(
    captureMediaCacheLease(first, 'space'),
    ['photo'],
    load,
  );
  await loadCachedMediaBlob(
    captureMediaCacheLease(second, 'space'),
    ['photo'],
    load,
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ...tokens,
            accessToken: 'access-b',
            refreshToken: 'refresh-b',
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    ),
  );
  await refreshSessionTokens('https://api.example', 'refresh-a');
  const rotated = new AttachmentsApi(configuration('access-b'));
  await loadCachedMediaBlob(
    captureMediaCacheLease(rotated, 'space'),
    ['photo'],
    load,
  );
  expect(load).toHaveBeenCalledTimes(1);
});

it('shares profile media between independently constructed profile clients', async () => {
  const first = new ProfilesApi(configuration());
  const second = new ProfilesApi(configuration());
  const load = vi.fn(async () => new Blob(['avatar']));
  const identity = ['profile-avatar', 'account', 'attachment-a'];
  await loadCachedMediaBlob(
    captureMediaCacheLease(first, 'space'),
    identity,
    load,
  );
  await loadCachedMediaBlob(
    captureMediaCacheLease(second, 'space'),
    identity,
    load,
  );
  expect(load).toHaveBeenCalledTimes(1);
  await loadCachedMediaBlob(
    captureMediaCacheLease(second, 'space'),
    ['profile-avatar', 'account', 'attachment-b'],
    load,
  );
  expect(load).toHaveBeenCalledTimes(2);
});

it('isolates API origins and fails closed for a stale Space client', async () => {
  const first = new AttachmentsApi(configuration());
  const second = new AttachmentsApi(
    configuration('access-a', 'https://other.example'),
  );
  const load = vi.fn(async () => new Blob(['photo']));
  await loadCachedMediaBlob(
    captureMediaCacheLease(first, 'space'),
    ['photo'],
    load,
  );
  await loadCachedMediaBlob(
    captureMediaCacheLease(second, 'space'),
    ['photo'],
    load,
  );
  await storeSession({ account, tokens, spaceId: 'other-space' });
  await expect(
    loadCachedMediaBlob(
      captureMediaCacheLease(first, 'space'),
      ['photo'],
      load,
    ),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(load).toHaveBeenCalledTimes(2);
});

it('clears bytes on logout and cannot reuse them after the same account logs in again', async () => {
  const first = new AttachmentsApi(configuration());
  const load = vi.fn(async () => new Blob(['photo']));
  await loadCachedMediaBlob(
    captureMediaCacheLease(first, 'space'),
    ['photo'],
    load,
  );
  await clearStoredSession();
  await storeSession({ account, tokens, spaceId: 'space' });
  const nextLogin = new AttachmentsApi(configuration());
  await loadCachedMediaBlob(
    captureMediaCacheLease(nextLogin, 'space'),
    ['photo'],
    load,
  );
  await expect(
    loadCachedMediaBlob(
      captureMediaCacheLease(first, 'space'),
      ['photo'],
      load,
    ),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(load).toHaveBeenCalledTimes(2);
});

it('uses the existing product read-cache wipe as a synchronous media barrier', async () => {
  const client = new AttachmentsApi(configuration());
  const before = captureMediaCacheLease(client, 'space');
  const load = vi.fn(async () => new Blob(['photo']));
  await loadCachedMediaBlob(before, ['photo'], load);
  clearProductReadCacheInBackground();
  await expect(
    loadCachedMediaBlob(before, ['photo'], load),
  ).rejects.toMatchObject({ name: 'AbortError' });
  await loadCachedMediaBlob(
    captureMediaCacheLease(client, 'space'),
    ['photo'],
    load,
  );
  expect(load).toHaveBeenCalledTimes(2);
});
