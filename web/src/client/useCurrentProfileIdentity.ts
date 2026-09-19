import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import type { AccountView } from '../api/generated/models/AccountView';
import { Configuration } from '../api/generated/runtime';
import { authorSummaryQueryKeys } from './authorSummaryConsumers';
import { useProfileAvatarUrl } from './useProfileAvatarUrl';

export function useCurrentProfileIdentity({
  apiBaseUrl,
  accessToken,
  account,
  spaceId,
}: {
  apiBaseUrl: string;
  accessToken: string;
  account: AccountView;
  spaceId: string;
}) {
  const configuration = useMemo(
    () =>
      new Configuration({
        basePath: apiBaseUrl,
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    [accessToken, apiBaseUrl],
  );
  const profilesApi = useMemo(
    () => new ProfilesApi(configuration),
    [configuration],
  );
  const profileQuery = useQuery({
    queryKey: authorSummaryQueryKeys.profileIdentity(spaceId, account.id),
    queryFn: () =>
      profilesApi.getPartnerProfileApiV1SpacesSpaceIdProfilesAccountIdGet({
        accountId: account.id,
        spaceId,
      }),
    retry: false,
  });
  const profile = profileQuery.data;
  const displayName = profile?.displayName ?? account.displayName;
  const { avatarUrl, loadFailed: avatarLoadFailed } = useProfileAvatarUrl(
    profilesApi,
    spaceId,
    account.id,
    profile?.profileAttachmentId,
  );

  return {
    avatarLoadFailed,
    avatarUrl,
    displayName,
    profileQuery,
    profilesApi,
  };
}
