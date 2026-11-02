// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import { useProfileAvatarUrl } from './useProfileAvatarUrl';
import {
  clearAuthorizedMediaCache,
  mediaCacheScopeForOwner,
  registerMediaClient,
} from './authorizedMediaCache';

describe('useProfileAvatarUrl performance sharing (#1028)', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  let createObjectUrl: ReturnType<typeof vi.fn<typeof URL.createObjectURL>>;
  let revokeObjectUrl: ReturnType<typeof vi.fn<typeof URL.revokeObjectURL>>;

  beforeEach(() => {
    clearAuthorizedMediaCache();
    createObjectUrl = vi.fn(() => 'blob:shared-avatar');
    revokeObjectUrl = vi.fn();
    URL.createObjectURL = createObjectUrl;
    URL.revokeObjectURL = revokeObjectUrl;
  });

  afterEach(() => {
    clearAuthorizedMediaCache();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it('reuses avatar bytes and the display URL across tab remounts', async () => {
    const getProfileAvatarContentRaw = vi.fn(async () => ({
      raw: { blob: async () => new Blob(['avatar']) },
    }));
    const profilesApi = {
      getProfileAvatarContentRaw,
    } as unknown as ProfilesApi;
    const first = renderHook(() =>
      useProfileAvatarUrl(profilesApi, 'space', 'account', 'avatar-a'),
    );
    await waitFor(() => expect(first.result.current.avatarUrl).not.toBeNull());
    first.unmount();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = renderHook(() =>
      useProfileAvatarUrl(profilesApi, 'space', 'account', 'avatar-a'),
    );
    await waitFor(() => expect(second.result.current.avatarUrl).not.toBeNull());
    expect(getProfileAvatarContentRaw).toHaveBeenCalledTimes(1);
    second.unmount();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).not.toHaveBeenCalled();
    clearAuthorizedMediaCache();
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
  });

  it('shares an active avatar across profile clients and loads a changed attachment separately', async () => {
    const firstLoad = vi.fn(async () => ({
      raw: { blob: async () => new Blob(['first']) },
    }));
    const secondLoad = vi.fn(async () => ({
      raw: { blob: async () => new Blob(['second']) },
    }));
    const firstApi = {
      getProfileAvatarContentRaw: firstLoad,
    } as unknown as ProfilesApi;
    const secondApi = {
      getProfileAvatarContentRaw: secondLoad,
    } as unknown as ProfilesApi;
    const scope = mediaCacheScopeForOwner({}, '', () => true);
    registerMediaClient(firstApi, scope);
    registerMediaClient(secondApi, scope);
    const first = renderHook(() =>
      useProfileAvatarUrl(firstApi, 'space', 'account', 'avatar-a'),
    );
    const second = renderHook(
      ({ attachment }) =>
        useProfileAvatarUrl(secondApi, 'space', 'account', attachment),
      {
        initialProps: { attachment: 'avatar-a' },
      },
    );
    await waitFor(() => expect(second.result.current.avatarUrl).not.toBeNull());
    expect(first.result.current.avatarUrl).toBe(
      second.result.current.avatarUrl,
    );
    expect(firstLoad).toHaveBeenCalledTimes(1);
    expect(secondLoad).not.toHaveBeenCalled();
    second.rerender({ attachment: 'avatar-b' });
    await waitFor(() => expect(secondLoad).toHaveBeenCalledTimes(1));
    first.unmount();
    second.unmount();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('never reuses a revoked active avatar entry after a cache wipe', async () => {
    let serial = 0;
    createObjectUrl.mockImplementation(() => `blob:avatar-${++serial}`);
    const download = vi.fn(async () => ({
      raw: { blob: async () => new Blob(['avatar']) },
    }));
    const api = {
      getProfileAvatarContentRaw: download,
    } as unknown as ProfilesApi;
    const first = renderHook(() =>
      useProfileAvatarUrl(api, 'space', 'account', 'avatar'),
    );
    await waitFor(() =>
      expect(first.result.current.avatarUrl).toBe('blob:avatar-1'),
    );
    clearAuthorizedMediaCache();
    const next = renderHook(() =>
      useProfileAvatarUrl(api, 'space', 'account', 'avatar'),
    );
    await waitFor(() =>
      expect(next.result.current.avatarUrl).toBe('blob:avatar-2'),
    );
    expect(download).toHaveBeenCalledTimes(2);
    first.unmount();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const simultaneous = renderHook(() =>
      useProfileAvatarUrl(api, 'space', 'account', 'avatar'),
    );
    await waitFor(() =>
      expect(simultaneous.result.current.avatarUrl).toBe('blob:avatar-2'),
    );
    expect(download).toHaveBeenCalledTimes(2);
    next.unmount();
    simultaneous.unmount();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('deduplicates concurrent consumers of the same avatar and shares one object URL', async () => {
    const blob = vi.fn(async () => new Blob(['avatar']));
    const getProfileAvatarContentRaw = vi.fn(async () => ({
      raw: { blob },
    }));
    const profilesApi = {
      getProfileAvatarContentRaw,
    } as unknown as ProfilesApi;

    const { result, unmount } = renderHook(() => {
      const first = useProfileAvatarUrl(
        profilesApi,
        'space-1',
        'account-1',
        'attachment-1',
      );
      const second = useProfileAvatarUrl(
        profilesApi,
        'space-1',
        'account-1',
        'attachment-1',
      );
      return { first, second };
    });

    await waitFor(() => {
      expect(result.current.first.avatarUrl).toBe('blob:shared-avatar');
      expect(result.current.second.avatarUrl).toBe('blob:shared-avatar');
    });

    expect(getProfileAvatarContentRaw).toHaveBeenCalledTimes(1);
    expect(blob).toHaveBeenCalledTimes(1);
    expect(createObjectUrl).toHaveBeenCalledTimes(1);

    unmount();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(revokeObjectUrl).not.toHaveBeenCalled();
    clearAuthorizedMediaCache();
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:shared-avatar');
  });
});
