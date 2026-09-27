import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import { SpacesApi } from '../api/generated/apis/SpacesApi';
import type { AccountView } from '../api/generated/models/AccountView';
import { Configuration } from '../api/generated/runtime';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { normalizeClientError } from '../client/problemDetails';
import { partnerNicknameQueryKey } from '../client/partnerNickname';
import { firstNameFromDisplayName } from '../client/personalName';
import { useProfileAvatarUrl } from '../client/useProfileAvatarUrl';
import { useTranslation } from '../i18n';
import { PersonIdentity } from './PersonIdentity';
import { ProblemState } from './ProblemState';

export function PartnerIdentityPanel({
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
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const nicknameInputRef = useRef<HTMLInputElement>(null);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [nicknameStatus, setNicknameStatus] = useState<
    'saved' | 'removed' | null
  >(null);
  const configuration = useMemo(
    () =>
      new Configuration({
        basePath: apiBaseUrl,
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    [accessToken, apiBaseUrl],
  );
  const spacesApi = useMemo(
    () => new SpacesApi(configuration),
    [configuration],
  );
  const profilesApi = useMemo(
    () => new ProfilesApi(configuration),
    [configuration],
  );

  const spaceQuery = useQuery({
    queryKey: authorSummaryQueryKeys.space(spaceId),
    queryFn: async () => {
      try {
        return await spacesApi.getSpaceApiV1SpacesSpaceIdGet({ spaceId });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
  });

  const partner =
    spaceQuery.data?.partners.find(
      (candidate) => candidate.id !== account.id,
    ) ?? null;
  const partnerId = partner?.id ?? '';
  const profileQuery = useQuery({
    queryKey: authorSummaryQueryKeys.partnerProfile(spaceId, partnerId),
    queryFn: async () => {
      try {
        return await profilesApi.getPartnerProfileApiV1SpacesSpaceIdProfilesAccountIdGet(
          {
            accountId: partnerId,
            spaceId,
          },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    enabled: partnerId.length > 0,
    retry: false,
  });
  const nicknameQuery = useQuery({
    queryKey: partnerNicknameQueryKey(spaceId, account.id),
    queryFn: async () => {
      try {
        return await profilesApi.getPartnerNickname({ spaceId });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    enabled: partnerId.length > 0,
    retry: false,
  });

  const nicknameMutation = useMutation({
    mutationFn: async (nickname: string | null) => {
      if (!nicknameQuery.data || nicknameQuery.data.partnerId !== partnerId) {
        throw new Error('Partner nickname state is unavailable.');
      }
      try {
        return await profilesApi.setPartnerNickname({
          spaceId,
          ifMatch: `"${nicknameQuery.data.version}"`,
          partnerNicknameUpdate: { nickname },
        });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: (updated, nickname) => {
      queryClient.setQueryData(
        partnerNicknameQueryKey(spaceId, account.id),
        updated,
      );
      setEditingNickname(false);
      setNicknameStatus(nickname === null ? 'removed' : 'saved');
      requestAnimationFrame(() => editButtonRef.current?.focus());
    },
    onError: () => nicknameInputRef.current?.focus(),
  });

  const { avatarUrl, loadFailed } = useProfileAvatarUrl(
    profilesApi,
    spaceId,
    partnerId,
    profileQuery.data?.profileAttachmentId,
  );

  if (!partner) return null;

  const displayName = profileQuery.data?.displayName ?? partner.displayName;
  const partnerFirstName = firstNameFromDisplayName(
    displayName,
    t('couplePresencePartnerFallback'),
  );
  const currentNickname =
    nicknameQuery.data?.partnerId === partnerId
      ? nicknameQuery.data.nickname
      : null;
  return (
    <section
      className="form-card profile-identity-panel"
      aria-labelledby="partner-identity-title"
    >
      <div>
        <h2 id="partner-identity-title">{t('profileIdentity.partnerTitle')}</h2>
        <p>{t('profileIdentity.partnerIntro')}</p>
      </div>
      {profileQuery.error ? (
        <ProblemState
          error={profileQuery.error}
          onRetry={() => void profileQuery.refetch()}
        />
      ) : (
        <PersonIdentity
          displayName={displayName}
          imageUrl={avatarUrl}
          size="large"
          imageAlt={t('profileIdentity.imageAlt', { name: displayName })}
          fallbackAlt={t('profileIdentity.fallbackAlt', { name: displayName })}
        />
      )}
      {loadFailed ? (
        <p className="field-help profile-identity-status" role="status">
          {t('profileIdentity.loadAvatarFailed')}
        </p>
      ) : null}
      <div className="partner-nickname">
        <div className="partner-nickname-summary">
          <div>
            <h3>{t('profiles.nickname.title', { name: partnerFirstName })}</h3>
            <p>
              {currentNickname ??
                t('profiles.nickname.fallback', { name: partnerFirstName })}
            </p>
          </div>
          <button
            ref={editButtonRef}
            type="button"
            className="button secondary"
            disabled={nicknameQuery.isLoading || Boolean(nicknameQuery.error)}
            onClick={() => {
              setNicknameDraft(currentNickname ?? '');
              setNicknameStatus(null);
              nicknameMutation.reset();
              setEditingNickname(true);
              requestAnimationFrame(() => nicknameInputRef.current?.focus());
            }}
          >
            {currentNickname
              ? t('profiles.nickname.edit')
              : t('profiles.nickname.add')}
          </button>
        </div>
        <p className="field-help">{t('profiles.nickname.privateHelp')}</p>
        {nicknameQuery.error ? (
          <ProblemState
            error={nicknameQuery.error}
            onRetry={() => void nicknameQuery.refetch()}
          />
        ) : null}
        {editingNickname ? (
          <form
            className="partner-nickname-form"
            onSubmit={(event) => {
              event.preventDefault();
              const cleaned = nicknameDraft.trim();
              if (cleaned) nicknameMutation.mutate(cleaned);
            }}
          >
            <label htmlFor="partner-nickname-input">
              {t('profiles.nickname.inputLabel', { name: partnerFirstName })}
            </label>
            <input
              id="partner-nickname-input"
              ref={nicknameInputRef}
              type="text"
              maxLength={80}
              autoComplete="off"
              value={nicknameDraft}
              onChange={(event) => setNicknameDraft(event.target.value)}
              aria-invalid={nicknameMutation.error ? true : undefined}
            />
            <div className="partner-nickname-actions">
              <button
                type="submit"
                className="button primary"
                disabled={!nicknameDraft.trim() || nicknameMutation.isPending}
              >
                {nicknameMutation.isPending
                  ? t('common.saving')
                  : t('profiles.nickname.save')}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={nicknameMutation.isPending}
                onClick={() => {
                  setEditingNickname(false);
                  nicknameMutation.reset();
                  requestAnimationFrame(() => editButtonRef.current?.focus());
                }}
              >
                {t('common.cancel')}
              </button>
              {currentNickname ? (
                <button
                  type="button"
                  className="button tertiary"
                  disabled={nicknameMutation.isPending}
                  onClick={() => nicknameMutation.mutate(null)}
                >
                  {t('profiles.nickname.remove')}
                </button>
              ) : null}
            </div>
            {nicknameMutation.error ? (
              <ProblemState error={nicknameMutation.error} />
            ) : null}
          </form>
        ) : null}
        {nicknameStatus ? (
          <p className="field-help" role="status">
            {t(`profiles.nickname.${nicknameStatus}`)}
          </p>
        ) : null}
      </div>
    </section>
  );
}
