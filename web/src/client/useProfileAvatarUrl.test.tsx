// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import { useProfileAvatarUrl } from './useProfileAvatarUrl';

describe('useProfileAvatarUrl performance sharing (#1028)', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  let createObjectUrl: ReturnType<typeof vi.fn>;
  let revokeObjectUrl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectUrl = vi.fn(() => 'blob:shared-avatar');
    revokeObjectUrl = vi.fn();
    URL.createObjectURL = createObjectUrl;
    URL.revokeObjectURL = revokeObjectUrl;
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
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
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:shared-avatar');
  });
});
