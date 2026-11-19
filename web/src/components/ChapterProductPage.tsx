import './FreeComposer.css';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { ChapterDetail } from '../api/generated/models/ChapterDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { formatChapterPeriod } from '../client/chapterPresentation';
import { invalidateChapterProjections } from '../client/chapterQueries';
import { assertOnlineWrite } from '../client/connectivity';
import {
  deleteFocusTargetFromInfiniteData,
  type InfiniteItemsData,
  PLANNING_DELETE_FOCUS_STATE_KEY,
} from '../client/deleteFocusTarget';
import { normalizeClientError } from '../client/problemDetails';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { placeDetailPath, STORY_CHAPTERS_ROUTE } from '../client/routes';
import {
  dateFromInput,
  dateOnlyInput,
  planningIfMatch,
  type SharedPlanningApis,
} from '../client/sharedPlanning';
import { useTaskOrigin } from '../client/taskOrigin';
import { useTaskActivation } from '../client/useTaskActivation';
import { resolvedLocale, useTranslation } from '../i18n';
import { ChapterContextFields, type ChapterDraft } from './ChapterFields';
import {
  ItemDeleteSheet,
  ItemMenuOption,
  ItemMenuSheet,
  ItemMenuTrigger,
  leaveItemMenu,
} from './ItemActions';
import { PageHeader } from './PageHeader';
import {
  PlanningDiscardConfirmation,
  usePlanningEditorLifecycle,
} from './PlanningEditorLifecycle';
import { PlanningRelationManager } from './PlanningRelationManager';
import { ProblemState } from './ProblemState';
import type { ShortTaskSheetHandle } from './ShortTaskSheet';
import { TaskBackButton } from './TaskBackButton';
import { UiState } from './UiState';
import './SharedPlanningPages.css';
import './ChapterExperience.css';
import './StoryUnifiedPage.css';
import './StoryHandmade.css';

async function apiCall<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

function chapterDraft(chapter: ChapterDetail): ChapterDraft {
  return {
    title: chapter.title,
    description: chapter.description ?? '',
    startOn: dateOnlyInput(chapter.startOn),
    endOn: dateOnlyInput(chapter.endOn),
    placeId: chapter.placeId ?? '',
  };
}

function ChapterEditor({
  chapter,
  apis,
  spaceId,
  placeName,
  captureAdmission,
  requestCloseRef,
  draft,
  setDraft,
  titleInputRef,
  restoreFocusRef,
  updatePending,
  updateError,
  onSubmit,
  onClose,
}: {
  chapter: ChapterDetail;
  apis: SharedPlanningApis;
  spaceId: string;
  placeName?: string;
  captureAdmission: () => () => boolean;
  requestCloseRef: RefObject<(() => void) | null>;
  draft: ChapterDraft;
  setDraft: (draft: ChapterDraft) => void;
  titleInputRef: RefObject<HTMLInputElement | null>;
  restoreFocusRef: RefObject<HTMLButtonElement | null>;
  updatePending: boolean;
  updateError: unknown;
  onSubmit: (draft: ChapterDraft) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const isDirty =
    JSON.stringify(draft) !== JSON.stringify(chapterDraft(chapter));
  const [placePending, setPlacePending] = useState(false);
  const isPending = updatePending || placePending;
  const lifecycle = usePlanningEditorLifecycle({
    isDirty,
    isPending,
    initialFocusRef: titleInputRef,
    restoreFocusRef,
    onClose,
  });
  useEffect(() => {
    requestCloseRef.current = lifecycle.requestClose;
    return () => {
      requestCloseRef.current = null;
    };
  }, [requestCloseRef, lifecycle.requestClose]);

  const updateDraft = (values: Partial<ChapterDraft>) =>
    setDraft({ ...draft, ...values });

  return (
    <section className="planning-subsection free-composer">
      <h2>{t('m5s3.common.edit')}</h2>
      {lifecycle.showDiscardConfirm ? (
        <PlanningDiscardConfirmation
          onKeepEditing={lifecycle.keepEditing}
          onDiscard={lifecycle.discard}
        />
      ) : null}
      <form
        id="chapter-edit-form"
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          if (isPending) return;
          onSubmit(draft);
        }}
      >
        <label htmlFor="chapter-edit-description">
          {t('m5s3.common.description')}
        </label>
        <textarea
          id="chapter-edit-description"
          name="description"
          rows={4}
          value={draft.description}
          disabled={isPending}
          onChange={(event) => updateDraft({ description: event.target.value })}
        />
        <ChapterContextFields
          apis={apis}
          spaceId={spaceId}
          draft={draft}
          onChange={updateDraft}
          disabled={updatePending}
          placeName={placeName}
          captureAdmission={captureAdmission}
          onPendingChange={setPlacePending}
        />
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button type="submit" disabled={isPending || !draft.title.trim()}>
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
    </section>
  );
}

