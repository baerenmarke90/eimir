import { protectSensitiveMediaProjections } from '../client/sensitiveMediaProjections';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useCallback, useLayoutEffect, useState } from 'react';
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
import { invalidateDashboard } from '../client/dashboardQueries';
import { splitFirstGrapheme } from '../client/graphemeSplit';
import {
  type MemoryEditValues,
  isGeneratedMemoryTitle,
  memoryDateInputValue,
  memoryIfMatch,
  memoryUpdatePayload,
} from '../client/memoryProduct';
import { usePartnerNickname } from '../client/partnerNickname';
import {
  ClientProblemError,
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';
import { loadProductWithReadCache } from '../client/productReadCache';
import type { ReferenceApis } from '../client/referenceFlow';
import {
  appRoutePath,
  memoryDetailPath,
  memoryEditPath,
} from '../client/routes';
import { postSnackbar } from '../client/snackbar';
import { useStoryViewReceipt } from '../client/storyViewReceipt';
import { useTaskOrigin } from '../client/taskOrigin';
import {
  formatAttachmentDraftContextKey,
  useAttachmentDrafts,
} from '../client/useAttachmentDrafts';
import { useStoryDeletion } from '../client/useStoryDeletion';
import { useTaskActivation } from '../client/useTaskActivation';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { resolvedLocale, useTranslation } from '../i18n';
import { SensitiveMediaCheckbox } from './SensitiveMedia';
import { AttachmentDraftPicker } from './AttachmentDraftPicker';
import { CommentsPanel } from './CommentsPanel';
import { MemoryPhotoGallery } from './MemoryPhotoGallery';
import { MemoryPreview } from './MemoryPreview';
import {
  MEMORY_TAGS,
  type MemoryTag,
  MemoryTagChoices,
} from './MemoryTagChoices';
import { MomentPlaces } from './MomentPlaces';
import { PageHeader } from './PageHeader';
import { PhotoSourcePicker } from './PhotoSourcePicker';
import { ProblemState } from './ProblemState';
import { StoryDetailEditLink } from './StoryDetailEditLink';
import { StoryDetailPageShell } from './StoryDetailPageShell';
import { StoryEditorPageShell } from './StoryFormPageShell';
import { storyAuthorLabel } from './storyPresentation';
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
}: {
  mode: MemoryProductMode;
  apis: ReferenceApis;
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
  currentAccountId: string;
  loadMemoryImage: (
    memoryId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ) => Promise<string>;
}) {
  const { t } = useTranslation();
  const { nicknameFor } = usePartnerNickname();
  const navigate = useNavigate();
  const location = useLocation();
  const { requestReturn, resolveOrigin } = useTaskOrigin();
  const taskState = location.state as {
    taskOriginKey?: unknown;
    memorySaved?: boolean;
    photosUnconfirmed?: boolean;
  } | null;
  const originKey = taskState?.taskOriginKey;
  const returnControl = (
    <button
      type="button"
      className="back-link tertiary"
      onClick={() => requestReturn(originKey)}
    >
      {t(
        resolveOrigin(originKey)
          ? 'taskBoundary.back'
          : 'memoryProduct.backToStory',
      )}
    </button>
  );
  const params = useParams();
  const queryClient = useQueryClient();
  const memoryId = params.memoryId;
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
        load: () => apis.memories.getMemory({ spaceId, memoryId }),
        serialize: MemoryDetailToJSON,
        deserialize: (payload) => MemoryDetailFromJSON(payload),
      });
    },
    enabled: Boolean(memoryId),
    retry: false,
  });
  const [tagDraft, setTagDraft] = useState<{
    memoryId: string;
    tags: MemoryTag[];
  } | null>(null);

  useStoryViewReceipt({
    apis,
    spaceId,
    kind: 'MEMORY',
    itemId: memoryId ?? '',
    presented: mode === 'detail' && memoryQuery.isSuccess,
  });

  // Edit accepts new draft uploads only up to the capacity the Memory's
  // already-bound attachments (minus any the user has marked for removal)
  // leave available; the backend's MAX_MEMORY_ATTACHMENTS stays authoritative
  // regardless (#701).
  const keptBoundAttachmentCount = memoryQuery.data
    ? memoryQuery.data.value.attachments.filter(
        (attachment) =>
          attachment.status === 'READY' &&
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
  });

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
          Object.keys(sensitiveValues).length > 0;
        if (attachmentsChanged) {
          const existing = [...updated.attachments]
            .sort((left, right) => left.position - right.position)
            .map((attachment) => attachment.id)
            .filter((attachmentId) => !removedAttachmentIds.has(attachmentId));
          const attachmentIds = [...existing, ...attachments.readyIds];
          updated = await apis.memories.replaceMemoryAttachments({
            spaceId,
            memoryId: updated.id,
            ifMatch: String(updated.version),
            memoryAttachmentSet: {
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
      setRemovedAttachmentIds(new Set());
      queryClient.setQueryData(memoryKey, { value: memory, source: 'network' });
      await Promise.all([
        invalidateStoryProjections(queryClient, spaceId),
        queryClient.invalidateQueries({ queryKey: memoryKey }),
        invalidateDashboard(queryClient, spaceId),
      ]);
      if (!request.isCurrent()) return;
      navigate(memoryDetailPath(memory.id), {
        replace: true,
        state: { taskOriginKey: originKey },
      });
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
  const readyAttachments = [...memory.attachments]
    .filter((attachment) => attachment.status === 'READY')
    .sort((left, right) => left.position - right.position);

  if (mode === 'edit') {
    if (!memory.capabilities.canEdit || offline) {
      return (
        <div className="page page-reading">
          <PageHeader
            before={
              <Link
                className="back-link"
                to={memoryDetailPath(memory.id)}
                state={{ taskOriginKey: originKey }}
              >
                {t('memoryProduct.backToMemory')}
              </Link>
            }
            eyebrow={t('memoryProduct.editEyebrow')}
            title={t('memoryProduct.editHeading')}
            description={t('memoryProduct.editIntro')}
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
        queryClient.isMutating({ mutationKey: deleteKey }) ||
        queryClient.isMutating({ mutationKey: updateKey })
      )
        return;
      const data = new FormData(event.currentTarget);
      const ownsTask = captureSaveOwnership();
      const ownsRead = captureAuthorizedQuery(queryClient, memoryKey);
      updateMutation.mutate({
        memory: editableMemory,
        isCurrent: () => ownsTask() && ownsRead(),
        values: {
          title: String(data.get('title') || ''),
          body: String(data.get('body') || ''),
          tags: [...selectedTags],
          happenedOn: String(data.get('happenedOn') || ''),
        },
      });
    }

    return (
      <StoryEditorPageShell
        before={
          <Link
            className="back-link"
            to={memoryDetailPath(memory.id)}
            state={{ taskOriginKey: originKey }}
          >
            {t('memoryProduct.backToMemory')}
          </Link>
        }
        eyebrow={t('memoryProduct.editEyebrow')}
        title={t('memoryProduct.editHeading')}
        description={t('memoryProduct.editIntro')}
        headerClassName="create-heading"
        sectionLabelledBy="memory-edit-heading"
        sectionHeading={t('memoryProduct.formAria')}
      >
        <>
          <form
            key={memory.version}
            onSubmit={submit}
            className="form-grid memory-form"
          >
            <div className="field-group">
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
              <label htmlFor="memory-edit-body">{t('memory.bodyLabel')}</label>
              <textarea
                id="memory-edit-body"
                name="body"
                rows={6}
                defaultValue={memory.body}
              />
            </div>
            <div className="field-group">
              <label htmlFor="memory-edit-date">{t('memory.dateLabel')}</label>
              <input
                id="memory-edit-date"
                name="happenedOn"
                type="date"
                defaultValue={memoryDateInputValue(memory.happenedOn)}
              />
            </div>

            <MemoryTagChoices
              selected={selectedTags}
              onChange={(tags) => setTagDraft({ memoryId: memory.id, tags })}
              disabled={updateMutation.isPending}
            />

            {readyAttachments.length > 0 ? (
              <fieldset className="memory-existing-attachments">
                <legend>{t('memoryProduct.existingPhotosHeading')}</legend>
                <p className="field-help">
                  {t('memoryProduct.existingPhotosHelp')}{' '}
                  {t('sensitiveMedia.help')}
                </p>
                <ul className="memory-edit-attachment-list">
                  {readyAttachments.map((attachment) => {
                    const removed = removedAttachmentIds.has(attachment.id);
                    return (
                      <li
                        key={attachment.id}
                        className={`memory-edit-attachment${
                          removed ? ' memory-edit-attachment-removed' : ''
                        }`}
                      >
                        <MemoryPreview
                          memoryId={memory.id}
                          attachmentId={attachment.id}
                          isSensitive={
                            sensitiveValues[attachment.id] ??
                            attachment.isSensitive
                          }
                          loadImage={loadMemoryImage}
                        />
                        <div className="memory-edit-attachment-actions">
                          <SensitiveMediaCheckbox
                            checked={
                              sensitiveValues[attachment.id] ??
                              attachment.isSensitive ??
                              true
                            }
                            disabled={removed || updateMutation.isPending}
                            onChange={(value) =>
                              setSensitiveDraft((current) => ({
                                key: sensitiveDraftKey,
                                values: {
                                  ...(current.key === sensitiveDraftKey
                                    ? current.values
                                    : {}),
                                  [attachment.id]: value,
                                },
                              }))
                            }
                          />
                          {removed ? (
                            <span role="status">
                              {t('memoryProduct.photoMarkedForRemoval')}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className="tertiary"
                            onClick={() =>
                              toggleAttachmentRemoval(attachment.id)
                            }
                          >
                            {removed
                              ? t('memoryProduct.keepPhoto')
                              : t('memoryProduct.markPhotoForRemoval')}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            ) : null}

            <div className="memory-new-attachments-heading">
              <strong>{t('memoryProduct.newPhotosHeading')}</strong>
              {readyAttachments.length > 0 ? (
                <p className="field-help">
                  {t('memoryProduct.editPhotosPreserved')}
                </p>
              ) : null}
            </div>
            <AttachmentDraftPicker
              id="memory-edit-images"
              disabled={updateMutation.isPending}
              attachments={attachments}
              multiple
            />
            <PhotoSourcePicker
              apiBaseUrl={apiBaseUrl}
              accessToken={accessToken}
              accountId={currentAccountId}
              spaceId={spaceId}
              remaining={Math.max(
                0,
                MAX_MEMORY_ATTACHMENTS -
                  keptBoundAttachmentCount -
                  attachments.items.length,
              )}
              beginSelection={attachments.beginSelection}
            />

            <div className="form-actions">
              <Link
                className="button-link secondary-link"
                to={memoryDetailPath(memory.id)}
                state={{ taskOriginKey: originKey }}
                onClick={() => setConfirmDelete(false)}
              >
                {t('common.cancel')}
              </Link>
              <button
                type="submit"
                disabled={
                  updateMutation.isPending ||
                  attachments.hasPending ||
                  deleteMutation.isBlocked
                }
              >
                {updateMutation.isPending
                  ? t('memoryProduct.saving')
                  : t('memoryProduct.save')}
              </button>
            </div>
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
    ? formatDateOnly(memory.happenedOn)
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

  return (
    <StoryDetailPageShell
      title={hasAuthoredTitle ? memory.title : dateLabel}
      description={
        hasAuthoredTitle ? (
          <time
            dateTime={
              memory.happenedOn
                ? memoryDateInputValue(memory.happenedOn)
                : undefined
            }
          >
            {dateLabel}
          </time>
        ) : undefined
      }
      titleAction={
        memory.capabilities.canEdit && !offline ? (
          <StoryDetailEditLink
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
      pageClassName="memory-product-page"
      containerClassName="memory-detail-container"
      articleClassName="memory-detail-card"
    >
      {memory.body.trim() ? (
        <div className="memory-diary-prose">
          {memory.body.split(/\r?\n[\t ]*\r?\n/).map((paragraph, index) => {
            const initial = index === 0 ? splitFirstGrapheme(paragraph) : null;
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
      ) : null}

      {(memory.tags ?? []).length > 0 ? (
        <section aria-label={t('memory.tagsLabel')}>
          <ul className="memory-tag-summary">
            {memory.tags.map((tag) => (
              <li key={tag}>
                {(MEMORY_TAGS as readonly string[]).includes(tag)
                  ? t(`memory.tagLabels.${tag}`)
                  : tag}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="memory-media-context">
        {readyAttachments.length > 0 ? (
          <section aria-label={t('memory.photoLabel')}>
            <MemoryPhotoGallery
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

        <MomentPlaces
          key={`${apiBaseUrl}:${currentAccountId}:${spaceId}:${memory.id}`}
          apiBaseUrl={apiBaseUrl}
          accessToken={accessToken}
          accountId={currentAccountId}
          spaceId={spaceId}
          targetId={memory.id}
          kind="memories"
          offline={offline}
          compact
        />
      </div>
      <CommentsPanel
        commentsApi={apis.comments}
        spaceId={spaceId}
        parentKind="memory"
        parentId={memory.id}
        currentAccountId={currentAccountId}
        canComment={memory.capabilities.canComment}
        offline={offline}
      />

      <footer className="memory-provenance-footer">
        <p>
          {t('memoryProduct.provenance', {
            author: provenanceAuthor,
            createdAt: formatCreatedAt(memory.createdAt),
          })}
        </p>
      </footer>
    </StoryDetailPageShell>
  );
}
