import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { AttachmentsApi } from '../api/generated/apis/AttachmentsApi';
import { ContentVisibility } from '../api/generated/models/ContentVisibility';
import { PersonRelationship } from '../api/generated/models/PersonRelationship';
import type { RelatedPersonFields } from '../api/generated/models/RelatedPersonFields';
import type { RelatedPersonView } from '../api/generated/models/RelatedPersonView';
import {
  type DraftUploadPhase,
  uploadMemoryDraftAttachment,
} from '../client/memoryAttachmentDraft';
import {
  createOwnedObjectUrl,
  type OwnedObjectUrl,
} from '../client/objectUrlResource';
import { createReferenceApis } from '../client/referenceFlow';
import {
  birthdayFromInput,
  birthdayInputParts,
  daysInMonth,
} from '../client/relatedPersonBirthday';
import { useEditorHistoryEntry } from '../client/useEditorHistoryEntry';
import { useRelatedPersonAvatarUrl } from '../client/useRelatedPersonAvatarUrl';
import { useTranslation } from '../i18n';
import { DestinationIcon } from './DestinationIcon';
import { personInitials } from './PersonIdentity';
import { ProblemState } from './ProblemState';
import { containModalTabFocus, useModalLifecycle } from './useModalLifecycle';

const RELATIONSHIPS = Object.values(PersonRelationship);
const VISIBILITIES = Object.values(ContentVisibility);

function dateInputValue(value: Date | null): string {
  if (!value) return '';
  return value.toISOString().slice(0, 10);
}

function personFields(
  form: FormData,
  avatarAttachmentId: string | null,
): RelatedPersonFields {
  const birthdayYearKnown = form.get('birthdayYearKnown') === 'on';
  const birthday = birthdayFromInput({
    yearKnown: birthdayYearKnown,
    dateValue: String(form.get('birthday') || ''),
    monthValue: String(form.get('birthdayMonth') || ''),
    dayValue: String(form.get('birthdayDay') || ''),
  });

  return {
    displayName: String(form.get('displayName') || '').trim(),
    relationship: String(
      form.get('relationship'),
    ) as RelatedPersonFields['relationship'],
    visibility: String(
      form.get('visibility'),
    ) as RelatedPersonFields['visibility'],
    birthday,
    birthdayYearKnown: Boolean(birthday && birthdayYearKnown),
    showBirthdayOnDashboard: Boolean(
      birthday && form.get('showBirthdayOnDashboard') === 'on',
    ),
    avatarAttachmentId: avatarAttachmentId || undefined,
  };
}

