import { createPortal } from 'react-dom';
import { ComposerTool, ComposerToolRow } from './PageComposer';
import { EimirIcon } from './EimirIcon';
import { loadVideoSource } from '../client/video';
import { loadAuthorizedStoryImageResource } from '../client/storyMediaLoader';
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  type FormEvent,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { MemoryDetail } from '../api/generated/models/MemoryDetail';
import {
  MemoryDetailFromJSON,
  MemoryDetailToJSON,
} from '../api/generated/models/MemoryDetail';
import { MAX_MEMORY_ATTACHMENTS } from '../client/attachmentLimits';
import {
  authorSummaryQueryKeys,
  invalidateStoryProjections,
} from '../client/authorSummaryConsumers';
import { bindVideoTransferTargets } from '../client/backgroundVideoUploads';
import { invalidateDashboard } from '../client/dashboardQueries';
import { isGalleryAttachment } from '../client/galleryMedia';
import { splitFirstGrapheme } from '../client/graphemeSplit';
import {
  isGeneratedMemoryTitle,
  type MemoryEditValues,
  memoryDateInputValue,
  memoryIfMatch,
  memoryUpdatePayload,
} from '../client/memoryProduct';
import type { ObjectUrlSource } from '../client/objectUrlResource';
import { usePartnerNickname } from '../client/partnerNickname';
import {
  ClientProblemError,
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';
import { loadProductWithReadCache } from '../client/productReadCache';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import type { ReferenceApis } from '../client/referenceFlow';
import {
  appRoutePath,
  memoryDetailPath,
  memoryEditPath,
} from '../client/routes';
import { protectSensitiveMediaProjections } from '../client/sensitiveMediaProjections';
import { postSnackbar } from '../client/snackbar';
import { useStoryViewReceipt } from '../client/storyViewReceipt';
import { useTaskOrigin } from '../client/taskOrigin';
import {
  formatAttachmentDraftContextKey,
  useAttachmentDrafts,
} from '../client/useAttachmentDrafts';
import { orderedPhotoKeys } from '../client/useOrderedPhotoDrafts';
import { useStoryDeletion } from '../client/useStoryDeletion';
import { useTaskActivation } from '../client/useTaskActivation';
import { useTaskEditorLifecycle } from '../client/useTaskEditorLifecycle';
import { resolvedLocale, useTranslation } from '../i18n';
import { AttachmentDraftPicker } from './AttachmentDraftPicker';
import { CommentsPanel } from './CommentsPanel';
import {
  ComposerDateContext,
  type ComposerDateContextHandle,
} from './ComposerDateContext';
import type { ContextTagEditorHandle } from './ContextTagEditor';
import { DraftExitPrompt } from './DraftExitPrompt';
import { DraftMediaPreview } from './DraftMediaPreview';
import { ExpandableDescription } from './ExpandableDescription';
import { ExperienceAnswers } from './ExperienceAnswers';
import { MediaProcessingState } from './MediaProcessingState';
import { MemoryPhotoGallery } from './MemoryPhotoGallery';
import { MemoryPlacesDraftField } from './MemoryPlacesDraftField';
import { MemoryPlanningLinks } from './MemoryPlanningLinks';
import { MemoryPreview } from './MemoryPreview';
import {
  MEMORY_TAGS,
  type MemoryTag,
  MemoryTagChoices,
} from './MemoryTagChoices';
import { MomentDate } from './MomentDate';
import type { MomentPlaceSelection } from './MomentPlaceField';
import { MomentPlaces } from './MomentPlaces';
import { NativeDateInput } from './NativeDateField';
import { PageHeader } from './PageHeader';
import { PhotoDraftGallery } from './PhotoDraftGallery';
import { ProblemState } from './ProblemState';
import { StoryDetailEditLink } from './StoryDetailEditLink';
import { StoryDetailPageShell } from './StoryDetailPageShell';
import { StoryEditorPageShell } from './StoryFormPageShell';
import { storyAuthorLabel } from './storyPresentation';
import { TaskBackButton, TaskBackLink } from './TaskBackButton';
import { TaskOriginLink } from './TodayDestinationLink';
import { UiState } from './UiState';

export type MemoryProductMode = 'detail' | 'edit';

function formatDateOnly(value: Date): string {
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(value);
}

function formatCreatedAt(value: Date): string {
  return new Intl.DateTimeFormat(resolvedLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(value);
}

export function MemoryProductPage({
  mode,
  apis,
  apiBaseUrl,
  accessToken,
  spaceId,
  currentAccountId,
  loadMemoryImage,
  startupRead,
}: {
  mode: MemoryProductMode;
  apis: ReferenceApis;
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
  currentAccountId: string;
  startupRead?: () => Promise<MemoryDetail> | undefined;
  loadMemoryImage: (
    memoryId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ) => Promise<ObjectUrlSource>;
}) {
  const [placeToolHost, setPlaceToolHost] = useState<HTMLSpanElement | null>(
    null,
  );
  const [tagToolHost, setTagToolHost] = useState<HTMLSpanElement | null>(null);
  const [photoToolHost, setPhotoToolHost] = useState<HTMLSpanElement | null>(
    null,
  );
  const [placeContextHost, setPlaceContextHost] =
    useState<HTMLSpanElement | null>(null);
  const [commentHost, setCommentHost] = useState<HTMLSpanElement | null>(null);
  const { t } = useTranslation();
  const { nicknameFor } = usePartnerNickname();
  const navigate = useNavigate();
  const location = useLocation();
  const { requestReturn } = useTaskOrigin();
  const taskState = location.state as {
    taskOriginKey?: unknown;
    memorySaved?: boolean;
    photosUnconfirmed?: boolean;
  } | null;
  const originKey = taskState?.taskOriginKey;
  const returnControl = (
    <TaskBackButton onClick={() => requestReturn(originKey)} />
  );
  const params = useParams();
  const queryClient = useQueryClient();
  const memoryId = params.memoryId;
  const planningPending =
    useIsMutating({
      mutationKey: [
        'memory-planning',
        apiBaseUrl,
        currentAccountId,
        spaceId,
        memoryId,
        'write',
      ],
      exact: true,
    }) > 0;
  const memoryKey = authorSummaryQueryKeys.memory(spaceId, memoryId);
  const contextKey = formatAttachmentDraftContextKey(currentAccountId, spaceId);
  const deleteKey = [
    'memory-delete',
    currentAccountId,
    spaceId,
    memoryId,
  ] as const;
  const updateKey = [
    'memory-update',
    currentAccountId,
    spaceId,
    memoryId,
  ] as const;
  const sensitiveDraftKey = JSON.stringify([contextKey, memoryId, mode]);
  const [sensitiveDraft, setSensitiveDraft] = useState<{
    key: string;
    values: Record<string, boolean>;
  }>({ key: sensitiveDraftKey, values: {} });
  const sensitiveValues =
    sensitiveDraft.key === sensitiveDraftKey ? sensitiveDraft.values : {};
  const [removedAttachmentState, setRemovedAttachmentState] = useState<{
    contextKey: string;
    ids: Set<string>;
  }>(() => ({
    contextKey,
    ids: new Set(),
  }));

  const removedAttachmentIds =
    removedAttachmentState.contextKey === contextKey
      ? removedAttachmentState.ids
      : new Set<string>();

  useLayoutEffect(() => {
    setRemovedAttachmentState((current) =>
      current.contextKey === contextKey
        ? current
        : { contextKey, ids: new Set() },
    );
  }, [contextKey]);

  const setRemovedAttachmentIds = useCallback(
    (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      setRemovedAttachmentState((current) => {
        const active =
          current.contextKey === contextKey ? current.ids : new Set<string>();
        const next = typeof updater === 'function' ? updater(active) : updater;
        return { contextKey, ids: next };
      });
    },
    [contextKey],
  );

  const memoryQuery = useQuery({
    queryKey: memoryKey,
    queryFn: async () => {
      if (!memoryId) throw new Error('Missing Memory route parameter.');
      return loadProductWithReadCache({
        accountId: currentAccountId,
        spaceId,
        kind: 'memory',
        resourceId: memoryId,
        load: () =>
          startupRead?.() ?? apis.memories.getMemory({ spaceId, memoryId }),
        serialize: MemoryDetailToJSON,
        deserialize: (payload) => MemoryDetailFromJSON(payload),
      });
    },
    enabled: Boolean(memoryId),
    refetchInterval: (query) =>
      !query.state.error &&
      (query.state.data?.value.attachments ?? []).some((item) =>
        ['PENDING', 'PROCESSING'].includes(item.status),
      )
        ? 2500
        : false,
    retry: false,
  });
  const editForm = useRef<HTMLFormElement>(null);
  const tagEditorRef = useRef<ContextTagEditorHandle>(null);
  const dateContextRef = useRef<ComposerDateContextHandle>(null);
  const [formDirty, setFormDirty] = useState(false);
  const [placePending, setPlacePending] = useState(false);
  const [tagDraft, setTagDraft] = useState<{
    memoryId: string;
    tags: MemoryTag[];
  } | null>(null);

  useStoryViewReceipt({
    apis,
    spaceId,
    kind: 'MEMORY',
    itemId: memoryQuery.data?.value.experienceRootId ?? memoryId ?? '',
    presented: mode === 'detail' && memoryQuery.isSuccess,
  });

  // Edit accepts new draft uploads only up to the capacity the Memory's
  // already-bound attachments (minus any the user has marked for removal)
  // leave available; the backend's MAX_MEMORY_ATTACHMENTS stays authoritative
  // regardless (#701).
  const keptBoundAttachmentCount = memoryQuery.data
    ? memoryQuery.data.value.attachments.filter(
        (attachment) =>
          isGalleryAttachment(attachment) &&
          !removedAttachmentIds.has(attachment.id),
      ).length
    : 0;
  const attachments = useAttachmentDrafts({
    apis,
    apiBaseUrl,
    accessToken,
    spaceId,
    accountId: currentAccountId,
    maxAttachments: MAX_MEMORY_ATTACHMENTS - keptBoundAttachmentCount,
    resourceKey: JSON.stringify([apiBaseUrl, memoryId, mode]),
  });

  const photoOrderScope = JSON.stringify([
    apiBaseUrl,
    contextKey,
    memoryId,
    mode,
  ]);
  const [photoOrder, setPhotoOrder] = useState<{
    scope: string;
    keys: string[];
  }>({ scope: photoOrderScope, keys: [] });
  const [coverDraft, setCoverDraft] = useState<{
    scope: string;
    key: string | null;
  } | null>(null);
  const [placesDraft, setPlacesDraft] = useState<{
    scope: string;
    value: MomentPlaceSelection[];
  } | null>(null);
  const initialCover = memoryQuery.data?.value.selectedCoverAttachmentId;
  const preferredCover =
    coverDraft?.scope === photoOrderScope
      ? coverDraft.key
      : initialCover
        ? `saved:${initialCover}`
        : null;
  const availablePhotoItems = [
    ...(memoryQuery.data?.value.attachments ?? [])
      .filter(
        (photo) =>
          isGalleryAttachment(photo) && !removedAttachmentIds.has(photo.id),
      )
      .sort((a, b) => a.position - b.position)
      .map((photo) => ({ key: `saved:${photo.id}`, photo, draft: undefined })),
    ...attachments.items.map((draft) => ({
      key: `draft:${draft.id}`,
      photo: undefined,
      draft,
    })),
  ];
  const photoKeys = orderedPhotoKeys(
    availablePhotoItems.map((item) => item.key),
    photoOrder.scope === photoOrderScope ? photoOrder.keys : [],
  );
  const photoItems = photoKeys.flatMap((key) => {
    const item = availablePhotoItems.find((item) => item.key === key);
    return item ? [item] : [];
  });
  const selectedCoverKey = photoKeys.includes(preferredCover ?? '')
    ? preferredCover
    : null;
  const coverItem = photoItems.find((item) => item.key === selectedCoverKey);
  const coverId =
    coverItem?.photo?.id ?? coverItem?.draft?.attachmentId ?? null;
  const coverChanged =
    coverId !== (memoryQuery.data?.value.selectedCoverAttachmentId ?? null);
  const photoOrderChanged = photoKeys.some(
    (key, index) => key !== availablePhotoItems[index]?.key,
  );

  const captureSaveOwnership = useTaskActivation(
    mode === 'edit',
    JSON.stringify([apiBaseUrl, contextKey, memoryId, location.key]),
  );

  const updateMutation = useMutation({
    mutationKey: updateKey,
    mutationFn: async ({
      memory,
      values,
      isCurrent,
    }: {
      isCurrent: () => boolean;
      memory: MemoryDetail;
      values: MemoryEditValues;
    }) => {
      try {
        if (!isCurrent()) throw new ClientProblemError('permission');
        let updated = await apis.memories.updateMemory({
          spaceId,
          memoryId: memory.id,
          ifMatch: memoryIfMatch(memory),
          memoryUpdate: memoryUpdatePayload(values),
        });

        if (!isCurrent()) throw new ClientProblemError('permission');
        const attachmentsChanged =
          attachments.readyIds.length > 0 ||
          removedAttachmentIds.size > 0 ||
          Object.keys(sensitiveValues).length > 0 ||
          photoOrderChanged ||
          coverChanged;
        if (attachmentsChanged) {
          const attachmentIds = photoItems.flatMap((item) => {
            const id =
              item.photo?.id ??
              (item.draft?.status === 'ready'
                ? item.draft.attachmentId
                : undefined);
            return id ? [id] : [];
          });
          updated = await apis.memories.replaceMemoryAttachments({
            spaceId,
            memoryId: updated.id,
            ifMatch: String(updated.version),
            memoryAttachmentSet: {
              selectedCoverAttachmentId: coverId,
              attachments: attachmentIds.map((attachmentId, position) => ({
                attachmentId,
                position,
                isSensitive:
                  sensitiveValues[attachmentId] ??
                  attachments.items.find(
                    (item) => item.attachmentId === attachmentId,
                  )?.isSensitive ??
                  updated.attachments.find((item) => item.id === attachmentId)
                    ?.isSensitive,
              })),
            },
          });
        }
        const observed = queryClient.getQueryData<{ value: MemoryDetail }>(
          memoryKey,
        );
        if (observed && observed.value.version > updated.version)
          throw new ClientProblemError('conflict', 409);
        protectSensitiveMediaProjections(
          queryClient,
          updated.spaceId,
          updated.attachments,
        );
        await bindVideoTransferTargets(
          spaceId,
          { targetType: 'MEMORY', targetId: updated.id },
          updated.attachments.map((item) => item.id),
        );
        return updated;
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onMutate: async ({ memory, values, isCurrent }) => {
      if (!isCurrent()) throw new ClientProblemError('permission');
      await queryClient.cancelQueries({ queryKey: memoryKey });
      if (!isCurrent()) throw new ClientProblemError('permission');
      const previous = queryClient.getQueryData(memoryKey);
      queryClient.setQueryData(memoryKey, {
        value: {
          ...memory,
          title: values.title,
          body: values.body,
          tags: values.tags,
          happenedOn: values.happenedOn
            ? new Date(`${values.happenedOn}T00:00:00Z`)
            : null,
          updatedAt: new Date(),
        },
        source: 'network',
      });
      return { previous };
    },
    onError: (_error, variables, context) => {
      if (!variables.isCurrent()) return;
      const observed = queryClient.getQueryData<{ value: MemoryDetail }>(
        memoryKey,
      );
      if (
        context?.previous &&
        (!observed || observed.value.version <= variables.memory.version)
      )
        queryClient.setQueryData(memoryKey, context.previous);
      void queryClient.invalidateQueries({ queryKey: memoryKey });
    },
    onSuccess: async (memory, request) => {
      if (!request.isCurrent()) return;
      setSensitiveDraft({ key: sensitiveDraftKey, values: {} });
      attachments.clear();
      setPhotoOrder({ scope: photoOrderScope, keys: [] });
      setRemovedAttachmentIds(new Set());
      queryClient.setQueryData(memoryKey, { value: memory, source: 'network' });
      await Promise.all([
        invalidateStoryProjections(queryClient, spaceId),
        queryClient.invalidateQueries({ queryKey: memoryKey }),
        ...(memory.experienceRootId
          ? [
              queryClient.invalidateQueries({
                queryKey: authorSummaryQueryKeys.memory(
                  spaceId,
                  memory.experienceRootId,
                ),
              }),
            ]
          : []),
        invalidateDashboard(queryClient, spaceId),
      ]);
      if (!request.isCurrent()) return;
      editorLifecycle.closeConfirmed(() =>
        navigate(memoryDetailPath(memory.id), {
          replace: true,
          state: { taskOriginKey: originKey, memorySaved: true },
        }),
      );
    },
  });

  const deleteMutation = useStoryDeletion<MemoryDetail>({
    active: mode === 'edit',
    accountId: currentAccountId,
    spaceId,
    resourceId: memoryId,
    kind: 'memory',
    version: memoryQuery.data?.value.version,
    queryKey: memoryKey,
    mutationKey: deleteKey,
    conflictingMutationKeys: [updateKey],
    execute: (memory) =>
      apis.memories.deleteMemory({
        spaceId,
        memoryId: memory.id,
        ifMatch: memoryIfMatch(memory),
      }),
    onDeleted: () => {
      navigate(appRoutePath('story'), { replace: true });
      postSnackbar('snackbar.memoryDeleted');
    },
  });
  const editorLifecycle = useTaskEditorLifecycle({
    isActive: mode === 'edit',
    isDirty:
      !deleteMutation.isPending &&
      (formDirty ||
        photoOrderChanged ||
        coverChanged ||
        removedAttachmentIds.size > 0 ||
        attachments.items.length > 0 ||
        placesDraft?.scope === photoOrderScope ||
        tagDraft?.memoryId === memoryId ||
        Object.keys(sensitiveValues).length > 0),
    isCloseBlocked:
      updateMutation.isPending ||
      attachments.hasPending ||
      placePending ||
      planningPending,
    onClose: () => {
      if (memoryId)
        navigate(memoryDetailPath(memoryId), {
          replace: true,
          state: { taskOriginKey: originKey },
        });
    },
  });
  const deleting = deleteMutation.isPending;
  const { confirming: confirmDelete, setConfirming: setConfirmDelete } =
    deleteMutation;

  function toggleAttachmentRemoval(attachmentId: string) {
    setRemovedAttachmentIds((current) => {
      const next = new Set(current);
      if (next.has(attachmentId)) next.delete(attachmentId);
      else next.add(attachmentId);
      return next;
    });
  }

  async function reloadCurrentMemory() {
    updateMutation.reset();
    deleteMutation.reset();
    setCoverDraft(null);
    setPlacesDraft(null);
    setFormDirty(false);
    setConfirmDelete(false);
    setRemovedAttachmentIds(new Set());
    await memoryQuery.refetch();
  }

  if (!memoryId) {
    return (
      <UiState
        kind="error"
        title={t('states.unknown.title')}
        body={t('states.unknown.body')}
      />
    );
  }

  if (memoryQuery.isLoading) {
    return (
      <div className="page page-reading">
        <UiState kind="loading" title={t('memoryProduct.loading')} />
      </div>
    );
  }

  const readDenied =
    memoryQuery.error &&
    ['unauthorized', 'permission', 'notFound'].includes(
      clientProblemKind(memoryQuery.error),
    );
  if (
    memoryQuery.error &&
    (!memoryQuery.data || readDenied || mode === 'edit')
  ) {
    return (
      <div className="page page-reading">
        {returnControl}
        <ProblemState
          error={memoryQuery.error}
          onRetry={() => void memoryQuery.refetch()}
        />
      </div>
    );
  }

  const result = memoryQuery.data;
  if (!result) return null;
  const memory = result.value;
  const selectedTags =
    tagDraft?.memoryId === memory.id ? tagDraft.tags : (memory.tags ?? []);
  const offline = result.source === 'cache' || Boolean(memoryQuery.error);
  const boundAttachments = [...memory.attachments]
    .filter(isGalleryAttachment)
    .sort((left, right) => left.position - right.position);

  if (mode === 'edit') {
    if (
      !memory.capabilities.canEdit ||
      offline ||
      (memory.experienceKind && memory.authorId !== currentAccountId)
    ) {
      return (
        <div className="page page-reading">
          <PageHeader
            before={
              <TaskBackLink
                to={memoryDetailPath(memory.id)}
                state={{ taskOriginKey: originKey }}
              >
                {t('taskBoundary.back')}
              </TaskBackLink>
            }
            title={
              memory.experienceKind
                ? t('coupleExperiences.editOwnAnswer')
                : t('memoryProduct.editHeading')
            }
          />
          <UiState
            kind={offline ? 'offline' : 'permission'}
            title={
              offline
                ? t('states.offline.title')
                : t('memoryProduct.editNotAllowedTitle')
            }
            body={
              offline
                ? t('states.offline.body')
                : t('memoryProduct.editNotAllowedBody')
            }
          />
        </div>
      );
    }

    const editableMemory = memory;

    function submit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      if (
        attachments.hasPending ||
        placePending ||
        attachments.items.some((item) => item.status === 'failed') ||
        queryClient.isMutating({ mutationKey: deleteKey }) ||
        queryClient.isMutating({ mutationKey: updateKey })
      )
        return;
      if (!memory.experienceKind && !dateContextRef.current?.reportValidity())
        return;
      const data = new FormData(event.currentTarget);
      const tags = tagEditorRef.current?.commitDraft();
      if (!tags) return;
      const ownsTask = captureSaveOwnership();
      const ownsRead = captureAuthorizedQuery(queryClient, memoryKey);
      updateMutation.mutate({
        memory: editableMemory,
        isCurrent: () => ownsTask() && ownsRead(),
        values: {
          title: String(data.get('title') || ''),
          body: String(data.get('body') || ''),
          tags,
          happenedOn: String(data.get('happenedOn') || ''),
          happenedUntil: String(data.get('happenedUntil') || ''),
          ...(placesDraft?.scope === photoOrderScope
            ? {
                placeIds: placesDraft.value.map((place) => place.id),
                expectedPlaceIds: memory.placeIds ?? [],
              }
            : {}),
        },
      });
    }

    return (
      <StoryEditorPageShell
        quiet={!memory.experienceKind}
        before={
          <TaskBackLink
            inline={!memory.experienceKind}
            to={memoryDetailPath(memory.id)}
            onClick={(event) => {
              event.preventDefault();
              editorLifecycle.requestClose();
            }}
            state={{ taskOriginKey: originKey }}
          >
            {t('taskBoundary.back')}
          </TaskBackLink>
        }
        title={
          memory.experienceKind
            ? t('coupleExperiences.editOwnAnswer')
            : t('memoryProduct.editHeading')
        }
        headerClassName="create-heading"
        headerAction={
          !memory.experienceKind ? (
            <button
              type="submit"
              form="memory-edit-form"
              className="composer-save-action"
              aria-label={
                updateMutation.isPending
                  ? t('memoryProduct.saving')
                  : t('memoryProduct.save')
              }
              disabled={
                updateMutation.isPending ||
                placePending ||
                planningPending ||
                attachments.hasPending ||
                attachments.items.some((item) => item.status === 'failed') ||
                deleteMutation.isBlocked
              }
            >
              {updateMutation.isPending
                ? t('memoryProduct.saving')
                : t('m5s3.common.save')}
            </button>
          ) : undefined
        }
        sectionLabelledBy="memory-edit-heading"
        sectionHeading={t('memoryProduct.formAria')}
      >
        <>
          <DraftExitPrompt
            open={editorLifecycle.showDiscardConfirm}
            onKeep={editorLifecycle.keepEditing}
            onDiscard={() => editorLifecycle.closeConfirmed()}
          />
          <form
            id="memory-edit-form"
            onChange={() => setFormDirty(true)}
            ref={editForm}
            key={memory.version}
            onSubmit={submit}
            className="form-grid memory-form"
          >
            <div className="composer-context">
              {!memory.experienceKind ? (
                <ComposerDateContext
                  ref={dateContextRef}
                  idPrefix="memory-edit-date"
                  label={t('memory.dateLabel')}
                  defaultValue={memoryDateInputValue(memory.happenedOn)}
                  defaultEndValue={memoryDateInputValue(
                    memory.happenedUntil ?? null,
                  )}
                  allowRange
                  disabled={updateMutation.isPending}
                  onChange={() => setFormDirty(true)}
                  onEndChange={() => setFormDirty(true)}
                />
              ) : (
                <>
                  <div
                    className="field-group"
                    hidden={Boolean(memory.experienceKind)}
                  >
                    <label htmlFor="memory-edit-date">
                      {t('memory.dateLabel')}
                    </label>
                    <NativeDateInput
                      id="memory-edit-date"
                      name="happenedOn"
                      defaultValue={memoryDateInputValue(memory.happenedOn)}
                    />
                  </div>

                  <div
                    className="field-group"
                    hidden={Boolean(memory.experienceKind)}
                  >
                    <label htmlFor="memory-edit-through">
                      {t('experiences.through')}
                    </label>
                    <NativeDateInput
                      id="memory-edit-through"
                      name="happenedUntil"
                      defaultValue={memoryDateInputValue(
                        memory.happenedUntil ?? null,
                      )}
                    />
                  </div>
                </>
              )}
              {!memory.experienceKind ? (
                <span
                  ref={setPlaceContextHost}
                  className="composer-context-row"
                />
              ) : null}
            </div>
            <div
              className={
                !memory.experienceKind ? 'composer-content' : undefined
              }
            >
              <AttachmentDraftPicker
                presentation={!memory.experienceKind ? 'diary' : 'default'}
                pageWideDrop={!memory.experienceKind}
                hasMedia={photoItems.length > 0}
                mediaTrigger={(open) =>
                  photoToolHost
                    ? createPortal(
                        <ComposerTool
                          icon="foto"
                          label={t('composer.photo')}
                          active={photoItems.length > 0}
                          disabled={updateMutation.isPending}
                          onClick={open}
                        />,
                        photoToolHost,
                      )
                    : null
                }
                sourceContext={{
                  apiBaseUrl,
                  accessToken,
                  accountId: currentAccountId,
                  spaceId,
                  remaining: Math.max(
                    0,
                    MAX_MEMORY_ATTACHMENTS -
                      keptBoundAttachmentCount -
                      attachments.items.length,
                  ),
                  beginSelection: attachments.beginSelection,
                }}
                id="memory-edit-images"
                videoContext={{ apis, accountId: currentAccountId, spaceId }}
                disabled={updateMutation.isPending}
                attachments={attachments}
                gallery={(addAction) => (
                  <PhotoDraftGallery
                    addAction={!memory.experienceKind ? addAction : undefined}
                    key={photoOrderScope}
                    resourceScopeKey={photoOrderScope}
                    selectedCoverKey={selectedCoverKey}
                    onSelectCover={(key) =>
                      setCoverDraft({ scope: photoOrderScope, key })
                    }
                    onOrderChange={(keys) =>
                      setPhotoOrder({ scope: photoOrderScope, keys })
                    }
                    disabled={updateMutation.isPending}
                    items={photoItems.map((item, index) => ({
                      key: item.key,
                      name:
                        item.draft?.file.name ??
                        t('m5s3.planImage.photoNumber', { number: index + 1 }),
                      draft: item.draft,
                      loadMedia: item.photo
                        ? (signal) =>
                            loadMemoryImage(memory.id, item.photo!.id, signal)
                        : undefined,
                      loadPoster: item.photo
                        ? (signal) =>
                            loadAuthorizedStoryImageResource(
                              apis,
                              spaceId,
                              'MEMORY',
                              memory.id,
                              item.photo!.id,
                              { signal, variant: 'thumbnail' },
                            )
                        : undefined,
                      loadPlayback: item.photo
                        ? (signal) =>
                            loadVideoSource(
                              apis,
                              spaceId,
                              'MEMORY',
                              memory.id,
                              item.photo!.id,
                              signal,
                            )
                        : undefined,
                      mediaType: item.photo?.mediaType,
                      status: item.photo?.status,
                      canRemove: !item.photo || memory.capabilities.canDelete,
                      canEditSensitivity:
                        !item.photo ||
                        (item.photo.canEditSensitivity ??
                          memory.capabilities.canDelete),
                      isSensitive: item.photo
                        ? (sensitiveValues[item.photo.id] ??
                          item.photo.isSensitive ??
                          true)
                        : item.draft?.isSensitive === true,
                      preview:
                        item.photo && item.photo.status !== 'READY' ? (
                          <MediaProcessingState
                            status={item.photo.status}
                            compact
                          />
                        ) : item.photo ? (
                          <MemoryPreview
                            memoryId={memory.id}
                            attachmentId={item.photo.id}
                            isSensitive={
                              sensitiveValues[item.photo.id] ??
                              item.photo.isSensitive
                            }
                            loadImage={loadMemoryImage}
                          />
                        ) : item.draft ? (
                          <DraftMediaPreview
                            draft={item.draft}
                            blurSensitivePreview={!memory.experienceKind}
                            context={{
                              apis,
                              accountId: currentAccountId,
                              spaceId,
                            }}
                          />
                        ) : null,
                    }))}
                    onSensitive={(key, value) => {
                      const item = photoItems.find((item) => item.key === key);
                      if (
                        item?.photo &&
                        (item.photo.canEditSensitivity ??
                          memory.capabilities.canDelete)
                      )
                        setSensitiveDraft((current) => ({
                          key: sensitiveDraftKey,
                          values: {
                            ...(current.key === sensitiveDraftKey
                              ? current.values
                              : {}),
                            [item.photo.id]: value,
                          },
                        }));
                      else if (item?.draft)
                        attachments.setSensitive(item.draft.id, value);
                    }}
                    removeLabel={(key) =>
                      photoItems.find((item) => item.key === key)?.photo
                        ? t('memoryProduct.markPhotoForRemoval')
                        : t('memory.photoRemove')
                    }
                    onRemove={(key) => {
                      const item = photoItems.find((item) => item.key === key);
                      if (item?.photo) toggleAttachmentRemoval(item.photo.id);
                      else if (item?.draft) attachments.remove(item.draft.id);
                    }}
                    onRetry={(key) => {
                      const draft = photoItems.find(
                        (item) => item.key === key,
                      )?.draft;
                      if (draft) attachments.retry(draft);
                    }}
                  />
                )}
                showItems={false}
                multiple
              />{' '}
              <div
                className={
                  !memory.experienceKind
                    ? 'composer-writing-surface'
                    : undefined
                }
              >
                <div
                  className="field-group"
                  hidden={Boolean(memory.experienceKind)}
                >
                  <label htmlFor="memory-edit-title">
                    {t('memory.titleLabel')}
                  </label>
                  <input
                    id="memory-edit-title"
                    name="title"
                    required
                    maxLength={200}
                    defaultValue={memory.title}
                  />
                </div>
                <div className="field-group">
                  <label htmlFor="memory-edit-body">
                    {t('memory.bodyLabel')}
                  </label>
                  <textarea
                    id="memory-edit-body"
                    name="body"
                    rows={6}
                    required={Boolean(memory.experienceKind)}
                    maxLength={memory.experienceKind ? 2000 : undefined}
                    defaultValue={memory.body}
                  />
                </div>
              </div>
            </div>

            <MemoryPlacesDraftField
              presentation={!memory.experienceKind ? 'composer' : 'default'}
              renderTrigger={
                !memory.experienceKind
                  ? (open) =>
                      placeToolHost
                        ? createPortal(
                            <ComposerTool
                              icon="orte"
                              label={t('composer.place')}
                              active={Boolean(
                                (placesDraft?.scope === photoOrderScope
                                  ? placesDraft.value
                                  : memory.placeIds
                                )?.length,
                              )}
                              disabled={updateMutation.isPending}
                              onClick={open}
                            />,
                            placeToolHost,
                          )
                        : null
                  : undefined
              }
              renderSelection={
                !memory.experienceKind
                  ? (selected, open) =>
                      selected.length && placeContextHost
                        ? createPortal(
                            <button
                              type="button"
                              className="tertiary composer-place-context"
                              onClick={open}
                            >
                              <EimirIcon name="orte" />
                              {selected[0].name}
                              {selected.length > 1
                                ? ` +${selected.length - 1}`
                                : ''}
                            </button>,
                            placeContextHost,
                          )
                        : null
                  : undefined
              }
              memoryId={memory.id}
              order={memory.placeIds ?? []}
              apiBaseUrl={apiBaseUrl}
              accessToken={accessToken}
              accountId={currentAccountId}
              spaceId={spaceId}
              value={
                placesDraft?.scope === photoOrderScope
                  ? placesDraft.value
                  : undefined
              }
              onChange={(value) =>
                setPlacesDraft({ scope: photoOrderScope, value })
              }
              disabled={updateMutation.isPending}
              onPendingChange={setPlacePending}
              onNavigate={(proceed) => {
                const ownsTask = captureSaveOwnership();
                const ownsRead = captureAuthorizedQuery(queryClient, memoryKey);
                editorLifecycle.requestClose(() => {
                  if (ownsTask() && ownsRead()) proceed();
                });
              }}
            />
            <MemoryTagChoices
              presentation={!memory.experienceKind ? 'composer' : 'default'}
              renderTrigger={
                !memory.experienceKind
                  ? (open) =>
                      tagToolHost
                        ? createPortal(
                            <ComposerTool
                              icon="tag"
                              label={t('composer.tag')}
                              active={selectedTags.length > 0}
                              disabled={updateMutation.isPending}
                              onClick={open}
                            />,
                            tagToolHost,
                          )
                        : null
                  : undefined
              }
              discloseEmpty={!memory.experienceKind}
              parentId={memory.id}
              editorRef={tagEditorRef}
              selected={selectedTags}
              onChange={(tags) => setTagDraft({ memoryId: memory.id, tags })}
              disabled={updateMutation.isPending}
            />

            {boundAttachments
              .filter((photo) => removedAttachmentIds.has(photo.id))
              .map((photo) => (
                <div key={photo.id} className="photo-draft-controls">
                  <span role="status">
                    {t('memoryProduct.photoMarkedForRemoval')}
                  </span>
                  <button
                    type="button"
                    className="tertiary"
                    disabled={updateMutation.isPending}
                    onClick={() => toggleAttachmentRemoval(photo.id)}
                  >
                    {t('memoryProduct.keepPhoto')}
                  </button>
                </div>
              ))}

            {!memory.experienceKind ? (
              <MemoryPlanningLinks
                apiBaseUrl={apiBaseUrl}
                accessToken={accessToken}
                accountId={currentAccountId}
                spaceId={spaceId}
                memoryId={memory.id}
                canManage={
                  memory.capabilities.canEdit && !updateMutation.isPending
                }
                editing
                presentation="composer"
                offline={offline}
              />
            ) : null}
            {!memory.experienceKind ? (
              <ComposerToolRow>
                <span className="composer-tool-slot" ref={setPhotoToolHost} />
                <span className="composer-tool-slot" ref={setPlaceToolHost} />
                <span className="composer-tool-slot" ref={setTagToolHost} />
              </ComposerToolRow>
            ) : null}
            {memory.experienceKind ? (
              <div className="form-actions">
                <Link
                  className="button-link secondary-link"
                  to={memoryDetailPath(memory.id)}
                  state={{ taskOriginKey: originKey }}
                  onClick={(event) => {
                    event.preventDefault();
                    setConfirmDelete(false);
                    editorLifecycle.requestClose();
                  }}
                >
                  {t('common.cancel')}
                </Link>
                <button
                  type="submit"
                  disabled={
                    updateMutation.isPending ||
                    placePending ||
                    planningPending ||
                    attachments.hasPending ||
                    attachments.items.some(
                      (item) => item.status === 'failed',
                    ) ||
                    deleteMutation.isBlocked
                  }
                >
                  {updateMutation.isPending
                    ? t('memoryProduct.saving')
                    : t('memoryProduct.save')}
                </button>
              </div>
            ) : null}
          </form>
          {updateMutation.error ? (
            <ProblemState
              error={updateMutation.error}
              onRetry={() => void reloadCurrentMemory()}
            />
          ) : null}

          {memory.capabilities.canDelete && !offline ? (
            <div style={{ marginTop: 'var(--space-8)' }}>
              {!confirmDelete && !deleting ? (
                <button
                  type="button"
                  className="button-link danger-link"
                  onClick={() => setConfirmDelete(true)}
                  disabled={deleteMutation.isBlocked}
                >
                  {t('memoryProduct.delete')}
                </button>
              ) : (
                <section
                  className="memory-danger-zone memory-delete-confirmation"
                  aria-label={t('memoryProduct.delete')}
                  role="alert"
                >
                  <div>
                    <h2>{t('memoryProduct.deleteConfirmTitle')}</h2>
                    <p>{t('memoryProduct.deleteConfirmBody')}</p>
                  </div>
                  <div className="memory-actions">
                    <button
                      type="button"
                      className="tertiary"
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleting}
                    >
                      {t('memoryProduct.deleteCancel')}
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => deleteMutation.mutate(memory)}
                      disabled={deleteMutation.isBlocked}
                    >
                      {deleting
                        ? t('memoryProduct.deleting')
                        : t('memoryProduct.deleteConfirm')}
                    </button>
                  </div>
                  {deleteMutation.error && (
                    <ProblemState
                      error={deleteMutation.error}
                      onRetry={() => deleteMutation.reset()}
                    />
                  )}
                </section>
              )}
            </div>
          ) : null}
        </>
      </StoryEditorPageShell>
    );
  }
  const dateLabel = memory.happenedOn
    ? memory.happenedUntil &&
      memory.happenedUntil.getTime() !== memory.happenedOn.getTime()
      ? new Intl.DateTimeFormat(resolvedLocale(), {
          dateStyle: 'long',
          timeZone: 'UTC',
        }).formatRange(memory.happenedOn, memory.happenedUntil)
      : formatDateOnly(memory.happenedOn)
    : t('memoryProduct.noDate');
  const hasAuthoredTitle = Boolean(
    memory.title.trim() &&
      !isGeneratedMemoryTitle(memory.title, memory.happenedOn, t),
  );

  const provenanceAuthor = storyAuthorLabel(
    memory.author,
    currentAccountId,
    nicknameFor,
  );

  const dateContext = (
    <MomentDate
      dateTime={
        memory.happenedOn ? memoryDateInputValue(memory.happenedOn) : undefined
      }
    >
      {dateLabel}
    </MomentDate>
  );
  const placeContext = (
    <MomentPlaces
      key={`${apiBaseUrl}:${currentAccountId}:${spaceId}:${memory.id}`}
      apiBaseUrl={apiBaseUrl}
      accessToken={accessToken}
      accountId={currentAccountId}
      spaceId={spaceId}
      targetId={memory.id}
      canManage={false}
      kind="memories"
      offline={offline}
      compact
      inline
    />
  );

  const mediaContext = (
    <div className="memory-media-context">
      {memory.experienceKind &&
      memory.experienceAnswers?.some(
        (answer) => (answer.attachments?.length ?? 0) > 0,
      ) ? (
        <section aria-label={t('coupleExperiences.sharedGallery')}>
          <h2>{t('coupleExperiences.sharedGallery')}</h2>
          <div className="experience-shared-gallery">
            {memory.experienceAnswers
              .filter((answer) => (answer.attachments?.length ?? 0) > 0)
              .map((answer, index) => (
                <MemoryPhotoGallery
                  key={answer.id}
                  memory={{
                    ...memory,
                    id: answer.id,
                    authorId: answer.author.id,
                    author: answer.author,
                    body: answer.body,
                    version: answer.version,
                    capabilities: answer.capabilities,
                    attachments: answer.attachments ?? [],
                  }}
                  apis={apis}
                  accountId={currentAccountId}
                  offline={offline}
                  projectionMemoryId={memory.id}
                  commentTriggerRef={index === 0 ? setCommentHost : undefined}
                  loadImage={(attachmentId, signal) =>
                    loadMemoryImage(answer.id, attachmentId, signal)
                  }
                  scope={`memory:${apiBaseUrl}:${currentAccountId}:${spaceId}:${mode}:${answer.id}`}
                />
              ))}
          </div>
        </section>
      ) : null}
      {(!memory.experienceKind || !memory.experienceAnswers?.length) &&
      boundAttachments.length > 0 ? (
        <section aria-label={t('memory.photoLabel')}>
          <MemoryPhotoGallery
            commentTriggerRef={setCommentHost}
            key={`memory:${apiBaseUrl}:${currentAccountId}:${spaceId}:${mode}:${memory.id}`}
            memory={memory}
            apis={apis}
            accountId={currentAccountId}
            offline={offline}
            loadImage={(attachmentId, signal) =>
              loadMemoryImage(memory.id, attachmentId, signal)
            }
            scope={`memory:${apiBaseUrl}:${currentAccountId}:${spaceId}:${mode}:${memory.id}`}
          />
        </section>
      ) : null}
    </div>
  );

  return (
    <StoryDetailPageShell
      before={
        !memory.experienceKind ? (
          <TaskBackButton inline onClick={() => requestReturn(originKey)} />
        ) : undefined
      }
      title={
        !memory.experienceKind
          ? t('composer.diaryEntry')
          : hasAuthoredTitle
            ? memory.title
            : dateContext
      }
      titleContext={
        memory.experienceKind && !hasAuthoredTitle ? (
          <div className="moment-metadata">{placeContext}</div>
        ) : undefined
      }
      metadata={
        !memory.experienceKind || hasAuthoredTitle ? (
          <div className="moment-metadata">
            {dateContext}
            {placeContext}
          </div>
        ) : undefined
      }
      titleAction={
        (!memory.experienceKind ||
          (!memory.experienceAnswers?.length &&
            memory.authorId === currentAccountId)) &&
        memory.capabilities.canEdit &&
        !offline ? (
          <StoryDetailEditLink
            text={!memory.experienceKind}
            to={memoryEditPath(memory.id)}
            label={t('memoryProduct.edit')}
            state={{ taskOriginKey: originKey }}
          />
        ) : undefined
      }
      offline={offline}
      beforeHeader={
        <>
          {taskState?.memorySaved ? (
            <div
              className="inline-message inline-message-success"
              role="status"
            >
              {t(
                taskState.photosUnconfirmed
                  ? 'taskBoundary.photosUnconfirmed'
                  : !memory.experienceKind
                    ? 'composer.saved'
                    : 'taskBoundary.saved',
              )}
            </div>
          ) : null}
          {memoryQuery.error ? (
            <ProblemState
              error={memoryQuery.error}
              onRetry={() => void memoryQuery.refetch()}
            />
          ) : null}
        </>
      }
      pageClassName={`memory-product-page${!memory.experienceKind ? ' page-composer-detail' : ''}`}
      containerClassName="memory-detail-container"
      articleClassName="memory-detail-card"
    >
      {memory.experienceKind && (memory.experienceAnswers?.length ?? 0) > 0 ? (
        <ExperienceAnswers
          answers={memory.experienceAnswers ?? []}
          kind={memory.experienceKind}
          editable={!offline}
          originKey={typeof originKey === 'string' ? originKey : undefined}
        />
      ) : null}
      {memory.experienceKind &&
      memory.experienceAnswers &&
      !memory.experienceAnswers.some(
        (answer) => answer.author.id === currentAccountId,
      ) ? (
        <TaskOriginLink
          className="button-link"
          to={`${memory.experienceKind === 'HAPPINESS' ? '/story/happiness' : '/story/time-travel'}/new?replyTo=${encodeURIComponent(memory.experienceRootId ?? memory.id)}`}
        >
          {t('coupleExperiences.addOwnAnswer')}
        </TaskOriginLink>
      ) : null}
      {!memory.experienceKind ? mediaContext : null}
      {!memory.experienceKind && hasAuthoredTitle ? (
        <h2 className="detail-content-title">{memory.title}</h2>
      ) : null}
      {(!memory.experienceKind || !memory.experienceAnswers?.length) &&
      memory.body.trim() ? (
        <ExpandableDescription
          text={memory.body}
          scope={JSON.stringify([
            apiBaseUrl,
            currentAccountId,
            spaceId,
            memory.id,
          ])}
          renderText={(visibleText) => (
            <div className="memory-diary-prose">
              {visibleText.split(/\r?\n[\t ]*\r?\n/).map((paragraph, index) => {
                const initial =
                  index === 0 ? splitFirstGrapheme(paragraph) : null;
                return (
                  <p
                    className="memory-detail-body"
                    // biome-ignore lint/suspicious/noArrayIndexKey: Read-only paragraphs have no state or reorder interaction.
                    key={index}
                  >
                    {initial ? (
                      <>
                        <span className="drop-cap-letter">{initial.first}</span>
                        {initial.rest}
                      </>
                    ) : (
                      paragraph
                    )}
                  </p>
                );
              })}
            </div>
          )}
        />
      ) : null}

      {(memory.tags ?? []).length > 0 ? (
        <section aria-label={t('memory.tagsLabel')}>
          <ul className="memory-tag-summary">
            {memory.tags.map((tag) => (
              <li key={tag}>
                {!memory.experienceKind ? <EimirIcon name="tag" /> : null}
                {(MEMORY_TAGS as readonly string[]).includes(tag)
                  ? t(`memory.tagLabels.${tag}`)
                  : tag}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {memory.experienceKind ? mediaContext : null}
      {!memory.experienceKind ? (
        <MemoryPlanningLinks
          apiBaseUrl={apiBaseUrl}
          accessToken={accessToken}
          accountId={currentAccountId}
          spaceId={spaceId}
          memoryId={memory.id}
          canManage={memory.capabilities.canEdit}
          presentation="detail"
          offline={offline}
          initialPlanId={(() => {
            const candidate = (
              location.state as {
                sourcePlanToLink?: {
                  id?: unknown;
                  memoryId?: unknown;
                  accountId?: unknown;
                  spaceId?: unknown;
                  instance?: unknown;
                };
              } | null
            )?.sourcePlanToLink;
            return candidate?.memoryId === memory.id &&
              candidate.accountId === currentAccountId &&
              candidate.spaceId === spaceId &&
              candidate.instance === apiBaseUrl &&
              typeof candidate.id === 'string'
              ? candidate.id
              : undefined;
          })()}
          onInitialPlanConsumed={() => {
            const state = { ...location.state };
            delete state.sourcePlanToLink;
            void navigate(`${location.pathname}${location.search}`, {
              replace: true,
              state,
            });
          }}
        />
      ) : null}
      <CommentsPanel
        inlineComposer={!memory.experienceKind}
        triggerContainer={commentHost}
        commentsApi={apis.comments}
        spaceId={spaceId}
        parentKind="memory"
        parentId={memory.experienceRootId ?? memory.id}
        currentAccountId={currentAccountId}
        canComment={memory.capabilities.canComment}
        offline={offline}
      />

      {!memory.experienceKind ? (
        <footer className="memory-provenance-footer">
          <p>
            {t('memoryProduct.provenance', {
              author: provenanceAuthor,
              createdAt: formatCreatedAt(memory.createdAt),
            })}
          </p>
        </footer>
      ) : null}
    </StoryDetailPageShell>
  );
}
