import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { AttachmentsApi } from '../api/generated/apis/AttachmentsApi';
import type { PeopleApi } from '../api/generated/apis/PeopleApi';
import { RelatedPersonDeletePolicy } from '../api/generated/models/RelatedPersonDeletePolicy';
import type { RelatedPersonFields } from '../api/generated/models/RelatedPersonFields';
import type { RelatedPersonView } from '../api/generated/models/RelatedPersonView';
import { invalidateDashboard } from '../client/dashboardQueries';
import {
  type DeleteFocusTarget,
  deleteFocusTarget,
} from '../client/deleteFocusTarget';
import { normalizeClientError } from '../client/problemDetails';
import {
  canConfirmRelatedPersonDelete,
  INITIAL_RELATED_PERSON_DELETE_CHOICE,
  type RelatedPersonDeleteChoice,
  type RelatedPersonDeletePolicyValue,
  relatedPersonDeleteReducer,
} from '../client/relatedPersonDelete';
import { useRelatedPersonAvatarUrl } from '../client/useRelatedPersonAvatarUrl';
import { useTranslation } from '../i18n';
import { AvatarPhoto } from './AvatarPhoto';
import { AddIcon, DestinationIcon } from './DestinationIcon';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { RelatedPersonEditorSheet } from './RelatedPersonEditorSheet';
import { ShortTaskSheet } from './ShortTaskSheet';
import { TaskBackLink } from './TaskBackButton';
import { UiState } from './UiState';
import { containModalTabFocus, useModalLifecycle } from './useModalLifecycle';
import './RelatedPeoplePage.css';
import './PeopleProfiles.css';

function PersonPhoto({
  person,
  attachmentsApi,
  spaceId,
  large = false,
}: {
  person: RelatedPersonView;
  attachmentsApi?: AttachmentsApi;
  spaceId: string;
  large?: boolean;
}) {
  const { avatarUrl } = useRelatedPersonAvatarUrl(
    attachmentsApi,
    spaceId,
    person.avatarAttachmentId,
  );
  return (
    <AvatarPhoto
      name={person.displayName}
      url={avatarUrl}
      identity={`${spaceId}:person:${person.id}:${person.avatarAttachmentId}`}
      large={large}
    />
  );
}

export function DeleteRelatedPersonDialogContent({
  person,
  pending,
  error,
  choice,
  onSelectPolicy,
  onCascadeConfirmed,
  onCancel,
  onDelete,
  dialogRef,
  cancelButtonRef,
  onKeyDown,
}: {
  person: RelatedPersonView;
  pending: boolean;
  error: Error | null;
  choice: RelatedPersonDeleteChoice;
  onSelectPolicy: (policy: RelatedPersonDeletePolicyValue) => void;
  onCascadeConfirmed: (confirmed: boolean) => void;
  onCancel: () => void;
  onDelete: (policy: RelatedPersonDeletePolicyValue) => void;
  dialogRef?: RefObject<HTMLElement | null>;
  cancelButtonRef?: RefObject<HTMLButtonElement | null>;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
}) {
  const { t } = useTranslation();
  const canDelete = canConfirmRelatedPersonDelete(choice);

  return (
    <section
      ref={dialogRef}
      className="modal-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="related-person-delete-title"
      aria-describedby="related-person-delete-description related-person-delete-privacy"
      onKeyDown={onKeyDown}
    >
      <h2 id="related-person-delete-title">{t('people.deleteTitle')}</h2>
      <p id="related-person-delete-description">
        {t('people.deleteBody', { name: person.displayName })}
      </p>
      <p id="related-person-delete-privacy" className="field-help">
        {t('people.deletePrivacyNote')}
      </p>

      <fieldset className="form-grid">
        <legend>{t('people.deletePolicyLegend')}</legend>
        <label className="choice-card">
          <input
            type="radio"
            name="deletePolicy"
            value={RelatedPersonDeletePolicy.preserve}
            checked={choice.policy === RelatedPersonDeletePolicy.preserve}
            onChange={() => onSelectPolicy(RelatedPersonDeletePolicy.preserve)}
          />
          <span>
            <strong>{t('people.deletePreserveTitle')}</strong>
            <small>{t('people.deletePreserveBody')}</small>
          </span>
        </label>
        <label className="choice-card choice-card-danger">
          <input
            type="radio"
            name="deletePolicy"
            value={RelatedPersonDeletePolicy.cascade}
            checked={choice.policy === RelatedPersonDeletePolicy.cascade}
            onChange={() => onSelectPolicy(RelatedPersonDeletePolicy.cascade)}
          />
          <span>
            <strong>{t('people.deleteCascadeTitle')}</strong>
            <small>{t('people.deleteCascadeBody')}</small>
          </span>
        </label>
      </fieldset>

      {choice.policy === RelatedPersonDeletePolicy.cascade ? (
        <div className="inline-message inline-message-danger" role="alert">
          <strong>{t('people.deleteCascadeWarningTitle')}</strong>
          <span>{t('people.deleteCascadeWarningBody')}</span>
          <label className="choice-row">
            <input
              type="checkbox"
              checked={choice.cascadeConfirmed}
              onChange={(event) =>
                onCascadeConfirmed(event.currentTarget.checked)
              }
            />
            <span>{t('people.deleteCascadeConfirm')}</span>
          </label>
        </div>
      ) : null}

      {error ? <ProblemState error={error} /> : null}

      <div className="form-actions">
        <button
          ref={cancelButtonRef}
          type="button"
          className="secondary"
          onClick={onCancel}
          disabled={pending}
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className={
            choice.policy === RelatedPersonDeletePolicy.cascade
              ? 'danger'
              : undefined
          }
          disabled={!canDelete || pending}
          onClick={() => {
            if (choice.policy && canDelete) onDelete(choice.policy);
          }}
        >
          {pending ? t('people.deleting') : t('people.deleteConfirm')}
        </button>
      </div>
    </section>
  );
}