export function RelatedPersonEditorSheet({
  person,
  pending,
  error,
  spaceId,
  apiBaseUrl,
  accessToken,
  attachmentsApi,
  onCancel,
  onSubmit,
  onDeleteRequest,
}: {
  person: RelatedPersonView | null;
  pending: boolean;
  error: Error | null;
  spaceId: string;
  apiBaseUrl?: string;
  accessToken?: string;
  attachmentsApi?: AttachmentsApi | null;
  onCancel: () => void;
  onSubmit: (fields: RelatedPersonFields) => void;
  onDeleteRequest?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialDraft = useMemo(() => {
    const birthdayParts = birthdayInputParts(person?.birthday ?? null);
    return {
      avatarAttachmentId: person?.avatarAttachmentId ?? null,
      birthdayDay: birthdayParts.dayValue,
      birthdayMonth: birthdayParts.monthValue,
      birthdayYearKnown: person?.birthday ? person.birthdayYearKnown : true,
      displayName: person?.displayName ?? '',
      knownBirthday:
        person?.birthday && person.birthdayYearKnown
          ? dateInputValue(person.birthday)
          : '',
      relationship: person?.relationship ?? PersonRelationship.OTHER,
      showBirthdayOnDashboard: person?.birthday
        ? person.showBirthdayOnDashboard
        : false,
      visibility: person?.visibility ?? ContentVisibility.SHARED,
    };
  }, [person]);
  const [displayName, setDisplayName] = useState(initialDraft.displayName);
  const [relationship, setRelationship] = useState(initialDraft.relationship);
  const [birthdayYearKnown, setBirthdayYearKnown] = useState(
    initialDraft.birthdayYearKnown,
  );
  const [knownBirthday, setKnownBirthday] = useState(
    initialDraft.knownBirthday,
  );
  const [birthdayMonth, setBirthdayMonth] = useState(
    initialDraft.birthdayMonth,
  );
  const [birthdayDay, setBirthdayDay] = useState(initialDraft.birthdayDay);
  const [showBirthdayOnDashboard, setShowBirthdayOnDashboard] = useState(
    initialDraft.showBirthdayOnDashboard,
  );
  const [visibility, setVisibility] = useState(initialDraft.visibility);

  const [currentAvatarId, setCurrentAvatarId] = useState<string | null>(
    initialDraft.avatarAttachmentId,
  );
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [uploadPhase, setUploadPhase] = useState<DraftUploadPhase | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const { avatarUrl: existingAvatarUrl } = useRelatedPersonAvatarUrl(
    attachmentsApi,
    spaceId,
    person?.avatarAttachmentId,
  );
  const displayedAvatarUrl =
    avatarPreviewUrl || (currentAvatarId ? existingAvatarUrl : null);
  const initials = useMemo(
    () => (person ? personInitials(person.displayName) : '?'),
    [person],
  );

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => ({
        value: String(index + 1),
        label: new Intl.DateTimeFormat(i18n.language, {
          month: 'long',
          timeZone: 'UTC',
        }).format(new Date(Date.UTC(2000, index, 1))),
      })),
    [i18n.language],
  );
  const birthdayPartRequired = Boolean(birthdayMonth || birthdayDay);
  const hasBirthday = birthdayYearKnown
    ? Boolean(knownBirthday)
    : Boolean(birthdayMonth && birthdayDay);
  const isDirty = useMemo(
    () =>
      displayName !== initialDraft.displayName ||
      relationship !== initialDraft.relationship ||
      birthdayYearKnown !== initialDraft.birthdayYearKnown ||
      knownBirthday !== initialDraft.knownBirthday ||
      birthdayMonth !== initialDraft.birthdayMonth ||
      birthdayDay !== initialDraft.birthdayDay ||
      showBirthdayOnDashboard !== initialDraft.showBirthdayOnDashboard ||
      visibility !== initialDraft.visibility ||
      currentAvatarId !== initialDraft.avatarAttachmentId ||
      avatarPreviewUrl !== null,
    [
      avatarPreviewUrl,
      birthdayDay,
      birthdayMonth,
      birthdayYearKnown,
      currentAvatarId,
      displayName,
      initialDraft,
      knownBirthday,
      relationship,
      showBirthdayOnDashboard,
      visibility,
    ],
  );

  useEffect(() => {
    if (!hasBirthday) setShowBirthdayOnDashboard(false);
  }, [hasBirthday]);

  const previewResourceRef = useRef<OwnedObjectUrl | null>(null);
  const setPreviewFile = useCallback((file: File | null) => {
    previewResourceRef.current?.dispose();
    const resource = file ? createOwnedObjectUrl(file) : null;
    previewResourceRef.current = resource;
    setAvatarPreviewUrl(resource?.url ?? null);
  }, []);

  useEffect(() => {
    return () => {
      previewResourceRef.current?.dispose();
      previewResourceRef.current = null;
    };
  }, []);

  useModalLifecycle({
    active: true,
    initialFocusRef: nameInputRef,
  });

  const closeEditor = useEditorHistoryEntry({
    isDirty,
    isCloseBlocked: pending || Boolean(uploadPhase),
    onDiscardRequested: () => setShowDiscardConfirm(true),
    onClose: onCancel,
  });

  const handleCloseAttempt = useCallback(() => {
    if (pending || uploadPhase) return;
    if (isDirty) {
      setShowDiscardConfirm(true);
      return;
    }
    closeEditor();
  }, [closeEditor, isDirty, pending, uploadPhase]);

  useEffect(() => {
    const backdrop = backdropRef.current;
    if (!backdrop) return;

    function handleBackdropClick(event: MouseEvent) {
      if (event.target === backdrop) handleCloseAttempt();
    }

    backdrop.addEventListener('click', handleBackdropClick);
    return () => backdrop.removeEventListener('click', handleBackdropClick);
  }, [handleCloseAttempt]);

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && !pending && !uploadPhase) {
      event.preventDefault();
      if (showDiscardConfirm) {
        setShowDiscardConfirm(false);
      } else {
        handleCloseAttempt();
      }
      return;
    }
    containModalTabFocus(event, dialogRef.current, { visibleOnly: true });
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    if (!file.type.startsWith('image/')) {
      setUploadError(t('flow.imageOnly'));
      return;
    }

    if (apiBaseUrl && accessToken) {
      try {
        const referenceApis = createReferenceApis(apiBaseUrl, accessToken);
        const ready = await uploadMemoryDraftAttachment(
          referenceApis,
          apiBaseUrl,
          accessToken,
          spaceId,
          file,
          setUploadPhase,
        );
        setCurrentAvatarId(ready.attachmentId);
        setPreviewFile(file);
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : t('flow.uploadFailed'),
        );
      } finally {
        setUploadPhase(null);
      }
      return;
    }

    setPreviewFile(file);
  }

  function handleAvatarRemove() {
    setCurrentAvatarId(null);
    setPreviewFile(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(personFields(new FormData(event.currentTarget), currentAvatarId));
  }

  const privacyIcon =
    visibility === ContentVisibility.PRIVATE ? 'private' : 'people';

  return (
    <div
      ref={backdropRef}
      className="focused-editor-backdrop"
      role="presentation"
    >
      <section
        ref={dialogRef}
        className="focused-editor-sheet related-person-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="related-person-editor-title"
        onKeyDown={handleDialogKeyDown}
      >
        <header className="focused-editor-header">
          <div className="focused-editor-heading">
            <span className="focused-editor-kicker">{t('people.eyebrow')}</span>
            <h2 id="related-person-editor-title">
              {person ? t('people.editTitle') : t('people.createTitle')}
            </h2>
          </div>
          <button
            type="button"
            className="focused-editor-close"
            onClick={handleCloseAttempt}
            aria-label={t('people.closeDialogAria')}
            disabled={pending || Boolean(uploadPhase)}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </header>

        <form
          key={person?.id ?? 'new'}
          className="focused-editor-form"
          onSubmit={submit}
        >
          <div className="focused-editor-scroll">
            <div className="focused-editor-stack">
              {showDiscardConfirm ? (
                <div
                  className="inline-message inline-message-danger focused-editor-confirmation"
                  role="alert"
                >
                  <strong>{t('people.discardTitle')}</strong>
                  <span>{t('people.discardBody')}</span>
                  <div className="form-actions choice-row">
                    <button
                      type="button"
                      className="secondary compact-action"
                      onClick={() => setShowDiscardConfirm(false)}
                    >
                      {t('people.keepEditing')}
                    </button>
                    <button
                      type="button"
                      className="danger compact-action"
                      onClick={closeEditor}
                    >
                      {t('people.discardConfirm')}
                    </button>
                  </div>
                </div>
              ) : null}

              <section
                className="focused-editor-primary"
                aria-labelledby="related-person-identity-title"
              >
                <div className="focused-editor-section-heading">
                  <h3 id="related-person-identity-title">
                    {t('people.identitySectionTitle')}
                  </h3>
                  <p>{t('people.identitySectionHelp')}</p>
                </div>

                <div className="related-person-identity-row">
                  <div className="people-editor-avatar" aria-hidden="true">
                    {displayedAvatarUrl ? (
                      <img src={displayedAvatarUrl} alt="" />
                    ) : (
                      <span>{initials}</span>
                    )}
                  </div>
                  <div className="people-editor-avatar-actions">
                    <span className="field-label">
                      {t('people.avatarLabel')}
                    </span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="visually-hidden-file-input"
                      aria-label={t('people.avatarLabel')}
                    />
                    <div className="people-editor-avatar-buttons">
                      <button
                        type="button"
                        className="secondary compact-action"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={pending || Boolean(uploadPhase)}
                      >
                        {displayedAvatarUrl
                          ? t('people.avatarChange')
                          : t('people.avatarUpload')}
                      </button>
                      {displayedAvatarUrl ? (
                        <button
                          type="button"
                          className="tertiary compact-action"
                          onClick={handleAvatarRemove}
                          disabled={pending || Boolean(uploadPhase)}
                        >
                          {t('people.avatarRemove')}
                        </button>
                      ) : null}
                    </div>
                    {uploadPhase ? (
                      <small className="field-help" role="status">
                        {uploadPhase === 'validating'
                          ? t('people.avatarValidating')
                          : t('people.avatarUploading')}
                      </small>
                    ) : null}
                  </div>
                </div>

                {uploadError ? (
                  <p className="field-help field-error" role="alert">
                    {uploadError}
                  </p>
                ) : null}

                <div className="field-group">
                  <label htmlFor="related-person-name">
                    {t('people.nameLabel')}
                  </label>
                  <input
                    ref={nameInputRef}
                    id="related-person-name"
                    name="displayName"
                    required
                    maxLength={120}
                    value={displayName}
                    onChange={(event) =>
                      setDisplayName(event.currentTarget.value)
                    }
                    autoComplete="off"
                  />
                </div>

                <div className="field-group">
                  <label htmlFor="related-person-relationship">
                    {t('people.relationshipLabel')}
                  </label>
                  <select
                    id="related-person-relationship"
                    name="relationship"
                    value={relationship}
                    onChange={(event) =>
                      setRelationship(
                        event.currentTarget.value as PersonRelationship,
                      )
                    }
                  >
                    {RELATIONSHIPS.map((relationship) => (
                      <option key={relationship} value={relationship}>
                        {t(`people.relationship.${relationship}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </section>

              <details
                className="focused-editor-disclosure"
                open={person?.birthday ? true : undefined}
              >
                <summary>
                  <span>
                    <strong>{t('people.birthdayLabel')}</strong>
                    <small>{t('people.birthdayOptionalHelp')}</small>
                  </span>
                </summary>
                <div className="focused-editor-disclosure-content">
                  <label
                    className="choice-row"
                    htmlFor="related-person-birthday-year-known"
                  >
                    <input
                      id="related-person-birthday-year-known"
                      name="birthdayYearKnown"
                      type="checkbox"
                      checked={birthdayYearKnown}
                      onChange={(event) => {
                        const nextYearKnown = event.currentTarget.checked;
                        if (!nextYearKnown && knownBirthday) {
                          const knownDate = new Date(
                            `${knownBirthday}T00:00:00.000Z`,
                          );
                          setBirthdayMonth(String(knownDate.getUTCMonth() + 1));
                          setBirthdayDay(String(knownDate.getUTCDate()));
                        }
                        setBirthdayYearKnown(nextYearKnown);
                      }}
                    />
                    <span>{t('people.birthdayYearKnown')}</span>
                  </label>

                  {birthdayYearKnown ? (
                    <div className="field-group">
                      <label htmlFor="related-person-birthday">
                        {t('people.birthdayDateLabel')}
                      </label>
                      <input
                        id="related-person-birthday"
                        name="birthday"
                        type="date"
                        value={knownBirthday}
                        onChange={(event) =>
                          setKnownBirthday(event.currentTarget.value)
                        }
                      />
                    </div>
                  ) : (
                    <>
                      <div className="birthday-parts-grid">
                        <div className="field-group">
                          <label htmlFor="related-person-birthday-day">
                            {t('people.birthdayDayLabel')}
                          </label>
                          <input
                            id="related-person-birthday-day"
                            name="birthdayDay"
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={daysInMonth(Number(birthdayMonth))}
                            required={birthdayPartRequired}
                            value={birthdayDay}
                            onChange={(event) =>
                              setBirthdayDay(event.currentTarget.value)
                            }
                          />
                        </div>
                        <div className="field-group">
                          <label htmlFor="related-person-birthday-month">
                            {t('people.birthdayMonthLabel')}
                          </label>
                          <select
                            id="related-person-birthday-month"
                            name="birthdayMonth"
                            required={birthdayPartRequired}
                            value={birthdayMonth}
                            onChange={(event) =>
                              setBirthdayMonth(event.currentTarget.value)
                            }
                          >
                            <option value="">
                              {t('people.birthdayMonthPlaceholder')}
                            </option>
                            {monthOptions.map((month) => (
                              <option key={month.value} value={month.value}>
                                {month.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <p className="field-help">
                        {t('people.birthdayUnknownYearHelp')}
                      </p>
                    </>
                  )}

                  {hasBirthday ? (
                    <div className="birthday-dashboard-option">
                      <label
                        className="choice-row"
                        htmlFor="related-person-show-birthday-on-dashboard"
                      >
                        <input
                          id="related-person-show-birthday-on-dashboard"
                          name="showBirthdayOnDashboard"
                          type="checkbox"
                          checked={showBirthdayOnDashboard}
                          onChange={(event) =>
                            setShowBirthdayOnDashboard(
                              event.currentTarget.checked,
                            )
                          }
                        />
                        <span>{t('people.birthdayShowOnDashboard')}</span>
                      </label>
                      <p className="field-help">
                        {t('people.birthdayShowOnDashboardHelp')}
                      </p>
                    </div>
                  ) : null}
                </div>
              </details>

              <section
                className="focused-editor-privacy"
                aria-labelledby="related-person-privacy-title"
              >
                <span
                  className="focused-editor-privacy-icon"
                  aria-hidden="true"
                >
                  <DestinationIcon icon={privacyIcon} />
                </span>
                <div className="focused-editor-privacy-content">
                  <div className="focused-editor-section-heading compact">
                    <h3 id="related-person-privacy-title">
                      {t('people.visibilityLabel')}
                    </h3>
                    <p>{t('people.visibilityHelp')}</p>
                  </div>
                  <select
                    id="related-person-visibility"
                    name="visibility"
                    value={visibility}
                    aria-label={t('people.visibilityLabel')}
                    onChange={(event) =>
                      setVisibility(
                        event.currentTarget.value as ContentVisibility,
                      )
                    }
                  >
                    {VISIBILITIES.map((visibilityOption) => (
                      <option key={visibilityOption} value={visibilityOption}>
                        {t(`people.visibility.${visibilityOption}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </section>

              {error ? <ProblemState error={error} /> : null}

              {person && onDeleteRequest ? (
                <section
                  className="focused-editor-danger-zone"
                  aria-labelledby="related-person-lifecycle-title"
                >
                  <div className="focused-editor-section-heading compact">
                    <h3 id="related-person-lifecycle-title">
                      {t('people.lifecycleTitle')}
                    </h3>
                    <p>{t('people.lifecycleHelp')}</p>
                  </div>
                  <button
                    type="button"
                    className="secondary danger compact-action"
                    onClick={onDeleteRequest}
                    disabled={pending || Boolean(uploadPhase)}
                  >
                    {t('people.delete')}
                  </button>
                </section>
              ) : null}
            </div>
          </div>

          <footer className="focused-editor-actions">
            <button type="submit" disabled={pending || Boolean(uploadPhase)}>
              {pending
                ? t('people.saving')
                : person
                  ? t('people.saveChanges')
                  : t('people.create')}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={handleCloseAttempt}
              disabled={pending || Boolean(uploadPhase)}
            >
              {t('common.cancel')}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
