import { useDocumentLeaveGuard } from '../client/useDocumentLeaveGuard';
import { AvatarPhoto } from './AvatarPhoto';
import { PageHeader } from './PageHeader';
import { TaskBackButton } from './TaskBackButton';
import './PeopleProfiles.css';
import {
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
import { createReferenceApis } from '../client/referenceFlow';
import {
  birthdayFromInput,
  birthdayInputParts,
  daysInMonth,
} from '../client/relatedPersonBirthday';
import { useAttachmentDrafts } from '../client/useAttachmentDrafts';
import { useEditorHistoryEntry } from '../client/useEditorHistoryEntry';
import { useRelatedPersonAvatarUrl } from '../client/useRelatedPersonAvatarUrl';
import { useTranslation } from '../i18n';
import { MediaDropZone } from './MediaDropZone';
import { PhotoSourcePicker } from './PhotoSourcePicker';
import { MediaActionGroup } from './MediaActionGroup';
import { AddActionButton } from './AddAction';
import { ProblemState } from './ProblemState';

const RELATIONSHIPS: PersonRelationship[] = [
  PersonRelationship.DAUGHTER,
  PersonRelationship.SON,
  PersonRelationship.MOTHER,
  PersonRelationship.FATHER,
  PersonRelationship.SISTER,
  PersonRelationship.BROTHER,
  PersonRelationship.GRANDMOTHER,
  PersonRelationship.GRANDFATHER,
  PersonRelationship.GRANDDAUGHTER,
  PersonRelationship.GRANDSON,
  PersonRelationship.MOTHER_IN_LAW,
  PersonRelationship.FATHER_IN_LAW,
  PersonRelationship.AUNT,
  PersonRelationship.UNCLE,
  PersonRelationship.COUSIN,
  PersonRelationship.RELATIVE,
  PersonRelationship.FRIEND,
  PersonRelationship.ACQUAINTANCE,
  PersonRelationship.COLLEAGUE,
  PersonRelationship.OTHER,
];

function dateInputValue(value: Date | null): string {
  if (!value) return '';
  return value.toISOString().slice(0, 10);
}

function personFields(
  form: FormData,
  avatarAttachmentId: string | null,
): RelatedPersonFields {
  const month = String(form.get('birthdayMonth') || '');
  const day = String(form.get('birthdayDay') || '');
  const year = String(form.get('birthdayYear') || '');
  const birthdayYearKnown = Boolean(year && month && day);
  const birthday = birthdayFromInput({
    yearKnown: birthdayYearKnown,
    dateValue: birthdayYearKnown
      ? `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      : '',
    monthValue: month,
    dayValue: day,
  });

  return {
    displayName: String(form.get('displayName') || '').trim(),
    note: String(form.get('note') || '').trim(),
    relationship: String(
      form.get('relationship'),
    ) as RelatedPersonFields['relationship'],
    visibility: ContentVisibility.SHARED,
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
  accountId,
  attachmentsApi,
  onCancel,
  onSubmit,
  onSaved,
}: {
  person: RelatedPersonView | null;
  pending: boolean;
  error: Error | null;
  spaceId: string;
  apiBaseUrl?: string;
  accessToken?: string;
  accountId?: string;
  attachmentsApi?: AttachmentsApi | null;
  onCancel: () => void;
  onSubmit: (fields: RelatedPersonFields) => Promise<RelatedPersonView>;
  onSaved: (person: RelatedPersonView) => void;
}) {
  const { t, i18n } = useTranslation();
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
      note: person?.note ?? '',
      knownBirthday:
        person?.birthday && person.birthdayYearKnown
          ? dateInputValue(person.birthday)
          : '',
      relationship: person?.relationship ?? PersonRelationship.OTHER,
      showBirthdayOnDashboard: person?.birthday
        ? person.showBirthdayOnDashboard
        : false,
    };
  }, [person]);
  const [displayName, setDisplayName] = useState(initialDraft.displayName);
  const [note, setNote] = useState(initialDraft.note);
  const [relationship, setRelationship] = useState(initialDraft.relationship);
  const [birthdayYear, setBirthdayYear] = useState(
    initialDraft.birthdayYearKnown
      ? initialDraft.knownBirthday.slice(0, 4)
      : '',
  );
  const [birthdayMonth, setBirthdayMonth] = useState(
    initialDraft.birthdayMonth,
  );
  const [birthdayDay, setBirthdayDay] = useState(initialDraft.birthdayDay);
  const [showBirthdayOnDashboard, setShowBirthdayOnDashboard] = useState(
    initialDraft.showBirthdayOnDashboard,
  );

  const [currentAvatarId, setCurrentAvatarId] = useState<string | null>(
    initialDraft.avatarAttachmentId,
  );
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const referenceApis = useMemo(
    () => createReferenceApis(apiBaseUrl ?? '', accessToken ?? ''),
    [apiBaseUrl, accessToken],
  );
  const avatarDrafts = useAttachmentDrafts({
    apis: referenceApis,
    apiBaseUrl: apiBaseUrl ?? '',
    accessToken: accessToken ?? '',
    spaceId,
    accountId: accountId ?? '',
    resourceKey: `related-person:${person?.id ?? 'new'}`,
    maxAttachments: 1,
    preserveMetadata: false,
  });
  const avatarDraft = avatarDrafts.items[0];
  const avatarPreviewUrl = avatarDraft?.previewUrl ?? null;
  const uploadPhase = avatarDrafts.hasPending ? avatarDraft?.status : null;
  const uploadError = selectionError ?? avatarDraft?.error;
  const avatarNotReady = Boolean(avatarDraft && avatarDraft.status !== 'ready');
  const avatarId = avatarDraft
    ? (avatarDraft.attachmentId ?? null)
    : currentAvatarId;
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const { avatarUrl: existingAvatarUrl } = useRelatedPersonAvatarUrl(
    attachmentsApi,
    spaceId,
    person?.avatarAttachmentId,
  );
  const displayedAvatarUrl =
    avatarPreviewUrl || (currentAvatarId ? existingAvatarUrl : null);

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
  const birthdayPartRequired = Boolean(
    birthdayMonth || birthdayDay || birthdayYear,
  );
  const hasBirthday = Boolean(birthdayMonth && birthdayDay);
  const isDirty = useMemo(
    () =>
      displayName !== initialDraft.displayName ||
      note !== initialDraft.note ||
      relationship !== initialDraft.relationship ||
      birthdayYear !==
        (initialDraft.birthdayYearKnown
          ? initialDraft.knownBirthday.slice(0, 4)
          : '') ||
      birthdayMonth !== initialDraft.birthdayMonth ||
      birthdayDay !== initialDraft.birthdayDay ||
      showBirthdayOnDashboard !== initialDraft.showBirthdayOnDashboard ||
      currentAvatarId !== initialDraft.avatarAttachmentId ||
      avatarPreviewUrl !== null,
    [
      avatarPreviewUrl,
      birthdayDay,
      birthdayMonth,
      birthdayYear,
      currentAvatarId,
      displayName,
      initialDraft,
      note,
      relationship,
      showBirthdayOnDashboard,
    ],
  );

  useEffect(() => {
    if (!hasBirthday) setShowBirthdayOnDashboard(false);
  }, [hasBirthday]);

  useDocumentLeaveGuard(isDirty || pending || Boolean(uploadPhase));

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
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      // Nested photo/source dialogs own Escape before the focused page does.
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        document.querySelector('[role="dialog"]')
      )
        return;
      event.preventDefault();
      if (showDiscardConfirm) setShowDiscardConfirm(false);
      else handleCloseAttempt();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handleCloseAttempt, showDiscardConfirm]);

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    // Portalled source tasks own their keyboard and native dialog focus.
    if (!event.currentTarget.contains(event.target as Node)) return;
    if (event.key === 'Escape' && !pending && !uploadPhase) {
      event.preventDefault();
      if (showDiscardConfirm) {
        setShowDiscardConfirm(false);
      } else {
        handleCloseAttempt();
      }
      return;
    }
  }

  function selectAvatar(file?: File) {
    if (!file || pending || uploadPhase) return;

    setSelectionError(null);
    if (!file.type.startsWith('image/')) {
      setSelectionError(t('flow.imageOnly'));
      return;
    }

    for (const draft of avatarDrafts.items) avatarDrafts.remove(draft.id);
    avatarDrafts.addFiles([file]);
  }

  function handleAvatarRemove() {
    setCurrentAvatarId(null);
    for (const draft of avatarDrafts.items) avatarDrafts.remove(draft.id);
    setSelectionError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || avatarNotReady) return;
    const form = event.currentTarget;
    const fields = personFields(new FormData(form), avatarId);
    if (
      fields.birthday &&
      (fields.birthday.getUTCDate() !== Number(birthdayDay) ||
        fields.birthday.getUTCMonth() + 1 !== Number(birthdayMonth))
    ) {
      const day = form.elements.namedItem('birthdayDay') as HTMLInputElement;
      day.setCustomValidity(t('people.invalidBirthday'));
      day.reportValidity();
      day.addEventListener('input', () => day.setCustomValidity(''), {
        once: true,
      });
      return;
    }
    try {
      const saved = await onSubmit(fields);
      closeEditor(() => onSaved(saved));
    } catch {
      /* The mutation presents the failure without discarding this draft. */
    }
  }

  return (
    <section
      className="page page-reading person-editor-page"
      aria-label={t('people.formRailAria')}
      onKeyDown={handleDialogKeyDown}
    >
      <TaskBackButton
        onClick={handleCloseAttempt}
        disabled={pending || Boolean(uploadPhase)}
      />
      <PageHeader
        title={person ? t('people.editTitle') : t('people.createTitle')}
      />
      <form
        onInput={(event) => {
          const day = event.currentTarget.elements.namedItem(
            'birthdayDay',
          ) as HTMLInputElement | null;
          day?.setCustomValidity('');
        }}
        onSubmit={(event) => void submit(event)}
        className="people-editor-form"
      >
        {showDiscardConfirm ? (
          <div className="inline-message inline-message-danger" role="alert">
            <strong>{t('people.discardTitle')}</strong>
            <div className="form-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setShowDiscardConfirm(false)}
              >
                {t('people.keepEditing')}
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => closeEditor()}
              >
                {t('people.discardConfirm')}
              </button>
            </div>
          </div>
        ) : null}
        <MediaDropZone
          multiple={false}
          disabled={pending || Boolean(uploadPhase)}
          onFiles={(files) => selectAvatar(files[0])}
        >
          <div className="people-editor-photo">
            <AvatarPhoto
              name={displayName || '?'}
              url={displayedAvatarUrl}
              identity={`${spaceId}:person-editor:${person?.id ?? 'new'}:${avatarId}`}
            />
            <details className="people-photo-options">
              <summary>
                {displayedAvatarUrl
                  ? t('people.avatarChange')
                  : t('people.avatarUpload')}
              </summary>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label={t('people.avatarUpload')}
                  onChange={(event) =>
                    selectAvatar(event.currentTarget.files?.[0])
                  }
                />
                <MediaActionGroup>
                  {apiBaseUrl && accessToken && accountId ? (
                    <PhotoSourcePicker
                      apiBaseUrl={apiBaseUrl}
                      accessToken={accessToken}
                      spaceId={spaceId}
                      accountId={accountId}
                      remaining={1}
                      disabled={pending || Boolean(uploadPhase)}
                      beginSelection={() => {
                        const ticket = avatarDrafts.beginSelection();
                        return {
                          ...ticket,
                          commit: (files) => {
                            if (ticket.signal.aborted || !files.length)
                              return false;
                            if (!files[0].type.startsWith('image/')) {
                              setSelectionError(t('flow.imageOnly'));
                              return false;
                            }
                            setSelectionError(null);
                            for (const draft of avatarDrafts.items)
                              avatarDrafts.remove(draft.id);
                            return ticket.commit(files.slice(0, 1));
                          },
                        };
                      }}
                      devicePicker={(close) => (
                        <AddActionButton
                          label={t('people.avatarUpload')}
                          onClick={() => {
                            fileInputRef.current?.click();
                            close();
                          }}
                        />
                      )}
                    />
                  ) : (
                    <AddActionButton
                      label={t('people.avatarUpload')}
                      onClick={() => fileInputRef.current?.click()}
                    />
                  )}
                </MediaActionGroup>
                {displayedAvatarUrl ? (
                  <button
                    type="button"
                    className="tertiary danger"
                    onClick={handleAvatarRemove}
                    disabled={pending || Boolean(uploadPhase)}
                  >
                    {t('people.avatarRemove')}
                  </button>
                ) : null}
              </div>
            </details>
          </div>
        </MediaDropZone>
        {uploadPhase ? (
          <p className="field-help" role="status">
            {t(
              uploadPhase === 'validating'
                ? 'people.avatarValidating'
                : 'people.avatarUploading',
            )}
          </p>
        ) : null}
        {uploadError ? (
          <div className="field-error" role="alert">
            <p>{uploadError}</p>
            {avatarDraft?.status === 'failed' ? (
              <button
                type="button"
                onClick={() => avatarDrafts.retry(avatarDraft)}
              >
                {t('common.retry')}
              </button>
            ) : null}
          </div>
        ) : null}
        <label className="field-group" htmlFor="related-person-name">
          {t('people.nameLabel')}
          <input
            ref={nameInputRef}
            id="related-person-name"
            name="displayName"
            required
            maxLength={120}
            value={displayName}
            autoComplete="off"
            onChange={(event) => setDisplayName(event.currentTarget.value)}
          />
        </label>
        <label className="field-group" htmlFor="related-person-relationship">
          {t('people.relationshipLabel')}
          <select
            id="related-person-relationship"
            name="relationship"
            value={relationship}
            onChange={(event) =>
              setRelationship(event.currentTarget.value as PersonRelationship)
            }
          >
            {!RELATIONSHIPS.includes(relationship) ? (
              <option value={relationship}>
                {t(`people.relationship.${relationship}`)}
              </option>
            ) : null}
            {RELATIONSHIPS.map((value) => (
              <option key={value} value={value}>
                {t(`people.relationship.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <details
          className="people-birthday-options"
          open={person?.birthday ? true : undefined}
        >
          <summary>{t('people.birthdayLabel')}</summary>
          <div className="people-birthday-parts">
            <label className="field-group">
              {t('people.birthdayDayLabel')}
              <input
                name="birthdayDay"
                type="number"
                inputMode="numeric"
                min={1}
                max={daysInMonth(Number(birthdayMonth))}
                required={birthdayPartRequired}
                value={birthdayDay}
                onChange={(event) => setBirthdayDay(event.currentTarget.value)}
              />
            </label>
            <label className="field-group">
              {t('people.birthdayMonthLabel')}
              <select
                name="birthdayMonth"
                required={birthdayPartRequired}
                value={birthdayMonth}
                onChange={(event) =>
                  setBirthdayMonth(event.currentTarget.value)
                }
              >
                <option value="">{t('people.birthdayMonthPlaceholder')}</option>
                {monthOptions.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-group">
              {t('people.optionalYear')}
              <input
                name="birthdayYear"
                type="number"
                inputMode="numeric"
                min={1}
                max={9999}
                value={birthdayYear}
                onChange={(event) => setBirthdayYear(event.currentTarget.value)}
              />
            </label>
          </div>
          {hasBirthday ? (
            <label className="choice-row">
              <input
                name="showBirthdayOnDashboard"
                type="checkbox"
                checked={showBirthdayOnDashboard}
                onChange={(event) =>
                  setShowBirthdayOnDashboard(event.currentTarget.checked)
                }
              />
              {t('people.birthdayShowOnDashboard')}
            </label>
          ) : null}
        </details>
        <label className="field-group" htmlFor="related-person-note">
          {t('people.noteLabel')}
          <textarea
            id="related-person-note"
            name="note"
            rows={3}
            disabled={pending}
            maxLength={2000}
            value={note}
            placeholder={t('people.notePlaceholder')}
            onChange={(event) => setNote(event.currentTarget.value)}
          />
        </label>
        {error ? <ProblemState error={error} /> : null}
        <footer className="people-editor-footer">
          <button type="submit" disabled={pending || avatarNotReady}>
            {t(pending ? 'people.saving' : 'people.saveChanges')}
          </button>
        </footer>
      </form>
    </section>
  );
}
