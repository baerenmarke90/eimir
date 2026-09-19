import { useEffect, useRef, useState, type RefObject } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ChapterDetail } from '../api/generated/models/ChapterDetail';
import type { PlaceDetail } from '../api/generated/models/PlaceDetail';
import { normalizeClientError } from '../client/problemDetails';
import {
  dateFromInput,
  dateOnlyInput,
  loadAllPlaces,
  planningIfMatch,
  type SharedPlanningApis,
} from '../client/sharedPlanning';
import { placeDetailPath, STORY_CHAPTERS_ROUTE } from '../client/routes';
import { useTaskOrigin } from '../client/taskOrigin';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import {
  deleteFocusTargetFromInfiniteData,
  type InfiniteItemsData,
  PLANNING_DELETE_FOCUS_STATE_KEY,
} from '../client/deleteFocusTarget';
import { resolvedLocale, useTranslation } from '../i18n';
import { PageHeader } from './PageHeader';
import { ListEntryIconButton } from './ListEntryActions';
import { NativeDateField } from './NativeDateField';
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

type ChapterDraft = {
  title: string;
  description: string;
  startOn: string;
  endOn: string;
  placeId: string;
};

function chapterDraft(chapter: ChapterDetail): ChapterDraft {
  return {
    title: chapter.title,
    description: chapter.description ?? '',
    startOn: dateOnlyInput(chapter.startOn),
    endOn: dateOnlyInput(chapter.endOn),
    placeId: chapter.placeId ?? '',
  };
}

function formatChapterDate(value: Date): string {
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(value);
}

