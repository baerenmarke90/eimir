import './FreeComposer.css';
import './PagePlanComposer.css';
import './PageComposerDetail.css';
import { createPortal } from 'react-dom';
import { ComposerToolRow, ComposerTool } from './PageComposer';
import { PlaceChoicePicker } from './PlaceChoicePicker';
import { MomentMapLink } from './MomentMapLink';
import { photoPlaceMapUrl } from '../client/photoPlaces';
import { useTransientFlag } from './useTransientFlag';
import { NativeDateInput } from './NativeDateField';
import {
  onlineManager,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { LinkPreviewsApi } from '../api/generated/apis/LinkPreviewsApi';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import type { PlanUpdate } from '../api/generated/models/PlanUpdate';
import { Configuration } from '../client/apiConfiguration';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { assertOnlineWrite, isClientOnline } from '../client/connectivity';
import { invalidateDashboard } from '../client/dashboardQueries';
import { formatCalendarDate } from '../client/formatRecency';
import {
  planScheduleLabel,
  planStatusWord,
} from '../client/planningPresentation';
import {
  ClientProblemError,
  normalizeClientError,
} from '../client/problemDetails';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { createReferenceApis } from '../client/referenceFlow';
import { appRoutePath } from '../client/routes';
import {
  dateFromInput,
  dateOnlyInput,
  loadAllPlaces,
  localCalendarDateInput,
  localDateTimeInput,
  planningIfMatch,
  planScheduleDateInput,
  planScheduleFromInputs,
  planScheduleTimeInput,
  type SharedPlanningApis,
} from '../client/sharedPlanning';
import { useTaskOrigin } from '../client/taskOrigin';
import { planPhotos, usePlanPhotoDrafts } from '../client/usePlanPhotoDrafts';
import { useTranslation } from '../i18n';
import { CommentsPanel } from './CommentsPanel';
import { EimirIcon } from './EimirIcon';
import { ExpandableDescription } from './ExpandableDescription';
import { ComposerHeader } from './StoryFormPageShell';
import { ComposerDateContext } from './ComposerDateContext';
import { PlanCalendarAction } from './PlanCalendarAction';
import {
  PlanningDiscardConfirmation,
  usePlanningEditorLifecycle,
} from './PlanningEditorLifecycle';
import { PlanPhotoGallery } from './PlanPhotoGallery';
import { PlanPhotosEditor } from './PlanPhotosEditor';
import {
  PlanScheduleFields,
  type PlanScheduleFieldsHandle,
} from './PlanScheduleFields';
import { PlanCollectionLinks } from './PlanCollectionLinks';
import { PlanStoryContinuation } from './PlanStoryContinuation';
import { PlanStoryLinks } from './PlanStoryLinks';
import { PlanWishLink } from './PlanWishLink';
import { PreferenceSwitch } from './PreferenceSwitch';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet } from './ShortTaskSheet';
import { TaskBackButton } from './TaskBackButton';
import { MemoryTagChoices } from './MemoryTagChoices';
import { ContextTagList } from './ContextTagList';
import type { ContextTagEditorHandle } from './ContextTagEditor';
import { UiState } from './UiState';
import { usePlanCompletion } from './usePlanCompletion';
import './SharedPlanningPages.css';
import './PlanningReference.css';

