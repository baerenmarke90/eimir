import './FreeComposer.css';
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
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import type { PeopleApi } from '../api/generated/apis/PeopleApi';
import { ContentVisibility } from '../api/generated/models/ContentVisibility';
import { DateRepeat } from '../api/generated/models/DateRepeat';
import { ImportantDateType } from '../api/generated/models/ImportantDateType';
import type { ImportantDateView } from '../api/generated/models/ImportantDateView';
import type { RelatedPersonView } from '../api/generated/models/RelatedPersonView';
import { invalidateDashboard } from '../client/dashboardQueries';
import {
  dateInputValueToApiDate,
  localDateInputValue,
} from '../client/dateInput';
import {
  type DeleteFocusTarget,
  deleteFocusTarget,
} from '../client/deleteFocusTarget';
import {
  EMPTY_IMPORTANT_DATE_DRAFT,
  IMPORTANT_DATE_LABEL_MAX_LENGTH,
  type ImportantDateDraft,
  importantDateFieldsFromDraft,
} from '../client/importantDateDraft';
import { useOccasionHolidayPreference } from '../client/occasionHolidayPreferences';
import { nextOccasionHolidays } from '../client/occasionHolidays';
import { normalizeClientError } from '../client/problemDetails';
import { calculateNextAnniversary } from '../client/relationshipPreview';
import { PLAN_CREATE_ROUTE, settingsCategoryPath } from '../client/routes';
import { useTaskOrigin } from '../client/taskOrigin';
import { useEditorHistoryEntry } from '../client/useEditorHistoryEntry';
import { useTranslation } from '../i18n';
import { AddActionButton } from './AddAction';
import { DestinationIcon } from './DestinationIcon';
import { EimirIcon, type EimirIconName } from './EimirIcon';
import { NativeDateInput } from './NativeDateField';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import { UiState } from './UiState';
import { containModalTabFocus, useModalLifecycle } from './useModalLifecycle';

const DATE_TYPES = Object.values(ImportantDateType);
const DATE_REPEATS = Object.values(DateRepeat);
const VISIBILITIES = Object.values(ContentVisibility);
const RELATIONSHIP_ANNIVERSARY_KEY = 'relationship-anniversary';
const OCCASION_ICONS: Record<ImportantDateType, EimirIconName> = {
  BIRTHDAY: 'geburtstag',
  ANNIVERSARY: 'wir',
  CUSTOM: 'highlights',
};

function OccasionTitle({
  type,
  label,
}: {
  type: ImportantDateType;
  label: string;
}) {
  const { t } = useTranslation();
  const typeLabel = t(`importantDates.type.${type}`);
  const icon = OCCASION_ICONS[type];
  return (
    <span className="occasion-title">
      <span
        className="occasion-type-symbol"
        role="img"
        aria-label={typeLabel}
        title={typeLabel}
      >
        <EimirIcon
          name={icon}
          variant={icon === 'wir' ? 'outline' : 'duotone'}
        />
      </span>
      <span>{label}</span>
    </span>
  );
}

function OccasionVisibility({ visibility }: { visibility: ContentVisibility }) {
  const { t } = useTranslation();
  const label = t(`importantDates.visibility.${visibility}`);
  return (
    <span
      className="occasion-visibility"
      role="img"
      aria-label={label}
      title={label}
    >
      <DestinationIcon
        icon={visibility === ContentVisibility.PRIVATE ? 'private' : 'people'}
      />
    </span>
  );
}

function dateInputValue(value: Date | null | undefined): string {
  if (!value) return '';
  return value.toISOString().slice(0, 10);
}

