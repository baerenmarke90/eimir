import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import type { PeopleApi } from '../api/generated/apis/PeopleApi';
import { ContentVisibility } from '../api/generated/models/ContentVisibility';
import { DateRepeat } from '../api/generated/models/DateRepeat';
import { ImportantDateType } from '../api/generated/models/ImportantDateType';
import type { ImportantDateView } from '../api/generated/models/ImportantDateView';
import type { RelatedPersonView } from '../api/generated/models/RelatedPersonView';
import { invalidateDashboard } from '../client/dashboardQueries';
import {
  deleteFocusTarget,
  type DeleteFocusTarget,
} from '../client/deleteFocusTarget';
import {
  EMPTY_IMPORTANT_DATE_DRAFT,
  IMPORTANT_DATE_LABEL_MAX_LENGTH,
  type ImportantDateDraft,
  importantDateFieldsFromDraft,
} from '../client/importantDateDraft';
import { normalizeClientError } from '../client/problemDetails';
import { useEditorHistoryEntry } from '../client/useEditorHistoryEntry';
import { useTranslation } from '../i18n';
import { AddIcon, DestinationIcon } from './DestinationIcon';
import { ProblemState } from './ProblemState';
import { containModalTabFocus, useModalLifecycle } from './useModalLifecycle';
import { UiState } from './UiState';

const DATE_TYPES = Object.values(ImportantDateType);
const DATE_REPEATS = Object.values(DateRepeat);
const VISIBILITIES = Object.values(ContentVisibility);

function dateInputValue(value: Date | null | undefined): string {
  if (!value) return '';
  return value.toISOString().slice(0, 10);
}