function ChapterEditor({
  chapter,
  places,
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
  chapter: ChapterDetail;
  places: PlaceDetail[];
  draft: ChapterDraft;
  setDraft: (draft: ChapterDraft) => void;
  titleInputRef: RefObject<HTMLInputElement | null>;
  editTriggerRef: RefObject<HTMLButtonElement | null>;
  updatePending: boolean;
  updateError: unknown;
  deletePending: boolean;
  deleteError: unknown;
  onSubmit: (draft: ChapterDraft) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const deleteHeadingRef = useRef<HTMLHeadingElement>(null);
  const restoreDeleteTriggerRef = useRef(false);
  const isDirty =
    JSON.stringify(draft) !== JSON.stringify(chapterDraft(chapter));
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

  const updateDraft = (values: Partial<ChapterDraft>) =>
    setDraft({ ...draft, ...values });

  return (
    <section className="planning-subsection">
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
          onChange={(event) => updateDraft({ description: event.target.value })}
        />
        <div className="planning-coordinate-grid">
          <NativeDateField
            id="chapter-edit-start"
            name="startOn"
            label={t('m5s3.chapter.startOn')}
            value={draft.startOn}
            onChange={(event) => updateDraft({ startOn: event.target.value })}
            openPickerOnClick
          />
          <NativeDateField
            id="chapter-edit-end"
            name="endOn"
            label={t('m5s3.chapter.endOn')}
            value={draft.endOn}
            onChange={(event) => updateDraft({ endOn: event.target.value })}
            openPickerOnClick
          />
        </div>
        <label htmlFor="chapter-edit-place">{t('m5s3.common.place')}</label>
        <select
          id="chapter-edit-place"
          name="placeId"
          value={draft.placeId}
          onChange={(event) => updateDraft({ placeId: event.target.value })}
        >
          <option value="">{t('m5s3.common.noPlace')}</option>
          {places.map((place) => (
            <option key={place.id} value={place.id}>
              {place.name}
            </option>
          ))}
        </select>
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

      {chapter.capabilities.canDelete ? (
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
              aria-labelledby="chapter-delete-heading"
            >
              <h2
                ref={deleteHeadingRef}
                id="chapter-delete-heading"
                tabIndex={-1}
              >
                {t('m5s3.common.deleteHeading')}
              </h2>
              <p>{t('m5s3.chapter.deleteConsequence')}</p>
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

export function ChapterProductPage({
  apis,
  spaceId,
}: {
  apis: SharedPlanningApis;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const { chapterId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { captureOrigin, requestReturn, resolveOrigin } = useTaskOrigin();
  const originKey = (
    location.state as { taskOriginKey?: unknown } | null
  )?.taskOriginKey;
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<ChapterDraft | null>(null);
  const editTriggerRef = useRef<HTMLButtonElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const key = authorSummaryQueryKeys.chapterDetail(spaceId, chapterId);

  const chapterQuery = useQuery({
    queryKey: key,
    queryFn: () => {
      if (!chapterId) throw new Error('Missing Chapter route parameter.');
      return apiCall(() => apis.chapters.getChapter({ spaceId, chapterId }));
    },
    enabled: Boolean(chapterId),
    retry: false,
  });
  const placesQuery = useQuery({
    queryKey: authorSummaryQueryKeys.placeOptions(spaceId),
    queryFn: () => apiCall(() => loadAllPlaces(apis, spaceId)),
    staleTime: 30_000,
    retry: false,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      chapter,
      title,
      description,
      startOn,
      endOn,
      placeId,
    }: {
      chapter: ChapterDetail;
      title: string;
      description: string | null;
      startOn: Date | null;
      endOn: Date | null;
      placeId: string | null;
    }) =>
      apiCall(() =>
        apis.chapters.updateChapter({
          spaceId,
          chapterId: chapter.id,
          ifMatch: planningIfMatch(chapter),
          chapterUpdate: { title, description, startOn, endOn, placeId },
        }),
      ),
    onSuccess: async (chapter) => {
      queryClient.setQueryData(key, chapter);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['m5-s3', 'chapters', spaceId],
        }),
        queryClient.invalidateQueries({ queryKey: key }),
      ]);
      setIsEditing(false);
      setDraft(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (chapter: ChapterDetail) =>
      apiCall(() =>
        apis.chapters.deleteChapter({
          spaceId,
          chapterId: chapter.id,
          ifMatch: planningIfMatch(chapter),
        }),
      ),
    onMutate: (chapter) => ({
      focusTarget: deleteFocusTargetFromInfiniteData(
        queryClient.getQueryData<InfiniteItemsData<ChapterDetail>>(
          authorSummaryQueryKeys.chapters(spaceId),
        ),
        chapter.id,
      ),
    }),
    onSuccess: async (_result, _chapter, context) => {
      queryClient.removeQueries({ queryKey: key });
      await queryClient.invalidateQueries({
        queryKey: ['m5-s3', 'chapters', spaceId],
      });
      navigate(STORY_CHAPTERS_ROUTE, {
        replace: true,
        state: {
          [PLANNING_DELETE_FOCUS_STATE_KEY]: context.focusTarget,
        },
      });
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
  const linkedPlace = chapter.placeId
    ? (placesQuery.data?.find((place) => place.id === chapter.placeId) ?? null)
    : null;
  const startLabel = chapter.startOn
    ? formatChapterDate(chapter.startOn)
    : null;
  const endLabel = chapter.endOn ? formatChapterDate(chapter.endOn) : null;

  return (
    <div className="page planning-page">
      <PageHeader
        before={
          <button
            type="button"
            className="back-link tertiary"
            onClick={() => requestReturn(originKey, STORY_CHAPTERS_ROUTE)}
          >
            {t(
              resolveOrigin(originKey)
                ? 'taskBoundary.back'
                : 'm5s3.common.backToChapters',
            )}
          </button>
        }
        eyebrow={t('m5s3.chapter.detailEyebrow')}
        title={chapter.title}
        titleEditor={
          isEditing ? (
            <input
              ref={titleInputRef}
              form="chapter-edit-form"
              name="title"
              required
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
        description={chapter.description || t('m5s3.chapter.noDescription')}
        titleAction={
          chapter.capabilities.canEdit && !isEditing ? (
            <ListEntryIconButton
              ref={editTriggerRef}
              icon="edit"
              className="tertiary"
              label={t('common.edit')}
              onClick={() => {
                setDraft(chapterDraft(chapter));
                setIsEditing(true);
              }}
            />
          ) : undefined
        }
      />

      {!isEditing ? (
        <section className="planning-subsection planning-chapter-context">
          <h2>{t('m5s3.chapter.contextHeading')}</h2>
          {startLabel && endLabel ? (
            <p className="planning-chapter-period">
              {startLabel} – {endLabel}
            </p>
          ) : startLabel ? (
            <p className="planning-chapter-period">
              {t('m5s3.chapter.startOn')}: {startLabel}
            </p>
          ) : endLabel ? (
            <p className="planning-chapter-period">
              {t('m5s3.chapter.endOn')}: {endLabel}
            </p>
          ) : (
            <p className="planning-meta">{t('m5s3.chapter.noPeriod')}</p>
          )}
          {chapter.placeId ? (
            linkedPlace ? (
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
                {t('m5s3.chapter.placeLabel', { name: linkedPlace.name })}
              </Link>
            ) : placesQuery.isLoading ? (
              <p className="planning-meta">{t('m5s3.chapter.placeLoading')}</p>
            ) : (
              <p className="planning-meta">
                {t('m5s3.chapter.placeUnavailable')}
              </p>
            )
          ) : (
            <p className="planning-meta">{t('m5s3.chapter.noPlace')}</p>
          )}
        </section>
      ) : null}

      {isEditing && draft ? (
        <ChapterEditor
          chapter={chapter}
          places={placesQuery.data ?? []}
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
              chapter,
              title: next.title.trim(),
              description: next.description.trim() || null,
              startOn: dateFromInput(next.startOn) ?? null,
              endOn: dateFromInput(next.endOn) ?? null,
              placeId: next.placeId || null,
            })
          }
          onDelete={() => deleteMutation.mutate(chapter)}
          onClose={() => {
            setIsEditing(false);
            setDraft(null);
            updateMutation.reset();
            deleteMutation.reset();
          }}
        />
      ) : null}

      <PlanningRelationManager
        apis={apis}
        spaceId={spaceId}
        ownerKind="chapter"
        ownerId={chapter.id}
        canManage={chapter.capabilities.canEdit}
      />
    </div>
  );
}