async function apiCall<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export function PlanProductPage({
  apis,
  spaceId,
  apiBaseUrl,
  accessToken,
  accountId,
}: {
  apis: SharedPlanningApis;
  spaceId: string;
  apiBaseUrl?: string;
  accessToken?: string;
  accountId?: string;
}) {
  const { t } = useTranslation();
  const { planId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { requestReturn } = useTaskOrigin();
  const taskState = location.state as {
    taskOriginKey?: unknown;
    planningCreated?: boolean;
  } | null;
  const originKey = taskState?.taskOriginKey;
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTitleValue, setEditTitleValue] = useState('');
  const editFocus = useRef<HTMLDivElement>(null);
  const [saved, showSaved] = useTransientFlag(2500);
  useEffect(() => {
    if (taskState?.planningCreated) showSaved();
  }, [taskState?.planningCreated, showSaved]);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [placePending, setPlacePending] = useState(false);
  const placeTrigger = useRef<HTMLButtonElement>(null);
  const [photoToolHost, setPhotoToolHost] = useState<HTMLSpanElement | null>(
    null,
  );
  const [tagToolHost, setTagToolHost] = useState<HTMLSpanElement | null>(null);
  const [listToolHost, setListToolHost] = useState<HTMLSpanElement | null>(
    null,
  );
  const tagEditor = useRef<ContextTagEditorHandle>(null);
  const [completionTarget, setCompletionTarget] = useState<string | null>(null);
  const completionTrigger = useRef<HTMLButtonElement>(null);
  const [completionSheetPresent, setCompletionSheetPresent] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanDetail | null>(null);
  const [editDirty, setEditDirty] = useState(false);
  const [photosChanged, setPhotosChanged] = useState(false);
  const mediaApis = useMemo(
    () => createReferenceApis(apiBaseUrl ?? '', accessToken ?? ''),
    [apiBaseUrl, accessToken],
  );
  const photos = usePlanPhotoDrafts({
    apis: mediaApis,
    apiBaseUrl: apiBaseUrl ?? '',
    accessToken: accessToken ?? '',
    spaceId,
    accountId: accountId ?? '',
    resourceKey: planId,
  });
  const online = useSyncExternalStore(
    onlineManager.subscribe,
    isClientOnline,
    () => true,
  );
  const linkPreviewsApi = useMemo(
    () =>
      new LinkPreviewsApi(
        new Configuration({
          basePath: apiBaseUrl ?? '',
          headers: accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : undefined,
        }),
      ),
    [apiBaseUrl, accessToken],
  );
  const [anticipation, setAnticipation] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState('');
  const editTitle = useRef<HTMLInputElement>(null);
  const scheduleFields = useRef<PlanScheduleFieldsHandle>(null);
  const editTrigger = useRef<HTMLButtonElement>(null);
  const key = authorSummaryQueryKeys.planDetail(spaceId, planId);
  const planWriteKey = ['plan-write', spaceId, planId] as const;
  const otherWritePending =
    useIsMutating({ mutationKey: planWriteKey, exact: true }) > 0;

  const planQuery = useQuery({
    queryKey: key,
    queryFn: () => {
      if (!planId) throw new Error('Missing Plan route parameter.');
      return apiCall(() => apis.plans.getPlan({ spaceId, planId }));
    },
    enabled: Boolean(planId),
    retry: false,
  });
  const placesQuery = useQuery({
    queryKey: authorSummaryQueryKeys.placeOptions(spaceId),
    queryFn: () => apiCall(() => loadAllPlaces(apis, spaceId)),
    staleTime: 30_000,
    retry: false,
  });
  const linkedPlaceId = planQuery.data?.placeId;
  const listedPlace = placesQuery.data?.find(
    (place) => place.id === linkedPlaceId,
  );
  const linkedPlaceQuery = useQuery({
    queryKey: authorSummaryQueryKeys.placeDetail(
      spaceId,
      linkedPlaceId ?? undefined,
    ),
    queryFn: () => {
      if (!linkedPlaceId) throw new Error('Missing linked Plan place.');
      return apiCall(() =>
        apis.places.getPlace({ spaceId, placeId: linkedPlaceId }),
      );
    },
    enabled: Boolean(linkedPlaceId && !listedPlace && !placesQuery.isPending),
    retry: false,
  });
  const commitPlan = async (plan: PlanDetail) => {
    await queryClient.invalidateQueries({
      queryKey: ['context-tags', spaceId],
    });
    queryClient.setQueryData(key, plan);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['m5-s3', 'plans', spaceId] }),
      queryClient.invalidateQueries({ queryKey: key }),
      invalidateDashboard(queryClient, spaceId),
    ]);
  };

  const updateMutation = useMutation({
    mutationKey: planWriteKey,
    networkMode: 'always',
    mutationFn: async (intent: {
      plan: PlanDetail;
      values: PlanUpdate;
      ownsRead?: () => boolean;
    }) => {
      const { plan, values } = intent;
      const ownsRead = captureAuthorizedQuery(queryClient, key);
      intent.ownsRead = ownsRead;
      assertOnlineWrite();
      assertOnlineWrite();
      if (!ownsRead()) throw new ClientProblemError('permission');
      return apiCall(() =>
        apis.plans.updatePlan({
          spaceId,
          planId: plan.id,
          ifMatch: planningIfMatch(plan),
          planUpdate: values,
        }),
      );
    },
    onSuccess: async (data, intent) => {
      if (!intent.ownsRead?.()) return;
      await commitPlan(data);
      photos.clear();
      setIsEditing(false);
      setConfirmDelete(false);
      showSaved();
    },
  });

  const completion = usePlanCompletion({ apis, spaceId, planId });
  const completing = completion.isPending;
  const placeWritePending =
    useIsMutating({ mutationKey: ['plan-place-create', spaceId, planId] }) > 0;
  const writesPending =
    completing || otherWritePending || placeWritePending || placePending;
  const editorLifecycle = usePlanningEditorLifecycle({
    isActive: isEditing,
    isDirty: editDirty,
    isPending: writesPending,
    initialFocusRef: editFocus,
    restoreFocusRef: editTrigger,
    onEscape: () => Boolean(document.querySelector('dialog[open]')),
    onClose: () => {
      photos.clear();
      setIsEditing(false);
      setConfirmDelete(false);
    },
  });
  const returnMutation = useMutation({
    mutationKey: planWriteKey,
    mutationFn: (plan: PlanDetail) =>
      apiCall(() =>
        apis.plans.returnPlanToWish({
          spaceId,
          planId: plan.id,
          ifMatch: planningIfMatch(plan),
        }),
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['m5-s3', 'plans', spaceId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['m5-s3', 'wishes', spaceId],
        }),
        invalidateDashboard(queryClient, spaceId),
      ]);
      navigate(`${appRoutePath('plan')}#wishes`, { replace: true });
    },
  });
  const deleteMutation = useMutation({
    mutationKey: planWriteKey,
    mutationFn: (plan: PlanDetail) =>
      apiCall(() =>
        apis.plans.deletePlan({
          spaceId,
          planId: plan.id,
          ifMatch: planningIfMatch(plan),
        }),
      ),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: key });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['m5-s3', 'plans', spaceId],
        }),
        invalidateDashboard(queryClient, spaceId),
      ]);
      navigate(`${appRoutePath('plan')}#plans`, { replace: true });
    },
  });

  function isPlanWritePending() {
    return (
      completion.isInFlight() ||
      queryClient.isMutating({ mutationKey: planWriteKey, exact: true }) > 0 ||
      placePending
    );
  }

  if (!planId)
    return (
      <UiState
        kind="error"
        title={t('states.unknown.title')}
        body={t('states.unknown.body')}
      />
    );
  if (planQuery.isLoading)
    return <UiState kind="loading" title={t('m5s3.plan.loading')} />;
  if (planQuery.error)
    return (
      <ProblemState
        error={planQuery.error}
        onRetry={() => void planQuery.refetch()}
      />
    );
  const plan = planQuery.data;
  if (!plan) return null;

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !plan ||
      isPlanWritePending() ||
      placePending ||
      photos.hasPending ||
      photos.hasFailed ||
      photos.entries.length !== photos.items.length
    )
      return;
    if (scheduleFields.current?.reportValidity() === false) return;
    const tags = tagEditor.current?.commitDraft() ?? editTags;
    if (!tags) return;
    const data = new FormData(event.currentTarget);
    const description = String(data.get('description')).trim();
    const placeId = String(data.get('placeId')).trim();
    const experiencedOn = String(data.get('experiencedOn') ?? '').trim();
    updateMutation.mutate({
      plan: editingPlan ?? plan,
      values: {
        title: String(data.get('title')).trim(),
        tags,
        description: description || null,
        placeId: placeId || null,
        experiencedOn: experiencedOn ? dateFromInput(experiencedOn) : undefined,
        anticipationEnabled: anticipation,
        ...(plan.status !== 'COMPLETED'
          ? {
              schedule:
                planScheduleFromInputs(
                  String(data.get('plannedDate') ?? ''),
                  String(data.get('plannedTime') ?? ''),
                  String(data.get('plannedEnd') ?? ''),
                ) ?? null,
            }
          : {}),
        ...(photosChanged
          ? {
              attachments: photos.entries,
              selectedCoverAttachmentId: photos.selectedCoverAttachmentId,
            }
          : {}),
      },
    });
  }

  function submitComplete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!plan) return;
    const data = new FormData(event.currentTarget);
    const experiencedOn = dateFromInput(String(data.get('experiencedOn')));
    if (!experiencedOn) return;
    if (isPlanWritePending()) return;
    completion.complete({ plan, experiencedOn });
  }

  const lifecycleError = completion.error || returnMutation.error;

  const place = listedPlace ?? linkedPlaceQuery.data;
  const placeName = place?.name ?? null;
  const scheduleLabel = planScheduleLabel(plan);
  const hasSubfacts = Boolean(plan.experiencedOn);
  const showsLifecycle =
    plan.capabilities.canEdit && plan.status !== 'COMPLETED';
  const completionScope = `${spaceId}:${plan.id}`;
  const completionOpen =
    completionTarget === completionScope &&
    !isEditing &&
    showsLifecycle &&
    !completion.isConfirmed;

  return (
    <div
      className={`page planning-page planen-detail page-plan-detail${isEditing ? ' free-composer quiet-composer page-composer page-plan-composer' : ' page-composer-detail'}`}
    >
      {isEditing ? (
        <form
          id="plan-edit-form"
          onSubmit={(event) => {
            event.preventDefault();
            submitEdit(event);
          }}
        />
      ) : null}
      {isEditing ? (
        <ComposerHeader
          key="plan-edit-header"
          before={
            <TaskBackButton inline onClick={editorLifecycle.requestClose}>
              {t('taskBoundary.close')}
            </TaskBackButton>
          }
          title={t('m5s3.common.edit')}
          action={
            <button
              form="plan-edit-form"
              type="submit"
              aria-label={
                updateMutation.isPending
                  ? t('m5s3.common.saving')
                  : t('m5s3.common.saveChanges')
              }
              disabled={writesPending || photos.hasPending || photos.hasFailed}
              data-saveable={Boolean(editTitleValue.trim())}
            >
              {updateMutation.isPending
                ? t('m5s3.common.saving')
                : t('m5s3.common.save')}
            </button>
          }
        />
      ) : (
        <ComposerHeader
          key="plan-read-header"
          before={
            <TaskBackButton
              inline
              onClick={() =>
                requestReturn(originKey, `${appRoutePath('plan')}#plans`)
              }
            />
          }
          title={t('navigation.quickCreatePlan')}
          action={
            plan.capabilities.canEdit ? (
              <button
                type="button"
                ref={editTrigger}
                className="tertiary composer-detail-edit"
                disabled={writesPending}
                onClick={() => {
                  if (isPlanWritePending()) return;
                  setEditingPlan(plan);
                  setEditTags(plan.tags ?? []);
                  setEditTitleValue(plan.title);
                  setIsEditing(true);
                  setEditDirty(false);
                  photos.load(planPhotos(plan), plan.selectedCoverAttachmentId);
                  setPhotosChanged(false);
                  setAnticipation(plan.anticipationEnabled ?? false);
                  setSelectedPlaceId(plan.placeId ?? '');
                }}
              >
                {t('common.edit')}
              </button>
            ) : undefined
          }
        />
      )}
      {!isEditing && saved ? (
        <p className="composer-saved-status" role="status">
          <EimirIcon name="check" />
          {t('taskBoundary.saved')}
        </p>
      ) : null}
      {!isEditing ? (
        <section
          className="planning-facts planen-detail-summary"
          aria-label={t('m5s3.plan.scheduleFacts')}
        >
          <div className="planen-detail-when-where">
            <p className="planen-detail-schedule">
              <EimirIcon name="kalender" />
              {scheduleLabel ?? t('m5s3.overview.undatedHeading')}
            </p>
            {!isEditing && placeName
              ? (() => {
                  const destination = photoPlaceMapUrl(
                    place?.latitude ?? null,
                    place?.longitude ?? null,
                  );
                  const copy = (
                    <>
                      <EimirIcon name="orte" />
                      <span>{placeName}</span>
                    </>
                  );
                  return destination ? (
                    <MomentMapLink
                      className="planen-schedule-place"
                      to={destination}
                    >
                      {copy}
                    </MomentMapLink>
                  ) : (
                    <span className="planen-schedule-place">{copy}</span>
                  );
                })()
              : null}
          </div>
          {!isEditing && linkedPlaceQuery.error && !place ? (
            <ProblemState
              error={linkedPlaceQuery.error}
              onRetry={() => void linkedPlaceQuery.refetch()}
            />
          ) : null}
          {!isEditing && plan.status !== 'COMPLETED' ? (
            <PlanCalendarAction plan={plan} location={placeName ?? undefined} />
          ) : null}
          {plan.status === 'COMPLETED' ? (
            <p className="planen-detail-status">{planStatusWord(t, plan)}</p>
          ) : null}
          {completion.pendingDay && !completionOpen ? (
            <p className="planen-detail-pending" role="status">
              {t('m5s3.plan.completePending', {
                date: formatCalendarDate(completion.pendingDay),
              })}
            </p>
          ) : null}
          {hasSubfacts ? (
            <div className="planen-detail-subfacts">
              {plan.experiencedOn ? (
                <p>
                  <strong>{t('m5s3.plan.experiencedOn')}:</strong>{' '}
                  {formatCalendarDate(plan.experiencedOn)}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {!isEditing ? (
        <>
          <PlanPhotoGallery
            plan={plan}
            spaceId={spaceId}
            apiBaseUrl={apiBaseUrl}
            accessToken={accessToken}
          />
          <h2 className="page-composer-title plan-detail-title">
            {plan.title}
          </h2>
        </>
      ) : null}
      <div className="planning-detail-grid">
        {isEditing ? (
          <section
            id="plan-edit-section"
            className="planning-subsection free-composer"
          >
            <h2 className="sr-only">{t('m5s3.common.edit')}</h2>
            {editorLifecycle.showDiscardConfirm ? (
              <PlanningDiscardConfirmation
                onKeepEditing={editorLifecycle.keepEditing}
                onDiscard={editorLifecycle.discard}
              />
            ) : null}
            <div
              ref={editFocus}
              tabIndex={-1}
              className="planning-task-focus"
            />
            <fieldset
              className="form-grid planning-editor-fields"
              disabled={writesPending}
              onChange={() => setEditDirty(true)}
            >
              <input
                form="plan-edit-form"
                type="hidden"
                name="placeId"
                value={selectedPlaceId}
              />
              <div className="composer-context page-composer-context-row">
                {plan.status !== 'COMPLETED' ? (
                  <PlanScheduleFields
                    ref={scheduleFields}
                    compact
                    disabled={writesPending}
                    formId="plan-edit-form"
                    idPrefix="plan-schedule"
                    defaultDate={planScheduleDateInput(editingPlan ?? plan)}
                    defaultTime={planScheduleTimeInput(editingPlan ?? plan)}
                    defaultEnd={localDateTimeInput(
                      (editingPlan ?? plan).plannedEnd,
                    )}
                    includeEnd
                  />
                ) : (
                  <ComposerDateContext
                    formId="plan-edit-form"
                    idPrefix="plan-edit-experienced"
                    defaultValue={dateOnlyInput(plan.experiencedOn)}
                    name="experiencedOn"
                    label={t('m5s3.plan.experiencedOn')}
                  />
                )}
                {selectedPlaceId ? (
                  <button
                    type="button"
                    className="composer-place-context tertiary"
                    onClick={(event) => {
                      placeTrigger.current = event.currentTarget;
                      setPlaceOpen(true);
                    }}
                  >
                    <EimirIcon name="orte" />
                    {placesQuery.data?.find(
                      (item) => item.id === selectedPlaceId,
                    )?.name ?? placeName}
                  </button>
                ) : null}
              </div>
              <PlanPhotosEditor
                controller={photos}
                spaceId={spaceId}
                planId={plan.id}
                disabled={writesPending}
                canUpload={Boolean(apiBaseUrl && accessToken)}
                presentation="tools"
                pageWideDrop
                mediaTrigger={(open) =>
                  photoToolHost
                    ? createPortal(
                        <ComposerTool
                          icon="foto"
                          label={t('composer.photo')}
                          active={Boolean(photos.items.length)}
                          disabled={writesPending}
                          onClick={open}
                        />,
                        photoToolHost,
                      )
                    : null
                }
                photoSourceContext={
                  apiBaseUrl && accessToken && accountId
                    ? { apiBaseUrl, accessToken, accountId }
                    : undefined
                }
                onChange={() => {
                  setPhotosChanged(true);
                  setEditDirty(true);
                }}
              />
              <div className="page-composer-writing">
                <label className="sr-only" htmlFor="plan-edit-title">
                  {t('m5s3.common.title')}
                </label>
                <input
                  form="plan-edit-form"
                  ref={editTitle}
                  id="plan-edit-title"
                  name="title"
                  className="page-composer-title"
                  required
                  maxLength={200}
                  defaultValue={plan.title}
                  onChange={(event) => {
                    setEditTitleValue(event.target.value);
                    setEditDirty(true);
                  }}
                />
                <label className="sr-only" htmlFor="plan-edit-description">
                  {t('m5s3.common.description')}
                </label>
                <textarea
                  form="plan-edit-form"
                  id="plan-edit-description"
                  name="description"
                  className="page-composer-prose"
                  onInput={(event) => {
                    event.currentTarget.style.height = 'auto';
                    event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
                  }}
                  rows={4}
                  defaultValue={plan.description ?? ''}
                  placeholder={t('m5s3.common.description')}
                />
              </div>
            </fieldset>
            <PlanCollectionLinks
              apis={apis}
              spaceId={spaceId}
              plan={plan}
              editing
              disabled={writesPending || !online}
              renderTrigger={(open) =>
                listToolHost
                  ? createPortal(
                      <ComposerTool
                        icon="listen"
                        label={t('composer.list')}
                        disabled={writesPending}
                        onClick={open}
                      />,
                      listToolHost,
                    )
                  : null
              }
            />
            <MemoryTagChoices
              presentation="composer"
              parentType="PLAN"
              parentId={plan.id}
              selected={editTags}
              onChange={(tags) => {
                setEditTags(tags);
                setEditDirty(true);
              }}
              editorRef={tagEditor}
              onDraftChange={() => setEditDirty(true)}
              disabled={writesPending}
              renderTrigger={(open) =>
                tagToolHost
                  ? createPortal(
                      <ComposerTool
                        icon="tag"
                        label={t('composer.tag')}
                        active={Boolean(editTags.length)}
                        disabled={writesPending}
                        onClick={open}
                      />,
                      tagToolHost,
                    )
                  : null
              }
            />
            <PlanWishLink
              apis={apis}
              spaceId={spaceId}
              plan={plan}
              editing
              presentation="composer"
              disabled={writesPending}
              onLinked={async (updated) => {
                setEditingPlan((current) =>
                  current
                    ? {
                        ...current,
                        version: updated.version,
                        sourceWishId: updated.sourceWishId,
                      }
                    : current,
                );
                await commitPlan(updated);
              }}
            />
            <fieldset
              className="form-grid planning-editor-fields"
              disabled={writesPending}
              onChange={() => setEditDirty(true)}
            >
              {plan.status !== 'COMPLETED' ? (
                <PreferenceSwitch
                  label={t('relationshipReflections.anticipation.show')}
                  description={t('relationshipReflections.anticipation.help')}
                  checked={anticipation}
                  disabled={writesPending}
                  onCheckedChange={(value) => {
                    setAnticipation(value);
                    setEditDirty(true);
                  }}
                />
              ) : null}
              {updateMutation.error ? (
                <ProblemState
                  error={updateMutation.error}
                  onRetry={() => {
                    void planQuery.refetch().then((result) => {
                      if (result.data && !result.error) {
                        setEditingPlan((current) =>
                          current
                            ? { ...current, version: result.data.version }
                            : current,
                        );
                      }
                    });
                  }}
                />
              ) : null}
            </fieldset>

            {plan.capabilities.canDelete ? (
              <div style={{ marginTop: 'var(--space-8)' }}>
                {!confirmDelete ? (
                  <button
                    type="button"
                    className="button-link danger-link"
                    onClick={() => {
                      if (!isPlanWritePending()) setConfirmDelete(true);
                    }}
                    disabled={writesPending}
                  >
                    {t('m5s3.common.delete')}
                  </button>
                ) : (
                  <section
                    className="planning-danger-zone"
                    aria-labelledby="plan-delete-heading"
                  >
                    <h2 id="plan-delete-heading">
                      {t('m5s3.common.deleteHeading')}
                    </h2>
                    <p>{t('m5s3.plan.deleteConsequence')}</p>
                    <div className="planning-confirm-row">
                      <button
                        type="button"
                        className="danger"
                        onClick={() => {
                          if (!isPlanWritePending())
                            deleteMutation.mutate(plan);
                        }}
                        disabled={writesPending}
                      >
                        {deleteMutation.isPending
                          ? t('m5s3.common.deleting')
                          : t('m5s3.common.confirmDelete')}
                      </button>
                      <button
                        type="button"
                        className="tertiary"
                        onClick={() => setConfirmDelete(false)}
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                    {deleteMutation.error ? (
                      <ProblemState
                        error={deleteMutation.error}
                        onRetry={() => void planQuery.refetch()}
                      />
                    ) : null}
                  </section>
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        {!isEditing && plan.description ? (
          <div className="planen-section planen-section-content">
            <ExpandableDescription
              text={plan.description}
              previewApi={linkPreviewsApi}
              spaceId={spaceId}
              scope={JSON.stringify([apiBaseUrl, accountId, plan.id])}
              offline={!online}
            />
          </div>
        ) : null}

        {!isEditing ? (
          <ContextTagList tags={plan.tags} presentation="composer" />
        ) : null}
        {!isEditing ? (
          <div className="planen-detail-context">
            <PlanCollectionLinks
              key={JSON.stringify([
                'lists',
                apiBaseUrl,
                accountId,
                spaceId,
                plan.id,
              ])}
              apis={apis}
              spaceId={spaceId}
              plan={plan}
              disabled={writesPending || !online}
            />
            <PlanWishLink
              key={JSON.stringify([apiBaseUrl, accountId, spaceId, plan.id])}
              apis={apis}
              spaceId={spaceId}
              plan={plan}
              disabled={writesPending}
              onLinked={commitPlan}
            />
            {plan.status === 'COMPLETED' ? (
              <PlanStoryLinks
                key={JSON.stringify([
                  'story',
                  apiBaseUrl,
                  accountId,
                  spaceId,
                  plan.id,
                ])}
                apis={apis}
                spaceId={spaceId}
                planId={plan.id}
              />
            ) : null}
          </div>
        ) : null}
        <div hidden={isEditing} className="plan-discussion">
          <CommentsPanel
            inlineComposer
            key={JSON.stringify([apiBaseUrl, accountId, spaceId, plan.id])}
            commentsApi={apis.comments ?? mediaApis.comments}
            linkPreviewsApi={linkPreviewsApi}
            spaceId={spaceId}
            parentKind="plan"
            parentId={plan.id}
            currentAccountId={accountId ?? ''}
            canComment={plan.capabilities.canComment}
            offline={!online}
            labelledComposer
          />
        </div>

        {!isEditing && plan.status === 'COMPLETED' && completion.isConfirmed ? (
          <PlanStoryContinuation
            accountId={accountId}
            apiBaseUrl={apiBaseUrl}
            apis={apis}
            spaceId={spaceId}
            plan={plan}
            focusOnMount={completion.isConfirmed && !completionSheetPresent}
            justCompleted={completion.isConfirmed}
            sharedAchievementEnabled={completion.hasSharedAchievement}
          />
        ) : null}

        {plan.status === 'COMPLETED' &&
        !completion.isConfirmed &&
        !plan.capabilities.canEdit ? (
          <section className="planen-completed-result">
            <p>{t('m5s3.plan.completedBody')}</p>
          </section>
        ) : null}

        {isEditing && plan.sourceWishId ? (
          <section className="planning-subsection">
            <button
              type="button"
              className="tertiary"
              onClick={() => {
                if (!isPlanWritePending()) returnMutation.mutate(plan);
              }}
              disabled={writesPending}
            >
              {t('m5s3.plan.returnToWish')}
            </button>
          </section>
        ) : null}
        {!isEditing && showsLifecycle ? (
          <section className="planen-completion-action">
            {lifecycleError && !completionOpen ? (
              <ProblemState
                error={lifecycleError}
                onRetry={() => void planQuery.refetch()}
              />
            ) : null}
            <button
              ref={completionTrigger}
              type="button"
              className="planen-complete-cta"
              aria-haspopup="dialog"
              aria-expanded={completionOpen}
              aria-disabled={writesPending}
              onClick={() => {
                if (!isPlanWritePending()) setCompletionTarget(completionScope);
              }}
            >
              {t('m5s3.plan.complete')}
            </button>
          </section>
        ) : null}
        <ShortTaskSheet
          open={completionOpen}
          onPresenceChange={setCompletionSheetPresent}
          title={t('m5s3.plan.completeDateTitle')}
          className="planen-completion-sheet"
          restoreFocusRef={completionTrigger}
          onClose={() => setCompletionTarget(null)}
          isCloseBlocked={writesPending}
          footer={
            <button
              type="submit"
              form="plan-complete-form"
              aria-disabled={writesPending}
            >
              {completion.pendingDay
                ? t('m5s3.common.saving')
                : t('m5s3.plan.complete')}
            </button>
          }
        >
          {lifecycleError ? (
            <ProblemState
              error={lifecycleError}
              onRetry={() => void planQuery.refetch()}
            />
          ) : null}
          {completion.pendingDay ? (
            <p className="planen-detail-pending" role="status">
              {t('m5s3.plan.completePending', {
                date: formatCalendarDate(completion.pendingDay),
              })}
            </p>
          ) : null}
          <form
            id="plan-complete-form"
            className="planen-complete-form"
            onSubmit={submitComplete}
          >
            <label htmlFor="plan-complete-date">
              {t('m5s3.plan.experiencedOn')}
            </label>
            <NativeDateInput
              id="plan-complete-date"
              name="experiencedOn"
              required
              readOnly={writesPending}
              defaultValue={localCalendarDateInput()}
            />
          </form>
        </ShortTaskSheet>
      </div>
      {isEditing ? (
        <>
          <ComposerToolRow>
            <span className="composer-tool-slot" ref={setPhotoToolHost} />
            <ComposerTool
              ref={placeTrigger}
              icon="orte"
              label={t('composer.place')}
              active={Boolean(selectedPlaceId)}
              disabled={writesPending}
              onClick={() => setPlaceOpen(true)}
            />
            <span className="composer-tool-slot" ref={setListToolHost} />
            <span className="composer-tool-slot" ref={setTagToolHost} />
          </ComposerToolRow>
          <ShortTaskSheet
            open={placeOpen}
            title={t('m5s3.common.place')}
            restoreFocusRef={placeTrigger}
            isCloseBlocked={placePending}
            onClose={() => setPlaceOpen(false)}
          >
            {selectedPlaceId ? (
              <button
                type="button"
                className="tertiary"
                disabled={placePending}
                onClick={() => {
                  setSelectedPlaceId('');
                  setEditDirty(true);
                  setPlaceOpen(false);
                }}
              >
                {t('m5s3.common.noPlace')}
              </button>
            ) : null}
            <PlaceChoicePicker
              api={apis.places}
              spaceId={spaceId}
              queryKey={authorSummaryQueryKeys.placeOptions(spaceId)}
              offline={!online}
              confirmSharedCreate
              onPendingChange={setPlacePending}
              onChoose={(chosen) => {
                queryClient.setQueryData(
                  authorSummaryQueryKeys.placeOptions(spaceId),
                  (current: typeof placesQuery.data) => [
                    ...(current ?? []).filter(
                      (entry) => entry.id !== chosen.id,
                    ),
                    chosen,
                  ],
                );
                setSelectedPlaceId(chosen.id);
                setEditDirty(true);
                setPlacePending(false);
                setPlaceOpen(false);
              }}
            />
          </ShortTaskSheet>
        </>
      ) : null}
    </div>
  );
}
