import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { AccountView } from '../api/generated/models/AccountView';
import type { ProfileIdentityUpdate } from '../api/generated/models/ProfileIdentityUpdate';
import { Configuration } from '../client/apiConfiguration';
import {
  authorSummaryQueryKeys,
  invalidateAuthorSummaryConsumers,
} from '../client/authorSummaryConsumers';
import { ProfilesApi } from '../client/mediaApis';
import {
  type DraftUploadPhase,
  uploadMemoryDraftAttachment,
} from '../client/memoryAttachmentDraft';
import { loadPhotoCropSource, type PhotoCropSource } from '../client/photoCrop';
import { normalizeClientError } from '../client/problemDetails';
import {
  createReferenceApis,
  ReferenceFlowError,
} from '../client/referenceFlow';
import { defaultAvatarUrl } from '../client/defaultAvatar';
import { useProfileAvatarUrl } from '../client/useProfileAvatarUrl';
import { useTranslation } from '../i18n';
import { AvatarPhoto } from './AvatarPhoto';
import { NativeDateField } from './NativeDateField';
import { PhotoCropTask } from './PhotoCropTask';
import './PeopleProfiles.css';
import { MediaDropZone } from './MediaDropZone';
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
  editRequest = 0,
}: {
  apiBaseUrl: string;
  accessToken: string;
  account: AccountView;
  spaceId: string;
  onDisplayNameChanged: (displayName: string) => void;
  /** Raised by the page's actions menu: opens the editor once per change. */
  editRequest?: number;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const changeAvatarButtonRef = useRef<HTMLButtonElement>(null);
  const avatarSelectionRef = useRef(0);
  const displayNameInputRef = useRef<HTMLInputElement>(null);
  const birthdayInputRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(false);
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [birthdayDraft, setBirthdayDraft] = useState('');
  const [uploadPhase, setUploadPhase] = useState<DraftUploadPhase | null>(null);
  const [cropSource, setCropSource] = useState<PhotoCropSource | null>(null);
  const [preparingAvatar, setPreparingAvatar] = useState(false);

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

  const {
    avatarUrl,
    loadFailed: avatarLoadFailed,
    hasNoPicture,
  } = useProfileAvatarUrl(
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

  // Name and birthday are one edit: only what changed is sent.
  const saveMutation = useMutation({
    mutationFn: async (changes: {
      displayName?: string;
      birthday?: Date | null;
    }) => updateIdentity(changes),
    onSuccess: async (profile) => {
      await acceptUpdatedProfile(profile);
      setEditingIdentity(false);
    },
  });

  useEffect(() => {
    if (!saveMutation.error) return;
    // Pending inputs are disabled until React commits the failed save.
    const input =
      saveMutation.variables?.displayName !== undefined
        ? displayNameInputRef.current
        : birthdayInputRef.current;
    input?.focus();
  }, [saveMutation.error, saveMutation.variables]);

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
    saveMutation.reset();
    avatarMutation.reset();
    removeAvatarMutation.reset();
  }

  // The user chooses the visible section first; a photo this device cannot
  // decode is uploaded unchanged, as before the crop step existed (#1854).
  async function selectAvatar(file: File) {
    if (pending) return;
    resetActionState();
    const selection = ++avatarSelectionRef.current;
    setPreparingAvatar(true);
    const source = await loadPhotoCropSource(file);
    if (selection !== avatarSelectionRef.current) {
      source?.release();
      return;
    }
    setPreparingAvatar(false);
    if (source) setCropSource(source);
    else avatarMutation.mutate(file);
  }

  function openEditor() {
    if (!profileQuery.data) return;
    setSaved(false);
    saveMutation.reset();
    setNameDraft(profileQuery.data.displayName);
    setBirthdayDraft(dateInputValue(profileQuery.data.birthday));
    setEditingIdentity(true);
    requestAnimationFrame(() => displayNameInputRef.current?.focus());
  }

  function closeEditor() {
    saveMutation.reset();
    setEditingIdentity(false);
  }

  // Editing starts from the page's actions menu; it opens once its data is in.
  const handledEditRequest = useRef(0);
  useEffect(() => {
    if (editRequest === handledEditRequest.current || !profileQuery.data)
      return;
    handledEditRequest.current = editRequest;
    openEditor();
  });

  function submitIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveMutation.isPending || !profileQuery.data) return;
    const changes: { displayName?: string; birthday?: Date | null } = {};
    if (nameDraft !== profileQuery.data.displayName)
      changes.displayName = nameDraft;
    if (birthdayDraft !== dateInputValue(profileQuery.data.birthday))
      changes.birthday = birthdayDraft
        ? new Date(`${birthdayDraft}T00:00:00.000Z`)
        : null;
    if (!Object.keys(changes).length) return;
    resetActionState();
    saveMutation.mutate(changes);
  }

  const profile = profileQuery.data;
  const visibleName = profile?.displayName ?? account.displayName;
  const dirty =
    Boolean(profile) &&
    (nameDraft !== profile?.displayName ||
      birthdayDraft !== dateInputValue(profile?.birthday));
  const nameFailed =
    saveMutation.error !== null &&
    saveMutation.variables?.displayName !== undefined;
  const pending =
    saveMutation.isPending ||
    avatarMutation.isPending ||
    removeAvatarMutation.isPending ||
    preparingAvatar ||
    cropSource !== null;
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
            <AvatarPhoto
              name={visibleName}
              url={avatarUrl}
              standInUrl={hasNoPicture ? defaultAvatarUrl(account.id) : null}
              identity={`${spaceId}:profile:${account.id}:${profile.profileAttachmentId}`}
              large
            />
            {editingIdentity ? (
              <MediaDropZone
                multiple={false}
                disabled={pending}
                onFiles={(files) => {
                  if (pending || !files[0]) return;
                  void selectAvatar(files[0]);
                }}
              >
                <div className="profile-identity-actions-row eimir-motion-disclosure">
                  <button
                    ref={changeAvatarButtonRef}
                    type="button"
                    className="secondary compact-action"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={pending}
                  >
                    {avatarMutation.isPending || preparingAvatar
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
                      void selectAvatar(file);
                    }}
                  />
                </div>
              </MediaDropZone>
            ) : null}
          </div>

          <div className="profile-identity-details">
            {editingIdentity ? (
              <form
                className="profile-identity-edit-form form-grid eimir-motion-disclosure"
                onSubmit={submitIdentity}
              >
                <div className="field-group">
                  <label htmlFor="profile-display-name">
                    {t('profileIdentity.displayNameLabel')}
                  </label>
                  <input
                    ref={displayNameInputRef}
                    id="profile-display-name"
                    name="displayName"
                    type="text"
                    value={nameDraft}
                    maxLength={120}
                    autoComplete="name"
                    disabled={pending}
                    aria-invalid={nameFailed ? true : undefined}
                    aria-describedby={
                      nameFailed ? 'profile-display-name-error' : undefined
                    }
                    onChange={(event) => {
                      setNameDraft(event.target.value);
                      if (saveMutation.error) saveMutation.reset();
                      setSaved(false);
                    }}
                  />
                  {nameFailed && saveMutation.error ? (
                    <div id="profile-display-name-error">
                      <ProblemState error={saveMutation.error} />
                    </div>
                  ) : null}
                </div>
                <NativeDateField
                  ref={birthdayInputRef}
                  id="profile-birthday"
                  name="birthday"
                  label={t('profileIdentity.birthdayLabel')}
                  helpText={t('profileIdentity.birthdayHelp')}
                  value={birthdayDraft}
                  disabled={pending}
                  error={
                    saveMutation.error && !nameFailed
                      ? t('profileIdentity.birthdaySaveError')
                      : undefined
                  }
                  onChange={(event) => {
                    setBirthdayDraft(event.target.value);
                    if (saveMutation.error) saveMutation.reset();
                    setSaved(false);
                  }}
                />
                <div className="form-actions profile-identity-edit-actions">
                  <button type="submit" disabled={pending || !dirty}>
                    {saveMutation.isPending
                      ? t('profileIdentity.savingProfile')
                      : t('profileIdentity.saveProfile')}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={closeEditor}
                    disabled={pending}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="profile-identity-name-row">
                  <h2 className="profile-identity-display-name">
                    {visibleName}
                  </h2>
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
              </>
            )}

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

      {saved ? (
        <div className="inline-message inline-message-success" role="status">
          <span>{t('profileIdentity.saved')}</span>
        </div>
      ) : null}
      {avatarMutation.error ? (
        <ProblemState
          error={avatarMutation.error}
          detail={
            avatarMutation.error instanceof ReferenceFlowError
              ? avatarMutation.error.message
              : undefined
          }
        />
      ) : null}
      {removeAvatarMutation.error ? (
        <ProblemState error={removeAvatarMutation.error} />
      ) : null}
      <PhotoCropTask
        source={cropSource}
        restoreFocusRef={changeAvatarButtonRef}
        onCancel={() => setCropSource(null)}
        onConfirm={(file) => {
          setCropSource(null);
          avatarMutation.mutate(file);
        }}
      />
    </section>
  );
}
