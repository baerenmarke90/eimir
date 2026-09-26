import {
  type FormEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import { SpacesApi } from '../api/generated/apis/SpacesApi';
import type { AccountView } from '../api/generated/models/AccountView';
import { DurationDisplayMode } from '../api/generated/models/DurationDisplayMode';
import { PreferenceCategory } from '../api/generated/models/PreferenceCategory';
import { PreferenceSentiment } from '../api/generated/models/PreferenceSentiment';
import type { ProfilePreferenceView } from '../api/generated/models/ProfilePreferenceView';
import { ProfileVisibility } from '../api/generated/models/ProfileVisibility';
import type { SpaceProfileView } from '../api/generated/models/SpaceProfileView';
import { Configuration } from '../api/generated/runtime';
import { invalidateDashboard } from '../client/dashboardQueries';
import { settingsCategoryPath } from '../client/routes';
import { normalizeClientError } from '../client/problemDetails';
import { usePartnerNickname } from '../client/partnerNickname';
import {
  CATEGORIES,
  type ProfilePreferenceDraft,
  SENTIMENTS,
  profilePreferenceCreateFromDraft,
  profilePreferenceUpdateFromDraft,
} from '../client/profilePreferenceDraft';
import {
  calculateNextAnniversary,
  calculateRelationshipDuration,
  formatAnniversaryDetail,
  formatRelationshipDuration,
} from '../client/relationshipPreview';
import { resolvedLocale, useTranslation } from '../i18n';
import { AddIcon, DestinationIcon } from './DestinationIcon';
import { PartnerIdentityPanel } from './PartnerIdentityPanel';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';
import { containModalTabFocus, useModalLifecycle } from './useModalLifecycle';
import { useOverlayPresence } from './useOverlayPresence';

type PreferenceVisibility =
  | typeof ProfileVisibility.SELF_PROFILE
  | typeof ProfileVisibility.PRIVATE_PARTNER_NOTE;

function relationshipDateInput(
  value: Date | string | null | undefined,
): string {
  if (!value) return '';
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  return '';
}

function formatDateOnly(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}

/** Strictly read-only relationship summary for personal profile view. */
export function RelationshipSummarySection({
  spacesApi,
  spaceId,
}: {
  spacesApi: SpacesApi;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const { relationshipLabel } = usePartnerNickname();

  const spaceQuery = useQuery({
    queryKey: ['space', spaceId],
    queryFn: async () => {
      try {
        return await spacesApi.getSpaceApiV1SpacesSpaceIdGet({ spaceId });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
  });

  const profileQuery = useQuery({
    queryKey: ['space-profile', spaceId],
    queryFn: async () => {
      try {
        return await spacesApi.getSpaceProfileApiV1SpacesSpaceIdProfileGet({
          spaceId,
        });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
  });

  const partnerNames = useMemo(() => {
    const partners = spaceQuery.data?.partners;
    if (!partners || partners.length === 0) return null;
    return partners
      .map((person) =>
        relationshipLabel(
          person.id,
          person.displayName,
          t('couplePresencePartnerFallback'),
        ),
      )
      .join(' & ');
  }, [relationshipLabel, spaceQuery.data?.partners, t]);

  if (!profileQuery.data?.relationshipStartedOn) {
    return null;
  }

  return (
    <div className="profile-relationship-compact" role="status">
      {partnerNames ? (
        <>
          <span className="profile-couple-names">{partnerNames}</span>
          <span className="profile-couple-separator" aria-hidden="true">
            ·
          </span>
        </>
      ) : null}
      <span className="profile-relationship-start">
        <span className="profile-relationship-label">
          {t('profiles.relationshipStartLabel')}:{' '}
        </span>
        <span className="profile-relationship-value">
          {formatDateOnly(profileQuery.data.relationshipStartedOn)}
        </span>
      </span>
    </div>
  );
}

/** Editable relationship configuration section housed in Settings. */
export function RelationshipSettingsSection({
  spacesApi,
  spaceId,
}: {
  spacesApi: SpacesApi;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  const profileQuery = useQuery({
    queryKey: ['space-profile', spaceId],
    queryFn: async () => {
      try {
        return await spacesApi.getSpaceProfileApiV1SpacesSpaceIdProfileGet({
          spaceId,
        });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
  });

  const serverStartedOn = relationshipDateInput(
    profileQuery.data?.relationshipStartedOn,
  );
  const serverShowDuration =
    profileQuery.data?.showRelationshipDuration ?? false;
  const serverDurationMode =
    profileQuery.data?.durationDisplayMode ?? DurationDisplayMode.YEARS_MONTHS;

  const [startedOn, setStartedOn] = useState(serverStartedOn);
  const [showDuration, setShowDuration] = useState(serverShowDuration);
  const [durationMode, setDurationMode] =
    useState<SpaceProfileView['durationDisplayMode']>(serverDurationMode);

  useEffect(() => {
    if (profileQuery.data) {
      setStartedOn(
        relationshipDateInput(profileQuery.data.relationshipStartedOn),
      );
      setShowDuration(profileQuery.data.showRelationshipDuration ?? false);
      setDurationMode(
        profileQuery.data.durationDisplayMode ??
          DurationDisplayMode.YEARS_MONTHS,
      );
    }
  }, [profileQuery.data]);

  const isDirty = useMemo(() => {
    if (!profileQuery.data) return false;
    return (
      startedOn !== serverStartedOn ||
      showDuration !== serverShowDuration ||
      durationMode !== serverDurationMode
    );
  }, [
    profileQuery.data,
    startedOn,
    showDuration,
    durationMode,
    serverStartedOn,
    serverShowDuration,
    serverDurationMode,
  ]);

  const calculatedDuration = useMemo(() => {
    return calculateRelationshipDuration(startedOn);
  }, [startedOn]);

  const nextAnniversary = useMemo(() => {
    return calculateNextAnniversary(startedOn);
  }, [startedOn]);

  const currentDurationText = useMemo(() => {
    return formatRelationshipDuration(calculatedDuration, durationMode, t);
  }, [calculatedDuration, durationMode, t]);

  const nextAnniversaryText = useMemo(() => {
    return formatAnniversaryDetail(nextAnniversary, t, formatDateOnly);
  }, [nextAnniversary, t]);

  const mutation = useMutation({
    mutationFn: async ({
      relationshipStartedOn,
      showRelationshipDuration,
      durationDisplayMode,
    }: {
      relationshipStartedOn: Date | null;
      showRelationshipDuration: boolean;
      durationDisplayMode: SpaceProfileView['durationDisplayMode'];
    }) => {
      if (!profileQuery.data) return null;
      try {
        return await spacesApi.updateSpaceProfileApiV1SpacesSpaceIdProfilePut({
          spaceId,
          ifMatch: String(profileQuery.data.version),
          spaceProfileUpdate: {
            relationshipStartedOn,
            showRelationshipDuration,
            durationDisplayMode:
              durationDisplayMode ?? DurationDisplayMode.YEARS_MONTHS,
          },
        });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: async (profile) => {
      setSaved(true);
      if (profile) {
        queryClient.setQueryData(['space-profile', spaceId], profile);
      } else {
        await queryClient.invalidateQueries({
          queryKey: ['space-profile', spaceId],
        });
      }
      await invalidateDashboard(queryClient, spaceId);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isDirty || mutation.isPending) return;
    setSaved(false);
    mutation.mutate({
      relationshipStartedOn: startedOn
        ? new Date(`${startedOn}T00:00:00.000Z`)
        : null,
      showRelationshipDuration: showDuration,
      durationDisplayMode: durationMode,
    });
  }

  return (
    <section
      className="form-card relationship-settings-section"
      aria-labelledby="relationship-settings-title"
    >
      <div className="settings-section-head">
        <h2 id="relationship-settings-title">
          {t('profiles.relationshipTitle')}
        </h2>
        <p className="settings-section-intro">
          {t('profiles.relationshipIntro')}
        </p>
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
      {profileQuery.data ? (
        <form
          key={profileQuery.data.version}
          className="form-grid"
          onSubmit={submit}
        >
          <div className="field-group">
            <label htmlFor="relationship-started-on">
              {t('profiles.relationshipStartLabel')}
            </label>
            <input
              id="relationship-started-on"
              name="relationshipStartedOn"
              type="date"
              value={startedOn}
              onChange={(e) => {
                setStartedOn(e.target.value);
                setSaved(false);
              }}
            />
          </div>

          <label className="choice-row" htmlFor="show-relationship-duration">
            <input
              id="show-relationship-duration"
              name="showRelationshipDuration"
              type="checkbox"
              checked={showDuration}
              onChange={(e) => {
                setShowDuration(e.target.checked);
                setSaved(false);
              }}
            />
            <span>
              <strong>{t('profiles.relationshipDurationLabel')}</strong>
              <small>{t('profiles.relationshipDurationHelp')}</small>
            </span>
          </label>

          <div className="field-group">
            <label htmlFor="relationship-duration-mode">
              {t('profiles.relationshipModeLabel')}
            </label>
            <select
              id="relationship-duration-mode"
              name="durationDisplayMode"
              value={durationMode}
              onChange={(e) => {
                setDurationMode(
                  e.target.value as SpaceProfileView['durationDisplayMode'],
                );
                setSaved(false);
              }}
            >
              <option value={DurationDisplayMode.YEARS_MONTHS}>
                {t('profiles.relationshipModeYearsMonths')}
              </option>
              <option value={DurationDisplayMode.DAYS}>
                {t('profiles.relationshipModeDays')}
              </option>
            </select>
          </div>

          {/* Relationship Preview Card */}
          <div className="relationship-preview-card">
            <h3 className="relationship-preview-heading">
              {t('profiles.relationshipPreviewTitle')}
            </h3>
            <div className="relationship-preview-items">
              <div className="relationship-preview-item">
                <span className="relationship-preview-label">
                  {t('profiles.relationshipCurrentLabel')}
                </span>
                <span className="relationship-preview-value">
                  {currentDurationText}
                </span>
              </div>
              <div className="relationship-preview-item">
                <span className="relationship-preview-label">
                  {t('profiles.nextAnniversaryLabel')}
                </span>
                <span className="relationship-preview-value">
                  {nextAnniversaryText}
                </span>
              </div>
            </div>
          </div>

          <div className="form-actions relationship-form-actions">
            <button type="submit" disabled={!isDirty || mutation.isPending}>
              {mutation.isPending
                ? t('profiles.saving')
                : t('profiles.saveChanges')}
            </button>
            {saved && !isDirty ? (
              <span className="relationship-saved-feedback" role="status">
                {t('profiles.relationshipSavedSubtle')}
              </span>
            ) : null}
          </div>

          <div className="relationship-notification-hint-row">
            <Link
              to={settingsCategoryPath('notifications')}
              className="relationship-notification-hint-link"
            >
              {t('profiles.relationshipNotificationHint')}
            </Link>
          </div>
        </form>
      ) : null}

      {mutation.error ? <ProblemState error={mutation.error} /> : null}
    </section>
  );
}

/** Viewport-safe and accessible modal dialog for creating and editing preferences or private notes. */
export function PreferenceDialog({
  isOpen,
  preference,
  privateNote,
  pending,
  deletePending,
  onCancel,
  onSubmit,
  onDelete,
  error,
  deleteError,
  restoreFocusRef,
}: {
  isOpen: boolean;
  preference: ProfilePreferenceView | null;
  privateNote: boolean;
  pending: boolean;
  deletePending: boolean;
  onCancel: () => void;
  onSubmit: (draft: ProfilePreferenceDraft) => void;
  onDelete?: () => void;
  error?: unknown;
  deleteError?: unknown;
  restoreFocusRef?: RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLSelectElement>(null);
  const renderedPreferenceRef = useRef(preference);
  if (isOpen) renderedPreferenceRef.current = preference;
  const renderedPreference = renderedPreferenceRef.current;
  const { present, presenceState, completeExit } = useOverlayPresence(isOpen);

  useModalLifecycle({
    active: present,
    initialFocusRef: firstInputRef,
    restoreFocusRef,
    restoreFocus: Boolean(restoreFocusRef),
    deferRestoreFocus: true,
  });

  // Keyboard navigation: Escape closes only the active intent, while focus
  // containment remains in force until presentation presence actually ends.
  useEffect(() => {
    if (!present) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onCancel();
        return;
      }
      containModalTabFocus(e, dialogRef.current, {
        wrapFromOutside: true,
      });
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel, present]);

  // Backdrop dismissal remains pointer-owned; Escape is the keyboard
  // equivalent, so the presentation container itself is not a fake button.
  useEffect(() => {
    if (!present) return;
    const backdrop = backdropRef.current;
    if (!backdrop) return;
    function handleBackdropClick(event: MouseEvent) {
      if (isOpen && event.target === backdrop) onCancel();
    }
    backdrop.addEventListener('click', handleBackdropClick);
    return () => backdrop.removeEventListener('click', handleBackdropClick);
  }, [isOpen, onCancel, present]);

  if (!present) return null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      category: String(
        form.get('category'),
      ) as ProfilePreferenceDraft['category'],
      sentiment: String(
        form.get('sentiment'),
      ) as ProfilePreferenceDraft['sentiment'],
      topic: String(form.get('topic') || ''),
      value: String(form.get('value') || ''),
    });
  }

  return (
    <div
      ref={backdropRef}
      className="preference-modal-backdrop"
      data-presence={presenceState}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="preference-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pref-dialog-heading"
        onAnimationEnd={(event) => {
          if (
            event.target !== event.currentTarget ||
            presenceState !== 'exiting'
          )
            return;
          completeExit();
        }}
      >
        <div className="preference-modal-header">
          <h3 id="pref-dialog-heading" tabIndex={-1}>
            {renderedPreference
              ? privateNote
                ? t('profiles.noteEditTitle')
                : t('profiles.preferenceEditTitle')
              : privateNote
                ? t('profiles.noteCreateTitle')
                : t('profiles.preferenceCreateTitle')}
          </h3>
          <button
            type="button"
            className="preference-modal-close-btn"
            onClick={onCancel}
            aria-label={t('common.cancel')}
          >
            ✕
          </button>
        </div>

        <form
          key={renderedPreference?.id ?? 'new'}
          className="form-grid"
          onSubmit={submit}
        >
          <div className="field-group">
            <label
              htmlFor={`preference-category-${privateNote ? 'private' : 'self'}`}
            >
              {t('profiles.categoryLabel')}
            </label>
            <select
              ref={firstInputRef}
              id={`preference-category-${privateNote ? 'private' : 'self'}`}
              name="category"
              defaultValue={
                renderedPreference?.category ?? PreferenceCategory.OTHER
              }
            >
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {t(`profiles.category.${category}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label
              htmlFor={`preference-sentiment-${privateNote ? 'private' : 'self'}`}
            >
              {t('profiles.sentimentLabel')}
            </label>
            <select
              id={`preference-sentiment-${privateNote ? 'private' : 'self'}`}
              name="sentiment"
              defaultValue={
                renderedPreference?.sentiment ?? PreferenceSentiment.LIKE
              }
            >
              {SENTIMENTS.map((sentiment) => (
                <option key={sentiment} value={sentiment}>
                  {t(`profiles.sentiment.${sentiment}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label
              htmlFor={`preference-topic-${privateNote ? 'private' : 'self'}`}
            >
              {t('profiles.topicLabel')}
            </label>
            <input
              id={`preference-topic-${privateNote ? 'private' : 'self'}`}
              name="topic"
              required
              maxLength={120}
              defaultValue={renderedPreference?.topic ?? ''}
              placeholder={
                privateNote
                  ? t('profiles.noteTopicPlaceholder')
                  : t('profiles.topicPlaceholder')
              }
            />
          </div>

          <div className="field-group">
            <label
              htmlFor={`preference-value-${privateNote ? 'private' : 'self'}`}
            >
              {t('profiles.valueLabel')}
            </label>
            <textarea
              id={`preference-value-${privateNote ? 'private' : 'self'}`}
              name="value"
              required
              rows={3}
              maxLength={500}
              defaultValue={renderedPreference?.value ?? ''}
              placeholder={
                privateNote
                  ? t('profiles.noteValuePlaceholder')
                  : t('profiles.valuePlaceholder')
              }
            />
          </div>

          {error ? <ProblemState error={error} /> : null}
          {deleteError ? <ProblemState error={deleteError} /> : null}

          <div className="preference-modal-actions">
            {renderedPreference && onDelete ? (
              <button
                type="button"
                className="tertiary compact-action preference-delete-btn"
                onClick={onDelete}
                disabled={pending || deletePending}
              >
                {deletePending ? t('profiles.deleting') : t('profiles.delete')}
              </button>
            ) : null}

            <div className="preference-modal-submit-row">
              <button
                type="button"
                className="secondary"
                onClick={onCancel}
                disabled={pending || deletePending}
              >
                {t('common.cancel')}
              </button>
              <button type="submit" disabled={pending || deletePending}>
                {pending
                  ? t('profiles.saving')
                  : renderedPreference
                    ? t('profiles.saveChanges')
                    : t('profiles.create')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export function PreferenceManager({
  profilesApi,
  spaceId,
  accountId,
  visibility,
  items,
  title,
  intro,
  emptyTitle,
  emptyBody,
}: {
  profilesApi: ProfilesApi;
  spaceId: string;
  accountId: string;
  visibility: PreferenceVisibility;
  items: ProfilePreferenceView[];
  title: string;
  intro: string;
  emptyTitle: string;
  emptyBody: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ProfilePreferenceView | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);

  const privateNote = visibility === ProfileVisibility.PRIVATE_PARTNER_NOTE;
  const triggerButtonLabel = privateNote
    ? t('profiles.addNoteShort')
    : t('profiles.addPreferenceShort');

  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
    saveMutation.reset();
    deleteMutation.reset();
  }

  const saveMutation = useMutation({
    mutationFn: async (draft: ProfilePreferenceDraft) => {
      try {
        if (editing) {
          return await profilesApi.updateProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPreferenceIdPut(
            {
              preferenceId: editing.id,
              spaceId,
              ifMatch: String(editing.version),
              profilePreferenceUpdate: profilePreferenceUpdateFromDraft(draft),
            },
          );
        }
        return await profilesApi.createProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPost(
          {
            spaceId,
            profilePreferenceCreate: profilePreferenceCreateFromDraft(
              draft,
              accountId,
              visibility,
            ),
          },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: async () => {
      setSavedMessage(editing ? t('profiles.updated') : t('profiles.created'));
      closeDialog();
      await queryClient.invalidateQueries({
        queryKey: ['profile-preferences', spaceId],
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (target: ProfilePreferenceView) => {
      try {
        await profilesApi.deleteProfilePreferenceApiV1SpacesSpaceIdProfilePreferencesPreferenceIdDelete(
          {
            preferenceId: target.id,
            spaceId,
            ifMatch: String(target.version),
          },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: async () => {
      setSavedMessage(t('profiles.deleted'));
      closeDialog();
      await queryClient.invalidateQueries({
        queryKey: ['profile-preferences', spaceId],
      });
    },
  });

  const groupedCategories = useMemo(() => {
    const map = new Map<PreferenceCategory, ProfilePreferenceView[]>();
    for (const item of items) {
      const existing = map.get(item.category) ?? [];
      existing.push(item);
      map.set(item.category, existing);
    }
    return CATEGORIES.map((cat) => [cat, map.get(cat) ?? []] as const).filter(
      ([, catItems]) => catItems.length > 0,
    );
  }, [items]);

  return (
    <section
      className={`layout-panel profile-section profile-preferences-panel ${privateNote ? 'private-partner-notes-panel' : ''}`}
      aria-labelledby={`profile-manager-${visibility}`}
    >
      <div className="profile-preferences-header">
        <div>
          <h2 id={`profile-manager-${visibility}`}>{title}</h2>
          <p className="profile-section-intro">{intro}</p>
        </div>
        <button
          type="button"
          className="secondary compact-action"
          onClick={(e) => {
            triggerElementRef.current = e.currentTarget;
            setEditing(null);
            setDialogOpen(true);
            saveMutation.reset();
            deleteMutation.reset();
          }}
        >
          <AddIcon />
          <span>{triggerButtonLabel}</span>
        </button>
      </div>

      {savedMessage ? (
        <div className="inline-message inline-message-success" role="status">
          <span>{savedMessage}</span>
        </div>
      ) : null}

      {items.length === 0 ? (
        <UiState kind="empty" title={emptyTitle} body={emptyBody} />
      ) : (
        <div className="profile-preferences-groups">
          {groupedCategories.map(([category, catItems]) => (
            <div key={category} className="profile-preference-category-group">
              <h3 className="profile-preference-category-heading">
                {t(`profiles.category.${category}`)}
              </h3>
              <div className="profile-preference-chips">
                {catItems.map((pref) => {
                  const sentimentIcon =
                    pref.sentiment === PreferenceSentiment.LOVE
                      ? '♥'
                      : pref.sentiment === PreferenceSentiment.LIKE
                        ? '👍'
                        : pref.sentiment === PreferenceSentiment.DISLIKE
                          ? '👎'
                          : pref.sentiment === PreferenceSentiment.AVOID
                            ? '✕'
                            : '•';
                  return (
                    <button
                      key={pref.id}
                      type="button"
                      className="profile-preference-chip eimir-motion-lift"
                      onClick={(e) => {
                        triggerElementRef.current = e.currentTarget;
                        setEditing(pref);
                        setDialogOpen(true);
                        saveMutation.reset();
                        deleteMutation.reset();
                      }}
                    >
                      <span
                        className="profile-preference-chip-sentiment"
                        data-sentiment={pref.sentiment}
                        aria-hidden="true"
                      >
                        {sentimentIcon}
                      </span>
                      <span className="profile-preference-chip-topic">
                        {pref.topic}
                      </span>
                      <span className="profile-preference-chip-value">
                        {pref.value}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <PreferenceDialog
        isOpen={dialogOpen}
        preference={editing}
        privateNote={privateNote}
        pending={saveMutation.isPending}
        deletePending={deleteMutation.isPending}
        onCancel={closeDialog}
        onSubmit={(draft) => {
          setSavedMessage(null);
          saveMutation.mutate(draft);
        }}
        onDelete={
          editing
            ? () => {
                setSavedMessage(null);
                deleteMutation.mutate(editing);
              }
            : undefined
        }
        error={saveMutation.error}
        deleteError={deleteMutation.error}
        restoreFocusRef={triggerElementRef}
      />
    </section>
  );
}

/** Own profile preferences section (+ Vorliebe). */
export function SelfPreferencesSection({
  profilesApi,
  spaceId,
  accountId,
  items,
}: {
  profilesApi: ProfilesApi;
  spaceId: string;
  accountId: string;
  items: ProfilePreferenceView[];
}) {
  const { t } = useTranslation();
  return (
    <PreferenceManager
      profilesApi={profilesApi}
      spaceId={spaceId}
      accountId={accountId}
      visibility={ProfileVisibility.SELF_PROFILE}
      items={items}
      title={t('profiles.selfTitle')}
      intro={t('profiles.selfIntro')}
      emptyTitle={t('profiles.emptySelfTitle')}
      emptyBody={t('profiles.emptySelfBody')}
    />
  );
}

/** Partner's shared preferences section (read-only). */
export function PartnerProfileSection({
  profilesApi,
  spaceId,
  partnerId,
  partnerName,
}: {
  profilesApi: ProfilesApi;
  spaceId: string;
  partnerId: string;
  partnerName: string;
}) {
  const { t } = useTranslation();

  const partnerQuery = useQuery({
    queryKey: ['partner-profile', spaceId, partnerId],
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
    retry: false,
  });

  return (
    <section
      className="layout-panel profile-section"
      aria-labelledby="partner-profile-title"
    >
      <h2 id="partner-profile-title">
        {t('profiles.partnerTitle', { name: partnerName })}
      </h2>
      <p className="profile-section-intro">{t('profiles.partnerIntro')}</p>

      {partnerQuery.isLoading ? (
        <UiState kind="loading" title={t('profiles.loading')} />
      ) : null}
      {partnerQuery.error ? (
        <ProblemState
          error={partnerQuery.error}
          onRetry={() => void partnerQuery.refetch()}
        />
      ) : null}
      {partnerQuery.data?.preferences.length === 0 ? (
        <UiState
          kind="empty"
          title={t('profiles.partnerEmpty', { name: partnerName })}
        />
      ) : null}
      {partnerQuery.data?.preferences.length ? (
        <ul className="profile-preference-list">
          {partnerQuery.data.preferences.map((preference) => (
            <li key={preference.id} className="profile-preference-card">
              <div className="profile-preference-meta">
                <span>{t(`profiles.category.${preference.category}`)}</span>
                <span>{t(`profiles.sentiment.${preference.sentiment}`)}</span>
              </div>
              <h3>{preference.topic}</h3>
              <p>{preference.value}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Private partner notes section with visually explicit privacy indicator (+ Notiz). */
export function PrivatePartnerNotesSection({
  profilesApi,
  spaceId,
  partnerId,
  partnerName,
  items,
}: {
  profilesApi: ProfilesApi;
  spaceId: string;
  partnerId: string;
  partnerName: string;
  items: ProfilePreferenceView[];
}) {
  const { t } = useTranslation();
  return (
    <div className="private-partner-notes-wrapper">
      <div className="private-partner-notes-badge" role="note">
        <span className="private-partner-notes-icon" aria-hidden="true">
          <DestinationIcon icon="private" />
        </span>
        <span>{t('privateArea.entry.privacy')}</span>
      </div>
      <PreferenceManager
        profilesApi={profilesApi}
        spaceId={spaceId}
        accountId={partnerId}
        visibility={ProfileVisibility.PRIVATE_PARTNER_NOTE}
        items={items}
        title={t('profiles.privateTitle', { name: partnerName })}
        intro={t('profiles.privateIntro')}
        emptyTitle={t('profiles.emptyPrivateTitle')}
        emptyBody={t('profiles.emptyPrivateBody')}
      />
    </div>
  );
}

/** Composite preference section for backward compatibility. */
export function ProfilePreferencesSection({
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
  const { relationshipLabel } = usePartnerNickname();
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
  const spacesApi = useMemo(
    () => new SpacesApi(configuration),
    [configuration],
  );

  const spaceQuery = useQuery({
    queryKey: ['space', spaceId],
    queryFn: async () => {
      try {
        return await spacesApi.getSpaceApiV1SpacesSpaceIdGet({ spaceId });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
  });

  const preferencesQuery = useQuery({
    queryKey: ['profile-preferences', spaceId],
    queryFn: async () => {
      try {
        return await profilesApi.listProfilePreferencesApiV1SpacesSpaceIdProfilePreferencesGet(
          { spaceId },
        );
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
  const partnerName = partner
    ? relationshipLabel(
        partner.id,
        partner.displayName,
        t('couplePresencePartnerFallback'),
      )
    : '';

  const selfPreferences = preferencesQuery.data
    ? preferencesQuery.data.filter(
        (pref) =>
          pref.accountId === account.id &&
          pref.visibility === ProfileVisibility.SELF_PROFILE,
      )
    : [];

  const privatePartnerNotes =
    preferencesQuery.data && partner
      ? preferencesQuery.data.filter(
          (pref) =>
            pref.accountId === partner.id &&
            pref.visibility === ProfileVisibility.PRIVATE_PARTNER_NOTE,
        )
      : [];

  return (
    <div className="profile-preferences-section">
      {preferencesQuery.isLoading ? (
        <UiState kind="loading" title={t('profiles.preferencesLoading')} />
      ) : null}
      {preferencesQuery.error ? (
        <ProblemState
          error={preferencesQuery.error}
          onRetry={() => void preferencesQuery.refetch()}
        />
      ) : null}
      {preferencesQuery.data ? (
        <SelfPreferencesSection
          profilesApi={profilesApi}
          spaceId={spaceId}
          accountId={account.id}
          items={selfPreferences}
        />
      ) : null}

      {partner ? (
        <>
          <div className="profile-partner-block">
            <PartnerIdentityPanel
              apiBaseUrl={apiBaseUrl}
              accessToken={accessToken}
              account={account}
              spaceId={spaceId}
            />
            <PartnerProfileSection
              profilesApi={profilesApi}
              spaceId={spaceId}
              partnerId={partner.id}
              partnerName={partnerName}
            />
          </div>
          {preferencesQuery.data ? (
            <PrivatePartnerNotesSection
              profilesApi={profilesApi}
              spaceId={spaceId}
              partnerId={partner.id}
              partnerName={partnerName}
              items={privatePartnerNotes}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export const ProfilePage = ProfilePreferencesSection;
