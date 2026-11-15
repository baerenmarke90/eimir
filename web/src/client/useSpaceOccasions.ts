import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { PeopleApi } from '../api/generated/apis/PeopleApi';
import { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import { SpacesApi } from '../api/generated/apis/SpacesApi';
import { Configuration } from './apiConfiguration';
import { useApiRuntime } from './apiRuntimeContext';
import { authorSummaryQueryKeys } from './authorSummaryConsumers';
import { collectSpaceOccasions, type SpaceOccasion } from './occasionMatches';
import { normalizeClientError } from './problemDetails';

const NO_OCCASIONS: SpaceOccasion[] = [];

/** Same error shape as the other consumers of these shared query keys. */
async function read<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Occasion source unavailable');
  return value;
}

/**
 * #1907 F2: the couple's occasions for marking memories. Reuses the query
 * keys of Planen › Anlässe and the identity panels, so the screens share one
 * cache and invalidation. The mark is decoration on top of the memory: while
 * a source loads or fails, the occasions it would contribute are simply
 * absent and nothing else on the page waits for them.
 */
export function useSpaceOccasions(
  spaceId: string | undefined,
  accountId: string | undefined,
): SpaceOccasion[] {
  const runtime = useApiRuntime();
  const apis = useMemo(() => {
    if (!runtime) return null;
    const configuration = new Configuration({
      basePath: runtime.apiBaseUrl,
      headers: { Authorization: `Bearer ${runtime.accessToken}` },
    });
    return {
      people: new PeopleApi(configuration),
      profiles: new ProfilesApi(configuration),
      spaces: new SpacesApi(configuration),
    };
  }, [runtime]);
  const enabled = Boolean(apis && spaceId);
  const space = useQuery({
    queryKey: authorSummaryQueryKeys.space(spaceId ?? ''),
    enabled,
    queryFn: () =>
      read(() =>
        required(apis).spaces.getSpaceApiV1SpacesSpaceIdGet({
          spaceId: required(spaceId),
        }),
      ),
    retry: false,
  });
  const partnerId = space.data?.partners.find((p) => p.id !== accountId)?.id;
  const partnerProfile = useQuery({
    queryKey: authorSummaryQueryKeys.partnerProfile(
      spaceId ?? '',
      partnerId ?? '',
    ),
    enabled: enabled && Boolean(partnerId),
    queryFn: () =>
      read(() =>
        required(
          apis,
        ).profiles.getPartnerProfileApiV1SpacesSpaceIdProfilesAccountIdGet({
          spaceId: required(spaceId),
          accountId: required(partnerId),
        }),
      ),
    retry: false,
  });
  const ownProfile = useQuery({
    queryKey: authorSummaryQueryKeys.profileIdentity(spaceId ?? '', accountId),
    enabled: enabled && Boolean(accountId),
    queryFn: () =>
      read(() =>
        required(
          apis,
        ).profiles.getPartnerProfileApiV1SpacesSpaceIdProfilesAccountIdGet({
          spaceId: required(spaceId),
          accountId: required(accountId),
        }),
      ),
    retry: false,
  });
  const importantDates = useQuery({
    queryKey: ['important-dates', spaceId ?? ''],
    enabled,
    queryFn: () =>
      read(() =>
        required(
          apis,
        ).people.listImportantDatesApiV1SpacesSpaceIdImportantDatesGet({
          spaceId: required(spaceId),
        }),
      ),
    retry: false,
  });
  const partner = space.data?.partners.find((p) => p.id === partnerId);
  const relationshipStartedOn = space.data?.relationshipStartedOn;
  return useMemo(() => {
    if (!enabled) return NO_OCCASIONS;
    return collectSpaceOccasions({
      relationshipStartedOn: relationshipStartedOn
        ? new Date(`${relationshipStartedOn}T00:00:00Z`)
        : null,
      birthdays: [
        accountId && ownProfile.data?.birthday
          ? {
              accountId,
              displayName: ownProfile.data.displayName,
              birthday: ownProfile.data.birthday,
            }
          : null,
        partnerId && partnerProfile.data?.birthday
          ? {
              accountId: partnerId,
              displayName:
                partnerProfile.data.displayName || partner?.displayName || '',
              birthday: partnerProfile.data.birthday,
            }
          : null,
      ],
      importantDates: importantDates.data ?? [],
      viewerAccountId: accountId,
    });
  }, [
    enabled,
    accountId,
    partnerId,
    partner?.displayName,
    relationshipStartedOn,
    ownProfile.data,
    partnerProfile.data,
    importantDates.data,
  ]);
}
