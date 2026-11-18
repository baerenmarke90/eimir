// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AttachmentsApi } from '../api/generated/apis/AttachmentsApi';
import { useRelatedPersonAvatarUrl } from './useRelatedPersonAvatarUrl';
import { clearAuthorizedMediaCache } from './authorizedMediaCache';

beforeEach(() => {
  let serial = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(
    () => `blob:person-${++serial}`,
  );
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});
afterEach(() => {
  clearAuthorizedMediaCache();
  vi.restoreAllMocks();
});

it('keeps a related person avatar stable across view return and isolates replacement clients', async () => {
  const download = vi.fn(async () => ({
    raw: new Response('avatar'),
  }));
  const api = {
    getAttachmentContentRaw: download,
  } as unknown as AttachmentsApi;
  const first = renderHook(() =>
    useRelatedPersonAvatarUrl(api, 'space', 'photo'),
  );
  await waitFor(() =>
    expect(first.result.current.avatarUrl).toBe('blob:person-1'),
  );
  first.unmount();
  const next = renderHook(
    ({ client }) => useRelatedPersonAvatarUrl(client, 'space', 'photo'),
    { initialProps: { client: api } },
  );
  await waitFor(() =>
    expect(next.result.current.avatarUrl).toBe('blob:person-1'),
  );
  expect(download).toHaveBeenCalledTimes(1);
  const replacement = {
    getAttachmentContentRaw: download,
  } as unknown as AttachmentsApi;
  next.rerender({ client: replacement });
  expect(next.result.current.avatarUrl).toBeNull();
  await waitFor(() =>
    expect(next.result.current.avatarUrl).toBe('blob:person-2'),
  );
  next.unmount();
  clearAuthorizedMediaCache();
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
});
