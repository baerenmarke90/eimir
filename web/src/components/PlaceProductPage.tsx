import './FreeComposer.css';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type FormEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { PlaceDetail } from '../api/generated/models/PlaceDetail';
import {
  authorSummaryQueryKeys,
  invalidatePlaceConsumers,
} from '../client/authorSummaryConsumers';
import { assertOnlineWrite } from '../client/connectivity';
import {
  deleteFocusTargetFromInfiniteData,
  type InfiniteItemsData,
  PLANNING_DELETE_FOCUS_STATE_KEY,
} from '../client/deleteFocusTarget';
import {
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { MORE_PLACES_ROUTE } from '../client/routes';
import {
  planningIfMatch,
  type SharedPlanningApis,
} from '../client/sharedPlanning';
import { postSnackbar } from '../client/snackbar';
import { useTaskOrigin } from '../client/taskOrigin';
import { useTranslation } from '../i18n';
import { DestinationIcon } from './DestinationIcon';
import {
  ItemDeleteSheet,
  ItemMenuOption,
  ItemMenuSheet,
  ItemMenuTrigger,
  leaveItemMenu,
} from './ItemActions';
import { PageHeader } from './PageHeader';
import { PlaceMapPicker } from './PlaceMapPicker';
import { PlanningRelationManager } from './PlanningRelationManager';
import { ProblemState } from './ProblemState';
import { SharedContentSheet } from './SharedContentSheet';
import type { ShortTaskSheetHandle } from './ShortTaskSheet';
import { TaskBackButton } from './TaskBackButton';
import { UiState } from './UiState';
import './SharedPlanningPages.css';
import './SharedContentPages.css';

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
  open,
  apis,
  place,
  draft,
  setDraft,
  titleInputRef,
  restoreFocusRef,
  sheetRef,
  updatePending,
  updateError,
  onSubmit,
  onClose,
}: {
  open: boolean;
  apis: SharedPlanningApis;
  place: PlaceDetail;
  draft: PlaceDraft;
  setDraft: (draft: PlaceDraft) => void;
  titleInputRef: RefObject<HTMLInputElement | null>;
  restoreFocusRef: RefObject<HTMLButtonElement | null>;
  sheetRef: RefObject<ShortTaskSheetHandle | null>;
  updatePending: boolean;
  updateError: unknown;
  onSubmit: (draft: PlaceDraft) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [coordinateError, setCoordinateError] = useState(false);
  useEffect(() => {
    if (!open) setCoordinateError(false);
  }, [open]);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(placeDraft(place));
  const isPending = updatePending;

  const updateDraft = (values: Partial<PlaceDraft>) => {
    const next = { ...draft, ...values };
    setDraft(next);
    if (Boolean(next.latitude.trim()) === Boolean(next.longitude.trim())) {
      setCoordinateError(false);
    }
  };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    if (Boolean(draft.latitude.trim()) !== Boolean(draft.longitude.trim())) {
      setCoordinateError(true);
      return;
    }
    setCoordinateError(false);
    onSubmit(draft);
  }

  return (
    <SharedContentSheet
      open={open}
      title={t('common.edit')}
      isDirty={isDirty}
      isPending={isPending}
      initialFocusRef={titleInputRef}
      restoreFocusRef={restoreFocusRef}
      sheetRef={sheetRef}
      onClose={onClose}
    >
      {(requestClose) => (
        <>
          <form
            id="place-edit-form"
            className="form-grid free-composer"
            onSubmit={submit}
          >
            <fieldset
              disabled={isPending}
              className="shared-content-fields form-grid"
            >
              <label htmlFor="place-edit-name">{t('m5s3.place.name')}</label>
              <input
                ref={titleInputRef}
                id="place-edit-name"
                name="name"
                required
                maxLength={200}
                value={draft.name}
                onChange={(event) => updateDraft({ name: event.target.value })}
              />
              <PlaceMapPicker
                api={apis.places}
                spaceId={place.spaceId}
                disabled={isPending}
                value={
                  draft.latitude && draft.longitude
                    ? {
                        name: draft.name,
                        address: draft.address || null,
                        latitude: Number(draft.latitude),
                        longitude: Number(draft.longitude),
                      }
                    : undefined
                }
                onSelect={(selection) =>
                  updateDraft({
                    name: selection.name,
                    address: selection.address ?? '',
                    latitude: String(selection.latitude),
                    longitude: String(selection.longitude),
                  })
                }
              />
              <label htmlFor="place-edit-description">
                {t('m5s3.common.description')}
              </label>
              <textarea
                id="place-edit-description"
                name="description"
                rows={4}
                value={draft.description}
                onChange={(event) =>
                  updateDraft({ description: event.target.value })
                }
              />
              <label htmlFor="place-edit-address">
                {t('m5s3.place.address')}
              </label>
              <input
                id="place-edit-address"
                name="address"
                value={draft.address}
                onChange={(event) =>
                  updateDraft({ address: event.target.value })
                }
              />
              <details className="planning-technical-details">
                <summary>{t('m5s3.place.technicalDetails')}</summary>
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
              </details>
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
                    ? t('common.saving')
                    : t('m5s3.common.saveChanges')}
                </button>
                <button
                  type="button"
                  className="tertiary"
                  onClick={requestClose}
                  disabled={isPending}
                >
                  {t('common.cancel')}
                </button>
              </div>
              {updateError ? <ProblemState error={updateError} /> : null}
            </fieldset>
          </form>
        </>
      )}
    </SharedContentSheet>
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
  const { requestReturn } = useTaskOrigin();
  const originKey = (location.state as { taskOriginKey?: unknown } | null)
    ?.taskOriginKey;
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [draft, setDraft] = useState<PlaceDraft | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const editorSheetRef = useRef<ShortTaskSheetHandle>(null);
  const menuSheet = useRef<ShortTaskSheetHandle>(null);
  const deleteSheetRef = useRef<ShortTaskSheetHandle>(null);
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
    networkMode: 'always',
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
      apiCall(() => {
        assertOnlineWrite();
        return apis.places.updatePlace({
          spaceId,
          placeId: place.id,
          ifMatch: planningIfMatch(place),
          placeUpdate: { name, description, address, latitude, longitude },
        });
      }),
    onSuccess: async (place) => {
      queryClient.setQueryData(key, place);
      await invalidatePlaceConsumers(queryClient, spaceId);
      setIsEditing(false);
      setDraft(null);
    },
  });

  const archiveMutation = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: async (place: PlaceDetail) => {
      try {
        assertOnlineWrite();
        return await apis.places.updatePlace({
          spaceId,
          placeId: place.id,
          ifMatch: planningIfMatch(place),
          placeUpdate: { archived: !place.archived },
        });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onMutate: () => ({ isCurrent: captureAuthorizedQuery(queryClient, key) }),
    onSuccess: async (place, _previous, context) => {
      if (!context?.isCurrent()) return;
      queryClient.setQueryData(key, place);
      await invalidatePlaceConsumers(queryClient, spaceId);
      if (!context.isCurrent()) return;
      setMenuOpen(false);
      postSnackbar(
        t(place.archived ? 'm5s3.place.archived' : 'm5s3.place.restored'),
      );
    },
  });

  const deleteMutation = useMutation({
    networkMode: 'always',
    mutationFn: (place: PlaceDetail) =>
      apiCall(() => {
        assertOnlineWrite();
        return apis.places.deletePlace({
          spaceId,
          placeId: place.id,
          ifMatch: planningIfMatch(place),
        });
      }),
    onMutate: (place) => ({
      focusTarget: deleteFocusTargetFromInfiniteData(
        queryClient
          .getQueriesData<InfiniteItemsData<PlaceDetail>>({
            queryKey: authorSummaryQueryKeys.placesOverview(spaceId),
          })
          .map(([, data]) => data)
          .find((data) =>
            data?.pages.some((page) =>
              page.items.some((item) => item.id === place.id),
            ),
          ),
        place.id,
      ),
    }),
    onSuccess: async (_result, _place, context) => {
      const returnToOverview = () => {
        queryClient.removeQueries({ queryKey: key });
        void invalidatePlaceConsumers(queryClient, spaceId);
        navigate(MORE_PLACES_ROUTE, {
          replace: true,
          state: { [PLANNING_DELETE_FOCUS_STATE_KEY]: context.focusTarget },
        });
      };
      if (deleteSheetRef.current)
        deleteSheetRef.current.closeForNavigation(returnToOverview);
      else returnToOverview();
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
  if (
    placeQuery.error &&
    (!placeQuery.data ||
      ['unauthorized', 'permission', 'notFound'].includes(
        clientProblemKind(placeQuery.error),
      ))
  )
    return (
      <ProblemState
        error={placeQuery.error}
        onRetry={() => void placeQuery.refetch()}
      />
    );
  const place = placeQuery.data;
  if (!place) return null;

  return (
    <div className="page shared-content-page">
      <PageHeader
        before={
          <TaskBackButton
            onClick={() => requestReturn(originKey, MORE_PLACES_ROUTE)}
          />
        }
        className="shared-authored-heading"
        itemLabel={t('m5s3.place.detailEyebrow')}
        title={place.name}
        titleAction={
          place.capabilities.canEdit || place.capabilities.canDelete ? (
            <ItemMenuTrigger
              triggerRef={menuTriggerRef}
              label={t('m5s3.place.menu')}
              open={menuOpen}
              onOpen={() => {
                archiveMutation.reset();
                setMenuOpen(true);
              }}
            />
          ) : undefined
        }
      />

      {placeQuery.error ? (
        <ProblemState
          error={placeQuery.error}
          onRetry={() => void placeQuery.refetch()}
        />
      ) : null}

      <PlaceEditor
        open={isEditing}
        apis={apis}
        place={place}
        draft={draft ?? placeDraft(place)}
        setDraft={setDraft}
        titleInputRef={titleInputRef}
        restoreFocusRef={menuTriggerRef}
        sheetRef={editorSheetRef}
        updatePending={updateMutation.isPending}
        updateError={updateMutation.error}
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
        onClose={() => {
          setIsEditing(false);
          setDraft(null);
          updateMutation.reset();
        }}
      />

      <ItemMenuSheet
        open={menuOpen}
        title={t('m5s3.place.detailEyebrow')}
        restoreFocusRef={menuTriggerRef}
        sheetRef={menuSheet}
        isCloseBlocked={archiveMutation.isPending}
        onClose={() => setMenuOpen(false)}
      >
        {place.capabilities.canEdit ? (
          <ItemMenuOption
            icon="pen"
            title={t('common.edit')}
            disabled={archiveMutation.isPending}
            onClick={() =>
              leaveItemMenu(
                menuSheet,
                () => {
                  setDraft(placeDraft(place));
                  setIsEditing(true);
                },
                () => setMenuOpen(false),
              )
            }
          />
        ) : null}
        {place.capabilities.canEdit ? (
          <ItemMenuOption
            icon={place.archived ? 'undo' : 'download'}
            title={t(
              archiveMutation.isPending
                ? 'common.saving'
                : place.archived
                  ? 'm5s3.place.restore'
                  : 'm5s3.place.archive',
            )}
            disabled={archiveMutation.isPending}
            onClick={() => {
              if (!archiveMutation.isPending) archiveMutation.mutate(place);
            }}
          />
        ) : null}
        {place.capabilities.canDelete ? (
          <ItemMenuOption
            icon="trash"
            danger
            title={t('common.delete')}
            disabled={archiveMutation.isPending}
            onClick={() => {
              setMenuOpen(false);
              deleteMutation.reset();
              setDeleteOpen(true);
            }}
          />
        ) : null}
        {archiveMutation.error ? (
          <ProblemState error={archiveMutation.error} />
        ) : null}
      </ItemMenuSheet>

      <ItemDeleteSheet
        sheetRef={deleteSheetRef}
        open={deleteOpen}
        title={t('m5s3.common.deleteHeading')}
        body={t('m5s3.place.deleteConsequence')}
        confirmLabel={t('m5s3.common.confirmDelete')}
        pendingLabel={t('common.deleting')}
        pending={deleteMutation.isPending}
        error={deleteMutation.error}
        restoreFocusRef={menuTriggerRef}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate(place)}
      />

      {place.archived ? (
        <p className="planning-meta" role="status">
          {t('m5s3.place.scopeARCHIVED')}
        </p>
      ) : null}
      {place.address || place.description ? (
        <div className="shared-place-intro">
          {place.address ? (
            <p className="shared-place-address">
              <DestinationIcon icon="places" />
              <span>{place.address}</span>
            </p>
          ) : null}
          {place.description ? (
            <p className="shared-place-description">{place.description}</p>
          ) : null}
        </div>
      ) : null}
      <PlanningRelationManager
        apis={apis}
        spaceId={spaceId}
        ownerName={place.name}
        ownerKind="place"
        ownerId={place.id}
        canManage={place.capabilities.canEdit}
      />
      <details className="shared-place-details">
        <summary>{t('m5s3.place.locationHeading')}</summary>
        {place.latitude != null && place.longitude != null ? (
          <p>
            {t('m5s3.place.coordinates', {
              latitude: place.latitude,
              longitude: place.longitude,
            })}
          </p>
        ) : (
          <p>{t('m5s3.place.nameOnly')}</p>
        )}
      </details>
      {place.geocodingSource === 'openstreetmap' ? (
        <p className="shared-place-attribution">
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            © OpenStreetMap
          </a>
        </p>
      ) : null}
    </div>
  );
}
