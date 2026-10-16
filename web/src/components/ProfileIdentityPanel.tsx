import { type FormEvent, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import type { AccountView } from '../api/generated/models/AccountView';
import type { ProfileIdentityUpdate } from '../api/generated/models/ProfileIdentityUpdate';
import { Configuration } from '../api/generated/runtime';
import {
  authorSummaryQueryKeys,
  invalidateAuthorSummaryConsumers,
} from '../client/authorSummaryConsumers';
import {
  type DraftUploadPhase,
  uploadMemoryDraftAttachment,
} from '../client/memoryAttachmentDraft';
import { normalizeClientError } from '../client/problemDetails';
import { createReferenceApis } from '../client/referenceFlow';
import { useProfileAvatarUrl } from '../client/useProfileAvatarUrl';
import { useTranslation } from '../i18n';
import { NativeDateField } from './NativeDateField';
import { PersonIdentity } from './PersonIdentity';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';
import { VisibilityBadge } from './VisibilityBadge';
import './ProfileIdentityPanel.css';

function dateInputValue(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : '';
}

function uploadStatusKey(phase: DraftUploadPhase | null): string | null {
  if (phase === 'uploading') return 'profileIdentity.uploadUploading';
  if (phase === 'validating') return 'profileIdentity.uploadValidating';
  return null;
}

export function ProfileIdentityPanel({
  apiBaseUrl,
  accessToken,
  account,
  spaceId,
  onDisplayNameChanged,
}: {
  apiBaseUrl: string;
  accessToken: string;
  account: AccountView;
  spaceId: string;
  onDisplayNameChanged: (displayName: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const displayNameInputRef = useRef<HTMLInputElement>(null);
  const birthdayInputRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(false);
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingBirthday, setEditingBirthday] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<DraftUploadPhase | null>(null);

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
  const referenceApis = useMemo(
    () => createReferenceApis(apiBaseUrl, accessToken),
    [accessToken, apiBaseUrl],
  );

  const birthdayFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'long',
        timeZone: 'UTC',
      }),
    [i18n.language],
  );

  const profileQuery = useQuery({
    queryKey: authorSummaryQueryKeys.profileIdentity(spaceId, account.id),
    queryFn: async () => {
      try {
        return await profilesApi.getPartnerProfileApiV1SpacesSpaceIdProfilesAccountIdGet(
          {
            accountId: account.id,
            spaceId,
          },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
  });

  const { avatarUrl, loadFailed: avatarLoadFailed } = useProfileAvatarUrl(
    profilesApi,
    spaceId,
    account.id,
    profileQuery.data?.profileAttachmentId,
  );

  async function updateIdentity(body: ProfileIdentityUpdate) {
    if (!profileQuery.data) throw new Error(t('profiles.loading'));
    try {
      return await profilesApi.updateProfileIdentity({
        accountId: account.id,
        spaceId,
        ifMatch: String(profileQuery.data.version),
        profileIdentityUpdate: body,
      });
    } catch (error) {
      throw await normalizeClientError(error);
    }
  }

  async function acceptUpdatedProfile(
    profile: Awaited<ReturnType<typeof updateIdentity>>,
  ) {
    setSaved(true);
    onDisplayNameChanged(profile.displayName);
    await invalidateAuthorSummaryConsumers(queryClient, spaceId, account.id);
  }

  const displayNameMutation = useMutation({
    mutationFn: async (displayName: string) => updateIdentity({ displayName }),
    onSuccess: async (profile) => {
      await acceptUpdatedProfile(profile);
      setEditingName(false);
      setEditingIdentity(false);
    },
    onError: () => displayNameInputRef.current?.focus(),
  });

  const birthdayMutation = useMutation({
    mutationFn: async (birthday: Date | null) => updateIdentity({ birthday }),
    onSuccess: async (profile) => {
      await acceptUpdatedProfile(profile);
      setEditingBirthday(false);
      setEditingIdentity(false);
    },
    onError: () => birthdayInputRef.current?.focus(),
  });

  const avatarMutation = useMutation({
    mutationFn: async (file: File) => {
      let readyAttachmentId: string | null = null;
      try {
        const ready = await uploadMemoryDraftAttachment(
          referenceApis,
          apiBaseUrl,
          accessToken,
          spaceId,
          file,
          setUploadPhase,
        );
        readyAttachmentId = ready.attachmentId;
        return await updateIdentity({
          profileAttachmentId: ready.attachmentId,
        });
      } catch (error) {
        if (readyAttachmentId) {
          try {
            const attachment = await referenceApis.attachments.getAttachment({
              spaceId,
              attachmentId: readyAttachmentId,
            });
            await referenceApis.attachments.deleteAttachment({
              spaceId,
              attachmentId: readyAttachmentId,
              ifMatch: String(attachment.version),
            });
          } catch {
            // Server-side orphan cleanup remains the fallback.
          }
        }
        throw error;
      } finally {
        setUploadPhase(null);
      }
    },
    onSuccess: async (profile) => {
      await acceptUpdatedProfile(profile);
      setEditingIdentity(false);
    },
  });

  const removeAvatarMutation = useMutation({
    mutationFn: async () => updateIdentity({ profileAttachmentId: null }),
    onSuccess: async (profile) => {
      await acceptUpdatedProfile(profile);
      setEditingIdentity(false);
    },
  });

  function resetActionState() {
    setSaved(false);
    displayNameMutation.reset();
    birthdayMutation.reset();
    avatarMutation.reset();
    removeAvatarMutation.reset();
  }

  function submitDisplayName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (displayNameMutation.isPending) return;
    resetActionState();
    const form = new FormData(event.currentTarget);
    displayNameMutation.mutate(String(form.get('displayName') ?? ''));
  }

  function submitBirthday(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (birthdayMutation.isPending) return;
    const form = new FormData(event.currentTarget);
    const value = String(form.get('birthday') ?? '');
    resetActionState();
    birthdayMutation.mutate(value ? new Date(`${value}T00:00:00.000Z`) : null);
  }

  const profile = profileQuery.data;
  const visibleName = profile?.displayName ?? account.displayName;
  const pending =
    displayNameMutation.isPending ||
    birthdayMutation.isPending ||
    avatarMutation.isPending ||
    removeAvatarMutation.isPending;
  const phaseKey = uploadStatusKey(uploadPhase);

  return (
    <section
      className="form-card profile-identity-panel profile-identity-hero-card"
      id="profile-identity-settings"
      aria-labelledby="profile-identity-title"
    >
      <div className="sr-only">
        <h2 id="profile-identity-title">{t('profileIdentity.title')}</h2>
      </div>

      {profileQuery.isLoading ? (
        <UiState kind="loading" title={t('profiles.loading')} />
      ) : null}
      {profileQuery.error ? (
        <ProblemState
          error={profileQuery.error}
          onRetry={() => void profileQuery.refetch()}
        />
      ) : null}

      {profile ? (
        <div className="profile-identity-hero">
          <div className="profile-identity-avatar-col">
            <PersonIdentity
              displayName={visibleName}
              imageUrl={avatarUrl}
              size="large"
              showName={false}
              imageAlt={t('profileIdentity.imageAlt', { name: visibleName })}
              fallbackAlt={t('profileIdentity.fallbackAlt', {
                name: visibleName,
              })}
            />
          </div>

          <div className="profile-identity-details">
            <div className="profile-identity-name-row">
              <h2 className="profile-identity-display-name">{visibleName}</h2>
              <VisibilityBadge
                visibility="SHARED"
                size="small"
                customLabel={t('profileIdentity.partnerVisibilityNote')}
                className="profile-identity-visibility-badge"
              />
            </div>

            {profile.birthday ? (
              <p className="profile-identity-birthday">
                {t('profileIdentity.birthdayValue', {
                  date: birthdayFormatter.format(profile.birthday),
                })}
              </p>
            ) : null}

            <div className="profile-identity-edit-entry">
              <button
                type="button"
                className="secondary compact-action"
                onClick={() => {
                  if (editingIdentity) {
                    setEditingName(false);
                    setEditingBirthday(false);
                    displayNameMutation.reset();
                    birthdayMutation.reset();
                  } else {
                    setSaved(false);
                  }
                  setEditingIdentity((previous) => !previous);
                }}
                disabled={pending}
                aria-expanded={editingIdentity}
              >
                {editingIdentity
                  ? t('profileIdentity.closeProfileEdit')
                  : t('profileIdentity.editProfile')}
              </button>
            </div>

            {editingIdentity ? (
              <div className="profile-identity-actions-row eimir-motion-disclosure">
                <button
                  type="button"
                  className="secondary compact-action"
                  onClick={() => {
                    displayNameMutation.reset();
                    setSaved(false);
                    setEditingName((previous) => !previous);
                  }}
                  disabled={pending}
                >
                  {editingName
                    ? t('common.cancel')
                    : t('profileIdentity.editName')}
                </button>

                <button
                  type="button"
                  className="secondary compact-action"
                  onClick={() => {
                    birthdayMutation.reset();
                    setSaved(false);
                    setEditingBirthday((previous) => !previous);
                  }}
                  disabled={pending}
                >
                  {editingBirthday
                    ? t('common.cancel')
                    : t('profileIdentity.editBirthday')}
                </button>

                <button
                  type="button"
                  className="secondary compact-action"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={pending}
                >
                  {avatarMutation.isPending
                    ? t('profileIdentity.replacingAvatar')
                    : t('profileIdentity.changeAvatar')}
                </button>

                {profile.profileAttachmentId ? (
                  <button
                    type="button"
                    className="tertiary compact-action"
                    disabled={pending}
                    onClick={() => {
                      resetActionState();
                      removeAvatarMutation.mutate();
                    }}
                  >
                    {removeAvatarMutation.isPending
                      ? t('profileIdentity.removingAvatar')
                      : t('profileIdentity.removeAvatar')}
                  </button>
                ) : null}

                <input
                  ref={fileInputRef}
                  id="profile-avatar-file"
                  className="profile-identity-file-input visually-hidden-input"
                  type="file"
                  accept="image/*"
                  aria-label={t('profileIdentity.changeAvatar')}
                  tabIndex={-1}
                  disabled={pending}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = '';
                    if (!file) return;
                    resetActionState();
                    avatarMutation.mutate(file);
                  }}
                />
              </div>
            ) : null}

            {phaseKey ? (
              <span className="profile-identity-status" role="status">
                {t(phaseKey)}
              </span>
            ) : null}
            {avatarLoadFailed ? (
              <p className="field-help profile-identity-status" role="status">
                {t('profileIdentity.loadAvatarFailed')}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {editingIdentity && editingName && profile ? (
        <form
          key={`name-${profile.displayName}`}
          className="profile-name-inline-form form-grid eimir-motion-disclosure"
          onSubmit={submitDisplayName}
        >
          <div className="field-group">
            <label htmlFor="profile-display-name">
              {t('profileIdentity.displayNameLabel')}
            </label>
            <div className="profile-name-input-group">
              <input
                ref={displayNameInputRef}
                id="profile-display-name"
                name="displayName"
                type="text"
                defaultValue={profile.displayName}
                maxLength={120}
                autoComplete="name"
                disabled={pending}
                aria-invalid={displayNameMutation.error ? true : undefined}
                aria-describedby={
                  displayNameMutation.error
                    ? 'profile-display-name-error'
                    : undefined
                }
                onChange={() => {
                  if (displayNameMutation.error) displayNameMutation.reset();
                  setSaved(false);
                }}
              />
              <button type="submit" disabled={pending}>
                {displayNameMutation.isPending
                  ? t('profileIdentity.savingName')
                  : t('profileIdentity.saveName')}
              </button>
            </div>
            <small>{t('profileIdentity.displayNameHelp')}</small>
            {displayNameMutation.error ? (
              <div id="profile-display-name-error">
                <ProblemState error={displayNameMutation.error} />
              </div>
            ) : null}
          </div>
        </form>
      ) : null}

      {editingIdentity && editingBirthday && profile ? (
        <form
          key={`birthday-${dateInputValue(profile.birthday) || 'none'}`}
          className="profile-birthday-inline-form form-grid eimir-motion-disclosure"
          onSubmit={submitBirthday}
        >
          <NativeDateField
            ref={birthdayInputRef}
            id="profile-birthday"
            name="birthday"
            label={t('profileIdentity.birthdayLabel')}
            helpText={t('profileIdentity.birthdayHelp')}
            defaultValue={dateInputValue(profile.birthday)}
            disabled={pending}
            error={
              birthdayMutation.error
                ? t('profileIdentity.birthdaySaveError')
                : undefined
            }
            onChange={() => {
              if (birthdayMutation.error) birthdayMutation.reset();
              setSaved(false);
            }}
          />
          <div className="form-actions">
            <button type="submit" disabled={pending}>
              {birthdayMutation.isPending
                ? t('profileIdentity.savingBirthday')
                : t('profileIdentity.saveBirthday')}
            </button>
          </div>
        </form>
      ) : null}

      {saved ? (
        <div className="inline-message inline-message-success" role="status">
          <span>{t('profileIdentity.saved')}</span>
        </div>
      ) : null}
      {avatarMutation.error ? (
        <ProblemState error={avatarMutation.error} />
      ) : null}
      {removeAvatarMutation.error ? (
        <ProblemState error={removeAvatarMutation.error} />
      ) : null}
    </section>
  );
}