function useLocalCalendarDay(): Date {
  const [value, setValue] = useState(localDateInputValue);
  useEffect(() => {
    let timer = 0;
    function refresh() {
      window.clearTimeout(timer);
      const now = new Date();
      setValue(localDateInputValue(now));
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      timer = window.setTimeout(refresh, midnight.getTime() - now.getTime());
    }
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return dateInputValueToApiDate(value);
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
      data-create-entry={date ? undefined : true}
      role="presentation"
    >
      <section
        ref={dialogRef}
        className="focused-editor-sheet important-date-editor free-composer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="important-date-editor-title"
        onKeyDown={handleDialogKeyDown}
      >
        <header className="focused-editor-header">
          <div className="focused-editor-heading">
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
                </div>

                <div className="important-date-primary-grid">
                  <div className="field-group important-date-date-field">
                    <label htmlFor="important-date-date">
                      {t('importantDates.dateLabel')}
                    </label>
                    <NativeDateInput
                      ref={initialInputRef}
                      id="important-date-date"
                      name="date"
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

interface OccasionEntry {
  key: string;
  date: Date;
  type: ImportantDateType;
  label: string;
  custom?: ImportantDateView;
  person?: RelatedPersonView;
  profileName?: string;
}

type OccasionOccurrence = OccasionEntry & { repeats: DateRepeat };

export function ImportantDatesPanel({
  createActionContainer,
  peopleApi,
  spaceId,
  people,
  accountId = '',
  instance = '',
  partnerBirthday = null,
  ownBirthday = null,
  relationshipStartedOn = null,
  sourcesPending = false,
  sourcesUnavailable = false,
}: {
  createActionContainer?: HTMLElement | null;
  peopleApi: PeopleApi;
  spaceId: string;
  people: RelatedPersonView[];
  accountId?: string;
  instance?: string;
  partnerBirthday?: PartnerBirthdayProjection | null;
  ownBirthday?: PartnerBirthdayProjection | null;
  relationshipStartedOn?: Date | null;
  sourcesPending?: boolean;
  sourcesUnavailable?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { captureOrigin } = useTaskOrigin();
  const today = useLocalCalendarDay();
  const holidayPreference = useOccasionHolidayPreference({
    instance,
    accountId,
    spaceId,
  });
  const readerRef = useRef<ShortTaskSheetHandle>(null);
  const readerReturnRef = useRef<HTMLButtonElement>(null);
  const [readingKey, setReadingKey] = useState<string | null>(null);
  const [readerOpen, setReaderOpen] = useState(false);
  const openReader = useCallback((key: string) => {
    setReadingKey(key);
    setReaderOpen(true);
  }, []);
  const requestedBirthday = (
    location.state as { birthdayPersonId?: string } | null
  )?.birthdayPersonId;
  const [editing, setEditing] = useState<ImportantDateView | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  // Prototype: the month shown on the calendar sheet, as `YYYY-MM`.
  const [calendarMonth, setCalendarMonth] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [pendingDeleteFocus, setPendingDeleteFocus] =
    useState<DeleteFocusTarget | null>(null);
  const createActionRef = useRef<HTMLButtonElement>(null);
  const dateCardRefs = useRef(new Map<string, HTMLButtonElement>());

  const dateFormats = useMemo(
    () => ({
      day: new Intl.DateTimeFormat(i18n.language, {
        day: 'numeric',
        timeZone: 'UTC',
      }),
      month: new Intl.DateTimeFormat(i18n.language, {
        month: 'long',
        timeZone: 'UTC',
      }),
      monthAndYear: new Intl.DateTimeFormat(i18n.language, {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
      detail: new Intl.DateTimeFormat(i18n.language, {
        weekday: 'short',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    }),
    [i18n.language],
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

  const isPersonBirthday = useCallback(
    (date: ImportantDateView, personId: string) => {
      const birthday = people.find(
        (person) => person.id === personId,
      )?.birthday;
      return Boolean(
        birthday &&
          date.relatedPersonId === personId &&
          date.visibility === ContentVisibility.SHARED &&
          date.type === ImportantDateType.BIRTHDAY &&
          date.repeats === DateRepeat.ANNUALLY &&
          date.date.getUTCMonth() === birthday.getUTCMonth() &&
          date.date.getUTCDate() === birthday.getUTCDate(),
      );
    },
    [people],
  );
  useEffect(() => {
    if (!requestedBirthday || !people.some((p) => p.id === requestedBirthday))
      return;
    // Existing explicit birthday records remain authoritative for their date.
    const existing = datesQuery.data?.find((date) =>
      isPersonBirthday(date, requestedBirthday),
    );
    if (!datesQuery.data) return;
    openReader(existing?.id ?? `person:${requestedBirthday}`);
    navigate(
      {
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      },
      { replace: true, state: null },
    );
  }, [
    requestedBirthday,
    openReader,
    isPersonBirthday,
    datesQuery.data,
    people,
    navigate,
    location.pathname,
    location.search,
    location.hash,
  ]);
  const returnOrigin = (
    location.state as {
      peopleOrigin?: { to?: string; scrollY?: number; selectedId?: string };
    } | null
  )?.peopleOrigin;
  useEffect(() => {
    if (returnOrigin?.to !== '/plan#dates' || !datesQuery.data) return;
    const frame = requestAnimationFrame(() => {
      if (
        typeof returnOrigin.scrollY === 'number' &&
        Number.isFinite(returnOrigin.scrollY)
      )
        window.scrollTo({
          top: Math.max(0, returnOrigin.scrollY),
          behavior: 'instant',
        });
      if (returnOrigin.selectedId)
        dateCardRefs.current
          .get(returnOrigin.selectedId)
          ?.focus({ preventScroll: true });
      navigate(
        { pathname: location.pathname, hash: location.hash },
        { replace: true, state: null },
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [
    returnOrigin,
    datesQuery.data,
    navigate,
    location.pathname,
    location.hash,
  ]);
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
    onSuccess: async (saved) => {
      openReader(saved.id);
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

  const holidayEntries: OccasionEntry[] = holidayPreference.enabled
    ? nextOccasionHolidays(today)
        .filter(({ id, date }) => {
          const label = t(`importantDates.holidays.${id}`)
            .trim()
            .toLocaleLowerCase(i18n.language);
          return !(datesQuery.data ?? []).some(
            (saved) =>
              (saved.repeats === DateRepeat.ANNUALLY ||
                saved.date.getUTCFullYear() === date.getUTCFullYear()) &&
              saved.date.getUTCMonth() === date.getUTCMonth() &&
              saved.date.getUTCDate() === date.getUTCDate() &&
              saved.label.trim().toLocaleLowerCase(i18n.language) === label,
          );
        })
        .map(({ key, id, date }) => ({
          key,
          date,
          label: t(`importantDates.holidays.${id}`),
          type: ImportantDateType.CUSTOM,
        }))
    : [];
  const entries: OccasionEntry[] = [
    ...(datesQuery.data ?? []).map((date) => ({
      key: date.id,
      date: date.date,
      label: date.label,
      type: date.type,
      custom: date,
    })),
    ...people.flatMap((person) =>
      person.birthday &&
      !(datesQuery.data ?? []).some((date) => isPersonBirthday(date, person.id))
        ? [
            {
              key: `person:${person.id}`,
              date: person.birthday,
              type: ImportantDateType.BIRTHDAY,
              label: t('importantDates.partnerBirthdayLabel', {
                name: person.displayName,
              }),
              person,
            },
          ]
        : [],
    ),
    ...[ownBirthday, partnerBirthday].flatMap((birthday) =>
      birthday &&
      !(datesQuery.data ?? []).some(
        (date) =>
          date.type === ImportantDateType.BIRTHDAY &&
          date.repeats === DateRepeat.ANNUALLY &&
          date.visibility === ContentVisibility.SHARED &&
          !date.relatedPersonId &&
          date.date.getUTCMonth() === birthday.birthday.getUTCMonth() &&
          date.date.getUTCDate() === birthday.birthday.getUTCDate() &&
          date.label.trim().toLocaleLowerCase(i18n.language) ===
            t('importantDates.partnerBirthdayLabel', {
              name: birthday.displayName,
            })
              .trim()
              .toLocaleLowerCase(i18n.language),
      )
        ? [
            {
              key: `partner:${birthday.accountId}`,
              date: birthday.birthday,
              type: ImportantDateType.BIRTHDAY,
              label: t('importantDates.partnerBirthdayLabel', {
                name: birthday.displayName,
              }),
              profileName: birthday.displayName,
            },
          ]
        : [],
    ),
    ...(relationshipStartedOn &&
    Number.isFinite(relationshipStartedOn.getTime()) &&
    !(datesQuery.data ?? []).some(
      (date) =>
        date.type === ImportantDateType.ANNIVERSARY &&
        date.repeats === DateRepeat.ANNUALLY &&
        date.visibility === ContentVisibility.SHARED &&
        !date.relatedPersonId &&
        date.date.getUTCMonth() === relationshipStartedOn.getUTCMonth() &&
        date.date.getUTCDate() === relationshipStartedOn.getUTCDate() &&
        date.label.trim().toLocaleLowerCase(i18n.language) ===
          t('importantDates.relationshipAnniversary')
            .trim()
            .toLocaleLowerCase(i18n.language),
    )
      ? [
          {
            key: RELATIONSHIP_ANNIVERSARY_KEY,
            date: relationshipStartedOn,
            type: ImportantDateType.ANNIVERSARY,
            label: t('importantDates.relationshipAnniversary'),
          },
        ]
      : []),
    ...holidayEntries,
  ];
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(today.getUTCDate() + 1);
  const occurrences: OccasionOccurrence[] = entries.map((entry) => {
    const repeats = entry.custom?.repeats ?? DateRepeat.ANNUALLY;
    const date =
      repeats === DateRepeat.ANNUALLY
        ? (calculateNextAnniversary(entry.date, today)?.nextDate ?? entry.date)
        : entry.date;
    return { ...entry, date, repeats };
  });
  const compareDates = (a: OccasionOccurrence, b: OccasionOccurrence) =>
    a.date.getTime() - b.date.getTime();
  const compareTitles = (a: OccasionOccurrence, b: OccasionOccurrence) =>
    a.label.localeCompare(b.label, i18n.language);
  const upcoming = occurrences
    .filter((entry) => entry.date >= today)
    .sort((a, b) => compareDates(a, b) || compareTitles(a, b));
  const past = occurrences
    .filter((entry) => entry.date < today)
    .sort((a, b) => compareDates(b, a) || compareTitles(a, b));
  const selected = occurrences.find((entry) => entry.key === readingKey);
  const canCreatePlan =
    selected &&
    (!selected.custom ||
      selected.custom.visibility === ContentVisibility.SHARED);

  function navigateFromReader(to: string, createDate?: string) {
    if (!selected) return;
    readerRef.current?.closeForNavigation(() => {
      const taskOriginKey = captureOrigin({
        planningSegment: 'dates',
        selectedKey: selected.key,
        planningCreateDate: createDate,
      });
      void navigate(to, { state: { taskOriginKey } });
    });
  }

  function renderDateRow(entry: OccasionOccurrence) {
    const relativeLabel =
      entry.date.getTime() === today.getTime()
        ? t('m5s5.common.today')
        : entry.date.getTime() === tomorrow.getTime()
          ? t('m5s5.common.tomorrow')
          : null;
    return (
      <li key={entry.key}>
        <button
          ref={(element) => {
            if (element) dateCardRefs.current.set(entry.key, element);
            else dateCardRefs.current.delete(entry.key);
          }}
          type="button"
          className="important-date-card"
          data-planning-key={entry.key}
          aria-haspopup="dialog"
          onClick={(event) => {
            readerReturnRef.current = event.currentTarget;
            openReader(entry.key);
          }}
        >
          <time
            className="important-date-marker"
            dateTime={dateInputValue(entry.date)}
          >
            <span className="important-date-marker-day" aria-hidden="true">
              {dateFormats.day.format(entry.date)}
            </span>
            <span className="sr-only">
              {dateFormats.detail.format(entry.date)}
            </span>
          </time>
          <span className="important-date-timeline-body">
            <strong>
              <OccasionTitle type={entry.type} label={entry.label} />
            </strong>
            {relativeLabel || entry.custom ? (
              <span className="important-date-meta">
                {relativeLabel ?? t(`importantDates.repeats.${entry.repeats}`)}
                {entry.custom ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <OccasionVisibility visibility={entry.custom.visibility} />
                  </>
                ) : null}
              </span>
            ) : null}
          </span>
        </button>
      </li>
    );
  }

  function renderMonths(rows: OccasionOccurrence[], isPast = false) {
    const months = new Map<string, OccasionOccurrence[]>();
    for (const entry of rows) {
      const key = dateInputValue(entry.date).slice(0, 7);
      const month = months.get(key);
      if (month) month.push(entry);
      else months.set(key, [entry]);
    }
    const Heading = isPast ? 'h3' : 'h2';
    return Array.from(months, ([key, month]) => {
      const date = month[0].date;
      const format =
        isPast || date.getUTCFullYear() !== today.getUTCFullYear()
          ? dateFormats.monthAndYear
          : dateFormats.month;
      return (
        <div className="occasions-month" key={key}>
          <Heading>{format.format(date)}</Heading>
          <ul className="occasions-list">{month.map(renderDateRow)}</ul>
        </div>
      );
    });
  }
  // Prototype: occasions are points in the year, so the view is a calendar in
  // three steps from coarse to fine: the next occasion, a band of the coming
  // twelve months, and the chosen month as a quiet sheet with its occasions.
  function renderCalendar() {
    const monthKey = (date: Date) => dateInputValue(date).slice(0, 7);
    const isPersonal = (entry: OccasionOccurrence) =>
      Boolean(entry.custom) || entry.type !== ImportantDateType.CUSTOM;
    const byMonth = new Map<string, OccasionOccurrence[]>();
    for (const entry of upcoming) {
      const key = monthKey(entry.date);
      byMonth.set(key, [...(byMonth.get(key) ?? []), entry]);
    }
    const months = Array.from({ length: 12 }, (_, index) => {
      const first = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + index, 1),
      );
      return { key: monthKey(first), first };
    });
    const next = upcoming[0];
    const activeKey =
      calendarMonth && months.some((month) => month.key === calendarMonth)
        ? calendarMonth
        : monthKey(next.date);
    const active = months.find((month) => month.key === activeKey) ?? months[0];
    const activeEntries = byMonth.get(active.key) ?? [];
    const year = active.first.getUTCFullYear();
    const monthIndex = active.first.getUTCMonth();
    const daysInMonth = new Date(
      Date.UTC(year, monthIndex + 1, 0),
    ).getUTCDate();
    // Monday-first week: Sunday (0) moves to the end.
    const leading = (active.first.getUTCDay() + 6) % 7;
    const weekdayFormat = new Intl.DateTimeFormat(i18n.language, {
      weekday: 'narrow',
      timeZone: 'UTC',
    });
    const shortMonth = new Intl.DateTimeFormat(i18n.language, {
      month: 'short',
      timeZone: 'UTC',
    });
    const relative = new Intl.RelativeTimeFormat(i18n.language, {
      numeric: 'auto',
    });
    const daysUntilNext = Math.round(
      (next.date.getTime() - today.getTime()) / 86_400_000,
    );
    const todayKey = dateInputValue(today);
    const weekdays = Array.from({ length: 7 }, (_, index) => ({
      id: `weekday-${index + 1}`,
      // 1 January 2024 was a Monday.
      label: weekdayFormat.format(new Date(Date.UTC(2024, 0, index + 1))),
    }));
    const leadingCells = Array.from(
      { length: leading },
      (_, index) => `lead-${index + 1}`,
    );

    return (
      <div className="occasions-calendar">
        <button
          type="button"
          className="occasions-next"
          aria-haspopup="dialog"
          onClick={(event) => {
            readerReturnRef.current = event.currentTarget;
            openReader(next.key);
          }}
        >
          <span className="occasions-next-when">
            {relative.format(daysUntilNext, 'day')}
          </span>
          <strong className="occasions-next-title">{next.label}</strong>
          <time
            className="occasions-next-date"
            dateTime={dateInputValue(next.date)}
          >
            {dateFormats.detail.format(next.date)}
          </time>
        </button>

        <div className="occasions-band">
          {months.map((month) => {
            const entries = byMonth.get(month.key) ?? [];
            const isActive = month.key === active.key;
            return (
              <button
                key={month.key}
                type="button"
                className={`occasions-band-month${isActive ? ' is-active' : ''}`}
                aria-pressed={isActive}
                aria-label={`${dateFormats.monthAndYear.format(month.first)}, ${entries.length}`}
                onClick={() => setCalendarMonth(month.key)}
              >
                <span>{shortMonth.format(month.first)}</span>
                <span className="occasions-band-dots" aria-hidden="true">
                  {entries.slice(0, 3).map((entry) => (
                    <i
                      key={entry.key}
                      className={isPersonal(entry) ? 'is-personal' : undefined}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>

        <div className="occasions-sheet" key={active.key}>
          <h2 className="occasions-sheet-title">
            {dateFormats.monthAndYear.format(active.first)}
          </h2>
          <div className="occasions-grid">
            {weekdays.map((weekday) => (
              <span
                key={weekday.id}
                className="occasions-grid-weekday"
                aria-hidden="true"
              >
                {weekday.label}
              </span>
            ))}
            {leadingCells.map((id) => (
              <span key={id} />
            ))}
            {Array.from({ length: daysInMonth }, (_, index) => {
              const day = index + 1;
              const key = `${active.key}-${String(day).padStart(2, '0')}`;
              const onDay = activeEntries.filter(
                (entry) => dateInputValue(entry.date) === key,
              );
              const className = [
                'occasions-grid-day',
                key === todayKey ? 'is-today' : '',
                onDay.length ? 'has-occasion' : '',
                onDay.some(isPersonal) ? 'is-personal' : '',
              ]
                .filter(Boolean)
                .join(' ');
              // A day with an occasion opens it; several on one day open the
              // first, and the list below shows them all.
              return onDay.length ? (
                <button
                  key={key}
                  type="button"
                  className={className}
                  aria-haspopup="dialog"
                  aria-label={`${dateFormats.detail.format(onDay[0].date)}: ${onDay
                    .map((entry) => entry.label)
                    .join(', ')}`}
                  onClick={(event) => {
                    readerReturnRef.current = event.currentTarget;
                    openReader(onDay[0].key);
                  }}
                >
                  {day}
                </button>
              ) : (
                <span key={key} className={className} aria-hidden="true">
                  {day}
                </span>
              );
            })}
          </div>
          {activeEntries.length ? (
            <ul className="occasions-list">
              {activeEntries.map(renderDateRow)}
            </ul>
          ) : (
            <p className="occasions-sheet-empty">
              {t('importantDates.monthEmpty', {
                defaultValue: 'In diesem Monat steht nichts an.',
              })}
            </p>
          )}
        </div>
      </div>
    );
  }

  const openEditor = () => {
    if (!selected?.custom) return;
    const date = selected.custom;
    readerRef.current?.closeForNavigation(() => {
      setReadingKey(null);
      setEditing(date);
      saveMutation.reset();
      deleteMutation.reset();
    });
  };
  const createAction = (
    <AddActionButton
      ref={createActionRef}
      label={t('importantDates.create')}
      floating={Boolean(createActionContainer)}
      aria-haspopup="dialog"
      className="occasions-add"
      onClick={() => {
        readerReturnRef.current = createActionRef.current;
        setEditing(null);
        setIsCreating(true);
        saveMutation.reset();
        deleteMutation.reset();
        setSavedMessage(null);
      }}
    />
  );
  return (
    <section
      className="important-dates-section occasions-panel"
      aria-label={t('importantDates.heading')}
    >
      {createActionContainer
        ? createPortal(createAction, createActionContainer)
        : createAction}
      {savedMessage ? (
        <p className="people-saved" role="status">
          {savedMessage}
        </p>
      ) : null}
      {datesQuery.isLoading ? (
        <UiState kind="loading" title={t('importantDates.loading')} />
      ) : null}
      {datesQuery.error ? (
        <ProblemState
          error={datesQuery.error}
          onRetry={() => void datesQuery.refetch()}
        />
      ) : null}
      {datesQuery.data &&
      !entries.length &&
      !sourcesPending &&
      !sourcesUnavailable ? (
        <UiState kind="empty" title={t('importantDates.emptyTitle')} />
      ) : null}
      {upcoming.length ? renderCalendar() : null}
      {past.length ? (
        <div className="occasions-past">
          <h2>{t('importantDates.past')}</h2>
          {renderMonths(past, true)}
        </div>
      ) : null}
      <ShortTaskSheet
        ref={readerRef}
        restoreFocusRef={readerReturnRef}
        open={readerOpen && Boolean(selected)}
        className="occasion-reader-sheet"
        title={
          selected ? (
            <OccasionTitle type={selected.type} label={selected.label} />
          ) : (
            t('importantDates.heading')
          )
        }
        onClose={() => setReaderOpen(false)}
      >
        {selected ? (
          <div className="occasion-reader">
            <p className="important-date-meta occasion-reader-date">
              <time dateTime={dateInputValue(selected.date)}>
                {dateFormats.detail.format(selected.date)}
              </time>
              <span aria-hidden="true">·</span>
              <span>{t(`importantDates.repeats.${selected.repeats}`)}</span>
              {selected.custom ? (
                <>
                  <span aria-hidden="true">·</span>
                  <OccasionVisibility visibility={selected.custom.visibility} />
                </>
              ) : null}
            </p>
            {selected.profileName ? (
              <p className="occasion-reader-source">
                {t('importantDates.partnerBirthdayProfileSource', {
                  name: selected.profileName,
                })}
              </p>
            ) : null}
            {selected.key.startsWith('holiday:') ? (
              <button
                type="button"
                className="tertiary"
                onClick={() =>
                  navigateFromReader(settingsCategoryPath('relationship'))
                }
              >
                {t('importantDates.holidaySettings.manage')}
              </button>
            ) : null}
            {selected.key === RELATIONSHIP_ANNIVERSARY_KEY ? (
              <button
                type="button"
                className="tertiary"
                onClick={() =>
                  navigateFromReader(settingsCategoryPath('relationship'))
                }
              >
                {t('importantDates.editRelationshipStart')}
              </button>
            ) : null}
            {selected.custom ? (
              <button
                type="button"
                className={canCreatePlan ? 'tertiary' : undefined}
                onClick={openEditor}
              >
                {t('importantDates.edit')}
              </button>
            ) : null}
            {selected.person ? (
              <button
                type="button"
                className="tertiary"
                onClick={() =>
                  readerRef.current?.closeForNavigation(() =>
                    navigate(
                      `/more/people/${encodeURIComponent(selected.person?.id ?? '')}`,
                      {
                        state: {
                          peopleOrigin: {
                            to: '/plan#dates',
                            scrollY: window.scrollY,
                            selectedId: selected.key,
                          },
                        },
                      },
                    ),
                  )
                }
              >
                {t('importantDates.openBirthdayProfile', {
                  name: selected.person.displayName,
                })}
              </button>
            ) : null}
            {canCreatePlan ? (
              <button
                type="button"
                onClick={() =>
                  navigateFromReader(
                    PLAN_CREATE_ROUTE,
                    dateInputValue(selected.date),
                  )
                }
              >
                {t('importantDates.createPlan')}
              </button>
            ) : null}
          </div>
        ) : null}
      </ShortTaskSheet>
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
    </section>
  );
}
