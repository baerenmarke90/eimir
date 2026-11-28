import './FreeComposer.css';
import './PagePlanComposer.css';
import './PageComposerDetail.css';
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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { PlanAnticipation } from '../api/generated/models/PlanAnticipation';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import type { PlanUpdate } from '../api/generated/models/PlanUpdate';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { assertOnlineWrite, isClientOnline } from '../client/connectivity';
import { invalidateDashboard } from '../client/dashboardQueries';
import {
  calendarPresentation,
  discreetTitleSuggestions,
  planListTitle,
} from '../client/discreetPlans';
import { formatCalendarDate } from '../client/formatRecency';
import { photoPlaceMapUrl } from '../client/photoPlaces';
import { usePlanStoryCapture } from '../client/planStoryCapture';
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
import { appRoutePath, wishDetailPath } from '../client/routes';
import {
  dateFromInput,
  dateOnlyInput,
  loadAllPlaces,
  localCalendarDateInput,
  planningIfMatch,
  planScheduleDateInput,
  planScheduleEndInput,
  planScheduleFromInputs,
  planScheduleTimeInput,
  type SharedPlanningApis,
} from '../client/sharedPlanning';
import { useTaskOrigin } from '../client/taskOrigin';
import { usePlanFileDrafts } from '../client/usePlanFileDrafts';
import { planPhotos, usePlanPhotoDrafts } from '../client/usePlanPhotoDrafts';
import { useTranslation } from '../i18n';
import { CommentsPanel } from './CommentsPanel';
import { ComposerDateContext } from './ComposerDateContext';
import type { ContextTagEditorHandle } from './ContextTagEditor';
import { ContextTagList } from './ContextTagList';
import {
  type DiscreetDraft,
  DiscreetLock,
  DiscreetPlanEditor,
  useDiscreetReveal,
} from './DiscreetPlan';
import { EimirIcon } from './EimirIcon';
import { ExpandableDescription } from './ExpandableDescription';
import {
  ItemDeleteSheet,
  ItemMenuOption,
  ItemMenuSheet,
  ItemMenuTrigger,
  leaveItemMenu,
} from './ItemActions';
import { MemoryTagChoices } from './MemoryTagChoices';
import { MomentMapLink } from './MomentMapLink';
import { NativeDateInput } from './NativeDateField';
import {
  ComposerDescriptionField,
  ComposerTool,
  ComposerToolRow,
} from './PageComposer';
import { PlaceChoicePicker } from './PlaceChoicePicker';
import { PlanCalendarSheet } from './PlanCalendarSheet';
import { PlanCollectionLinks } from './PlanCollectionLinks';
import { PlanCover } from './PlanCover';
import { PlanFilesEditor, PlanFilesList } from './PlanFiles';
import { PlanNoteLinks } from './PlanNoteLinks';
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
import { PlanStoryContinuation } from './PlanStoryContinuation';
import { PlanStoryLinks } from './PlanStoryLinks';
import { PlanWishLink } from './PlanWishLink';
import { PlanAnticipationChoice } from './PlanAnticipationChoice';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import { ComposerHeader } from './StoryFormPageShell';
import { TaskBackButton } from './TaskBackButton';
import { UiState } from './UiState';
import { usePlanCompletion } from './usePlanCompletion';
import { useTransientFlag } from './useTransientFlag';
import { WishOriginMark } from './WishJourney';
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
  const captureStory = usePlanStoryCapture({
    planId,
    spaceId,
    accountId,
    apiBaseUrl,
  });
  const taskState = location.state as {
    taskOriginKey?: unknown;
    planningCreated?: boolean;
  } | null;
  const originKey = taskState?.taskOriginKey;
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReturn, setConfirmReturn] = useState(false);
  const deleteSheet = useRef<ShortTaskSheetHandle>(null);
  const returnSheet = useRef<ShortTaskSheetHandle>(null);
  const menuSheet = useRef<ShortTaskSheetHandle>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTitleValue, setEditTitleValue] = useState('');
  const editFocus = useRef<HTMLDivElement>(null);
  const mapReturnFocusEntry = useRef<string | null>(null);
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
  const [fileToolHost, setFileToolHost] = useState<HTMLSpanElement | null>(
    null,
  );
  const [tagToolHost, setTagToolHost] = useState<HTMLSpanElement | null>(null);
  const [listToolHost, setListToolHost] = useState<HTMLSpanElement | null>(
    null,
  );
  const [noteToolHost, setNoteToolHost] = useState<HTMLSpanElement | null>(
    null,
  );
  const tagEditor = useRef<ContextTagEditorHandle>(null);
  const [completionTarget, setCompletionTarget] = useState<string | null>(null);
  const completionTrigger = useRef<HTMLButtonElement>(null);
  const wishOriginLink = useRef<HTMLAnchorElement>(null);
  const [completionSheetPresent, setCompletionSheetPresent] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanDetail | null>(null);
  const [editDirty, setEditDirty] = useState(false);
  const [photosChanged, setPhotosChanged] = useState(false);
  const [removedFileIds, setRemovedFileIds] = useState<string[]>([]);
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
  const [anticipation, setAnticipation] =
    useState<PlanAnticipation>('AUTOMATIC');
  const [discreetDraft, setDiscreetDraft] = useState<DiscreetDraft>({
    discreet: false,
    titleMode: 'PREVIEW',
    previewTitle: '',
  });
  const [selectedPlaceId, setSelectedPlaceId] = useState('');
  const editTitle = useRef<HTMLInputElement>(null);
  const scheduleFields = useRef<PlanScheduleFieldsHandle>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
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
  // Per-view reveal: never persisted; conceals again on leave or background.
  const discreetReveal = useDiscreetReveal(
    `plan:${spaceId}:${planId}`,
    Boolean(planQuery.data?.discreet) && !isEditing,
  );
  const revealToggle = useRef<HTMLButtonElement>(null);
  const scheduleButton = useRef<HTMLButtonElement>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const focusRevealToggle = useRef(false);
  useLayoutEffect(() => {
    if (!focusRevealToggle.current) return;
    focusRevealToggle.current = false;
    revealToggle.current?.focus();
  });
  const placesQuery = useQuery({
    queryKey: authorSummaryQueryKeys.placeOptions(spaceId),
    queryFn: () => apiCall(() => loadAllPlaces(apis, spaceId)),
    staleTime: 30_000,
    retry: false,
  });
  const savedFiles = (planQuery.data?.fileAttachments ?? []).filter(
    (file) => !removedFileIds.includes(file.id),
  );
  const files = usePlanFileDrafts(
    {
      apis: mediaApis,
      apiBaseUrl: apiBaseUrl ?? '',
      accessToken: accessToken ?? '',
      spaceId,
      accountId: accountId ?? '',
      resourceKey: planId,
    },
    savedFiles.length,
  );
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
      files.clear();
      setRemovedFileIds([]);
      setIsEditing(false);
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
    restoreFocusRef: menuTrigger,
    onEscape: () => Boolean(document.querySelector('dialog[open]')),
    onClose: () => {
      photos.clear();
      files.clear();
      setRemovedFileIds([]);
      setIsEditing(false);
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
      // The server discards the plan and reopens its wish.
      queryClient.removeQueries({ queryKey: key });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['m5-s3', 'plans', spaceId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['m5-s3', 'wishes', spaceId],
        }),
        invalidateDashboard(queryClient, spaceId),
      ]);
      const goToWishes = () =>
        navigate(`${appRoutePath('plan')}#wishes`, { replace: true });
      if (returnSheet.current)
        returnSheet.current.closeForNavigation(goToWishes);
      else goToWishes();
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
      const goToPlans = () =>
        navigate(`${appRoutePath('plan')}#plans`, { replace: true });
      if (deleteSheet.current)
        deleteSheet.current.closeForNavigation(goToPlans);
      else goToPlans();
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
      files.hasPending ||
      files.hasFailed ||
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
        anticipation,
        ...(discreetDraft.discreet || plan.discreet
          ? {
              discreet: discreetDraft.discreet,
              discreetTitleMode: discreetDraft.titleMode,
              previewTitle: discreetDraft.previewTitle.trim() || null,
            }
          : {}),
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
        ...(files.readyIds.length || removedFileIds.length
          ? {
              fileAttachmentChanges: {
                add: files.readyIds,
                remove: removedFileIds,
              },
            }
          : {}),
      },
    });
  }

  function startEdit() {
    if (!plan || isPlanWritePending()) return;
    setEditingPlan(plan);
    setEditTags(plan.tags ?? []);
    setEditTitleValue(plan.title);
    setIsEditing(true);
    setEditDirty(false);
    photos.load(planPhotos(plan), plan.selectedCoverAttachmentId);
    setPhotosChanged(false);
    setRemovedFileIds([]);
    setAnticipation(plan.anticipation ?? 'AUTOMATIC');
    setDiscreetDraft({
      discreet: plan.discreet ?? false,
      titleMode: plan.discreetTitleMode ?? 'PREVIEW',
      previewTitle: plan.previewTitle ?? '',
    });
    setSelectedPlaceId(plan.placeId ?? '');
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

  const lifecycleError = completion.error;
  // Discreet (#1790 F3): place, description, media, lists and comments stay
  // out of the DOM until this view is revealed; schedule actions remain.
  const concealed = discreetReveal.concealed;
  const toggleReveal = () => {
    focusRevealToggle.current = true;
    discreetReveal.toggle();
  };

  const place = listedPlace ?? linkedPlaceQuery.data;
  const placeName = place?.name ?? null;
  const scheduleLabel = planScheduleLabel(plan);
  const calendar = calendarPresentation(plan, placeName ?? undefined, t);
  // Only a dated, open Plan has a calendar entry to hand off.
  const hasCalendarEntry =
    plan.status !== 'COMPLETED' && Boolean(plan.plannedOn ?? plan.plannedStart);
  const hasSubfacts = Boolean(plan.experiencedOn);
  const showsLifecycle =
    plan.capabilities.canEdit && plan.status !== 'COMPLETED';
  // Ticking a plan off is the next step once its day has come or when it has
  // no day. Before that the action waits in the item menu, so a plan for next
  // month does not ask to be marked as experienced.
  const plannedDay = plan.plannedStart
    ? localCalendarDateInput(plan.plannedStart)
    : plan.plannedOn
      ? plan.plannedOn.toISOString().slice(0, 10)
      : null;
  const completionDue = !plannedDay || plannedDay <= localCalendarDateInput();
  // Dissolving the plan back into its wish is a rare correction, so it sits in
  // the item menu behind a confirmation instead of in the edit form.
  const canReturnToWish =
    Boolean(plan.sourceWishId) &&
    plan.capabilities.canEdit &&
    plan.status !== 'COMPLETED';
  // A completed Plan can become a Moment at any time, not only right after
  // completing it (#2158, Product Owner 2026-11-21).
  const canCaptureStory =
    plan.status === 'COMPLETED' && plan.capabilities.canEdit;
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
              {t('common.close')}
            </TaskBackButton>
          }
          title={t('common.edit')}
          action={
            <button
              form="plan-edit-form"
              type="submit"
              aria-label={
                updateMutation.isPending
                  ? t('common.saving')
                  : t('m5s3.common.saveChanges')
              }
              disabled={
                writesPending ||
                photos.hasPending ||
                photos.hasFailed ||
                files.hasPending ||
                files.hasFailed
              }
              data-saveable={Boolean(editTitleValue.trim())}
            >
              {updateMutation.isPending ? t('common.saving') : t('common.save')}
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
            plan.capabilities.canEdit || plan.capabilities.canDelete ? (
              <ItemMenuTrigger
                triggerRef={menuTrigger}
                label={t('m5s3.plan.menu')}
                open={menuOpen}
                onOpen={() => setMenuOpen(true)}
              />
            ) : undefined
          }
        />
      )}
      {!isEditing && saved ? (
        <p className="composer-saved-status" role="status">
          <EimirIcon name="check" />
          {t('composer.saved')}
        </p>
      ) : null}
      {!isEditing ? (
        plan.discreet ? (
          <div className="discreet-title-row">
            <h2 className="page-composer-title plan-detail-title">
              {concealed ? planListTitle(plan, t) : plan.title}
            </h2>
            {concealed && !plan.coverAttachment ? <DiscreetLock /> : null}
          </div>
        ) : (
          <h2 className="page-composer-title plan-detail-title">
            {plan.title}
          </h2>
        )
      ) : null}
      {!isEditing ? (
        <section
          className="planning-facts planen-detail-summary"
          aria-label={t('m5s3.plan.scheduleFacts')}
        >
          <div className="planen-detail-when-where">
            {hasCalendarEntry ? (
              <button
                ref={scheduleButton}
                type="button"
                className="planen-detail-schedule planen-detail-schedule-action"
                aria-haspopup="dialog"
                onClick={() => setCalendarOpen(true)}
              >
                <EimirIcon name="kalender" />
                {scheduleLabel}
              </button>
            ) : (
              <p className="planen-detail-schedule">
                <EimirIcon name="kalender" />
                {scheduleLabel ?? t('m5s3.overview.undatedHeading')}
              </p>
            )}
            {!isEditing && placeName && concealed ? (
              <span className="planen-schedule-place">
                <EimirIcon name="orte" />
                <span className="discreet-place-bar" aria-hidden="true" />
              </span>
            ) : null}
            {!isEditing && placeName && !concealed
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
                      returnFocusKey={`plan:${plan.id}:${linkedPlaceId}`}
                      returnFocusEntryRef={mapReturnFocusEntry}
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
          {hasCalendarEntry ? (
            <PlanCalendarSheet
              open={calendarOpen}
              onClose={() => setCalendarOpen(false)}
              restoreFocusRef={scheduleButton}
              plan={calendar.plan}
              location={calendar.location}
              sync={
                apiBaseUrl && accessToken && accountId
                  ? {
                      apiBaseUrl,
                      accessToken,
                      accountId,
                      spaceId: plan.spaceId,
                      planId: plan.id,
                      planVersion: plan.version,
                    }
                  : undefined
              }
            />
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
          {concealed ? (
            <PlanCover
              plan={plan}
              spaceId={spaceId}
              apiBaseUrl={apiBaseUrl}
              accessToken={accessToken}
              interactive={false}
              discreet
            />
          ) : (
            <PlanPhotoGallery
              plan={plan}
              spaceId={spaceId}
              apiBaseUrl={apiBaseUrl}
              accessToken={accessToken}
            />
          )}
          {plan.sourceWishId ? (
            <Link
              ref={wishOriginLink}
              className="plan-wish-origin"
              to={wishDetailPath(plan.sourceWishId)}
            >
              <WishOriginMark trailing>
                {t('wishJourney.fromWish')}
              </WishOriginMark>
            </Link>
          ) : null}
          {concealed ? (
            <section className="discreet-panel">
              <p>{t('discreetPlans.detail.concealedBody')}</p>
              <button
                ref={revealToggle}
                type="button"
                className="discreet-reveal-action"
                onClick={toggleReveal}
              >
                <EimirIcon name="eye" />
                {t('discreetPlans.detail.reveal')}
              </button>
            </section>
          ) : plan.discreet ? (
            <div className="discreet-conceal-row discreet-revealable">
              <button
                ref={revealToggle}
                type="button"
                className="secondary discreet-reveal-action"
                onClick={toggleReveal}
              >
                <EimirIcon name="lock" />
                {t('discreetPlans.detail.conceal')}
              </button>
            </div>
          ) : null}
          {plan.discreet ? (
            <p className="sr-only" role="status">
              {concealed
                ? t('discreetPlans.detail.concealed')
                : t('discreetPlans.detail.revealed')}
            </p>
          ) : null}
        </>
      ) : null}
      <div className="planning-detail-grid">
        {isEditing ? (
          <section
            id="plan-edit-section"
            className="planning-subsection free-composer"
          >
            <h2 className="sr-only">{t('common.edit')}</h2>
            {editorLifecycle.showDiscardConfirm ? (
              <PlanningDiscardConfirmation
                onKeepEditing={editorLifecycle.keepEditing}
                onDiscard={editorLifecycle.discard}
              />
            ) : null}
            <div ref={editFocus} tabIndex={-1} className="sr-only" />
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
                    defaultEnd={planScheduleEndInput(editingPlan ?? plan)}
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
              <div className="page-composer-writing composer-authored-surface">
                <label className="sr-only" htmlFor="plan-edit-title">
                  {t('common.title')}
                </label>
                <input
                  form="plan-edit-form"
                  ref={editTitle}
                  id="plan-edit-title"
                  name="title"
                  className="page-composer-title"
                  required
                  maxLength={200}
                  placeholder={t('m5s3.plan.titleHint')}
                  defaultValue={plan.title}
                  onChange={(event) => {
                    setEditTitleValue(event.target.value);
                    setEditDirty(true);
                  }}
                />
                <ComposerDescriptionField
                  form="plan-edit-form"
                  id="plan-edit-description"
                  hint={t('m5s3.plan.descriptionPlaceholder')}
                  rows={4}
                  defaultValue={plan.description ?? ''}
                />
              </div>
            </fieldset>
            <PlanFilesEditor
              drafts={files}
              savedFiles={savedFiles}
              toolHost={fileToolHost}
              disabled={writesPending || !apiBaseUrl || !accessToken}
              online={online}
              onChange={() => setEditDirty(true)}
              removeSaved={(id) => {
                setRemovedFileIds((ids) => [...ids, id]);
                setEditDirty(true);
              }}
            />
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
            <PlanNoteLinks
              apis={apis}
              spaceId={spaceId}
              accountId={accountId ?? ''}
              plan={plan}
              editing
              disabled={writesPending || !online}
              onNavigate={(destination) =>
                editorLifecycle.requestClose(destination)
              }
              renderTrigger={(open) =>
                noteToolHost
                  ? createPortal(
                      <ComposerTool
                        icon="notes"
                        label={t('sharedNotes.plan.tool')}
                        disabled={writesPending}
                        onClick={open}
                      />,
                      noteToolHost,
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
                <PlanAnticipationChoice
                  value={anticipation}
                  discreet={discreetDraft.discreet}
                  disabled={writesPending}
                  onChange={(value) => {
                    setAnticipation(value);
                    setEditDirty(true);
                  }}
                />
              ) : null}
              <DiscreetPlanEditor
                value={discreetDraft}
                suggestions={discreetTitleSuggestions(editingPlan ?? plan, t)}
                disabled={writesPending}
                onChange={(value) => {
                  setDiscreetDraft(value);
                  setEditDirty(true);
                }}
              />
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
          </section>
        ) : null}

        {!isEditing && !concealed && plan.description ? (
          <div className="planen-section planen-section-content">
            <ExpandableDescription
              text={plan.description}
              previewApi={apis.linkPreviews}
              spaceId={spaceId}
              scope={JSON.stringify([apiBaseUrl, accountId, plan.id])}
              offline={!online}
            />
          </div>
        ) : null}

        {!isEditing && !concealed && accessToken ? (
          <PlanFilesList
            key={JSON.stringify([apiBaseUrl, accountId, spaceId, plan.id])}
            attachments={mediaApis.attachments}
            files={plan.fileAttachments ?? []}
            apiBaseUrl={apiBaseUrl ?? ''}
            accessToken={accessToken}
            spaceId={spaceId}
            online={online}
          />
        ) : null}
        {!isEditing && !concealed ? (
          <ContextTagList tags={plan.tags} presentation="composer" />
        ) : null}
        {!isEditing && !concealed ? (
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
            <PlanNoteLinks
              key={JSON.stringify([
                'notes',
                apiBaseUrl,
                accountId,
                spaceId,
                plan.id,
              ])}
              apis={apis}
              spaceId={spaceId}
              accountId={accountId ?? ''}
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
              sourceLinkRef={wishOriginLink}
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
        <div hidden={isEditing || concealed} className="plan-discussion">
          <CommentsPanel
            inlineComposer
            key={JSON.stringify([apiBaseUrl, accountId, spaceId, plan.id])}
            commentsApi={apis.comments ?? mediaApis.comments}
            linkPreviewsApi={apis.linkPreviews}
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

        {!isEditing && showsLifecycle && completionDue ? (
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
          restoreFocusRef={completionDue ? completionTrigger : menuTrigger}
          onClose={() => setCompletionTarget(null)}
          isCloseBlocked={writesPending}
          footer={
            <button
              type="submit"
              form="plan-complete-form"
              aria-disabled={writesPending}
            >
              {completion.pendingDay
                ? t('common.saving')
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
            <span className="composer-tool-slot" ref={setFileToolHost} />
            <ComposerTool
              ref={placeTrigger}
              icon="orte"
              label={t('composer.place')}
              active={Boolean(selectedPlaceId)}
              disabled={writesPending}
              onClick={() => setPlaceOpen(true)}
            />
            <span className="composer-tool-slot" ref={setListToolHost} />
            <span className="composer-tool-slot" ref={setNoteToolHost} />
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
      <ItemMenuSheet
        open={menuOpen && !isEditing}
        title={t('navigation.quickCreatePlan')}
        restoreFocusRef={menuTrigger}
        sheetRef={menuSheet}
        onClose={() => setMenuOpen(false)}
      >
        {plan.capabilities.canEdit ? (
          <ItemMenuOption
            icon="pen"
            title={t('common.edit')}
            disabled={writesPending}
            onClick={() =>
              leaveItemMenu(menuSheet, startEdit, () => setMenuOpen(false))
            }
          />
        ) : null}
        {canCaptureStory
          ? (
              [
                ['memory', 'erinnerungen', 'm5s3.planStory.menuMemory'],
                ['heartMoment', 'denken', 'm5s3.planStory.menuHeartMoment'],
                ['milestone', 'meilensteine', 'm5s3.planStory.menuMilestone'],
              ] as const
            ).map(([kind, icon, label]) => (
              <ItemMenuOption
                key={kind}
                icon={icon}
                title={t(label)}
                disabled={writesPending}
                onClick={() =>
                  leaveItemMenu(
                    menuSheet,
                    () => captureStory(kind),
                    () => setMenuOpen(false),
                  )
                }
              />
            ))
          : null}
        {canReturnToWish ? (
          <ItemMenuOption
            icon="wuensche"
            title={t('m5s3.plan.returnToWish')}
            disabled={writesPending}
            onClick={() => {
              if (isPlanWritePending()) return;
              setMenuOpen(false);
              returnMutation.reset();
              setConfirmReturn(true);
            }}
          />
        ) : null}
        {showsLifecycle && !completionDue ? (
          <ItemMenuOption
            icon="check"
            title={t('m5s3.plan.complete')}
            disabled={writesPending}
            onClick={() => {
              if (isPlanWritePending()) return;
              setMenuOpen(false);
              setCompletionTarget(completionScope);
            }}
          />
        ) : null}
        {plan.capabilities.canDelete ? (
          <ItemMenuOption
            icon="trash"
            danger
            title={t('common.delete')}
            disabled={writesPending}
            onClick={() => {
              if (isPlanWritePending()) return;
              setMenuOpen(false);
              deleteMutation.reset();
              setConfirmDelete(true);
            }}
          />
        ) : null}
      </ItemMenuSheet>
      <ItemDeleteSheet
        sheetRef={returnSheet}
        open={confirmReturn && !isEditing}
        title={t('m5s3.plan.returnToWishConfirmTitle')}
        body={t('m5s3.plan.returnToWishConfirmBody')}
        confirmLabel={t('m5s3.plan.returnToWish')}
        pendingLabel={t('m5s3.plan.returning')}
        pending={returnMutation.isPending}
        error={returnMutation.error}
        restoreFocusRef={menuTrigger}
        onClose={() => setConfirmReturn(false)}
        onConfirm={() => {
          if (!isPlanWritePending()) returnMutation.mutate(plan);
        }}
      />
      <ItemDeleteSheet
        sheetRef={deleteSheet}
        open={confirmDelete && !isEditing}
        title={t('m5s3.common.deleteHeading')}
        body={t('m5s3.plan.deleteConsequence')}
        confirmLabel={t('m5s3.common.confirmDelete')}
        pendingLabel={t('common.deleting')}
        pending={deleteMutation.isPending}
        error={deleteMutation.error}
        restoreFocusRef={menuTrigger}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (!isPlanWritePending()) deleteMutation.mutate(plan);
        }}
      />
    </div>
  );
}
