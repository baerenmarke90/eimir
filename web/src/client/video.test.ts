// @vitest-environment jsdom

import { clearAuthorizedMediaCache } from './authorizedMediaCache';
import type { ReferenceApis } from './referenceFlow';
import { loadVideoSource } from './video';

beforeEach(clearAuthorizedMediaCache);
function setup(
  url = '/api/v1/spaces/space/attachments/video/playback?token=scoped',
  expiresAt = new Date(Date.now() + 60000),
) {
  const createVideoPlaybackAccess = vi
    .fn()
    .mockResolvedValue({ url, expiresAt });
  const apis = {
    attachments: {
      contentBaseUrl: 'https://api.example.test',
      createVideoPlaybackAccess,
    },
  } as unknown as ReferenceApis;
  return { apis, createVideoPlaybackAccess };
}
it('uses only a parent-bound transient grant on the configured API origin', async () => {
  const { apis, createVideoPlaybackAccess } = setup();
  const controller = new AbortController();
  const result = await loadVideoSource(
    apis,
    'space',
    'MEMORY',
    'memory',
    'video',
    controller.signal,
  );
  expect(result.url).toBe(
    'https://api.example.test/api/v1/spaces/space/attachments/video/playback?token=scoped',
  );
  expect(createVideoPlaybackAccess).toHaveBeenCalledWith(
    {
      spaceId: 'space',
      attachmentId: 'video',
      videoPlaybackRequest: { parentType: 'MEMORY', parentId: 'memory' },
    },
    { signal: controller.signal },
  );
});
it.each([
  'https://other.test/api/v1/spaces/space/attachments/video/playback?token=scoped',
  '/api/v1/spaces/space/attachments/other/playback?token=scoped',
  '/api/v1/spaces/space/attachments/video/playback?token=a&token=b',
  '/api/v1/spaces/space/attachments/video/playback?token=a&accessToken=b',
  '/api/v1/spaces/space/attachments/video/playback?token=a#fragment',
])('rejects an untrusted descriptor %s', async (url) => {
  const { apis } = setup(url);
  await expect(
    loadVideoSource(apis, 'space', 'MEMORY', 'memory', 'video'),
  ).rejects.toThrow('Invalid video playback descriptor');
});
it('rejects an expired grant and a grant that arrives after logout invalidated the lease', async () => {
  const expired = setup(undefined, new Date(0));
  await expect(
    loadVideoSource(expired.apis, 'space', 'MEMORY', 'memory', 'video'),
  ).rejects.toThrow();
  const { apis, createVideoPlaybackAccess } = setup();
  let resolve!: (value: unknown) => void;
  createVideoPlaybackAccess.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const work = loadVideoSource(apis, 'space', 'MEMORY', 'memory', 'video');
  clearAuthorizedMediaCache();
  resolve({
    url: '/api/v1/spaces/space/attachments/video/playback?token=a',
    expiresAt: new Date(Date.now() + 60000),
  });
  await expect(work).rejects.toThrow();
});

it('invalidates a parent poster lease after playback access is denied', async () => {
  const { captureMediaCacheLease, assertMediaCacheLease } = await import(
    './authorizedMediaCache'
  );
  const { ClientProblemError } = await import('./problemDetails');
  const { apis, createVideoPlaybackAccess } = setup();
  const lease = captureMediaCacheLease(apis.attachments, 'space', [
    'attachment',
    'MEMORY',
    'memory',
  ]);
  createVideoPlaybackAccess.mockRejectedValue(
    new ClientProblemError('notFound', 404),
  );
  await expect(
    loadVideoSource(apis, 'space', 'MEMORY', 'memory', 'video'),
  ).rejects.toThrow();
  expect(() => assertMediaCacheLease(lease)).toThrow();
});
