import './FreeComposer.css';
import './PageComposerDetail.css';
import { TaskBackButton } from './TaskBackButton';
import { MemoryTagChoices } from './MemoryTagChoices';
import { ContextTagList } from './ContextTagList';
import type { ContextTagEditorHandle } from './ContextTagEditor';
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
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { PlanSchedule } from '../api/generated/models/PlanSchedule';
import type { WishDetail } from '../api/generated/models/WishDetail';
import type { WishUpdate } from '../api/generated/models/WishUpdate';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { isClientOnline } from '../client/connectivity';
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
import { useTaskOrigin } from '../client/taskOrigin';
import { useTranslation } from '../i18n';
import { ExpandableDescription } from './ExpandableDescription';
import { ListEntryIconButton } from './ListEntryActions';
import { ComposerDescriptionField } from './PageComposer';
import { PageHeader } from './PageHeader';
import { PlanScheduleFields } from './PlanScheduleFields';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';
import { useWishCompletion } from './useWishCompletion';
import './SharedPlanningPages.css';
import './PlanningReference.css';

async function apiCall<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export function WishProductPage({
  accountId,
  apiBaseUrl,
  apis,
  spaceId,
}: {
  accountId?: string;
  apiBaseUrl?: string;
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
  const [editSnapshot, setEditingWish] = useState<WishDetail | null>(null);
  const editingWish =
    editSnapshot &&
    editSnapshot.id === wishId &&
    editSnapshot.spaceId === spaceId
      ? editSnapshot
      : null;
  const isEditing = editingWish !== null;
  const [editTags, setEditTags] = useState<string[]>([]);
  const tagEditor = useRef<ContextTagEditorHandle>(null);
  const [dismissedCompletion, setDismissedCompletion] =
    useState<WishDetail | null>(null);
  const completionHeadingRef = useRef<HTMLHeadingElement>(null);
  const backLinkRef = useRef<HTMLButtonElement>(null);
  const key = authorSummaryQueryKeys.wishDetail(spaceId, wishId);
  const online = useSyncExternalStore(
    onlineManager.subscribe,
    isClientOnline,
    () => true,
  );

  const wishWriteKey = ['wish-write', spaceId, wishId] as const;
  const otherWritePending =
    useIsMutating({ mutationKey: wishWriteKey, exact: true }) > 0;
  const completion = useWishCompletion({ apis, spaceId, wishId });
  const writesPending = completion.isPending || otherWritePending;
  const showCompletionContinuation =
    completion.confirmedResult !== null &&
    completion.confirmedResult !== dismissedCompletion;

  useEffect(() => {
    if (!completion.confirmedResult) return;
    setEditingWish(null);
    setConfirmDelete(false);
  }, [completion.confirmedResult]);

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
    mutationKey: wishWriteKey,
    mutationFn: ({ wish, update }: { wish: WishDetail; update: WishUpdate }) =>
      apiCall(() =>
        apis.wishes.updateWish({
          spaceId,
          wishId: wish.id,
          ifMatch: planningIfMatch(wish),
          wishUpdate: update,
        }),
      ),
    onSuccess: async (wish) => {
      await queryClient.invalidateQueries({
        queryKey: ['context-tags', spaceId],
      });
      queryClient.setQueryData(key, wish);
      await queryClient.invalidateQueries({
        queryKey: ['m5-s3', 'wishes', spaceId],
      });
      setEditingWish(null);
      setConfirmDelete(false);
    },
  });

  const convertMutation = useMutation({
    mutationKey: wishWriteKey,
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
    mutationKey: wishWriteKey,
    mutationFn: (wish: WishDetail) =>
      apiCall(() =>
        apis.wishes.deleteWish({
          spaceId,
          wishId: wish.id,
          ifMatch: planningIfMatch(wish),
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['context-tags', spaceId],
      });
      queryClient.removeQueries({ queryKey: key });
      await queryClient.invalidateQueries({
        queryKey: ['m5-s3', 'wishes', spaceId],
      });
      navigate(`${appRoutePath('plan')}#wishes`, { replace: true });
    },
  });

  function isWishWritePending() {
    return (
      completion.isInFlight() ||
      queryClient.isMutating({ mutationKey: wishWriteKey, exact: true }) > 0
    );
  }

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
  const visibleDescription = isEditing ? undefined : wish.description;

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingWish || isWishWritePending()) return;
    const tags = tagEditor.current?.commitDraft();
    if (!tags) return;
    const data = new FormData(event.currentTarget);
    const description = String(data.get('description') ?? '').trim() || null;
    updateMutation.mutate({
      wish: editingWish,
      update: {
        title: String(data.get('title')).trim(),
        tags,
        ...(description !== (editingWish.description ?? null)
          ? { description }
          : {}),
      },
    });
  }

  function submitConvert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wish || isWishWritePending()) return;
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
    setDismissedCompletion(completion.confirmedResult);
  }

  return (
    <div className="page planning-page wish-detail page-composer-detail">
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
        className={visibleDescription ? 'wish-description-heading' : undefined}
        before={
          <TaskBackButton
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
          </TaskBackButton>
        }
        eyebrow={t('m5s3.wish.detailEyebrow')}
        title={wish.title}
        titleEditor={
          editingWish ? (
            <input
              form="wish-edit-form"
              className="composer-authored-title"
              name="title"
              required
              maxLength={200}
              defaultValue={editingWish.title}
              readOnly={writesPending}
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
              onClick={() => {
                if (!isWishWritePending()) {
                  setEditTags(wish.tags ?? []);
                  setEditingWish(wish);
                }
              }}
              disabled={writesPending}
            />
          ) : undefined
        }
      />

      {completion.pendingRequest ? (
        <p className="planen-detail-pending" role="status">
          {t('m5s3.wish.completePending')}
        </p>
      ) : null}

      {visibleDescription ? (
        <div className="page-reading planen-section planen-section-content">
          <ExpandableDescription
            text={visibleDescription}
            previewApi={apis.linkPreviews}
            spaceId={spaceId}
            scope={JSON.stringify([apiBaseUrl, accountId, wish.id])}
            offline={!online}
          />
        </div>
      ) : null}
      {!isEditing ? <ContextTagList tags={wish.tags} /> : null}
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

        {editingWish ? (
          <section className="planning-subsection">
            <h2>{t('m5s3.common.edit')}</h2>
            <MemoryTagChoices
              parentType="WISH"
              parentId={wish.id}
              selected={editTags}
              onChange={setEditTags}
              editorRef={tagEditor}
              disabled={writesPending}
            />
            <div className="form-grid free-composer">
              <ComposerDescriptionField
                form="wish-edit-form"
                id="wish-edit-description"
                rows={4}
                defaultValue={editingWish.description ?? ''}
                readOnly={writesPending}
              />
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button
                  form="wish-edit-form"
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
                    setEditingWish(null);
                    setConfirmDelete(false);
                  }}
                >
                  {t('common.cancel')}
                </button>
              </div>
              {updateMutation.error ? (
                <ProblemState
                  error={updateMutation.error}
                  onRetry={() => {
                    void wishQuery.refetch().then(({ data, error }) => {
                      if (data && !error) {
                        setEditingWish((current) =>
                          current === editingWish
                            ? { ...editingWish, version: data.version }
                            : current,
                        );
                      }
                    });
                  }}
                />
              ) : null}
            </div>

            {wish.capabilities.canDelete ? (
              <div style={{ marginTop: 'var(--space-8)' }}>
                {!confirmDelete ? (
                  <button
                    type="button"
                    className="button-link danger-link"
                    onClick={() => {
                      if (!isWishWritePending()) setConfirmDelete(true);
                    }}
                    disabled={writesPending}
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
                        onClick={() => {
                          if (!isWishWritePending())
                            deleteMutation.mutate(wish);
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
            <summary className="button-link">
              {t('m5s3.wish.actionsHeading')}
            </summary>
            <section className="planning-subsection">
              <h2>{t('m5s3.wish.completeHeading')}</h2>
              <p>{t('m5s3.wish.completeIntro')}</p>
              <button
                type="button"
                className="planen-complete-cta"
                onClick={() => {
                  if (!isWishWritePending()) completion.complete(wish);
                }}
                aria-disabled={writesPending || undefined}
              >
                {completion.pendingRequest !== null
                  ? t('m5s3.wish.completing')
                  : t('m5s3.wish.complete')}
              </button>
              {completion.error ? (
                <ProblemState
                  error={completion.error}
                  onRetry={() => void wishQuery.refetch()}
                />
              ) : null}
            </section>
            <section className="planning-subsection">
              <h2>{t('m5s3.wish.convertHeading')}</h2>
              <p>{t('m5s3.wish.convertIntro')}</p>
              <form
                className="form-grid free-composer"
                onSubmit={submitConvert}
              >
                <fieldset
                  className="planen-lifecycle-fieldset"
                  disabled={writesPending}
                >
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
                  <button type="submit" disabled={writesPending}>
                    {convertMutation.isPending
                      ? t('m5s3.wish.converting')
                      : t('m5s3.wish.convert')}
                  </button>
                </fieldset>
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
