// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Configuration } from './apiConfiguration';
import {
  captureMediaCacheLease,
  evictAuthorizedMedia,
  loadCachedMediaBlob,
} from './authorizedMediaCache';
import {
  AttachmentsApi,
  DashboardApi,
  PlacesApi,
  ProfilesApi,
  StoryApi,
} from './mediaApis';
import { clearProductReadCacheInBackground } from './productReadCache';
import {
  clearStoredSession,
  refreshSessionTokens,
  storeSession,
} from './sessionPersistence';

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

const preview = ['attachment', 'MEMORY', 'parent', 'photo', 'thumbnail'];
const storyPayload = {
  items: [
    {
      kind: 'MEMORY',
      effectiveDate: '2026-11-05',
      memory: {
        id: 'parent',
        attachments: [
          { id: 'photo', status: 'READY', hasThumbnail: true },
          { id: 'processing', status: 'PROCESSING', hasThumbnail: true },
          { id: 'original-only', status: 'READY', hasThumbnail: false },
        ],
      },
    },
  ],
  nextCursor: null,
  hasMore: false,
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const photo = () => new Blob(['photo'], { type: 'image/jpeg' });
const parentLease = (media: AttachmentsApi) =>
  captureMediaCacheLease(media, 'space', ['attachment', 'MEMORY', 'parent']);

it.each([
  [
    'Map',
    () => new PlacesApi(configuration()).listMemoryMap({ spaceId: 'space' }),
  ],
  [
    'Timeline',
    () => new StoryApi(configuration()).getStoryTimeline({ spaceId: 'space' }),
  ],
  [
    'Discover',
    () => new StoryApi(configuration()).getStoryDiscover({ spaceId: 'space' }),
  ],
  [
    'Media gallery',
    () => new StoryApi(configuration()).getMediaGallery({ spaceId: 'space' }),
  ],
  [
    'Dashboard',
    () => new DashboardApi(configuration()).getDashboard({ spaceId: 'space' }),
  ],
] as const)(
  'a denied %s list evicts every stored image of that Space',
  async (_name, read) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ title: 'Forbidden' }, 403)),
    );
    const media = new AttachmentsApi(configuration());
    const load = vi.fn(async () => photo());
    await loadCachedMediaBlob(parentLease(media), preview, load);
    await loadCachedMediaBlob(parentLease(media), preview, load);
    expect(load).toHaveBeenCalledTimes(1);
    await expect(read()).rejects.toBeTruthy();
    await loadCachedMediaBlob(parentLease(media), preview, load);
    expect(load).toHaveBeenCalledTimes(2);
  },
);

it('a successful list keeps stored images without a new read grant', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json(storyPayload)),
  );
  const media = new AttachmentsApi(configuration());
  const load = vi.fn(async () => photo());
  await loadCachedMediaBlob(parentLease(media), preview, load);
  await new StoryApi(configuration()).getStoryTimeline({ spaceId: 'space' });
  await loadCachedMediaBlob(parentLease(media), preview, load);
  expect(load).toHaveBeenCalledTimes(1);
});

it('a late denied list from a previous login cannot evict images of the next login', async () => {
  let finish!: (value: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const request = new StoryApi(configuration()).getStoryTimeline({
    spaceId: 'space',
  });
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  await clearStoredSession();
  await storeSession({
    account,
    tokens: { ...tokens, accessToken: 'access-b', refreshToken: 'refresh-b' },
    spaceId: 'space',
  });
  const media = new AttachmentsApi(configuration('access-b'));
  const load = vi.fn(async () => photo());
  await loadCachedMediaBlob(parentLease(media), preview, load);
  finish(json({ title: 'Forbidden' }, 403));
  await expect(request).rejects.toBeTruthy();
  await loadCachedMediaBlob(parentLease(media), preview, load);
  expect(load).toHaveBeenCalledTimes(1);
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
