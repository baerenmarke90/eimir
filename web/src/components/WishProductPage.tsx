import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { PlanSchedule } from '../api/generated/models/PlanSchedule';
import type { WishDetail } from '../api/generated/models/WishDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { invalidateDashboard } from '../client/dashboardQueries';
import { normalizeClientError } from '../client/problemDetails';
import {
  appRoutePath,
  MEMORY_CREATE_ROUTE,
  planDetailPath,
} from '../client/routes';
import {
  loadAllPlaces,
  planningIfMatch,
  planScheduleFromInputs,
  type SharedPlanningApis,
} from '../client/sharedPlanning';
import { useTranslation } from '../i18n';
import { useTaskOrigin } from '../client/taskOrigin';
import { ListEntryIconButton } from './ListEntryActions';
import { PageHeader } from './PageHeader';
import { PlanScheduleFields } from './PlanScheduleFields';
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

export function WishProductPage({
  apis,
  spaceId,
}: {
  apis: SharedPlanningApis;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const { wishId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { captureOrigin, requestReturn, resolveOrigin } = useTaskOrigin();
  const taskState = location.state as { taskOriginKey?: unknown } | null;
  const originKey = taskState?.taskOriginKey;
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showCompletionContinuation, setShowCompletionContinuation] =
    useState(false);
  const completionHeadingRef = useRef<HTMLHeadingElement>(null);
  const backLinkRef = useRef<HTMLButtonElement>(null);
  const key = authorSummaryQueryKeys.wishDetail(spaceId, wishId);

  useEffect(() => {
    if (!showCompletionContinuation) return;
    completionHeadingRef.current?.focus();
    completionHeadingRef.current?.scrollIntoView?.({ block: 'center' });
  }, [showCompletionContinuation]);

  const wishQuery = useQuery({
    queryKey: key,
    queryFn: () => {
      if (!wishId) throw new Error('Missing Wish route parameter.');
      return apiCall(() => apis.wishes.getWish({ spaceId, wishId }));
    },
    enabled: Boolean(wishId),
    retry: false,
  });

  const placesQuery = useQuery({
    queryKey: authorSummaryQueryKeys.placeOptions(spaceId),
    queryFn: () => apiCall(() => loadAllPlaces(apis, spaceId)),
    staleTime: 30_000,
    retry: false,
  });

  const updateMutation = useMutation({
    mutationFn: ({ wish, title }: { wish: WishDetail; title: string }) =>
      apiCall(() =>
        apis.wishes.updateWish({
          spaceId,
          wishId: wish.id,
          ifMatch: planningIfMatch(wish),
          wishUpdate: { title },
        }),
      ),
    onSuccess: async (wish) => {
      queryClient.setQueryData(key, wish);
      await queryClient.invalidateQueries({
        queryKey: ['m5-s3', 'wishes', spaceId],
      });
      setIsEditing(false);
      setConfirmDelete(false);
    },
  });

  const completeMutation = useMutation({
    mutationFn: (wish: WishDetail) =>
      apiCall(() =>
        apis.wishes.completeWish({
          spaceId,
          wishId: wish.id,
          ifMatch: planningIfMatch(wish),
        }),
      ),
    onSuccess: async (completedWish) => {
      queryClient.setQueryData(key, completedWish);
      setIsEditing(false);
      setConfirmDelete(false);
      setShowCompletionContinuation(true);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['m5-s3', 'wishes', spaceId],
        }),
        invalidateDashboard(queryClient, spaceId),
      ]);
    },
  });

  const convertMutation = useMutation({
    mutationFn: ({
      wish,
      title,
      description,
      placeId,
      schedule,
    }: {
      wish: WishDetail;
      title?: string;
      description?: string;
      placeId?: string;
      schedule?: PlanSchedule;
    }) =>
      apiCall(() =>
        apis.plans.convertWishToPlan({
          spaceId,
          wishId: wish.id,
          ifMatch: planningIfMatch(wish),
          wishToPlan: { title, description, placeId, schedule },
        }),
      ),
    onSuccess: async (result) => {
      queryClient.setQueryData(key, result.wish);
      queryClient.setQueryData(
        authorSummaryQueryKeys.planDetail(spaceId, result.plan.id),
        result.plan,
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['m5-s3', 'wishes', spaceId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['m5-s3', 'plans', spaceId],
        }),
        queryClient.invalidateQueries({ queryKey: key }),
        invalidateDashboard(queryClient, spaceId),
      ]);
      navigate(planDetailPath(result.plan.id), {
        replace: true,
        state: resolveOrigin(originKey)
          ? { taskOriginKey: originKey }
          : undefined,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (wish: WishDetail) =>
      apiCall(() =>
        apis.wishes.deleteWish({
          spaceId,
          wishId: wish.id,
          ifMatch: planningIfMatch(wish),
        }),
      ),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: key });
      await queryClient.invalidateQueries({
        queryKey: ['m5-s3', 'wishes', spaceId],
      });
      navigate(`${appRoutePath('plan')}#wishes`, { replace: true });
    },
  });

  if (!wishId) {
    return (
      <UiState
        kind="error"
        title={t('states.unknown.title')}
        body={t('states.unknown.body')}
      />
    );
  }
  if (wishQuery.isLoading) {
    return <UiState kind="loading" title={t('m5s3.wish.loading')} />;
  }
  if (wishQuery.error) {
    return (
      <ProblemState
        error={wishQuery.error}
        onRetry={() => void wishQuery.refetch()}
      />
    );
  }
  const wish = wishQuery.data;
  if (!wish) return null;
  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wish) return;
    const data = new FormData(event.currentTarget);
    updateMutation.mutate({ wish, title: String(data.get('title')).trim() });
  }

  function submitConvert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wish) return;
    const data = new FormData(event.currentTarget);
    const title = String(data.get('title')).trim();
    const description = String(data.get('description')).trim();
    const placeId = String(data.get('placeId')).trim();
    const schedule = planScheduleFromInputs(
      String(data.get('plannedDate') ?? ''),
      String(data.get('plannedTime') ?? ''),
    );
    convertMutation.mutate({
      wish,
      title: title || undefined,
      description: description || undefined,
      placeId: placeId || undefined,
      schedule,
    });
  }

  function openMemoryComposer() {
    if (!wish) return;
    const continuationOriginKey = captureOrigin({
      planningSegment: 'wishes',
      selectedKey: wish.id,
    });
    navigate(MEMORY_CREATE_ROUTE, {
      state: continuationOriginKey
        ? { taskOriginKey: continuationOriginKey }
        : undefined,
    });
  }

  function dismissCompletionContinuation() {
    backLinkRef.current?.focus();
    setShowCompletionContinuation(false);
  }

  return (
    <div className="page planning-page">
      {isEditing ? (
        <form
          id="wish-edit-form"
          onSubmit={(e) => {
            e.preventDefault();
            submitEdit(e);
          }}
        />
      ) : null}
      <PageHeader
        before={
          <button
            type="button"
            ref={backLinkRef}
            className="back-link tertiary"
            onClick={() =>
              requestReturn(originKey, `${appRoutePath('plan')}#wishes`)
            }
          >
            {t(
              resolveOrigin(originKey)
                ? 'taskBoundary.back'
                : 'm5s3.common.back',
            )}
          </button>
        }
        eyebrow={t('m5s3.wish.detailEyebrow')}
        title={wish.title}
        titleEditor={
          isEditing ? (
            <input
              form="wish-edit-form"
              name="title"
              required
              maxLength={200}
              defaultValue={wish.title}
              aria-label={t('m5s3.common.title')}
            />
          ) : undefined
        }
        description={t(`m5s3.wish.status.${wish.status}`)}
        titleAction={
          wish.capabilities.canEdit && !isEditing ? (
            <ListEntryIconButton
              icon="edit"
              className="tertiary"
              label={t('common.edit')}
              onClick={() => setIsEditing(true)}
            />
          ) : undefined
        }
      />

      <div className="planning-detail-grid">
        {wish.status === 'COMPLETED' && showCompletionContinuation ? (
          <section
            className="planning-subsection eimir-motion-success"
            aria-labelledby="wish-completion-heading"
          >
            <h2
              id="wish-completion-heading"
              ref={completionHeadingRef}
              tabIndex={-1}
            >
              {t('m5s3.wish.completionTitle')}
            </h2>
            <p>{t('m5s3.wish.completionIntro')}</p>
            <div className="form-actions">
              <button type="button" onClick={openMemoryComposer}>
                {t('m5s3.wish.createMemory')}
              </button>
              <button
                type="button"
                className="tertiary"
                onClick={dismissCompletionContinuation}
              >
                {t('m5s3.wish.completionDone')}
              </button>
            </div>
          </section>
        ) : null}

        {wish.status === 'COMPLETED' && !showCompletionContinuation ? (
          <section className="planning-subsection">
            <p>{t('m5s3.wish.completedBody')}</p>
          </section>
        ) : null}

        {isEditing ? (
          <section className="planning-subsection">
            <h2>{t('m5s3.common.edit')}</h2>
            <div className="form-grid">
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button
                  form="wish-edit-form"
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
                  onRetry={() => void wishQuery.refetch()}
                />
              ) : null}
            </div>

            {wish.capabilities.canDelete ? (
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
                    aria-labelledby="wish-delete-heading"
                  >
                    <h2 id="wish-delete-heading">
                      {t('m5s3.common.deleteHeading')}
                    </h2>
                    <p>{t('m5s3.wish.deleteConsequence')}</p>
                    <div className="planning-confirm-row">
                      <button
                        type="button"
                        className="danger"
                        onClick={() => deleteMutation.mutate(wish)}
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
                        onRetry={() => void wishQuery.refetch()}
                      />
                    ) : null}
                  </section>
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        {wish.status === 'OPEN' && wish.capabilities.canEdit ? (
          <details className="planen-operations wish-operations">
            <summary>{t('m5s3.wish.actionsHeading')}</summary>
            <section className="planning-subsection">
              <h2>{t('m5s3.wish.completeHeading')}</h2>
              <p>{t('m5s3.wish.completeIntro')}</p>
              <button
                type="button"
                onClick={() => completeMutation.mutate(wish)}
                disabled={completeMutation.isPending}
              >
                {completeMutation.isPending
                  ? t('m5s3.wish.completing')
                  : t('m5s3.wish.complete')}
              </button>
              {completeMutation.error ? (
                <ProblemState
                  error={completeMutation.error}
                  onRetry={() => void wishQuery.refetch()}
                />
              ) : null}
            </section>
            <section className="planning-subsection">
              <h2>{t('m5s3.wish.convertHeading')}</h2>
              <p>{t('m5s3.wish.convertIntro')}</p>
              <form className="form-grid" onSubmit={submitConvert}>
                <label htmlFor="wish-plan-title">
                  {t('m5s3.wish.planTitle')}
                </label>
                <input
                  id="wish-plan-title"
                  name="title"
                  maxLength={200}
                  placeholder={wish.title}
                />
                <label htmlFor="wish-plan-description">
                  {t('m5s3.common.description')}
                </label>
                <textarea
                  id="wish-plan-description"
                  name="description"
                  rows={4}
                />
                <label htmlFor="wish-plan-place">
                  {t('m5s3.common.place')}
                </label>
                <select id="wish-plan-place" name="placeId" defaultValue="">
                  <option value="">{t('m5s3.common.noPlace')}</option>
                  {placesQuery.data?.map((place) => (
                    <option key={place.id} value={place.id}>
                      {place.name}
                    </option>
                  ))}
                </select>
                <PlanScheduleFields idPrefix="wish-plan-schedule" />
                <button type="submit" disabled={convertMutation.isPending}>
                  {convertMutation.isPending
                    ? t('m5s3.wish.converting')
                    : t('m5s3.wish.convert')}
                </button>
                {convertMutation.error ? (
                  <ProblemState
                    error={convertMutation.error}
                    onRetry={() => void wishQuery.refetch()}
                  />
                ) : null}
              </form>
            </section>
          </details>
        ) : null}
      </div>
    </div>
  );
}
