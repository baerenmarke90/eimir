import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  captureMediaCacheLease,
  clearAuthorizedMediaCache,
  evictAuthorizedMedia,
} from './authorizedMediaCache';
import {
  MEDIA_CACHE_MAX_AGE_MS,
  MEDIA_CACHE_MAX_BYTES,
  MEDIA_CACHE_MAX_ENTRIES,
} from './mediaCacheLimits';
import { ClientProblemError } from './problemDetails';
import type { ReferenceApis } from './referenceFlow';
import {
  acquireMediaObjectUrl,
  evictMediaObjectUrls,
  MEDIA_OBJECT_URL_MAX_IDLE_ORIGINALS,
} from './sharedMediaObjectUrls';
import { loadAuthorizedStoryImageResource } from './storyMediaLoader';

let create: ReturnType<typeof vi.fn<(blob: Blob | MediaSource) => string>>;
let revoke: ReturnType<typeof vi.fn<(url: string) => void>>;
beforeEach(() => {
  let serial = 0;
  create = vi.fn(() => `blob:shared-${++serial}`);
  revoke = vi.fn();
  vi.spyOn(URL, 'createObjectURL').mockImplementation(create);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revoke);
});
afterEach(() => {
  clearAuthorizedMediaCache();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('retains thumbnail and original identity across view release/reentry', () => {
  const image = new Blob(['photo']);
  const first = acquireMediaObjectUrl('thumbnail', image);
  const simultaneous = acquireMediaObjectUrl('thumbnail', image);
  first.dispose();
  first.dispose();
  expect(revoke).not.toHaveBeenCalled();
  simultaneous.dispose();
  const next = acquireMediaObjectUrl('thumbnail', image);
  expect(next.url).toBe(first.url);
  expect(create).toHaveBeenCalledTimes(1);
  next.dispose();
  const full = acquireMediaObjectUrl('original', image);
  const other = acquireMediaObjectUrl('original', image);
  full.dispose();
  expect(revoke).not.toHaveBeenCalled();
  other.dispose();
  const returned = acquireMediaObjectUrl('original', image);
  expect(returned.url).toBe(full.url);
  expect(revoke).not.toHaveBeenCalled();
  returned.dispose();
});

it('reuses one authorized poster when a video is encountered through an image consumer', async () => {
  const authorize = vi.fn().mockResolvedValue({
    method: 'STREAM',
    mediaType: 'VIDEO',
    url: '/content',
  });
  const content = vi.fn(async () => ({
    raw: new Response(new Blob(['poster'], { type: 'image/jpeg' })),
  }));
  const apis = {
    attachments: {
      createAttachmentReadAccess: authorize,
      getAttachmentContentRaw: content,
    },
  } as unknown as ReferenceApis;
  const fallback = await loadAuthorizedStoryImageResource(
    apis,
    'space',
    'MEMORY',
    'memory',
    'video',
  );
  fallback.dispose();
  for (let index = 0; index <= MEDIA_OBJECT_URL_MAX_IDLE_ORIGINALS; index++)
    acquireMediaObjectUrl(
      `photo-original-${index}`,
      new Blob(['photo']),
      'original',
    ).dispose();
  expect(revoke).not.toHaveBeenCalledWith(fallback.url);
  const explicit = await loadAuthorizedStoryImageResource(
    apis,
    'space',
    'MEMORY',
    'memory',
    'video',
    { variant: 'thumbnail' },
  );
  expect(explicit.url).toBe(fallback.url);
  expect(create).toHaveBeenCalledTimes(MEDIA_OBJECT_URL_MAX_IDLE_ORIGINALS + 2);
  expect(content).toHaveBeenCalledTimes(1);
  expect(content).toHaveBeenCalledWith(
    { spaceId: 'space', attachmentId: 'video', variant: 'thumbnail' },
    { signal: expect.any(AbortSignal) },
  );
  explicit.dispose();
});

it('expires and bounds idle images without revoking an active view', () => {
  vi.useFakeTimers();
  const active = acquireMediaObjectUrl('active', new Blob(['photo']));
  for (let index = 0; index < MEDIA_CACHE_MAX_ENTRIES + 6; index++)
    acquireMediaObjectUrl(String(index), new Blob(['photo'])).dispose();
  expect(revoke).toHaveBeenCalledTimes(6);
  expect(revoke).not.toHaveBeenCalledWith(active.url);
  vi.advanceTimersByTime(MEDIA_CACHE_MAX_AGE_MS);
  expect(revoke).toHaveBeenCalledTimes(MEDIA_CACHE_MAX_ENTRIES + 6);
  active.dispose();
});

it('reauthorizes reentry before reusing URL/bytes and revokes the parent immediately', async () => {
  const authorize = vi
    .fn()
    .mockResolvedValue({ method: 'STREAM', url: '/content' });
  const content = vi.fn(async () => ({
    raw: new Response(new Blob(['photo'])),
  }));
  const apis = {
    attachments: {
      createAttachmentReadAccess: authorize,
      getAttachmentContentRaw: content,
    },
  } as unknown as ReferenceApis;
  const first = await loadAuthorizedStoryImageResource(
    apis,
    'space',
    'MEMORY',
    'memory',
    'photo',
    { variant: 'thumbnail' },
  );
  first.dispose();
  let release!: (value: { method: string; url: string }) => void;
  authorize.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = loadAuthorizedStoryImageResource(
    apis,
    'space',
    'MEMORY',
    'memory',
    'photo',
    { variant: 'thumbnail' },
  );
  expect(authorize).toHaveBeenCalledTimes(2);
  expect(create).toHaveBeenCalledTimes(1);
  release({ method: 'STREAM', url: '/content' });
  const returned = await pending;
  expect(returned.url).toBe(first.url);
  expect(content).toHaveBeenCalledTimes(1);
  const lease = captureMediaCacheLease(apis.attachments, 'space', [
    'attachment',
    'MEMORY',
    'memory',
  ]);
  evictAuthorizedMedia(lease, ['attachment', 'MEMORY', 'memory']);
  expect(revoke).toHaveBeenCalledWith(returned.url);
  returned.dispose();
  expect(revoke).toHaveBeenCalledTimes(1);
});

it('clears active and idle resources synchronously on logout/Space wipe', () => {
  const active = acquireMediaObjectUrl('active', new Blob(['one']));
  const idle = acquireMediaObjectUrl('idle', new Blob(['two']));
  idle.dispose();
  evictMediaObjectUrls();
  expect(revoke).toHaveBeenCalledWith(active.url);
  expect(revoke).toHaveBeenCalledWith(idle.url);
  active.dispose();
  expect(revoke).toHaveBeenCalledTimes(2);
});

it('does not retain oversized idle images', () => {
  const blob = new Blob([new Uint8Array(MEDIA_CACHE_MAX_BYTES + 1)]);
  const first = acquireMediaObjectUrl('oversized', blob);
  first.dispose();
  expect(revoke).toHaveBeenCalledWith(first.url);
  const next = acquireMediaObjectUrl('oversized', blob);
  expect(next.url).not.toBe(first.url);
  next.dispose();
});

it('a denied fresh read revokes a previously retained parent image', async () => {
  const authorize = vi
    .fn()
    .mockResolvedValue({ method: 'STREAM', url: '/content' });
  const apis = {
    attachments: {
      createAttachmentReadAccess: authorize,
      getAttachmentContentRaw: vi.fn(async () => ({
        raw: new Response(new Blob(['photo'])),
      })),
    },
  } as unknown as ReferenceApis;
  const first = await loadAuthorizedStoryImageResource(
    apis,
    'space',
    'MEMORY',
    'memory',
    'photo',
    { variant: 'thumbnail' },
  );
  first.dispose();
  authorize.mockRejectedValueOnce(new ClientProblemError('permission', 403));
  await expect(
    loadAuthorizedStoryImageResource(
      apis,
      'space',
      'MEMORY',
      'memory',
      'photo',
      { variant: 'thumbnail' },
    ),
  ).rejects.toBeInstanceOf(ClientProblemError);
  expect(revoke).toHaveBeenCalledWith(first.url);
});

it('keeps ordinary app browsing beyond one minute and twenty-four previews stable', () => {
  vi.useFakeTimers();
  const first = acquireMediaObjectUrl('diary-preview', new Blob(['photo']));
  first.dispose();
  for (let index = 0; index < 40; index++)
    acquireMediaObjectUrl(`other-${index}`, new Blob(['photo'])).dispose();
  vi.advanceTimersByTime(90_000);
  const returned = acquireMediaObjectUrl('diary-preview', new Blob(['photo']));
  expect(returned.url).toBe(first.url);
  expect(revoke).not.toHaveBeenCalled();
  returned.dispose();
});

it('shares an original across preview and gallery release order', () => {
  const blob = new Blob(['photo']);
  const preview = acquireMediaObjectUrl('same-original', blob);
  const gallery = acquireMediaObjectUrl('same-original', blob);
  preview.dispose();
  gallery.dispose();
  const returned = acquireMediaObjectUrl('same-original', blob);
  expect(returned.url).toBe(preview.url);
  returned.dispose();
});

it('bounds idle decoded originals while retaining their downloaded bytes', async () => {
  const content = vi.fn(async () => ({
    raw: new Response(new Blob(['photo'])),
  }));
  const apis = {
    attachments: {
      createAttachmentReadAccess: vi
        .fn()
        .mockResolvedValue({ method: 'STREAM', url: '/content' }),
      getAttachmentContentRaw: content,
    },
  } as unknown as ReferenceApis;
  const active = await loadAuthorizedStoryImageResource(
    apis,
    'space',
    'MEMORY',
    'parent',
    'active',
  );
  let oldest = '';
  for (let index = 0; index <= MEDIA_OBJECT_URL_MAX_IDLE_ORIGINALS; index++) {
    const resource = await loadAuthorizedStoryImageResource(
      apis,
      'space',
      'MEMORY',
      'parent',
      String(index),
    );
    if (index === 0) oldest = resource.url;
    resource.dispose();
  }
  expect(revoke).toHaveBeenCalledWith(oldest);
  expect(revoke).not.toHaveBeenCalledWith(active.url);
  const returned = await loadAuthorizedStoryImageResource(
    apis,
    'space',
    'MEMORY',
    'parent',
    '0',
  );
  expect(returned.url).not.toBe(oldest);
  expect(content).toHaveBeenCalledTimes(
    MEDIA_OBJECT_URL_MAX_IDLE_ORIGINALS + 2,
  );
  returned.dispose();
  active.dispose();
});

it.each(['MEMORY', 'HEART_MOMENT', 'PLAN'] as const)(
  'keeps %s gallery originals and thumbnails stable after tab/back return while authorizing every reentry',
  async (parentType) => {
    const authorize = vi
      .fn()
      .mockResolvedValue({ method: 'STREAM', url: '/content' });
    const download = vi.fn(async () => ({
      raw: new Response(new Blob(['photo'])),
    }));
    const apis = {
      attachments: {
        createAttachmentReadAccess: authorize,
        getAttachmentContentRaw: download,
      },
    } as unknown as ReferenceApis;
    for (const variant of [undefined, 'thumbnail'] as const) {
      const first = await loadAuthorizedStoryImageResource(
        apis,
        'space',
        parentType,
        'parent',
        'photo',
        { variant },
      );
      first.dispose();
      const next = await loadAuthorizedStoryImageResource(
        apis,
        'space',
        parentType,
        'parent',
        'photo',
        { variant },
      );
      expect(next.url).toBe(first.url);
      next.dispose();
    }
    expect(authorize).toHaveBeenCalledTimes(4);
    expect(download).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(2);
  },
);

it('does not share one attachment across different authorized parent bindings', async () => {
  const authorize = vi
    .fn()
    .mockResolvedValue({ method: 'STREAM', url: '/content' });
  const apis = {
    attachments: {
      createAttachmentReadAccess: authorize,
      getAttachmentContentRaw: vi.fn(async () => ({
        raw: new Response(new Blob(['photo'])),
      })),
    },
  } as unknown as ReferenceApis;
  const memory = await loadAuthorizedStoryImageResource(
    apis,
    'space',
    'MEMORY',
    'one',
    'photo',
  );
  const plan = await loadAuthorizedStoryImageResource(
    apis,
    'space',
    'PLAN',
    'two',
    'photo',
  );
  expect(plan.url).not.toBe(memory.url);
  memory.dispose();
  plan.dispose();
});