function ImportantDateEditorSheet({
  date,
  people,
  pending,
  error,
  deletePending,
  deleteError,
  onClose,
  onSubmit,
  onDelete,
}: {
  date: ImportantDateView | null;
  people: RelatedPersonView[];
  pending: boolean;
  error: unknown;
  deletePending: boolean;
  deleteError: unknown;
  onClose: () => void;
  onSubmit: (draft: ImportantDateDraft) => void;
  onDelete: (target: ImportantDateView) => void;
}) {
  const { t } = useTranslation();
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const initialInputRef = useRef<HTMLInputElement>(null);

  const initialDraft = useMemo<ImportantDateDraft>(() => {
    if (!date) return EMPTY_IMPORTANT_DATE_DRAFT;
    return {
      date: dateInputValue(date.date),
      label: date.label,
      relatedPersonId: date.relatedPersonId ?? '',
      repeats: date.repeats,
      type: date.type,
      visibility: date.visibility,
    };
  }, [date]);

  const [label, setLabel] = useState(initialDraft.label);
  const [dateVal, setDateVal] = useState(initialDraft.date);
  const [type, setType] = useState<ImportantDateDraft['type']>(
    initialDraft.type,
  );
  const [repeats, setRepeats] = useState<ImportantDateDraft['repeats']>(
    initialDraft.repeats,
  );
  const [relatedPersonId, setRelatedPersonId] = useState(
    initialDraft.relatedPersonId,
  );
  const [visibility, setVisibility] = useState<
    ImportantDateDraft['visibility']
  >(initialDraft.visibility);
  const [detailsOpen, setDetailsOpen] = useState(Boolean(date));
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isDirty = useMemo(
    () =>
      label !== initialDraft.label ||
      dateVal !== initialDraft.date ||
      type !== initialDraft.type ||
      repeats !== initialDraft.repeats ||
      relatedPersonId !== initialDraft.relatedPersonId ||
      visibility !== initialDraft.visibility,
    [dateVal, initialDraft, label, relatedPersonId, repeats, type, visibility],
  );

  const closeEditor = useEditorHistoryEntry({
    isDirty,
    isCloseBlocked: pending || deletePending,
    onDiscardRequested: () => setShowDiscardConfirm(true),
    onClose,
  });

  const handleCloseAttempt = useCallback(() => {
    if (pending || deletePending) return;
    if (isDirty) {
      setShowDiscardConfirm(true);
      return;
    }
    closeEditor();
  }, [closeEditor, deletePending, isDirty, pending]);

  useModalLifecycle({
    active: true,
    initialFocusRef: initialInputRef,
  });

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
    if (event.key === 'Escape' && !pending && !deletePending) {
      event.preventDefault();
      if (showDeleteConfirm) {
        setShowDeleteConfirm(false);
      } else if (showDiscardConfirm) {
        setShowDiscardConfirm(false);
      } else {
        handleCloseAttempt();
      }
      return;
    }
    containModalTabFocus(event, dialogRef.current, { visibleOnly: true });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      date: dateVal,
      label,
      relatedPersonId,
      repeats,
      type,
      visibility,
    });
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
        className="focused-editor-sheet important-date-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="important-date-editor-title"
        onKeyDown={handleDialogKeyDown}
      >
        <header className="focused-editor-header">
          <div className="focused-editor-heading">
            <span className="focused-editor-kicker">
              {t('importantDates.heading')}
            </span>
            <h2 id="important-date-editor-title">
              {date
                ? t('importantDates.editTitle')
                : t('importantDates.createTitle')}
            </h2>
          </div>
          <button
            type="button"
            className="focused-editor-close"
            onClick={handleCloseAttempt}
            aria-label={t('importantDates.closeDialogAria')}
            disabled={pending || deletePending}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </header>

        <form className="focused-editor-form" onSubmit={handleSubmit}>
          <div className="focused-editor-scroll">
            <div className="focused-editor-stack">
              {showDeleteConfirm && date ? (
                <div
                  className="inline-message inline-message-danger focused-editor-confirmation"
                  role="alert"
                >
                  <strong>{t('importantDates.deleteQuestion')}</strong>
                  <span>{t('importantDates.deleteBody')}</span>
                  {deleteError ? <ProblemState error={deleteError} /> : null}
                  <div className="form-actions choice-row">
                    <button
                      type="button"
                      className="secondary compact-action"
                      disabled={deletePending}
                      onClick={() => setShowDeleteConfirm(false)}
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="button"
                      className="danger compact-action"
                      disabled={deletePending}
                      onClick={() => onDelete(date)}
                    >
                      {deletePending
                        ? t('importantDates.deleting')
                        : t('importantDates.deleteConfirm')}
                    </button>
                  </div>
                </div>
              ) : null}

              {showDiscardConfirm ? (
                <div
                  className="inline-message inline-message-danger focused-editor-confirmation"
                  role="alert"
                >
                  <strong>{t('importantDates.discardTitle')}</strong>
                  <span>{t('importantDates.discardBody')}</span>
                  <div className="form-actions choice-row">
                    <button
                      type="button"
                      className="secondary compact-action"
                      onClick={() => setShowDiscardConfirm(false)}
                    >
                      {t('importantDates.keepEditing')}
                    </button>
                    <button
                      type="button"
                      className="danger compact-action"
                      onClick={closeEditor}
                    >
                      {t('importantDates.discardConfirm')}
                    </button>
                  </div>
                </div>
              ) : null}

              <section
                className="focused-editor-primary"
                aria-labelledby="important-date-meaning-title"
              >
                <div className="focused-editor-section-heading">
                  <h3 id="important-date-meaning-title">
                    {t('importantDates.meaningSectionTitle')}
                  </h3>
                  <p>{t('importantDates.meaningSectionHelp')}</p>
                </div>

                <div className="important-date-primary-grid">
                  <div className="field-group important-date-date-field">
                    <label htmlFor="important-date-date">
                      {t('importantDates.dateLabel')}
                    </label>
                    <input
                      ref={initialInputRef}
                      id="important-date-date"
                      name="date"
                      type="date"
                      required
                      value={dateVal}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setDateVal(event.target.value)
                      }
                    />
                  </div>

                  <div className="field-group">
                    <label htmlFor="important-date-label">
                      {t('importantDates.labelLabel')}
                    </label>
                    <input
                      id="important-date-label"
                      name="label"
                      required
                      maxLength={IMPORTANT_DATE_LABEL_MAX_LENGTH}
                      value={label}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setLabel(event.target.value)
                      }
                    />
                  </div>
                </div>
              </section>

              <section
                className="focused-editor-section"
                aria-labelledby="important-date-person-title"
              >
                <div className="focused-editor-section-heading compact">
                  <h3 id="important-date-person-title">
                    {t('importantDates.relationshipSectionTitle')}
                  </h3>
                  <p>{t('importantDates.relationshipSectionHelp')}</p>
                </div>
                <div className="field-group">
                  <label htmlFor="important-date-person">
                    {t('importantDates.personLabel')}
                  </label>
                  <select
                    id="important-date-person"
                    name="relatedPersonId"
                    value={relatedPersonId}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      setRelatedPersonId(event.target.value)
                    }
                  >
                    <option value="">{t('importantDates.personNone')}</option>
                    {people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              </section>

              <details
                className="focused-editor-disclosure"
                open={detailsOpen}
                onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
              >
                <summary>
                  <span>
                    <strong>{t('importantDates.detailsTitle')}</strong>
                    <small>
                      {t(`importantDates.type.${type}`)} ·{' '}
                      {t(`importantDates.repeats.${repeats}`)}
                    </small>
                  </span>
                </summary>
                <div className="focused-editor-disclosure-content important-date-details-grid">
                  <div className="field-group">
                    <label htmlFor="important-date-type">
                      {t('importantDates.typeLabel')}
                    </label>
                    <select
                      id="important-date-type"
                      name="type"
                      value={type}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        setType(
                          event.target.value as ImportantDateDraft['type'],
                        )
                      }
                    >
                      {DATE_TYPES.map((typeValue) => (
                        <option key={typeValue} value={typeValue}>
                          {t(`importantDates.type.${typeValue}`)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field-group">
                    <label htmlFor="important-date-repeat">
                      {t('importantDates.repeatLabel')}
                    </label>
                    <select
                      id="important-date-repeat"
                      name="repeats"
                      value={repeats}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        setRepeats(
                          event.target.value as ImportantDateDraft['repeats'],
                        )
                      }
                    >
                      {DATE_REPEATS.map((repeat) => (
                        <option key={repeat} value={repeat}>
                          {t(`importantDates.repeats.${repeat}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </details>

              <section
                className="focused-editor-privacy"
                aria-labelledby="important-date-privacy-title"
              >
                <span
                  className="focused-editor-privacy-icon"
                  aria-hidden="true"
                >
                  <DestinationIcon icon={privacyIcon} />
                </span>
                <div className="focused-editor-privacy-content">
                  <div className="focused-editor-section-heading compact">
                    <h3 id="important-date-privacy-title">
                      {t('importantDates.visibilityLabel')}
                    </h3>
                    <p>{t('importantDates.visibilityHelp')}</p>
                  </div>
                  <select
                    id="important-date-visibility"
                    name="visibility"
                    value={visibility}
                    aria-label={t('importantDates.visibilityLabel')}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      setVisibility(
                        event.target.value as ImportantDateDraft['visibility'],
                      )
                    }
                  >
                    {VISIBILITIES.map((visibilityValue) => (
                      <option key={visibilityValue} value={visibilityValue}>
                        {t(`importantDates.visibility.${visibilityValue}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </section>

              {error ? <ProblemState error={error} /> : null}

              {date ? (
                <section
                  className="focused-editor-danger-zone"
                  aria-labelledby="important-date-lifecycle-title"
                >
                  <div className="focused-editor-section-heading compact">
                    <h3 id="important-date-lifecycle-title">
                      {t('importantDates.lifecycleTitle')}
                    </h3>
                    <p>{t('importantDates.lifecycleHelp')}</p>
                  </div>
                  <button
                    type="button"
                    className="secondary danger compact-action"
                    disabled={pending || deletePending}
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    {t('importantDates.delete')}
                  </button>
                </section>
              ) : null}
            </div>
          </div>

          <footer className="focused-editor-actions">
            <button type="submit" disabled={pending || deletePending}>
              {pending
                ? t('importantDates.saving')
                : date
                  ? t('importantDates.saveChanges')
                  : t('importantDates.create')}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={pending || deletePending}
              onClick={handleCloseAttempt}
            >
              {t('common.cancel')}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export interface PartnerBirthdayProjection {
  accountId: string;
  birthday: Date;
  displayName: string;
}

export function ImportantDatesPanel({
  peopleApi,
  spaceId,
  people,
  partnerBirthday = null,
}: {
  peopleApi: PeopleApi;
  spaceId: string;
  people: RelatedPersonView[];
  partnerBirthday?: PartnerBirthdayProjection | null;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ImportantDateView | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [pendingDeleteFocus, setPendingDeleteFocus] =
    useState<DeleteFocusTarget | null>(null);
  const createActionRef = useRef<HTMLButtonElement>(null);
  const dateCardRefs = useRef(new Map<string, HTMLButtonElement>());

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'long',
        timeZone: 'UTC',
      }),
    [i18n.language],
  );
  const dateMarkerFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        day: '2-digit',
        month: 'short',
        timeZone: 'UTC',
      }),
    [i18n.language],
  );
  const personNames = useMemo(
    () => new Map(people.map((person) => [person.id, person.displayName])),
    [people],
  );

  const datesQuery = useQuery({
    queryKey: ['important-dates', spaceId],
    queryFn: async () => {
      try {
        return await peopleApi.listImportantDatesApiV1SpacesSpaceIdImportantDatesGet(
          { spaceId },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: async (draft: ImportantDateDraft) => {
      const importantDateFields = importantDateFieldsFromDraft(draft);
      try {
        if (editing) {
          return await peopleApi.updateImportantDateApiV1SpacesSpaceIdImportantDatesDateIdPut(
            {
              dateId: editing.id,
              spaceId,
              ifMatch: String(editing.version),
              importantDateFields,
            },
          );
        }
        return await peopleApi.createImportantDateApiV1SpacesSpaceIdImportantDatesPost(
          {
            spaceId,
            importantDateFields,
          },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: async () => {
      setSavedMessage(
        editing ? t('importantDates.updated') : t('importantDates.created'),
      );
      setEditing(null);
      setIsCreating(false);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['important-dates', spaceId],
        }),
        invalidateDashboard(queryClient, spaceId),
      ]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (target: ImportantDateView) => {
      try {
        await peopleApi.deleteImportantDateApiV1SpacesSpaceIdImportantDatesDateIdDelete(
          {
            dateId: target.id,
            spaceId,
            ifMatch: String(target.version),
          },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: async (_result, target) => {
      setPendingDeleteFocus(
        deleteFocusTarget(datesQuery.data ?? [], target.id),
      );
      setEditing(null);
      setIsCreating(false);
      setSavedMessage(t('importantDates.deleted'));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['important-dates', spaceId],
        }),
        invalidateDashboard(queryClient, spaceId),
      ]);
    },
  });

  const editorOpen = isCreating || Boolean(editing);

  useEffect(() => {
    if (!pendingDeleteFocus || editorOpen) return;
    const target =
      pendingDeleteFocus.kind === 'item'
        ? dateCardRefs.current.get(pendingDeleteFocus.id)
        : createActionRef.current;
    target?.focus();
    setPendingDeleteFocus(null);
  }, [editorOpen, pendingDeleteFocus]);

  return (
    <section
      className="important-dates-section"
      aria-labelledby="important-dates-title"
    >
      <div className="important-dates-intro-block">
        <div>
          <h2 id="important-dates-title">{t('importantDates.heading')}</h2>
          <p className="important-dates-intro">{t('importantDates.intro')}</p>
        </div>
        <button
          ref={createActionRef}
          type="button"
          className="secondary compact-action important-dates-create-action"
          onClick={() => {
            setEditing(null);
            setIsCreating(true);
            saveMutation.reset();
            deleteMutation.reset();
            setSavedMessage(null);
          }}
        >
          <AddIcon />
          <span>{t('importantDates.create')}</span>
        </button>
      </div>

      {savedMessage ? (
        <div className="inline-message inline-message-success" role="status">
          <span>{savedMessage}</span>
        </div>
      ) : null}

      {editorOpen ? (
        <ImportantDateEditorSheet
          date={editing}
          people={people}
          pending={saveMutation.isPending}
          error={saveMutation.error}
          deletePending={deleteMutation.isPending}
          deleteError={deleteMutation.error}
          onClose={() => {
            setEditing(null);
            setIsCreating(false);
            saveMutation.reset();
            deleteMutation.reset();
          }}
          onSubmit={(draft) => {
            setSavedMessage(null);
            saveMutation.mutate(draft);
          }}
          onDelete={(target) => {
            setSavedMessage(null);
            deleteMutation.mutate(target);
          }}
        />
      ) : null}

      <section aria-labelledby="important-dates-list-title">
        <div className="layout-section-head">
          <h3 id="important-dates-list-title">
            {t('importantDates.listTitle')}
          </h3>
        </div>

        {datesQuery.isLoading ? (
          <UiState kind="loading" title={t('importantDates.loading')} />
        ) : null}
        {datesQuery.error ? (
          <ProblemState
            error={datesQuery.error}
            onRetry={() => void datesQuery.refetch()}
          />
        ) : null}
        {datesQuery.data?.length === 0 && !partnerBirthday ? (
          <UiState
            kind="empty"
            title={t('importantDates.emptyTitle')}
            body={t('importantDates.emptyBody')}
          />
        ) : null}
        {datesQuery.data?.length || partnerBirthday ? (
          <ul className="important-dates-list">
            {partnerBirthday
              ? (() => {
                  const markerParts = dateMarkerFormatter.formatToParts(
                    partnerBirthday.birthday,
                  );
                  const markerDay =
                    markerParts.find((part) => part.type === 'day')?.value ?? '';
                  const markerMonth =
                    markerParts.find((part) => part.type === 'month')?.value ?? '';
                  const label = t('importantDates.partnerBirthdayLabel', {
                    name: partnerBirthday.displayName,
                  });
                  return (
                    <li
                      key={`partner-birthday-${partnerBirthday.accountId}`}
                      className="important-date-item"
                    >
                      <fieldset
                        className="important-date-card important-date-card-derived"
                        aria-label={[
                          label,
                          t('importantDates.repeats.ANNUALLY'),
                          t('importantDates.visibility.SHARED'),
                        ].join(' – ')}
                      >
                        <time
                          className="important-date-marker"
                          dateTime={dateInputValue(partnerBirthday.birthday)}
                        >
                          <span className="important-date-marker-day">
                            {markerDay}
                          </span>
                          <span className="important-date-marker-month">
                            {markerMonth}
                          </span>
                        </time>
                        <span className="important-date-timeline-body">
                          <span className="important-date-title">{label}</span>
                          <span className="important-date-person">
                            {t('importantDates.partnerBirthdayProfileSource', {
                              name: partnerBirthday.displayName,
                            })}
                          </span>
                          <span className="important-date-meta">
                            <span>{t('importantDates.type.BIRTHDAY')}</span>
                            <span aria-hidden="true">·</span>
                            <span>{t('importantDates.repeats.ANNUALLY')}</span>
                            <span aria-hidden="true">·</span>
                            <span className="important-date-visibility important-date-visibility-shared">
                              <span
                                className="important-date-visibility-icon"
                                aria-hidden="true"
                              >
                                <DestinationIcon icon="people" />
                              </span>
                              {t('importantDates.visibility.SHARED')}
                            </span>
                          </span>
                        </span>
                      </fieldset>
                    </li>
                  );
                })()
              : null}
            {datesQuery.data?.map((date) => {
              const linkedPersonName = date.relatedPersonId
                ? personNames.get(date.relatedPersonId)
                : undefined;
              const markerParts = dateMarkerFormatter.formatToParts(date.date);
              const markerDay =
                markerParts.find((part) => part.type === 'day')?.value ?? '';
              const markerMonth =
                markerParts.find((part) => part.type === 'month')?.value ?? '';

              return (
                <li key={date.id} className="important-date-item">
                  <button
                    ref={(element) => {
                      if (element) dateCardRefs.current.set(date.id, element);
                      else dateCardRefs.current.delete(date.id);
                    }}
                    type="button"
                    className="important-date-card"
                    onClick={() => {
                      setEditing(date);
                      setIsCreating(false);
                      saveMutation.reset();
                      deleteMutation.reset();
                      setSavedMessage(null);
                    }}
                    aria-label={[
                      dateFormatter.format(date.date),
                      date.label,
                      linkedPersonName
                        ? t('importantDates.linkedPerson', {
                            name: linkedPersonName,
                          })
                        : null,
                      t(`importantDates.visibility.${date.visibility}`),
                      t('importantDates.edit'),
                    ]
                      .filter(Boolean)
                      .join(' – ')}
                  >
                    <time
                      className="important-date-marker"
                      dateTime={dateInputValue(date.date)}
                    >
                      <span className="important-date-marker-day">
                        {markerDay}
                      </span>
                      <span className="important-date-marker-month">
                        {markerMonth}
                      </span>
                    </time>
                    <span className="important-date-timeline-body">
                      <span className="important-date-title">{date.label}</span>
                      {linkedPersonName ? (
                        <span className="important-date-person">
                          {t('importantDates.linkedPerson', {
                            name: linkedPersonName,
                          })}
                        </span>
                      ) : null}
                      <span className="important-date-meta">
                        <span>{t(`importantDates.type.${date.type}`)}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {t(`importantDates.repeats.${date.repeats}`)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`important-date-visibility ${
                            date.visibility === ContentVisibility.PRIVATE
                              ? 'important-date-visibility-private'
                              : 'important-date-visibility-shared'
                          }`}
                        >
                          <span
                            className="important-date-visibility-icon"
                            aria-hidden="true"
                          >
                            <DestinationIcon
                              icon={
                                date.visibility === ContentVisibility.PRIVATE
                                  ? 'private'
                                  : 'people'
                              }
                            />
                          </span>
                          {t(`importantDates.visibility.${date.visibility}`)}
                        </span>
                      </span>
                    </span>
                    <span className="important-date-chevron" aria-hidden="true">
                      ›
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    </section>
  );
}