function DeleteRelatedPersonDialog({
  person,
  pending,
  error,
  onCancel,
  onDelete,
}: {
  person: RelatedPersonView;
  pending: boolean;
  error: Error | null;
  onCancel: () => void;
  onDelete: (policy: RelatedPersonDeletePolicyValue) => void;
}) {
  const [choice, dispatch] = useReducer(
    relatedPersonDeleteReducer,
    INITIAL_RELATED_PERSON_DELETE_CHOICE,
  );
  const dialogRef = useRef<HTMLElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useModalLifecycle({
    active: true,
    initialFocusRef: cancelButtonRef,
  });

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && !pending) {
      event.preventDefault();
      onCancel();
      return;
    }
    containModalTabFocus(event, dialogRef.current);
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <DeleteRelatedPersonDialogContent
        person={person}
        pending={pending}
        error={error}
        choice={choice}
        onSelectPolicy={(policy) => dispatch({ type: 'select', policy })}
        onCascadeConfirmed={(confirmed) =>
          dispatch({ type: 'confirmCascade', confirmed })
        }
        onCancel={onCancel}
        onDelete={onDelete}
        dialogRef={dialogRef}
        cancelButtonRef={cancelButtonRef}
        onKeyDown={handleDialogKeyDown}
      />
    </div>
  );
}

