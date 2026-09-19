import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { PlaceDetail } from '../api/generated/models/PlaceDetail';
import { normalizeClientError } from '../client/problemDetails';
import {
  planningIfMatch,
  type SharedPlanningApis,
} from '../client/sharedPlanning';
import { MORE_PLACES_ROUTE } from '../client/routes';
import { useTaskOrigin } from '../client/taskOrigin';
import {
  authorSummaryQueryKeys,
  invalidatePlaceConsumers,
} from '../client/authorSummaryConsumers';
import {
  deleteFocusTargetFromInfiniteData,
  type InfiniteItemsData,
  PLANNING_DELETE_FOCUS_STATE_KEY,
} from '../client/deleteFocusTarget';
import { useTranslation } from '../i18n';
import { PageHeader } from './PageHeader';
import { ListEntryIconButton } from './ListEntryActions';
import {
  PlanningDiscardConfirmation,
  usePlanningEditorLifecycle,
} from './PlanningEditorLifecycle';
import { PlanningRelationManager } from './PlanningRelationManager';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';
import './SharedPlanningPages.css';

async function apiCall<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

type PlaceDraft = {
  name: string;
  description: string;
  address: string;
  latitude: string;
  longitude: string;
};

function placeDraft(place: PlaceDetail): PlaceDraft {
  return {
    name: place.name,
    description: place.description ?? '',
    address: place.address ?? '',
    latitude: place.latitude?.toString() ?? '',
    longitude: place.longitude?.toString() ?? '',
  };
}

