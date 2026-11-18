// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearAuthorizedMediaCache } from './authorizedMediaCache';
import type { ReferenceApis } from './referenceFlow';
import { loadAuthorizedStoryImageResource } from './storyMediaLoader';
import { useObjectUrlResource } from './useObjectUrlResources';

let serial = 0;
const revoke = vi.fn();
beforeEach(() => {
  serial = 0;
  revoke.mockReset();
  vi.spyOn(URL, 'createObjectURL').mockImplementation(
    () => `blob:sync-${++serial}`,
  );
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revoke);
});
afterEach(() => {
  clearAuthorizedMediaCache();
  vi.restoreAllMocks();
});

function apis() {
  const authorize = vi
    .fn()
    .mockResolvedValue({ method: 'STREAM', url: '/content' });
  return {
    authorize,
    apis: {
      attachments: {
        createAttachmentReadAccess: authorize,
        getAttachmentContentRaw: vi.fn(async () => ({
          raw: new Response(new Blob(['photo'], { type: 'image/jpeg' })),
        })),
      },
    } as unknown as ReferenceApis,
  };
}

const view = (client: ReferenceApis, scopeKey: string, spaceId = 'space') =>
  renderHook(() =>
    useObjectUrlResource(scopeKey, 'photo', (_id, signal) =>
      loadAuthorizedStoryImageResource(
        client,
        spaceId,
        'MEMORY',
        'memory',
        'photo',
        { signal, variant: 'thumbnail' },
      ),
    ),
  );

it('renders an image this runtime already decoded in the first frame, from any page', async () => {
  const { apis: client, authorize } = apis();
  const first = view(client, 'media-overview');
  await vi.waitFor(() => expect(first.result.current.url).toBe('blob:sync-1'));
  first.unmount();
  // Another page with its own scope key returns to the same image.
  const returning = view(client, 'story-preview:memory');
  expect(returning.result.current.url).toBe('blob:sync-1');
  expect(returning.result.current.loading).toBe(false);
  await Promise.resolve();
  expect(authorize).toHaveBeenCalledTimes(1);
  returning.unmount();
  // The view released its handle and the promise's separate handle; the idle
  // shared URL stays retained for the next return.
  expect(revoke).not.toHaveBeenCalled();
});

it('falls back to the asynchronous load after logout or for another Space', async () => {
  const { apis: client } = apis();
  const first = view(client, 'scope');
  await vi.waitFor(() => expect(first.result.current.url).toBe('blob:sync-1'));
  first.unmount();
  const otherSpace = view(client, 'scope', 'other-space');
  expect(otherSpace.result.current.url).toBeNull();
  otherSpace.unmount();
  clearAuthorizedMediaCache();
  const afterLogout = view(client, 'scope');
  expect(afterLogout.result.current.url).toBeNull();
  await vi.waitFor(() => expect(afterLogout.result.current.url).not.toBeNull());
  expect(afterLogout.result.current.url).not.toBe('blob:sync-1');
  afterLogout.unmount();
});
