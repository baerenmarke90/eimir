// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Configuration } from './apiConfiguration';
import {
  AttachmentsApi,
  ProfilesApi,
  StoryApi,
  DashboardApi,
} from './mediaApis';
import {
  captureMediaCacheLease,
  loadCachedMediaBlob,
  consumeAuthorizedMediaPreview,
  evictAuthorizedMedia,
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

it('a completed Story response authorizes exactly its ready thumbnails on the shared media scope', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => json(storyPayload)),
  );
  const stories = new StoryApi(configuration());
  const media = new AttachmentsApi(configuration());
  await stories.getStoryTimeline({ spaceId: 'space' });
  const lease = captureMediaCacheLease(media, 'space');
  expect(consumeAuthorizedMediaPreview(lease, preview)).toBe(true);
  for (const id of ['processing', 'original-only'])
    expect(
      consumeAuthorizedMediaPreview(lease, [
        'attachment',
        'MEMORY',
        'parent',
        id,
        'thumbnail',
      ]),
    ).toBe(false);
});

it('a fresh Dashboard response authorizes only its own thumbnail previews', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      json({
        space: { spaceId: 'space', partner: null },
        upcoming: [],
        retrospective: null,
        keepsake: null,
        recentShared: [
          {
            type: 'MEMORY',
            id: 'parent',
            previewAttachmentId: 'photo',
            previewHasThumbnail: true,
          },
        ],
      }),
    ),
  );
  await new DashboardApi(configuration()).getDashboard({ spaceId: 'space' });
  expect(
    consumeAuthorizedMediaPreview(
      captureMediaCacheLease(new AttachmentsApi(configuration()), 'space'),
      preview,
    ),
  ).toBe(true);
});

it('cannot revive a revoked parent with a late Story response', async () => {
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
  const stories = new StoryApi(configuration());
  const media = new AttachmentsApi(configuration());
  const request = stories.getStoryTimeline({ spaceId: 'space' });
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  const parent = ['attachment', 'MEMORY', 'parent'];
  evictAuthorizedMedia(captureMediaCacheLease(media, 'space', parent), parent);
  finish(json(storyPayload));
  await request;
  expect(
    consumeAuthorizedMediaPreview(
      captureMediaCacheLease(media, 'space'),
      preview,
    ),
  ).toBe(false);
});

it('a denied Story read revokes outstanding preview proofs', async () => {
  let denied = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      denied ? json({ title: 'Forbidden' }, 403) : json(storyPayload),
    ),
  );
  const stories = new StoryApi(configuration());
  const media = new AttachmentsApi(configuration());
  await stories.getStoryTimeline({ spaceId: 'space' });
  denied = true;
  await expect(
    stories.getStoryTimeline({ spaceId: 'space' }),
  ).rejects.toBeTruthy();
  expect(
    consumeAuthorizedMediaPreview(
      captureMediaCacheLease(media, 'space'),
      preview,
    ),
  ).toBe(false);
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