function PlaceEditor({
  place,
  draft,
  setDraft,
  titleInputRef,
  editTriggerRef,
  updatePending,
  updateError,
  deletePending,
  deleteError,
  onSubmit,
  onDelete,
  onClose,
}: {
  place: PlaceDetail;
  draft: PlaceDraft;
  setDraft: (draft: PlaceDraft) => void;
  titleInputRef: RefObject<HTMLInputElement | null>;
  editTriggerRef: RefObject<HTMLButtonElement | null>;
  updatePending: boolean;
  updateError: unknown;
  deletePending: boolean;
  deleteError: unknown;
  onSubmit: (draft: PlaceDraft) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [coordinateError, setCoordinateError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const deleteHeadingRef = useRef<HTMLHeadingElement>(null);
  const restoreDeleteTriggerRef = useRef(false);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(placeDraft(place));
  const isPending = updatePending || deletePending;

  const lifecycle = usePlanningEditorLifecycle({
    isDirty,
    isPending,
    initialFocusRef: titleInputRef,
    restoreFocusRef: editTriggerRef,
    onEscape: () => {
      if (!confirmDelete) return false;
      restoreDeleteTriggerRef.current = true;
      setConfirmDelete(false);
      return true;
    },
    onClose,
  });

  useEffect(() => {
    if (confirmDelete) deleteHeadingRef.current?.focus();
    else if (restoreDeleteTriggerRef.current) {
      restoreDeleteTriggerRef.current = false;
      deleteTriggerRef.current?.focus();
    }
  }, [confirmDelete]);

  const updateDraft = (values: Partial<PlaceDraft>) => {
    const next = { ...draft, ...values };
    setDraft(next);
    if (Boolean(next.latitude.trim()) === Boolean(next.longitude.trim())) {
      setCoordinateError(false);
    }
  };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (Boolean(draft.latitude.trim()) !== Boolean(draft.longitude.trim())) {
      setCoordinateError(true);
      return;
    }
    setCoordinateError(false);
    onSubmit(draft);
  }

  return (
    <section className="planning-subsection">
      <h2>{t('m5s3.common.edit')}</h2>
      {lifecycle.showDiscardConfirm ? (
        <PlanningDiscardConfirmation
          onKeepEditing={lifecycle.keepEditing}
          onDiscard={lifecycle.discard}
        />
      ) : null}
      <form id="place-edit-form" className="form-grid" onSubmit={submit}>
        <label htmlFor="place-edit-description">
          {t('m5s3.common.description')}
        </label>
        <textarea
          id="place-edit-description"
          name="description"
          rows={4}
          value={draft.description}
          onChange={(event) => updateDraft({ description: event.target.value })}
        />
        <label htmlFor="place-edit-address">{t('m5s3.place.address')}</label>
        <input
          id="place-edit-address"
          name="address"
          value={draft.address}
          onChange={(event) => updateDraft({ address: event.target.value })}
        />
        <div className="planning-coordinate-grid">
          <div className="field-group">
            <label htmlFor="place-edit-latitude">
              {t('m5s3.place.latitude')}
            </label>
            <input
              id="place-edit-latitude"
              name="latitude"
              type="number"
              step="any"
              min="-90"
              max="90"
              value={draft.latitude}
              onChange={(event) =>
                updateDraft({ latitude: event.target.value })
              }
              aria-invalid={coordinateError}
              aria-describedby={
                coordinateError
                  ? 'place-edit-coordinate-help place-edit-coordinate-error'
                  : 'place-edit-coordinate-help'
              }
            />
          </div>
          <div className="field-group">
            <label htmlFor="place-edit-longitude">
              {t('m5s3.place.longitude')}
            </label>
            <input
              id="place-edit-longitude"
              name="longitude"
              type="number"
              step="any"
              min="-180"
              max="180"
              value={draft.longitude}
              onChange={(event) =>
                updateDraft({ longitude: event.target.value })
              }
              aria-invalid={coordinateError}
              aria-describedby={
                coordinateError
                  ? 'place-edit-coordinate-help place-edit-coordinate-error'
                  : 'place-edit-coordinate-help'
              }
            />
          </div>
        </div>
        <p
          id="place-edit-coordinate-help"
          className="field-help planning-coordinate-help"
        >
          {t('m5s3.place.coordinateHelp')}
        </p>
        {coordinateError ? (
          <p
            id="place-edit-coordinate-error"
            className="field-error"
            role="alert"
          >
            {t('m5s3.place.coordinatePairError')}
          </p>
        ) : null}
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button type="submit" disabled={isPending}>
            {updatePending
              ? t('m5s3.common.saving')
              : t('m5s3.common.saveChanges')}
          </button>
          <button
            type="button"
            className="tertiary"
            onClick={lifecycle.requestClose}
            disabled={isPending}
          >
            {t('common.cancel')}
          </button>
        </div>
        {updateError ? <ProblemState error={updateError} /> : null}
      </form>

      {place.capabilities.canDelete ? (
        <div style={{ marginTop: 'var(--space-8)' }}>
          {!confirmDelete ? (
            <button
              ref={deleteTriggerRef}
              type="button"
              className="button-link danger-link"
              onClick={() => setConfirmDelete(true)}
              disabled={isPending}
            >
              {t('m5s3.common.delete')}
            </button>
          ) : (
            <section
              className="planning-danger-zone"
              aria-labelledby="place-delete-heading"
            >
              <h2
                ref={deleteHeadingRef}
                id="place-delete-heading"
                tabIndex={-1}
              >
                {t('m5s3.common.deleteHeading')}
              </h2>
              <p>{t('m5s3.place.deleteConsequence')}</p>
              <div className="planning-confirm-row">
                <button
                  type="button"
                  className="danger"
                  onClick={onDelete}
                  disabled={isPending}
                >
                  {deletePending
                    ? t('m5s3.common.deleting')
                    : t('m5s3.common.confirmDelete')}
                </button>
                <button
                  type="button"
                  className="tertiary"
                  onClick={() => {
                    restoreDeleteTriggerRef.current = true;
                    setConfirmDelete(false);
                  }}
                  disabled={isPending}
                >
                  {t('common.cancel')}
                </button>
              </div>
              {deleteError ? <ProblemState error={deleteError} /> : null}
            </section>
          )}
        </div>
      ) : null}
    </section>
  );
}

export function PlaceProductPage({
  apis,
  spaceId,
}: {
  apis: SharedPlanningApis;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const { placeId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { requestReturn, resolveOrigin } = useTaskOrigin();
  const originKey = (location.state as { taskOriginKey?: unknown } | null)
    ?.taskOriginKey;
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<PlaceDraft | null>(null);
  const editTriggerRef = useRef<HTMLButtonElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const key = authorSummaryQueryKeys.placeDetail(spaceId, placeId);

  const placeQuery = useQuery({
    queryKey: key,
    queryFn: () => {
      if (!placeId) throw new Error('Missing Place route parameter.');
      return apiCall(() => apis.places.getPlace({ spaceId, placeId }));
    },
    enabled: Boolean(placeId),
    retry: false,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      place,
      name,
      description,
      address,
      latitude,
      longitude,
    }: {
      place: PlaceDetail;
      name: string;
      description: string | null;
      address: string | null;
      latitude: number | null;
      longitude: number | null;
    }) =>
      apiCall(() =>
        apis.places.updatePlace({
          spaceId,
          placeId: place.id,
          ifMatch: planningIfMatch(place),
          placeUpdate: { name, description, address, latitude, longitude },
        }),
      ),
    onSuccess: async (place) => {
      queryClient.setQueryData(key, place);
      await invalidatePlaceConsumers(queryClient, spaceId);
      setIsEditing(false);
      setDraft(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (place: PlaceDetail) =>
      apiCall(() =>
        apis.places.deletePlace({
          spaceId,
          placeId: place.id,
          ifMatch: planningIfMatch(place),
        }),
      ),
    onMutate: (place) => ({
      focusTarget: deleteFocusTargetFromInfiniteData(
        queryClient.getQueryData<InfiniteItemsData<PlaceDetail>>(
          authorSummaryQueryKeys.placesOverview(spaceId),
        ),
        place.id,
      ),
    }),
    onSuccess: async (_result, _place, context) => {
      queryClient.removeQueries({ queryKey: key });
      await invalidatePlaceConsumers(queryClient, spaceId);
      navigate(MORE_PLACES_ROUTE, {
        replace: true,
        state: {
          [PLANNING_DELETE_FOCUS_STATE_KEY]: context.focusTarget,
        },
      });
    },
  });

  if (!placeId)
    return (
      <UiState
        kind="error"
        title={t('states.unknown.title')}
        body={t('states.unknown.body')}
      />
    );
  if (placeQuery.isLoading)
    return <UiState kind="loading" title={t('m5s3.place.loading')} />;
  if (placeQuery.error)
    return (
      <ProblemState
        error={placeQuery.error}
        onRetry={() => void placeQuery.refetch()}
      />
    );
  const place = placeQuery.data;
  if (!place) return null;

  return (
    <div className="page planning-page">
      <PageHeader
        before={
          <button
            type="button"
            className="back-link tertiary"
            onClick={() => requestReturn(originKey, MORE_PLACES_ROUTE)}
          >
            {t(
              resolveOrigin(originKey)
                ? 'taskBoundary.back'
                : 'm5s3.common.backToPlaces',
            )}
          </button>
        }
        eyebrow={t('m5s3.place.detailEyebrow')}
        title={place.name}
        titleEditor={
          isEditing ? (
            <input
              ref={titleInputRef}
              form="place-edit-form"
              name="name"
              required
              maxLength={200}
              value={draft?.name ?? place.name}
              onChange={(event) =>
                setDraft((current) => ({
                  ...(current ?? placeDraft(place)),
                  name: event.target.value,
                }))
              }
              aria-label={t('m5s3.place.name')}
            />
          ) : undefined
        }
        description={place.description || t('m5s3.place.noDescription')}
        titleAction={
          place.capabilities.canEdit && !isEditing ? (
            <ListEntryIconButton
              ref={editTriggerRef}
              icon="edit"
              className="tertiary"
              label={t('common.edit')}
              onClick={() => {
                setDraft(placeDraft(place));
                setIsEditing(true);
              }}
            />
          ) : undefined
        }
      />

      <div className="planning-detail-grid">
        {isEditing && draft ? (
          <PlaceEditor
            place={place}
            draft={draft}
            setDraft={setDraft}
            titleInputRef={titleInputRef}
            editTriggerRef={editTriggerRef}
            updatePending={updateMutation.isPending}
            updateError={updateMutation.error}
            deletePending={deleteMutation.isPending}
            deleteError={deleteMutation.error}
            onSubmit={(next) =>
              updateMutation.mutate({
                place,
                name: next.name.trim(),
                description: next.description.trim() || null,
                address: next.address.trim() || null,
                latitude: next.latitude.trim()
                  ? Number(next.latitude.trim())
                  : null,
                longitude: next.longitude.trim()
                  ? Number(next.longitude.trim())
                  : null,
              })
            }
            onDelete={() => deleteMutation.mutate(place)}
            onClose={() => {
              setIsEditing(false);
              setDraft(null);
              updateMutation.reset();
              deleteMutation.reset();
            }}
          />
        ) : null}

        <section className="planning-subsection">
          <h2>{t('m5s3.place.locationHeading')}</h2>
          <p>
            <strong>{t('m5s3.place.address')}:</strong>{' '}
            {place.address || t('m5s3.place.noAddress')}
          </p>
          <details className="planning-technical-details">
            <summary>{t('m5s3.place.technicalDetails')}</summary>
            {place.latitude != null && place.longitude != null ? (
              <p className="planning-meta">
                {t('m5s3.place.coordinates', {
                  latitude: place.latitude,
                  longitude: place.longitude,
                })}
              </p>
            ) : (
              <p className="planning-meta">{t('m5s3.place.nameOnly')}</p>
            )}
            <p className="planning-meta">{t('m5s3.place.noMap')}</p>
          </details>
        </section>
      </div>

      <PlanningRelationManager
        apis={apis}
        spaceId={spaceId}
        ownerKind="place"
        ownerId={place.id}
        canManage={place.capabilities.canEdit}
      />
    </div>
  );
}
