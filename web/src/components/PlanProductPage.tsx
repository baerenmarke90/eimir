import { authorDisplayName } from '../client/authorPresentation';
import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { PlanDetail } from '../api/generated/models/PlanDetail';
import type { PlanSchedule } from '../api/generated/models/PlanSchedule';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { invalidateDashboard } from '../client/dashboardQueries';
import { normalizeClientError } from '../client/problemDetails';
import { appRoutePath } from '../client/routes';
import {
  planScheduleLabel,
  planStatusWord,
} from '../client/planningPresentation';
import {
  dateFromInput,
  dateOnlyInput,
  localDateTimeInput,
  loadAllPlaces,
  planningIfMatch,
  planScheduleDateInput,
  planScheduleFromInputs,
  planScheduleTimeInput,
  type SharedPlanningApis,
} from '../client/sharedPlanning';
import { useTranslation } from '../i18n';
import { useTaskOrigin } from '../client/taskOrigin';
import { DestinationIcon } from './DestinationIcon';
import { ListEntryIconButton } from './ListEntryActions';
import { PageHeader } from './PageHeader';
import { PlanScheduleFields } from './PlanScheduleFields';
import { PlanStoryContinuation } from './PlanStoryContinuation';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';
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
}: {
  apis: SharedPlanningApis;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const { planId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { requestReturn, resolveOrigin } = useTaskOrigin();
  const taskState = location.state as { taskOriginKey?: unknown } | null;
  const originKey = taskState?.taskOriginKey;
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const key = authorSummaryQueryKeys.planDetail(spaceId, planId);

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
    mutationFn: ({
      plan,
      title,
      description,
      placeId,
      experiencedOn,
    }: {
      plan: PlanDetail;
      title: string;
      description: string | null;
      placeId: string | null;
      experiencedOn?: Date;
    }) =>
      apiCall(() =>
        apis.plans.updatePlan({
          spaceId,
          planId: plan.id,
          ifMatch: planningIfMatch(plan),
          planUpdate: { title, description, placeId, experiencedOn },
        }),
      ),
    onSuccess: async (data) => {
      await commitPlan(data);
      setIsEditing(false);
      setConfirmDelete(false);
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: ({
      plan,
      schedule,
    }: {
      plan: PlanDetail;
      schedule: PlanSchedule;
    }) =>
      apiCall(() =>
        apis.plans.schedulePlan({
          spaceId,
          planId: plan.id,
          ifMatch: planningIfMatch(plan),
          planSchedule: schedule,
        }),
      ),
    onSuccess: commitPlan,
  });
  const unscheduleMutation = useMutation({
    mutationFn: (plan: PlanDetail) =>
      apiCall(() =>
        apis.plans.unschedulePlan({
          spaceId,
          planId: plan.id,
          ifMatch: planningIfMatch(plan),
        }),
      ),
    onSuccess: commitPlan,
  });
  const completeMutation = useMutation({
    mutationFn: ({
      plan,
      experiencedOn,
    }: {
      plan: PlanDetail;
      experiencedOn: Date;
    }) =>
      apiCall(() =>
        apis.plans.completePlan({
          spaceId,
          planId: plan.id,
          ifMatch: planningIfMatch(plan),
          planComplete: { experiencedOn },
        }),
      ),
    onSuccess: commitPlan,
  });
  const returnMutation = useMutation({
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
    if (!plan) return;
    const data = new FormData(event.currentTarget);
    const description = String(data.get('description')).trim();
    const placeId = String(data.get('placeId')).trim();
    const experiencedOn = String(data.get('experiencedOn')).trim();
    updateMutation.mutate({
      plan,
      title: String(data.get('title')).trim(),
      description: description || null,
      placeId: placeId || null,
      experiencedOn: experiencedOn ? dateFromInput(experiencedOn) : undefined,
    });
  }

  function submitSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!plan) return;
    const data = new FormData(event.currentTarget);
    const schedule = planScheduleFromInputs(
      String(data.get('plannedDate') ?? ''),
      String(data.get('plannedTime') ?? ''),
      String(data.get('plannedEnd') ?? ''),
    );
    if (!schedule) return;
    scheduleMutation.mutate({ plan, schedule });
  }

  function submitComplete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!plan) return;
    const data = new FormData(event.currentTarget);
    const experiencedOn = dateFromInput(String(data.get('experiencedOn')));
    if (!experiencedOn) return;
    completeMutation.mutate({ plan, experiencedOn });
  }

  const lifecycleError =
    scheduleMutation.error ||
    unscheduleMutation.error ||
    completeMutation.error ||
    returnMutation.error;

  const placeName = plan.placeId
    ? (placesQuery.data?.find((place) => place.id === plan.placeId)?.name ??
      null)
    : null;
  const scheduleLabel = planScheduleLabel(plan);
  const hasSubfacts = Boolean(plan.experiencedOn);
  const showsLifecycle =
    plan.capabilities.canEdit && plan.status !== 'COMPLETED';

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
              requestReturn(originKey, `${appRoutePath('plan')}#plans`)
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
              form="plan-edit-form"
              name="title"
              required
              maxLength={200}
              defaultValue={plan.title}
              aria-label={t('m5s3.common.title')}
            />
          ) : undefined
        }
        titleAction={
          plan.capabilities.canEdit && !isEditing ? (
            <ListEntryIconButton
              icon="edit"
              className="tertiary"
              label={t('common.edit')}
              onClick={() => setIsEditing(true)}
            />
          ) : undefined
        }
      />

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
          {placeName
            ? `${t('m5s3.plan.placeLabel', { name: placeName })} · `
            : ''}
          {t('m5s3.overview.createdBy', {
            name: authorDisplayName(plan.creator),
          })}
        </p>
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
          <section id="plan-edit-section" className="planning-subsection">
            <h2>{t('m5s3.common.edit')}</h2>
            <div className="form-grid">
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
                defaultValue={plan.placeId ?? ''}
              >
                <option value="">{t('m5s3.common.noPlace')}</option>
                {placesQuery.data?.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name}
                  </option>
                ))}
              </select>
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
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending
                    ? t('m5s3.common.saving')
                    : t('m5s3.common.saveChanges')}
                </button>
                <button
                  type="button"
                  className="tertiary"
                  onClick={() => {
                    setIsEditing(false);
                    setConfirmDelete(false);
                  }}
                >
                  {t('common.cancel')}
                </button>
              </div>
              {updateMutation.error ? (
                <ProblemState
                  error={updateMutation.error}
                  onRetry={() => void planQuery.refetch()}
                />
              ) : null}
            </div>

            {plan.capabilities.canDelete ? (
              <div style={{ marginTop: 'var(--space-8)' }}>
                {!confirmDelete ? (
                  <button
                    type="button"
                    className="button-link danger-link"
                    onClick={() => setConfirmDelete(true)}
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
                        onClick={() => deleteMutation.mutate(plan)}
                        disabled={deleteMutation.isPending}
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
            <p>{plan.description}</p>
          </section>
        ) : null}

        {!isEditing ? (
          <div
            className="planen-shared-note"
            role="note"
            aria-label={t('m5s3.plan.sharedTitle')}
          >
            <span className="planen-shared-note-icon" aria-hidden="true">
              <DestinationIcon icon="people" />
            </span>
            <div>
              <strong>{t('m5s3.plan.sharedTitle')}</strong>
              <p>{t('m5s3.plan.sharedBody')}</p>
            </div>
          </div>
        ) : null}

        {plan.status === 'COMPLETED' && completeMutation.isSuccess ? (
          <PlanStoryContinuation
            apis={apis}
            spaceId={spaceId}
            plan={plan}
            focusOnMount={completeMutation.isSuccess}
          />
        ) : null}

        {plan.status === 'COMPLETED' && !completeMutation.isSuccess ? (
          <section className="planen-completed-result">
            <p>{t('m5s3.plan.completedBody')}</p>
          </section>
        ) : null}

        {showsLifecycle ? (
          <details className="planen-operations">
            <summary>{t('m5s3.plan.actionsHeading')}</summary>
            <section className="planning-subsection">
              <h2>{t('m5s3.plan.lifecycleHeading')}</h2>
              <form className="form-grid" onSubmit={submitSchedule}>
                <PlanScheduleFields
                  idPrefix="plan-schedule"
                  defaultDate={planScheduleDateInput(plan)}
                  defaultTime={planScheduleTimeInput(plan)}
                  defaultEnd={localDateTimeInput(plan.plannedEnd)}
                  includeEnd
                />
                <div className="form-actions">
                  <button type="submit" disabled={scheduleMutation.isPending}>
                    {plan.status === 'PLANNED'
                      ? t('m5s3.plan.reschedule')
                      : t('m5s3.plan.schedule')}
                  </button>
                  {plan.status === 'PLANNED' ? (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => unscheduleMutation.mutate(plan)}
                      disabled={unscheduleMutation.isPending}
                    >
                      {t('m5s3.plan.unschedule')}
                    </button>
                  ) : null}
                </div>
              </form>

              {plan.sourceWishId ? (
                <button
                  type="button"
                  className="tertiary"
                  onClick={() => returnMutation.mutate(plan)}
                  disabled={returnMutation.isPending}
                >
                  {t('m5s3.plan.returnToWish')}
                </button>
              ) : null}
              {lifecycleError ? (
                <ProblemState
                  error={lifecycleError}
                  onRetry={() => void planQuery.refetch()}
                />
              ) : null}
              <form
                className="planen-complete-form"
                onSubmit={submitComplete}
                aria-label={t('m5s3.plan.complete')}
              >
                <label htmlFor="plan-complete-date">
                  {t('m5s3.plan.experiencedOn')}
                </label>
                <input
                  id="plan-complete-date"
                  name="experiencedOn"
                  type="date"
                  required
                  defaultValue={dateOnlyInput(new Date())}
                />
                <button
                  type="submit"
                  className="planen-complete-cta"
                  disabled={completeMutation.isPending}
                >
                  {t('m5s3.plan.complete')}
                </button>
              </form>
            </section>
          </details>
        ) : null}
      </div>
    </div>
  );
}
