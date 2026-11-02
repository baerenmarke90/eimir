import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  acquireMediaObjectUrl,
  evictMediaObjectUrls,
} from './sharedMediaObjectUrls';
import {
  clearAuthorizedMediaCache,
  captureMediaCacheLease,
  evictAuthorizedMedia,
} from './authorizedMediaCache';
import { loadAuthorizedStoryImageResource } from './storyMediaLoader';
import type { ReferenceApis } from './referenceFlow';
import { ClientProblemError } from './problemDetails';

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

it('retains thumbnail identity across view release/reentry and releases originals after the last consumer', () => {
  const image = new Blob(['photo']);
  const first = acquireMediaObjectUrl('thumbnail', image, true);
  const simultaneous = acquireMediaObjectUrl('thumbnail', image, true);
  first.dispose();
  first.dispose();
  expect(revoke).not.toHaveBeenCalled();
  simultaneous.dispose();
  const next = acquireMediaObjectUrl('thumbnail', image, true);
  expect(next.url).toBe(first.url);
  expect(create).toHaveBeenCalledTimes(1);
  next.dispose();
  const full = acquireMediaObjectUrl('original', image, false);
  const other = acquireMediaObjectUrl('original', image, false);
  full.dispose();
  expect(revoke).not.toHaveBeenCalled();
  other.dispose();
  expect(revoke).toHaveBeenCalledWith(full.url);
});

it('expires and bounds idle previews without revoking an active view', () => {
  vi.useFakeTimers();
  const active = acquireMediaObjectUrl('active', new Blob(['photo']), true);
  for (let index = 0; index < 30; index++)
    acquireMediaObjectUrl(String(index), new Blob(['photo']), true).dispose();
  expect(revoke).toHaveBeenCalledTimes(6);
  expect(revoke).not.toHaveBeenCalledWith(active.url);
  vi.advanceTimersByTime(60_000);
  expect(revoke).toHaveBeenCalledTimes(30);
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
  const active = acquireMediaObjectUrl('active', new Blob(['one']), true);
  const idle = acquireMediaObjectUrl('idle', new Blob(['two']), true);
  idle.dispose();
  evictMediaObjectUrls();
  expect(revoke).toHaveBeenCalledWith(active.url);
  expect(revoke).toHaveBeenCalledWith(idle.url);
  active.dispose();
  expect(revoke).toHaveBeenCalledTimes(2);
});

it('does not retain oversized idle previews', () => {
  const blob = new Blob([new Uint8Array(9 * 1024 * 1024)]);
  const first = acquireMediaObjectUrl('oversized', blob, true);
  first.dispose();
  expect(revoke).toHaveBeenCalledWith(first.url);
  const next = acquireMediaObjectUrl('oversized', blob, true);
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
