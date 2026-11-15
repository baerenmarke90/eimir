import { useQuery } from '@tanstack/react-query';
import type { SpacesApi } from '../api/generated/apis/SpacesApi';
import { ProfileVisibility } from '../api/generated/models/ProfileVisibility';
import type { ProfilesApi } from '../client/mediaApis';
import { usePartnerNickname } from '../client/partnerNickname';
import { PRIVATE_AREA_ROOT_PATH, privateApiCall } from '../client/privateArea';
import { useTranslation } from '../i18n';
import { ProblemState } from './ProblemState';
import { PrivatePartnerNotesSection } from './ProfilePageBase';
import { TaskBackLink } from './TaskBackButton';
import { UiState } from './UiState';
import './ProfilePage.css';

/** The existing owner-only preference records have one private reading home. */
export function PrivatePartnerNotesPage({
  profilesApi,
  spacesApi,
  accountId,
  spaceId,
}: {
  profilesApi: ProfilesApi;
  spacesApi: SpacesApi;
  accountId: string;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const { relationshipLabel } = usePartnerNickname();
  const space = useQuery({
    queryKey: ['space', spaceId],
    queryFn: () =>
      privateApiCall(() =>
        spacesApi.getSpaceApiV1SpacesSpaceIdGet({ spaceId }),
      ),
    retry: false,
  });
  const preferences = useQuery({
    queryKey: ['profile-preferences', spaceId],
    queryFn: () =>
      privateApiCall(() =>
        profilesApi.listProfilePreferencesApiV1SpacesSpaceIdProfilePreferencesGet(
          { spaceId },
        ),
      ),
    retry: false,
  });
  const partner = space.data?.partners.find(
    (person) => person.id !== accountId,
  );
  return (
    <div className="private-partner-notes-page">
      <TaskBackLink to={PRIVATE_AREA_ROOT_PATH}>
        {t('privateArea.backToHub')}
      </TaskBackLink>
      {space.isPending || preferences.isPending ? (
        <UiState kind="loading" title={t('profiles.preferencesLoading')} />
      ) : null}
      {space.error ? (
        <ProblemState
          error={space.error}
          onRetry={() => void space.refetch()}
        />
      ) : null}
      {preferences.error ? (
        <ProblemState
          error={preferences.error}
          onRetry={() => void preferences.refetch()}
        />
      ) : null}
      {space.data && !partner ? (
        <UiState
          kind="empty"
          title={t('profiles.noPartnerTitle')}
          body={t('profiles.noPartnerBody')}
        />
      ) : null}
      {partner && preferences.data ? (
        <PrivatePartnerNotesSection
          key={JSON.stringify([accountId, spaceId, partner.id])}
          profilesApi={profilesApi}
          spaceId={spaceId}
          partnerId={partner.id}
          partnerName={relationshipLabel(
            partner.id,
            partner.displayName,
            t('couplePresencePartnerFallback'),
          )}
          items={preferences.data.filter(
            (preference) =>
              preference.accountId === partner.id &&
              preference.visibility === ProfileVisibility.PRIVATE_PARTNER_NOTE,
          )}
          showPrivacyNotice={false}
        />
      ) : null}
    </div>
  );
}
