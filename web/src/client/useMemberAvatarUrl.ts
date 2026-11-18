import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import { Configuration } from '../api/generated/runtime';
import { authorSummaryQueryKeys } from './authorSummaryConsumers';
import { useProfileAvatarUrl } from './useProfileAvatarUrl';

/**
 * The profile picture of one Space member, or `null` while it loads, when the
 * member has none, or when reading it failed. Callers keep showing the
 * member's initials in that case, so a missing picture never blocks a screen.
 *
 * Shares the profile query key with the other identity surfaces, so a picture
 * already read for the header or the passport is reused here.
 */
export function useMemberAvatarUrl({
  apiBaseUrl,
  accessToken,
  spaceId,
  accountId,
  enabled = true,
}: {
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
  accountId: string | null | undefined;
  enabled?: boolean;
}): string | null {
  const profilesApi = useMemo(
    () =>
      new ProfilesApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ),
    [apiBaseUrl, accessToken],
  );
  const active = enabled && Boolean(accountId && spaceId);
  const profile = useQuery({
    queryKey: authorSummaryQueryKeys.profileIdentity(spaceId, accountId ?? ''),
    queryFn: () =>
      profilesApi.getPartnerProfileApiV1SpacesSpaceIdProfilesAccountIdGet({
        accountId: accountId ?? '',
        spaceId,
      }),
    enabled: active,
    retry: false,
  });
  const { avatarUrl, loadFailed } = useProfileAvatarUrl(
    active ? profilesApi : null,
    spaceId,
    accountId ?? '',
    profile.data?.profileAttachmentId,
  );
  return loadFailed ? null : avatarUrl;
}