export function RelatedPeoplePage({
  peopleApi,
  spaceId,
  apiBaseUrl,
  accessToken,
  attachmentsApi,
  currentAccountId,
}: {
  peopleApi: PeopleApi;
  spaceId: string;
  apiBaseUrl?: string;
  accessToken?: string;
  attachmentsApi?: AttachmentsApi;
  currentAccountId?: string;
}) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const parts = location.pathname
    .slice('/more/people'.length)
    .split('/')
    .filter(Boolean);
  const creating = parts[0] === 'new';
  const personId = creating ? null : (parts[0] ?? null);
  const editing = creating || parts[1] === 'edit';
  const [deleteTarget, setDeleteTarget] = useState<RelatedPersonView | null>(
    null,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingFocus, setPendingFocus] = useState<DeleteFocusTarget | null>(
    null,
  );
  const listKey = ['related-people', spaceId];
  const origin = (
    location.state as {
      peopleOrigin?: { to?: string; scrollY?: number; selectedId?: string };
    } | null
  )?.peopleOrigin;
  const returnTo =
    origin?.to === '/plan#dates' ? '/plan#dates' : '/more/people';
  const personPath = (id: string) => `/more/people/${encodeURIComponent(id)}`;
  const originState = {
    peopleOrigin: origin ?? { to: '/more/people', scrollY: window.scrollY },
  };
  const peopleQuery = useQuery({
    queryKey: listKey,
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
  const detailQuery = useQuery({
    queryKey: ['related-person', spaceId, personId],
    enabled: Boolean(personId),
    initialData: () => peopleQuery.data?.find((p) => p.id === personId),
    queryFn: async () => {
      if (!personId) throw new Error('Missing person');
      try {
        return await peopleApi.getRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdGet(
          { spaceId, personId },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
  });
  const person = detailQuery.data;
  const birthdays = useMemo(
    () => ({
      full: new Intl.DateTimeFormat(i18n.language, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
      short: new Intl.DateTimeFormat(i18n.language, {
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
      }),
    }),
    [i18n.language],
  );
  const birthday = (p: RelatedPersonView, year = true) =>
    p.birthday
      ? (year && p.birthdayYearKnown ? birthdays.full : birthdays.short).format(
          p.birthday,
        )
      : '';
  const save = useMutation({
    mutationFn: async (fields: RelatedPersonFields) => {
      try {
        if (person && !creating)
          return await peopleApi.updateRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdPut(
            {
              personId: person.id,
              spaceId,
              ifMatch: String(person.version),
              relatedPersonFields: fields,
            },
          );
        return await peopleApi.createRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPost(
          { spaceId, relatedPersonFields: fields },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: async (saved) => {
      queryClient.setQueryData(['related-person', spaceId, saved.id], saved);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: listKey }),
        invalidateDashboard(queryClient, spaceId),
      ]);
    },
  });
  const remove = useMutation({
    mutationFn: async (policy: RelatedPersonDeletePolicyValue) => {
      if (!deleteTarget) return;
      try {
        await peopleApi.deleteRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdDelete(
          {
            spaceId,
            personId: deleteTarget.id,
            ifMatch: String(deleteTarget.version),
            deletePolicy: policy,
          },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: async () => {
      if (deleteTarget)
        setPendingFocus(
          deleteFocusTarget(
            (peopleQuery.data ?? []).slice().sort((a, b) =>
              a.displayName.localeCompare(b.displayName, i18n.language, {
                numeric: true,
              }),
            ),
            deleteTarget.id,
          ),
        );
      setDeleteTarget(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: listKey }),
        queryClient.invalidateQueries({
          queryKey: ['important-dates', spaceId],
        }),
        invalidateDashboard(queryClient, spaceId),
      ]);
      navigate('/more/people', { replace: true });
    },
  });
  useEffect(() => {
    if (personId || editing || peopleQuery.isFetching) return;
    const frame = requestAnimationFrame(() => {
      if (
        typeof origin?.scrollY === 'number' &&
        Number.isFinite(origin.scrollY)
      )
        window.scrollTo({
          top: Math.max(0, origin.scrollY),
          behavior: 'instant',
        });
      const selector =
        pendingFocus?.kind === 'create'
          ? '#people-add-person'
          : pendingFocus?.kind === 'item'
            ? `[data-person-link="${CSS.escape(pendingFocus.id)}"]`
            : origin?.selectedId
              ? `[data-person-link="${CSS.escape(origin.selectedId)}"]`
              : null;
      if (selector)
        document
          .querySelector<HTMLElement>(selector)
          ?.focus({ preventScroll: true });
      setPendingFocus(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [
    personId,
    editing,
    peopleQuery.isFetching,
    origin?.scrollY,
    origin?.selectedId,
    pendingFocus,
  ]);

  if (editing && (creating || person))
    return (
      <RelatedPersonEditorSheet
        key={personId ?? 'new'}
        person={creating ? null : (person ?? null)}
        pending={save.isPending}
        error={save.error}
        spaceId={spaceId}
        apiBaseUrl={apiBaseUrl}
        accessToken={accessToken}
        accountId={currentAccountId}
        attachmentsApi={attachmentsApi}
        onCancel={() =>
          navigate(
            creating
              ? '/more/people'
              : personPath(personId ?? person?.id ?? ''),
            {
              replace: true,
              state: originState,
            },
          )
        }
        onSubmit={(fields) => save.mutateAsync(fields)}
        onSaved={(saved) =>
          navigate(personPath(saved.id), {
            replace: true,
            state: { ...originState, personSaved: true },
          })
        }
      />
    );
  if (personId)
    return (
      <div className="page page-reading people-profile">
        <TaskBackLink to={returnTo} state={originState} />
        {detailQuery.isLoading ? (
          <UiState kind="loading" title={t('people.loading')} />
        ) : null}
        {detailQuery.error ? (
          <ProblemState
            error={detailQuery.error}
            onRetry={() => void detailQuery.refetch()}
          />
        ) : null}
        {person ? (
          <>
            <div className="people-profile-actions">
              <Link
                className="button-link tertiary compact-action"
                to={`${personPath(person.id)}/edit`}
                state={originState}
              >
                {t('people.edit')}
              </Link>
              <button
                type="button"
                className="tertiary icon-only"
                aria-label={t('people.moreActions')}
                onClick={() => setMenuOpen(true)}
              >
                <span aria-hidden="true">⋯</span>
              </button>
            </div>
            <div className="people-profile-hero">
              <PersonPhoto
                person={person}
                attachmentsApi={attachmentsApi}
                spaceId={spaceId}
                large
              />
              <div>
                <h1>{person.displayName}</h1>
                <p>{t(`people.relationship.${person.relationship}`)}</p>
              </div>
            </div>
            {(location.state as { personSaved?: boolean } | null)
              ?.personSaved ? (
              <p className="people-saved" role="status">
                {t('people.updated')}
              </p>
            ) : null}
            <section className="people-profile-birthday">
              <h2>{t('people.birthdayLabel')}</h2>
              {person.birthday ? (
                <Link
                  className="people-birthday-link"
                  to={`/plan#dates`}
                  state={{
                    birthdayPersonId: person.id,
                    dateOrigin: personPath(person.id),
                  }}
                >
                  <strong>{birthday(person)}</strong>
                  <span className="people-chevron" aria-hidden="true">
                    ›
                  </span>
                </Link>
              ) : (
                <Link
                  className="button-link tertiary"
                  to={`${personPath(person.id)}/edit`}
                  state={originState}
                >
                  {t('people.addBirthday')}
                </Link>
              )}
            </section>
            <ShortTaskSheet
              open={menuOpen}
              title={person.displayName}
              onClose={() => setMenuOpen(false)}
            >
              <button
                type="button"
                className="tertiary danger"
                onClick={() => {
                  setMenuOpen(false);
                  setDeleteTarget(person);
                  remove.reset();
                }}
              >
                {t('people.lifecycleTitle')}
              </button>
            </ShortTaskSheet>
          </>
        ) : null}
        {deleteTarget ? (
          <DeleteRelatedPersonDialog
            person={deleteTarget}
            pending={remove.isPending}
            error={remove.error}
            onCancel={() => setDeleteTarget(null)}
            onDelete={(policy) => remove.mutate(policy)}
          />
        ) : null}
      </div>
    );
  return (
    <div className="page people-overview">
      <PageHeader
        title={t('people.title')}
        action={
          <Link
            className="button-link tertiary compact-action"
            id="people-add-person"
            to="/more/people/new"
            state={originState}
          >
            <AddIcon />
            {t('people.addPersonAction')}
          </Link>
        }
      />
      {peopleQuery.isLoading ? (
        <UiState kind="loading" title={t('people.loading')} />
      ) : null}
      {peopleQuery.error ? (
        <ProblemState
          error={peopleQuery.error}
          onRetry={() => void peopleQuery.refetch()}
        />
      ) : null}
      {peopleQuery.data?.length === 0 ? (
        <UiState kind="empty" title={t('people.emptyTitle')} />
      ) : null}
      {peopleQuery.data?.length ? (
        <ul className="people-portrait-list" aria-label={t('people.listAria')}>
          {peopleQuery.data
            .slice()
            .sort((a, b) =>
              a.displayName.localeCompare(b.displayName, i18n.language, {
                numeric: true,
              }),
            )
            .map((p) => (
              <li key={p.id}>
                <PersonPhoto
                  person={p}
                  attachmentsApi={attachmentsApi}
                  spaceId={spaceId}
                />
                <Link
                  className="people-profile-link"
                  data-person-link={p.id}
                  onClick={(event) => {
                    if (
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    event.preventDefault();
                    navigate(personPath(p.id), {
                      state: {
                        peopleOrigin: {
                          to: '/more/people',
                          scrollY: window.scrollY,
                          selectedId: p.id,
                        },
                      },
                    });
                  }}
                  to={personPath(p.id)}
                  state={{
                    peopleOrigin: {
                      to: '/more/people',
                      scrollY: window.scrollY,
                    },
                  }}
                >
                  <span>
                    <strong>{p.displayName}</strong>
                    <span>{t(`people.relationship.${p.relationship}`)}</span>
                    {p.birthday ? (
                      <small>
                        <DestinationIcon icon="birthday" />
                        {birthday(p, false)}
                      </small>
                    ) : null}
                  </span>
                  <span className="people-chevron" aria-hidden="true">
                    ›
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}
