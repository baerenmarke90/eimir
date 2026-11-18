import './FreeComposer.css';
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
  type RefObject,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { PlanSchedule } from '../api/generated/models/PlanSchedule';
import type { WishDetail } from '../api/generated/models/WishDetail';
import type { WishUpdate } from '../api/generated/models/WishUpdate';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { assertOnlineWrite, isClientOnline } from '../client/connectivity';
import { invalidateDashboard } from '../client/dashboardQueries';
import {
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';
import {
  appRoutePath,
  MEMORY_CREATE_ROUTE,
  planDetailPath,
  wishDetailPath,
} from '../client/routes';
import {
  loadAllPlaces,
  planningIfMatch,
  planScheduleFromInputs,
  type SharedPlanningApis,
} from '../client/sharedPlanning';
import { useTaskOrigin } from '../client/taskOrigin';
import { wishJourneyStage, wishPlanDateLabel } from '../client/wishJourney';
import { useTranslation } from '../i18n';
import { AddActionButton } from './AddAction';
import type { ContextTagEditorHandle } from './ContextTagEditor';
import { ContextTagList } from './ContextTagList';
import { ExpandableDescription } from './ExpandableDescription';
import {
  ItemDeleteSheet,
  ItemMenuOption,
  ItemMenuSheet,
  ItemMenuTrigger,
  leaveItemMenu,
} from './ItemActions';
import { PageHeader } from './PageHeader';
import {
  PlanningDiscardSheet,
  usePlanningEditorLifecycle,
} from './PlanningEditorLifecycle';
import { PlanScheduleFields } from './PlanScheduleFields';
import { ProblemState } from './ProblemState';
import { ShortTaskSheet, type ShortTaskSheetHandle } from './ShortTaskSheet';
import { TaskBackButton } from './TaskBackButton';
import { UiState } from './UiState';
import { useWishCompletion } from './useWishCompletion';
import { WishComposer } from './WishComposer';
import { WishDateProposalAction } from './WishDateProposalAction';
import { WishJourneyPath } from './WishJourney';
import { WishReminderAction } from './WishReminderAction';
import { WishRepeatSheet } from './WishRepeatSheet';
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
  const { t, i18n } = useTranslation();
  const { wishId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { captureOrigin, requestReturn, resolveOrigin } = useTaskOrigin();
  const taskState = location.state as { taskOriginKey?: unknown } | null;
  const originKey = taskState?.taskOriginKey;
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteSheet = useRef<ShortTaskSheetHandle>(null);
  const menuSheet = useRef<ShortTaskSheetHandle>(null);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const repeatTrigger = useRef<HTMLButtonElement>(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [continueOpen, setContinueOpen] = useState(false);
  const continueSheet = useRef<ShortTaskSheetHandle>(null);
  const [reminderAt, setReminderAt] = useState<Date | null>(null);
  const [editSnapshot, setEditingWish] = useState<WishDetail | null>(null);
  const editingWish =
    editSnapshot &&
    editSnapshot.id === wishId &&
    editSnapshot.spaceId === spaceId
      ? editSnapshot
      : null;
  const isEditing = editingWish !== null;
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [tagDraftDirty, setTagDraftDirty] = useState(false);
  const tagEditor = useRef<ContextTagEditorHandle>(null);
  const editFocus = useRef<HTMLDivElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const [dismissedCompletion, setDismissedCompletion] =
    useState<WishDetail | null>(null);
  const completionHeadingRef = useRef<HTMLHeadingElement>(null);
  const backLinkRef = useRef<HTMLButtonElement>(null);
  // "Plan now" on a date idea that is already a Wish opens this canonical
  // conversion with the idea's editable plan title; nothing is saved before
  // the couple confirms.
  const [convertDraft] = useState(
    () => resolveOrigin(originKey)?.planningConvertDraft,
  );
  const convertHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // A kept draft reopens the continue dialog where the couple left it.
    if (convertDraft) setContinueOpen(true);
  }, [convertDraft]);
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
  const editDirty = Boolean(
    editingWish &&
      (editTitle !== editingWish.title ||
        editDescription !== (editingWish.description ?? '') ||
        tagDraftDirty ||
        editTags.length !== (editingWish.tags?.length ?? 0) ||
        editTags.some((tag, index) => tag !== editingWish.tags?.[index])),
  );
  const editorLifecycle = usePlanningEditorLifecycle({
    isActive: isEditing,
    isDirty: editDirty,
    isPending: writesPending,
    initialFocusRef: editFocus,
    restoreFocusRef: menuTrigger,
    onEscape: () => Boolean(document.querySelector('dialog[open]')),
    onClose: () => setEditingWish(null),
  });

  useEffect(() => {
    if (!completion.confirmedResult) return;
    setEditingWish(null);
  }, [completion.confirmedResult]);

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
    networkMode: 'always',
    mutationFn: ({
      wish,
      update,
    }: {
      wish: WishDetail;
      update: WishUpdate;
    }) => {
      assertOnlineWrite();
      return apiCall(() =>
        apis.wishes.updateWish({
          spaceId,
          wishId: wish.id,
          ifMatch: planningIfMatch(wish),
          wishUpdate: update,
        }),
      );
    },
    onSuccess: async (wish) => {
      await queryClient.invalidateQueries({
        queryKey: ['context-tags', spaceId],
      });
      queryClient.setQueryData(key, wish);
      await queryClient.invalidateQueries({
        queryKey: ['m5-s3', 'wishes', spaceId],
      });
      editorLifecycle.closeConfirmed();
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
    networkMode: 'always',
    mutationFn: (wish: WishDetail) => {
      assertOnlineWrite();
      return apiCall(() =>
        apis.wishes.deleteWish({
          spaceId,
          wishId: wish.id,
          ifMatch: planningIfMatch(wish),
        }),
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['context-tags', spaceId],
      });
      await queryClient.invalidateQueries({
        queryKey: ['m5-s3', 'wishes', spaceId],
      });
      deleteSheet.current?.closeForNavigation(() => {
        queryClient.removeQueries({ queryKey: key });
        navigate(`${appRoutePath('plan')}#wishes`, { replace: true });
      });
    },
  });

  function isWishWritePending() {
    return (
      completion.isInFlight() ||
      queryClient.isMutating({ mutationKey: wishWriteKey, exact: true }) > 0
    );
  }

  // Once the wish is no longer open the continue dialog has done its job. It
  // closes without returning focus to the menu, so the continuation heading
  // keeps it.
  const wishStatus = wishQuery.data?.status;
  useEffect(() => {
    if (wishStatus && wishStatus !== 'OPEN' && continueOpen)
      continueSheet.current?.closeForNavigation(() => setContinueOpen(false), {
        animateExit: false,
      });
  }, [wishStatus, continueOpen]);

  // The continue dialog is modal, so the heading can take focus only once it
  // has closed and the completed wish (which renders the heading) has arrived.
  useEffect(() => {
    if (!showCompletionContinuation || continueOpen) return;
    if (wishStatus !== 'COMPLETED') return;
    completionHeadingRef.current?.focus();
    completionHeadingRef.current?.scrollIntoView?.({ block: 'center' });
  }, [showCompletionContinuation, continueOpen, wishStatus]);

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
    const title = editTitle.trim();
    if (!editingWish || !title || isWishWritePending()) return;
    const tags = tagEditor.current?.commitDraft();
    if (!tags) return;
    const description = editDescription.trim() || null;
    updateMutation.mutate({
      wish: editingWish,
      update: {
        title,
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

  function startEdit() {
    if (!wish || isWishWritePending()) return;
    updateMutation.reset();
    setEditTitle(wish.title);
    setEditDescription(wish.description ?? '');
    setEditTags(wish.tags ?? []);
    setTagDraftDirty(false);
    setEditingWish(wish);
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

  if (editingWish) {
    return (
      <WishComposer
        key={editingWish.id}
        wishId={editingWish.id}
        title={editTitle}
        description={editDescription}
        tags={editTags}
        tagEditorRef={tagEditor}
        focusRef={editFocus}
        disabled={writesPending}
        saving={updateMutation.isPending}
        onTitleChange={setEditTitle}
        onDescriptionChange={setEditDescription}
        onTagsChange={setEditTags}
        onTagDraftChange={setTagDraftDirty}
        onSubmit={submitEdit}
        onClose={editorLifecycle.requestClose}
      >
        {updateMutation.error ? (
          <ProblemState
            error={updateMutation.error}
            onRetry={
              clientProblemKind(updateMutation.error) === 'conflict'
                ? () => {
                    void wishQuery.refetch().then(({ data, error }) => {
                      if (data && !error) {
                        setEditingWish((current) =>
                          current === editingWish
                            ? { ...editingWish, version: data.version }
                            : current,
                        );
                      }
                    });
                  }
                : undefined
            }
          />
        ) : null}
        <PlanningDiscardSheet
          open={editorLifecycle.showDiscardConfirm}
          onKeepEditing={editorLifecycle.keepEditing}
          onDiscard={editorLifecycle.discard}
        />
      </WishComposer>
    );
  }

  return (
    <div className="page planning-page wish-detail page-composer-detail">
      <PageHeader
        variant="composer"
        before={
          <TaskBackButton
            inline
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
        title={t('m5s3.wish.detailEyebrow')}
        action={
          wish.capabilities.canEdit || wish.capabilities.canDelete ? (
            <ItemMenuTrigger
              triggerRef={menuTrigger}
              label={t('m5s3.wish.menu')}
              open={menuOpen}
              onOpen={() => setMenuOpen(true)}
            />
          ) : undefined
        }
      />
      <h2 className="detail-content-title">{wish.title}</h2>

      <WishJourneyPath
        className="wish-detail-journey"
        stage={wishJourneyStage(wish)}
        advancing={showCompletionContinuation}
      />
      {wish.status === 'PLANNED' && wish.plan ? (
        <Link
          className="button-link button-link-primary wish-detail-plan-action"
          to={planDetailPath(wish.plan.id)}
        >
          {(() => {
            const date = wishPlanDateLabel(wish.plan);
            return date
              ? t('wishJourney.openPlanOn', { date })
              : t('wishJourney.openPlan');
          })()}
        </Link>
      ) : null}

      {completion.pendingRequest ? (
        <p className="planen-detail-pending" role="status">
          {t('m5s3.wish.completePending')}
        </p>
      ) : null}
      {/* Outside the dialog, so a failed completion stays visible after it closes. */}
      {completion.error ? (
        <ProblemState
          error={completion.error}
          onRetry={() => void wishQuery.refetch()}
        />
      ) : null}

      {wish.description ? (
        <div className="page-reading planen-section planen-section-content">
          <ExpandableDescription
            text={wish.description}
            previewApi={apis.linkPreviews}
            spaceId={spaceId}
            scope={JSON.stringify([apiBaseUrl, accountId, wish.id])}
            offline={!online}
          />
        </div>
      ) : null}
      <ContextTagList tags={wish.tags} />
      {wish.status === 'OPEN' && accountId && apiBaseUrl ? (
        <WishReminderAction
          key={`${apiBaseUrl}:${accountId}:${spaceId}:${wish.id}`}
          accountId={accountId}
          apiBaseUrl={apiBaseUrl}
          spaceId={spaceId}
          wishId={wish.id}
          api={apis.wishes}
          open={reminderOpen}
          onOpenChange={setReminderOpen}
          onSavedChange={setReminderAt}
          restoreFocusRef={menuTrigger}
        />
      ) : null}
      {wish.status === 'OPEN' && accountId && apiBaseUrl ? (
        <WishDateProposalAction
          key={JSON.stringify([apiBaseUrl, accountId, spaceId, wish.id])}
          accountId={accountId}
          apiBaseUrl={apiBaseUrl}
          api={apis.wishes}
          online={online}
          spaceId={spaceId}
          wishId={wish.id}
          writesPending={writesPending}
          onAccept={(planId) =>
            navigate(planDetailPath(planId), {
              replace: true,
              state: resolveOrigin(originKey)
                ? { taskOriginKey: originKey }
                : undefined,
            })
          }
        />
      ) : null}
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
          <section className="planning-subsection wish-completed-section">
            <p>{t('m5s3.wish.completedBody')}</p>
            {wish.capabilities.canEdit ? (
              <>
                <AddActionButton
                  ref={repeatTrigger}
                  className="wish-repeat-action"
                  label={t('wishRepeat.action')}
                  icon="sparkle"
                  disabled={writesPending}
                  onClick={() => setRepeatOpen(true)}
                />
                <WishRepeatSheet
                  key={wish.id}
                  apis={apis}
                  spaceId={spaceId}
                  source={wish}
                  open={repeatOpen}
                  restoreFocusRef={repeatTrigger}
                  onClose={() => setRepeatOpen(false)}
                  onDone={(result, handle) =>
                    handle.closeForNavigation(() => {
                      setRepeatOpen(false);
                      navigate(
                        result.planId
                          ? planDetailPath(result.planId)
                          : wishDetailPath(result.wish.id),
                      );
                    })
                  }
                />
              </>
            ) : null}
          </section>
        ) : null}

        {wish.capabilities.canEdit ? (
          <ShortTaskSheet
            ref={continueSheet}
            open={continueOpen}
            title={t('m5s3.wish.actionsHeading')}
            restoreFocusRef={menuTrigger}
            onClose={() => setContinueOpen(false)}
          >
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
            </section>
            <section className="planning-subsection">
              <h2 ref={convertHeadingRef}>{t('m5s3.wish.convertHeading')}</h2>
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
                    defaultValue={convertDraft?.title}
                  />
                  <label htmlFor="wish-plan-description">
                    {t('m5s3.common.description')}
                  </label>
                  <textarea
                    id="wish-plan-description"
                    name="description"
                    rows={4}
                    defaultValue={convertDraft?.description}
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
          </ShortTaskSheet>
        ) : null}
      </div>

      <ItemMenuSheet
        open={menuOpen}
        title={t('m5s3.wish.detailEyebrow')}
        restoreFocusRef={menuTrigger}
        sheetRef={menuSheet}
        onClose={() => setMenuOpen(false)}
      >
        {wish.capabilities.canEdit ? (
          <ItemMenuOption
            icon="pen"
            title={t('common.edit')}
            disabled={writesPending}
            onClick={() =>
              leaveItemMenu(menuSheet, startEdit, () => setMenuOpen(false))
            }
          />
        ) : null}
        {wish.status === 'OPEN' && accountId && apiBaseUrl ? (
          <ItemMenuOption
            icon="benachrichtigungen"
            title={t(
              reminderAt
                ? 'm5s3.wish.reminder.edit'
                : 'm5s3.wish.reminder.action',
            )}
            hint={
              reminderAt
                ? t('m5s3.wish.reminder.scheduled', {
                    date: new Intl.DateTimeFormat(i18n.resolvedLanguage, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(reminderAt),
                  })
                : undefined
            }
            onClick={() => {
              setMenuOpen(false);
              setReminderOpen(true);
            }}
          />
        ) : null}
        {wish.status === 'OPEN' && wish.capabilities.canEdit ? (
          <ItemMenuOption
            icon="sparkle"
            title={t('m5s3.wish.actionsHeading')}
            disabled={writesPending}
            onClick={() => {
              setMenuOpen(false);
              setContinueOpen(true);
            }}
          />
        ) : null}
        {wish.capabilities.canDelete ? (
          <ItemMenuOption
            icon="trash"
            danger
            title={t('m5s3.common.delete')}
            disabled={writesPending}
            onClick={() => {
              if (isWishWritePending()) return;
              setMenuOpen(false);
              deleteMutation.reset();
              setConfirmDelete(true);
            }}
          />
        ) : null}
      </ItemMenuSheet>

      <ItemDeleteSheet
        sheetRef={deleteSheet}
        open={confirmDelete}
        title={t('m5s3.common.deleteHeading')}
        body={t('m5s3.wish.deleteConsequence')}
        confirmLabel={t('m5s3.common.confirmDelete')}
        pendingLabel={t('m5s3.common.deleting')}
        pending={deleteMutation.isPending}
        error={deleteMutation.error}
        restoreFocusRef={menuTrigger}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (!isWishWritePending()) deleteMutation.mutate(wish);
        }}
      />
    </div>
  );
}