type ChapterProductProps = {
  apis: SharedPlanningApis;
  spaceId: string;
  accountId?: string;
};

export function ChapterProductPage(props: ChapterProductProps) {
  const { chapterId } = useParams();
  return (
    <ScopedChapterProductPage
      key={`${props.accountId}:${props.spaceId}:${chapterId}`}
      {...props}
    />
  );
}

function ScopedChapterProductPage({
  apis,
  spaceId,
  accountId,
}: ChapterProductProps) {
  const { t } = useTranslation();
  const { chapterId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { captureOrigin, requestReturn, resolveOrigin } = useTaskOrigin();
  const originKey = (location.state as { taskOriginKey?: unknown } | null)
    ?.taskOriginKey;
  const queryClient = useQueryClient();
  const captureOwnership = useTaskActivation(true);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<ChapterDraft | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const deleteSheetRef = useRef<ShortTaskSheetHandle>(null);
  const menuSheet = useRef<ShortTaskSheetHandle>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const editorRequestCloseRef = useRef<(() => void) | null>(null);
  const key = authorSummaryQueryKeys.chapterDetail(spaceId, chapterId);

  const chapterQuery = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => {
      if (!chapterId) throw new Error('Missing Chapter route parameter.');
      return apiCall(() =>
        apis.chapters.getChapter({ spaceId, chapterId }, { signal }),
      );
    },
    enabled: Boolean(chapterId),
    retry: false,
  });
  const placeId = chapterQuery.data?.placeId;
  const placesQuery = useQuery({
    queryKey: authorSummaryQueryKeys.placeDetail(spaceId, placeId ?? undefined),
    queryFn: ({ signal }) =>
      apiCall(() =>
        apis.places.getPlace(
          { spaceId, placeId: placeId as string },
          { signal },
        ),
      ),
    enabled: Boolean(placeId),
    staleTime: 30_000,
    retry: false,
  });

  const updateMutation = useMutation({
    networkMode: 'always',
    mutationFn: ({
      chapter,
      title,
      description,
      startOn,
      endOn,
      placeId,
      ownsTask,
      admitted,
    }: {
      chapter: ChapterDetail;
      title: string;
      description: string | null;
      startOn: Date | null;
      endOn: Date | null;
      placeId: string | null;
      ownsTask: () => boolean;
      admitted: () => boolean;
    }) =>
      apiCall(() => {
        if (!ownsTask() || !admitted())
          throw new Error('Chapter task is no longer authorized.');
        assertOnlineWrite();
        return apis.chapters.updateChapter({
          spaceId,
          chapterId: chapter.id,
          ifMatch: planningIfMatch(chapter),
          chapterUpdate: { title, description, startOn, endOn, placeId },
        });
      }),
    onSuccess: async (chapter, request) => {
      if (!request.ownsTask() || !request.admitted()) return;
      queryClient.setQueryData(key, chapter);
      await Promise.all([
        invalidateChapterProjections(queryClient, spaceId, accountId),
        queryClient.invalidateQueries({ queryKey: key }),
      ]);
      if (!request.ownsTask() || !request.admitted()) return;
      setIsEditing(false);
      setDraft(null);
    },
  });

  const deleteMutation = useMutation({
    networkMode: 'always',
    mutationFn: ({
      chapter,
      ownsTask,
      admitted,
    }: {
      chapter: ChapterDetail;
      ownsTask: () => boolean;
      admitted: () => boolean;
    }) =>
      apiCall(() => {
        if (!ownsTask() || !admitted())
          throw new Error('Chapter task is no longer authorized.');
        assertOnlineWrite();
        return apis.chapters.deleteChapter({
          spaceId,
          chapterId: chapter.id,
          ifMatch: planningIfMatch(chapter),
        });
      }),
    onMutate: ({ chapter }) => ({
      focusTarget: deleteFocusTargetFromInfiniteData(
        queryClient.getQueryData<InfiniteItemsData<ChapterDetail>>(
          authorSummaryQueryKeys.chapters(spaceId),
        ),
        chapter.id,
      ),
    }),
    onSuccess: async (_result, request, context) => {
      if (!request.ownsTask() || !request.admitted()) return;
      await invalidateChapterProjections(queryClient, spaceId, accountId);
      if (!request.ownsTask() || !request.admitted()) return;
      const returnToOrigin = () => {
        if (!request.ownsTask() || !request.admitted()) return;
        queryClient.removeQueries({ queryKey: key });
        if (resolveOrigin(originKey)) {
          requestReturn(originKey, STORY_CHAPTERS_ROUTE);
          return;
        }
        navigate(STORY_CHAPTERS_ROUTE, {
          replace: true,
          state: {
            [PLANNING_DELETE_FOCUS_STATE_KEY]: context.focusTarget,
          },
        });
      };
      // Retire the confirmation sheet's same-route history entry before
      // returning to the origin; otherwise Back consumes that entry and
      // reopens the deleted read.
      if (deleteSheetRef.current)
        deleteSheetRef.current.closeForNavigation(returnToOrigin);
      else returnToOrigin();
    },
  });

  if (!chapterId)
    return (
      <UiState
        kind="error"
        title={t('states.unknown.title')}
        body={t('states.unknown.body')}
      />
    );
  if (chapterQuery.isLoading)
    return <UiState kind="loading" title={t('m5s3.chapter.loading')} />;
  if (chapterQuery.error)
    return (
      <ProblemState
        error={chapterQuery.error}
        onRetry={() => void chapterQuery.refetch()}
      />
    );
  const chapter = chapterQuery.data;
  if (!chapter) return null;
  const linkedPlace = placesQuery.data;
  const period = formatChapterPeriod(chapter, t, resolvedLocale());

  return (
    <div className="page planning-page chapter-page">
      <PageHeader
        before={
          <TaskBackButton
            disabled={updateMutation.isPending || deleteMutation.isPending}
            onClick={() =>
              isEditing
                ? editorRequestCloseRef.current?.()
                : requestReturn(originKey, STORY_CHAPTERS_ROUTE)
            }
          />
        }
        itemLabel={t('m5s3.chapter.detailEyebrow')}
        title={chapter.title}
        titleEditor={
          isEditing ? (
            <input
              ref={titleInputRef}
              form="chapter-edit-form"
              className="composer-authored-title"
              name="title"
              required
              disabled={updateMutation.isPending || deleteMutation.isPending}
              maxLength={200}
              value={draft?.title ?? chapter.title}
              onChange={(event) =>
                setDraft((current) => ({
                  ...(current ?? chapterDraft(chapter)),
                  title: event.target.value,
                }))
              }
              aria-label={t('m5s3.common.title')}
            />
          ) : undefined
        }
        titleAction={
          (chapter.capabilities.canEdit || chapter.capabilities.canDelete) &&
          !isEditing ? (
            <ItemMenuTrigger
              triggerRef={menuTriggerRef}
              label={t('m5s3.chapter.menu')}
              open={menuOpen}
              onOpen={() => setMenuOpen(true)}
            />
          ) : undefined
        }
      />

      {!isEditing ? (
        <>
          {period || chapter.placeId ? (
            <section
              className="chapter-reading-context"
              aria-label={t('m5s3.chapter.contextHeading')}
            >
              {period ? <p className="chapter-period">{period}</p> : null}
              {chapter.placeId && linkedPlace ? (
                <Link
                  className="planning-context-link"
                  to={placeDetailPath(linkedPlace.id)}
                  onClick={(event) => {
                    if (
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    const taskOriginKey = captureOrigin();
                    if (!taskOriginKey) return;
                    event.preventDefault();
                    void navigate(placeDetailPath(linkedPlace.id), {
                      state: { taskOriginKey },
                    });
                  }}
                >
                  {linkedPlace.name}
                </Link>
              ) : chapter.placeId ? (
                <p className="planning-meta">
                  {t(
                    placesQuery.isLoading
                      ? 'm5s3.chapter.placeLoading'
                      : 'm5s3.chapter.placeUnavailable',
                  )}
                </p>
              ) : null}
            </section>
          ) : null}
          {chapter.description?.trim() ? (
            <p className="chapter-authored-words">{chapter.description}</p>
          ) : null}
        </>
      ) : null}

      {isEditing && draft ? (
        <ChapterEditor
          chapter={chapter}
          apis={apis}
          spaceId={spaceId}
          placeName={linkedPlace?.name}
          captureAdmission={captureOwnership}
          requestCloseRef={editorRequestCloseRef}
          draft={draft}
          setDraft={setDraft}
          titleInputRef={titleInputRef}
          restoreFocusRef={menuTriggerRef}
          updatePending={updateMutation.isPending}
          updateError={updateMutation.error}
          onSubmit={(next) =>
            updateMutation.mutate({
              chapter,
              ownsTask: captureOwnership(),
              admitted: captureAuthorizedQuery(queryClient, key),
              title: next.title.trim(),
              description: next.description.trim() || null,
              startOn: dateFromInput(next.startOn) ?? null,
              endOn: dateFromInput(next.endOn) ?? null,
              placeId: next.placeId || null,
            })
          }
          onClose={() => {
            setIsEditing(false);
            setDraft(null);
            updateMutation.reset();
          }}
        />
      ) : null}

      {!isEditing ? (
        <PlanningRelationManager
          apis={apis}
          spaceId={spaceId}
          ownerName={chapter.title}
          ownerKind="chapter"
          ownerId={chapter.id}
          canManage={chapter.capabilities.canEdit}
        />
      ) : null}

      <ItemMenuSheet
        open={menuOpen && !isEditing}
        title={t('m5s3.chapter.detailEyebrow')}
        restoreFocusRef={menuTriggerRef}
        sheetRef={menuSheet}
        onClose={() => setMenuOpen(false)}
      >
        {chapter.capabilities.canEdit ? (
          <ItemMenuOption
            icon="pen"
            title={t('common.edit')}
            onClick={() =>
              leaveItemMenu(
                menuSheet,
                () => {
                  setDraft(chapterDraft(chapter));
                  setIsEditing(true);
                },
                () => setMenuOpen(false),
              )
            }
          />
        ) : null}
        {chapter.capabilities.canDelete ? (
          <ItemMenuOption
            icon="trash"
            danger
            title={t('m5s3.common.delete')}
            onClick={() => {
              setMenuOpen(false);
              deleteMutation.reset();
              setDeleteOpen(true);
            }}
          />
        ) : null}
      </ItemMenuSheet>

      <ItemDeleteSheet
        sheetRef={deleteSheetRef}
        open={deleteOpen && !isEditing}
        title={t('m5s3.common.deleteHeading')}
        body={t('m5s3.chapter.deleteConsequence')}
        confirmLabel={t('m5s3.common.confirmDelete')}
        pendingLabel={t('m5s3.common.deleting')}
        pending={deleteMutation.isPending}
        error={deleteMutation.error}
        restoreFocusRef={menuTriggerRef}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() =>
          deleteMutation.mutate({
            chapter,
            ownsTask: captureOwnership(),
            admitted: captureAuthorizedQuery(queryClient, key),
          })
        }
      />
    </div>
  );
}
