import {
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AttachmentsApi } from '../api/generated/apis/AttachmentsApi';
import type { PeopleApi } from '../api/generated/apis/PeopleApi';
import { ContentVisibility } from '../api/generated/models/ContentVisibility';
import { RelatedPersonDeletePolicy } from '../api/generated/models/RelatedPersonDeletePolicy';
import type { RelatedPersonFields } from '../api/generated/models/RelatedPersonFields';
import type { RelatedPersonView } from '../api/generated/models/RelatedPersonView';
import { invalidateDashboard } from '../client/dashboardQueries';
import {
  deleteFocusTarget,
  type DeleteFocusTarget,
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
import { AddIcon, DestinationIcon } from './DestinationIcon';
import { ImportantDatesPanel } from './ImportantDatesPanel';
import { PageHeader } from './PageHeader';
import { personInitials } from './PersonIdentity';
import { ProblemState } from './ProblemState';
import { RelatedPersonEditorSheet } from './RelatedPersonEditorSheet';
import { UiState } from './UiState';
import { containModalTabFocus, useModalLifecycle } from './useModalLifecycle';
import './RelatedPeoplePage.css';

function PersonCardAvatar({
  person,
  attachmentsApi,
  spaceId,
}: {
  person: RelatedPersonView;
  attachmentsApi: AttachmentsApi | undefined | null;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const { avatarUrl } = useRelatedPersonAvatarUrl(
    attachmentsApi,
    spaceId,
    person.avatarAttachmentId,
  );
  const initials = useMemo(
    () => personInitials(person.displayName),
    [person.displayName],
  );

  return (
    <div className="people-avatar-circle" aria-hidden="true">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={t('people.avatarAlt', { name: person.displayName })}
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
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
}: {
  peopleApi: PeopleApi;
  spaceId: string;
  apiBaseUrl?: string;
  accessToken?: string;
  attachmentsApi?: AttachmentsApi;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [editingPerson, setEditingPerson] = useState<RelatedPersonView | null>(
    null,
  );
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RelatedPersonView | null>(
    null,
  );
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [pendingDeleteFocus, setPendingDeleteFocus] =
    useState<DeleteFocusTarget | null>(null);
  const createActionRef = useRef<HTMLButtonElement>(null);
  const personCardRefs = useRef(new Map<string, HTMLButtonElement>());

  const birthdayFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    [i18n.language],
  );
  const birthdayWithoutYearFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        day: '2-digit',
        month: 'long',
        timeZone: 'UTC',
      }),
    [i18n.language],
  );

  const peopleQuery = useQuery({
    queryKey: ['related-people', spaceId],
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

  const saveMutation = useMutation({
    mutationFn: async (fields: RelatedPersonFields) => {
      try {
        if (editingPerson) {
          return await peopleApi.updateRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdPut(
            {
              personId: editingPerson.id,
              spaceId,
              ifMatch: String(editingPerson.version),
              relatedPersonFields: fields,
            },
          );
        }
        return await peopleApi.createRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPost(
          {
            spaceId,
            relatedPersonFields: fields,
          },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: async () => {
      setSavedMessage(
        editingPerson ? t('people.updated') : t('people.created'),
      );
      setEditingPerson(null);
      setIsCreating(false);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['related-people', spaceId],
        }),
        invalidateDashboard(queryClient, spaceId),
      ]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (policy: RelatedPersonDeletePolicyValue) => {
      if (!deleteTarget) return;
      try {
        await peopleApi.deleteRelatedPersonApiV1SpacesSpaceIdRelatedPersonsPersonIdDelete(
          {
            personId: deleteTarget.id,
            spaceId,
            deletePolicy: policy,
            ifMatch: String(deleteTarget.version),
          },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: async () => {
      if (deleteTarget) {
        setPendingDeleteFocus(
          deleteFocusTarget(peopleQuery.data ?? [], deleteTarget.id),
        );
      }
      setDeleteTarget(null);
      setSavedMessage(t('people.deleted'));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['related-people', spaceId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['important-dates', spaceId],
        }),
        invalidateDashboard(queryClient, spaceId),
      ]);
    },
  });

  useEffect(() => {
    if (!pendingDeleteFocus || deleteTarget) return;
    const target =
      pendingDeleteFocus.kind === 'item'
        ? personCardRefs.current.get(pendingDeleteFocus.id)
        : createActionRef.current;
    target?.focus();
    setPendingDeleteFocus(null);
  }, [deleteTarget, pendingDeleteFocus]);

  return (
    <div className="page">
      <PageHeader
        eyebrow={t('people.eyebrow')}
        title={t('people.title')}
        description={t('people.intro')}
        action={
          <button
            ref={createActionRef}
            type="button"
            className="primary compact-action"
            onClick={() => {
              setIsCreating(true);
              setEditingPerson(null);
              saveMutation.reset();
              setSavedMessage(null);
            }}
          >
            <AddIcon />
            <span>{t('people.addPersonAction')}</span>
          </button>
        }
      />

      {savedMessage ? (
        <div className="inline-message inline-message-success" role="status">
          <span>{savedMessage}</span>
        </div>
      ) : null}

      <section
        className="story-surface"
        aria-labelledby="related-people-list-title"
      >
        <div className="section-head">
          <div>
            <p className="section-kicker">{t('people.listKicker')}</p>
            <h2 id="related-people-list-title">{t('people.listTitle')}</h2>
          </div>
        </div>

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
          <UiState
            kind="empty"
            title={t('people.emptyTitle')}
            body={t('people.emptyBody')}
          />
        ) : null}
        {peopleQuery.data?.length ? (
          <ul className="people-grid" aria-label={t('people.listAria')}>
            {peopleQuery.data.map((person) => (
              <li key={person.id} className="people-card-item">
                <button
                  ref={(element) => {
                    if (element) personCardRefs.current.set(person.id, element);
                    else personCardRefs.current.delete(person.id);
                  }}
                  type="button"
                  className="people-card"
                  onClick={() => {
                    setEditingPerson(person);
                    setIsCreating(false);
                    saveMutation.reset();
                    setSavedMessage(null);
                  }}
                >
                  <PersonCardAvatar
                    person={person}
                    attachmentsApi={attachmentsApi}
                    spaceId={spaceId}
                  />
                  <div className="people-card-body">
                    <h3 className="people-card-name">{person.displayName}</h3>
                    <p className="people-card-relationship">
                      {t(`people.relationship.${person.relationship}`)}
                    </p>
                    {person.birthday ? (
                      <p className="people-card-birthday">
                        <span
                          className="people-card-birthday-icon"
                          aria-hidden="true"
                        >
                          <DestinationIcon icon="birthday" />
                        </span>
                        <span>
                          {person.birthdayYearKnown
                            ? birthdayFormatter.format(person.birthday)
                            : birthdayWithoutYearFormatter.format(
                                person.birthday,
                              )}
                        </span>
                      </p>
                    ) : null}
                    <span
                      className={`people-card-badge ${
                        person.visibility === ContentVisibility.PRIVATE
                          ? 'people-card-badge-private'
                          : ''
                      }`.trim()}
                    >
                      {t(`people.visibility.${person.visibility}`)}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <ImportantDatesPanel
        peopleApi={peopleApi}
        spaceId={spaceId}
        people={peopleQuery.data ?? []}
      />

      {isCreating || editingPerson ? (
        <RelatedPersonEditorSheet
          key={editingPerson?.id ?? 'create'}
          person={editingPerson}
          pending={saveMutation.isPending}
          error={saveMutation.error}
          spaceId={spaceId}
          apiBaseUrl={apiBaseUrl}
          accessToken={accessToken}
          attachmentsApi={attachmentsApi}
          onCancel={() => {
            setIsCreating(false);
            setEditingPerson(null);
            saveMutation.reset();
          }}
          onSubmit={(fields) => {
            setSavedMessage(null);
            saveMutation.mutate(fields);
          }}
          onDeleteRequest={
            editingPerson
              ? () => {
                  const target = editingPerson;
                  setIsCreating(false);
                  setEditingPerson(null);
                  setDeleteTarget(target);
                }
              : undefined
          }
        />
      ) : null}

      {deleteTarget ? (
        <DeleteRelatedPersonDialog
          key={deleteTarget.id}
          person={deleteTarget}
          pending={deleteMutation.isPending}
          error={deleteMutation.error}
          onCancel={() => {
            setDeleteTarget(null);
            deleteMutation.reset();
          }}
          onDelete={(policy) => deleteMutation.mutate(policy)}
        />
      ) : null}
    </div>
  );
}
