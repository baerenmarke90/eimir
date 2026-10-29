import { authorDisplayName } from '../client/authorPresentation';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import type { PlanUpdate } from '../api/generated/models/PlanUpdate';
import { createReferenceApis } from '../client/referenceFlow';
import {
  uploadMemoryDraftAttachment,
  type DraftUploadPhase,
} from '../client/memoryAttachmentDraft';
import { assertOnlineWrite } from '../client/connectivity';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { invalidateDashboard } from '../client/dashboardQueries';
import {
  ClientProblemError,
  normalizeClientError,
} from '../client/problemDetails';
import { usePartnerNickname } from '../client/partnerNickname';
import { formatCalendarDate } from '../client/formatRecency';
import { appRoutePath } from '../client/routes';
import {
  planScheduleLabel,
  planStatusWord,
} from '../client/planningPresentation';
import {
  dateFromInput,
  dateOnlyInput,
  localDateTimeInput,
  localCalendarDateInput,
  loadAllPlaces,
  planningIfMatch,
  planScheduleDateInput,
  planScheduleFromInputs,
  planScheduleTimeInput,
  type SharedPlanningApis,
} from '../client/sharedPlanning';
import { useTranslation } from '../i18n';
import { useTaskOrigin } from '../client/taskOrigin';
import { PageHeader } from './PageHeader';
import { PlanScheduleFields } from './PlanScheduleFields';
import { PlanStoryContinuation } from './PlanStoryContinuation';
import { PreferenceSwitch } from './PreferenceSwitch';
import { PlanCover, PlanCoverField } from './PlanCover';
import { PlaceMapPicker, type PlaceMapSelection } from './PlaceMapPicker';
import {
  usePlanningEditorLifecycle,
  PlanningDiscardConfirmation,
} from './PlanningEditorLifecycle';
import { placeDetailPath } from '../client/routes';
import { Link } from 'react-router-dom';
import { ProblemState } from './ProblemState';
import { usePlanCompletion } from './usePlanCompletion';
import { UiState } from './UiState';
import { ShortTaskSheet } from './ShortTaskSheet';
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
  const { relationshipLabel } = usePartnerNickname();
  const { planId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { requestReturn, resolveOrigin } = useTaskOrigin();
  const taskState = location.state as { taskOriginKey?: unknown } | null;
  const originKey = taskState?.taskOriginKey;
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [completionTarget, setCompletionTarget] = useState<string | null>(null);
  const completionTrigger = useRef<HTMLButtonElement>(null);
  const [completionSheetPresent, setCompletionSheetPresent] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanDetail | null>(null);
  const [editDirty, setEditDirty] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);
  const [coverSensitive, setCoverSensitive] = useState(false);
  const [anticipation, setAnticipation] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState('');
  const [uploadPhase, setUploadPhase] = useState<DraftUploadPhase | null>(null);
  const readyCovers = useRef(new WeakMap<File, string>());
  const uploadController = useRef<AbortController | null>(null);
  const editTitle = useRef<HTMLInputElement>(null);
  const editTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => () => uploadController.current?.abort(), []);
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
  const commitPlan = async (plan: PlanDetail) => {
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
      file: File | null;
      ownsRead?: () => boolean;
    }) => {
      const { plan, values, file } = intent;
      const ownsRead = captureAuthorizedQuery(queryClient, key);
      intent.ownsRead = ownsRead;
      assertOnlineWrite();
      const next = { ...values };
      if (file) {
        if (!apiBaseUrl || !accessToken)
          throw new Error('Plan upload transport unavailable');
        let attachmentId = readyCovers.current.get(file);
        if (!attachmentId) {
          const controller = new AbortController();
          uploadController.current = controller;
          try {
            const ready = await uploadMemoryDraftAttachment(
              createReferenceApis(apiBaseUrl, accessToken),
              apiBaseUrl,
              accessToken,
              spaceId,
              file,
              setUploadPhase,
              fetch,
              { signal: controller.signal },
            );
            attachmentId = ready.attachmentId;
            readyCovers.current.set(file, attachmentId);
          } finally {
            setUploadPhase(null);
          }
        }
        next.coverAttachmentId = attachmentId;
      }
      assertOnlineWrite();
      if (!ownsRead()) throw new ClientProblemError('permission');
      return apiCall(() =>
        apis.plans.updatePlan({
          spaceId,
          planId: plan.id,
          ifMatch: planningIfMatch(plan),
          planUpdate: next,
        }),
      );
    },
    onSuccess: async (data, intent) => {
      if (!intent.ownsRead?.()) return;
      await commitPlan(data);
      setIsEditing(false);
      setConfirmDelete(false);
    },
  });

  const completion = usePlanCompletion({ apis, spaceId, planId });
  const completing = completion.isPending;
  const placeWritePending =
    useIsMutating({ mutationKey: ['plan-place-create', spaceId, planId] }) > 0;
  const writesPending = completing || otherWritePending || placeWritePending;
  const editorLifecycle = usePlanningEditorLifecycle({
    isActive: isEditing,
    isDirty: editDirty,
    isPending: writesPending,
    initialFocusRef: editTitle,
    restoreFocusRef: editTrigger,
    onEscape: () => Boolean(document.querySelector('dialog[open]')),
    onClose: () => {
      setIsEditing(false);
      setConfirmDelete(false);
    },
  });
  const createPlaceMutation = useMutation({
    mutationKey: ['plan-place-create', spaceId, planId],
    networkMode: 'always',
    mutationFn: (selection: PlaceMapSelection) =>
      apiCall(() => {
        assertOnlineWrite();
        return apis.places.createPlace({
          spaceId,
          placeCreate: {
            name: selection.name,
            address: selection.address ?? undefined,
            latitude: selection.latitude,
            longitude: selection.longitude,
          },
        });
      }),
    onSuccess: async (place) => {
      queryClient.setQueryData(
        authorSummaryQueryKeys.placeOptions(spaceId),
        (current: typeof placesQuery.data) => [
          ...(current ?? []).filter((item) => item.id !== place.id),
          place,
        ],
      );
      setSelectedPlaceId(place.id);
      setEditDirty(true);
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
      queryClient.isMutating({ mutationKey: planWriteKey, exact: true }) > 0
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
    if (!plan || isPlanWritePending() || createPlaceMutation.isPending) return;
    const data = new FormData(event.currentTarget);
    const description = String(data.get('description')).trim();
    const placeId = String(data.get('placeId')).trim();
    const experiencedOn = String(data.get('experiencedOn') ?? '').trim();
    updateMutation.mutate({
      plan: editingPlan ?? plan,
      file: coverFile,
      values: {
        title: String(data.get('title')).trim(),
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
        ...(coverRemoved ? { coverAttachmentId: null } : {}),
        ...(coverFile || plan.coverAttachment
          ? { coverIsSensitive: coverSensitive }
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

  const placeName = plan.placeId
    ? (placesQuery.data?.find((place) => place.id === plan.placeId)?.name ??
      null)
    : null;
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
    <div className="page planning-page planen-detail">
      {isEditing ? (
        <form
          id="plan-edit-form"
          onSubmit={(event) => {
            event.preventDefault();
            submitEdit(event);
          }}
        />
      ) : null}
      <PageHeader
        before={
          <button
            type="button"
            className="back-link tertiary"
            onClick={() =>
              isEditing
                ? editorLifecycle.requestClose()
                : requestReturn(originKey, `${appRoutePath('plan')}#plans`)
            }
          >
            {t(
              resolveOrigin(originKey)
                ? 'taskBoundary.back'
                : 'm5s3.common.back',
            )}
          </button>
        }
        title={plan.title}
        titleEditor={
          isEditing ? (
            <input
              ref={editTitle}
              disabled={writesPending}
              form="plan-edit-form"
              name="title"
              onChange={() => setEditDirty(true)}
              required
              maxLength={200}
              defaultValue={plan.title}
              aria-label={t('m5s3.common.title')}
            />
          ) : undefined
        }
        titleAction={
          plan.capabilities.canEdit && !isEditing ? (
            <button
              type="button"
              ref={editTrigger}
              className="secondary"
              aria-label={t('common.edit')}
              title={t('common.edit')}
              disabled={writesPending}
              onClick={() => {
                if (!isPlanWritePending()) {
                  setEditingPlan(plan);
                  setIsEditing(true);
                  setEditDirty(false);
                  setCoverFile(null);
                  setCoverRemoved(false);
                  setCoverSensitive(plan.coverAttachment?.isSensitive ?? false);
                  setAnticipation(plan.anticipationEnabled ?? false);
                  setSelectedPlaceId(plan.placeId ?? '');
                }
              }}
            >
              {t('common.edit')}
            </button>
          ) : undefined
        }
      />

      {!isEditing ? (
        <PlanCover
          plan={plan}
          spaceId={spaceId}
          apiBaseUrl={apiBaseUrl}
          accessToken={accessToken}
        />
      ) : null}
      <section
        className="planning-facts planen-detail-summary"
        aria-label={t('m5s3.plan.scheduleFacts')}
      >
        <p className="planen-detail-schedule">
          {scheduleLabel ?? t('m5s3.overview.undatedHeading')}
        </p>
        {plan.status === 'COMPLETED' ? (
          <p className="planen-detail-status">{planStatusWord(t, plan)}</p>
        ) : null}
        <p className="planen-detail-meta">
          {placeName && plan.placeId ? (
            <>
              <Link to={placeDetailPath(plan.placeId)}>{placeName}</Link> ·{' '}
            </>
          ) : null}
          {t('m5s3.overview.createdBy', {
            name: plan.creator.isFormerMember
              ? authorDisplayName(plan.creator)
              : relationshipLabel(
                  plan.creator.id,
                  plan.creator.displayName,
                  t('couplePresencePartnerFallback'),
                ),
          })}
        </p>
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
                {dateOnlyInput(plan.experiencedOn)}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="planning-detail-grid">
        {isEditing ? (
          <section
            id="plan-edit-section"
            className="planning-subsection"
            onChange={() => setEditDirty(true)}
          >
            <h2>{t('m5s3.common.edit')}</h2>
            {editorLifecycle.showDiscardConfirm ? (
              <PlanningDiscardConfirmation
                onKeepEditing={editorLifecycle.keepEditing}
                onDiscard={editorLifecycle.discard}
              />
            ) : null}
            <PlanCoverField
              file={coverFile}
              removed={coverRemoved}
              sensitive={coverSensitive}
              disabled={writesPending}
              existing={
                plan.coverAttachment ? (
                  <PlanCover
                    plan={plan}
                    spaceId={spaceId}
                    apiBaseUrl={apiBaseUrl}
                    accessToken={accessToken}
                  />
                ) : undefined
              }
              onFile={(file) => {
                setCoverFile(file);
                setCoverRemoved(false);
                setEditDirty(true);
              }}
              onRemove={() => {
                setCoverFile(null);
                setCoverRemoved(true);
                setEditDirty(true);
              }}
              onSensitive={(value) => {
                setCoverSensitive(value);
                setEditDirty(true);
              }}
            />
            {uploadPhase ? (
              <p role="status">
                {t(
                  uploadPhase === 'uploading'
                    ? 'm5s3.planImage.uploading'
                    : 'm5s3.planImage.validating',
                )}
              </p>
            ) : null}
            <fieldset
              className="form-grid planning-editor-fields"
              disabled={writesPending}
            >
              <label htmlFor="plan-edit-description">
                {t('m5s3.common.description')}
              </label>
              <textarea
                form="plan-edit-form"
                id="plan-edit-description"
                name="description"
                rows={4}
                defaultValue={plan.description ?? ''}
              />
              <label htmlFor="plan-edit-place">{t('m5s3.common.place')}</label>
              <select
                form="plan-edit-form"
                id="plan-edit-place"
                name="placeId"
                value={selectedPlaceId}
                onChange={(event) => setSelectedPlaceId(event.target.value)}
              >
                <option value="">{t('m5s3.common.noPlace')}</option>
                {placesQuery.data?.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name}
                  </option>
                ))}
              </select>
              <PlaceMapPicker
                api={apis.places}
                spaceId={spaceId}
                disabled={writesPending || createPlaceMutation.isPending}
                onSelect={(selection) => createPlaceMutation.mutate(selection)}
              />
              {createPlaceMutation.error ? (
                <ProblemState error={createPlaceMutation.error} />
              ) : null}
              {plan.status !== 'COMPLETED' ? (
                <>
                  <PlanScheduleFields
                    formId="plan-edit-form"
                    idPrefix="plan-schedule"
                    defaultDate={planScheduleDateInput(editingPlan ?? plan)}
                    defaultTime={planScheduleTimeInput(editingPlan ?? plan)}
                    defaultEnd={localDateTimeInput(
                      (editingPlan ?? plan).plannedEnd,
                    )}
                    includeEnd
                  />
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
                </>
              ) : null}
              <details>
                <summary>{t('m5s3.plan.sharedTitle')}</summary>
                <p>{t('m5s3.plan.sharedBody')}</p>
              </details>
              {plan.status === 'COMPLETED' ? (
                <>
                  <label htmlFor="plan-edit-experienced">
                    {t('m5s3.plan.experiencedOn')}
                  </label>
                  <input
                    form="plan-edit-form"
                    id="plan-edit-experienced"
                    name="experiencedOn"
                    type="date"
                    defaultValue={dateOnlyInput(plan.experiencedOn)}
                  />
                </>
              ) : null}
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button
                  form="plan-edit-form"
                  type="submit"
                  disabled={writesPending}
                >
                  {updateMutation.isPending
                    ? t('m5s3.common.saving')
                    : t('m5s3.common.saveChanges')}
                </button>
                <button
                  type="button"
                  className="tertiary"
                  onClick={() => {
                    editorLifecycle.requestClose();
                  }}
                >
                  {t('common.cancel')}
                </button>
              </div>
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
          <section className="planen-section">
            <h2>{t('m5s3.plan.notesHeading')}</h2>
            <div className="planen-section-content">
              <p>{plan.description}</p>
            </div>
          </section>
        ) : null}

        {plan.status === 'COMPLETED' &&
        (completion.isConfirmed || plan.capabilities.canEdit) ? (
          <PlanStoryContinuation
            accountId={accountId}
            apiBaseUrl={apiBaseUrl}
            apis={apis}
            spaceId={spaceId}
            plan={plan}
            focusOnMount={completion.isConfirmed && !completionSheetPresent}
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
            <input
              id="plan-complete-date"
              name="experiencedOn"
              type="date"
              required
              readOnly={writesPending}
              defaultValue={localCalendarDateInput()}
            />
          </form>
        </ShortTaskSheet>
      </div>
    </div>
  );
}
