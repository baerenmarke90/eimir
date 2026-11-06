import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { PeopleApi } from '../api/generated/apis/PeopleApi';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import { SpacesApi } from '../api/generated/apis/SpacesApi';
import { Configuration } from '../client/apiConfiguration';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { normalizeClientError } from '../client/problemDetails';
import { useTranslation } from '../i18n';
import { ImportantDatesPanel } from './ImportantDatesPanel';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';
import './RelatedPeoplePage.css';
import './PeopleProfiles.css';

export function PlanningOccasions({
  peopleApi,
  profilesApi,
  spaceId,
  accountId,
  apiBaseUrl,
  accessToken,
}: {
  peopleApi: PeopleApi;
  profilesApi?: ProfilesApi;
  spaceId: string;
  accountId?: string;
  apiBaseUrl?: string;
  accessToken?: string;
}) {
  const { t } = useTranslation();
  const spacesApi = useMemo(
    () =>
      apiBaseUrl && accessToken
        ? new SpacesApi(
            new Configuration({
              basePath: apiBaseUrl,
              headers: { Authorization: `Bearer ${accessToken}` },
            }),
          )
        : null,
    [apiBaseUrl, accessToken],
  );
  const people = useQuery({
    queryKey: ['related-people', spaceId],
    queryFn: async () => {
      try {
        return await peopleApi.listRelatedPersonsApiV1SpacesSpaceIdRelatedPersonsGet(
          { spaceId },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
  });
  const space = useQuery({
    queryKey: authorSummaryQueryKeys.space(spaceId),
    enabled: Boolean(spacesApi),
    queryFn: async () => {
      if (!spacesApi) throw new Error('Space API unavailable');
      try {
        return await spacesApi.getSpaceApiV1SpacesSpaceIdGet({ spaceId });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
  });
  const partner = space.data?.partners.find((p) => p.id !== accountId);
  const profile = useQuery({
    queryKey: authorSummaryQueryKeys.partnerProfile(spaceId, partner?.id ?? ''),
    enabled: Boolean(partner && profilesApi),
    queryFn: async () => {
      if (!profilesApi || !partner)
        throw new Error('Partner profile unavailable');
      try {
        return await profilesApi.getPartnerProfileApiV1SpacesSpaceIdProfilesAccountIdGet(
          { spaceId, accountId: partner.id },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
  });
  return (
    <>
      {people.isLoading ? (
        <UiState kind="loading" title={t('people.loading')} />
      ) : null}
      {people.error ? (
        <ProblemState
          error={people.error}
          onRetry={() => void people.refetch()}
        />
      ) : null}
      {space.error ? (
        <ProblemState
          error={space.error}
          onRetry={() => void space.refetch()}
        />
      ) : null}
      {profile.error ? (
        <ProblemState
          error={profile.error}
          onRetry={() => void profile.refetch()}
        />
      ) : null}
      <ImportantDatesPanel
        peopleApi={peopleApi}
        spaceId={spaceId}
        people={people.data ?? []}
        partnerBirthday={
          partner && profile.data?.birthday
            ? {
                accountId: partner.id,
                displayName: profile.data.displayName || partner.displayName,
                birthday: profile.data.birthday,
              }
            : null
        }
      />
    </>
  );
}
