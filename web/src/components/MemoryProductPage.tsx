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
  memoryDateInputValue,
  memoryIfMatch,
  memoryUpdatePayload,
} from '../client/memoryProduct';
import {
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';
import { useStoryViewReceipt } from '../client/storyViewReceipt';
import {
  deleteProductReadCacheEntry,
  loadProductWithReadCache,
} from '../client/productReadCache';
import type { ReferenceApis } from '../client/referenceFlow';
import {
  appRoutePath,
  memoryDetailPath,
  memoryEditPath,
} from '../client/routes';
import { postSnackbar } from '../client/snackbar';
import { useTaskOrigin } from '../client/taskOrigin';
import {
  formatAttachmentDraftContextKey,
  useAttachmentDrafts,
} from '../client/useAttachmentDrafts';
import { resolvedLocale, useTranslation } from '../i18n';
import { AttachmentDraftPicker } from './AttachmentDraftPicker';
import { CommentsPanel } from './CommentsPanel';
import { MediaGallery } from './MediaGallery';
import { MemoryPreview } from './MemoryPreview';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { StoryDetailEditLink } from './StoryDetailEditLink';
import { StoryDetailPageShell } from './StoryDetailPageShell';
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
  loadMemoryImage: (memoryId: string, attachmentId: string) => Promise<string>;
}) {
  const { t } = useTranslation();
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
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  const updateMutation = useMutation({
    mutationFn: async ({
      memory,
      values,
    }: {
      memory: MemoryDetail;
      values: MemoryEditValues;
    }) => {
      try {
        let updated = await apis.memories.updateMemory({
          spaceId,
          memoryId: memory.id,
          ifMatch: memoryIfMatch(memory),
          memoryUpdate: memoryUpdatePayload(values),
        });

        const attachmentsChanged =
          attachments.readyIds.length > 0 || removedAttachmentIds.size > 0;
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
              })),
            },
          });
        }
        return updated;
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onMutate: async ({ memory, values }) => {
      await queryClient.cancelQueries({ queryKey: memoryKey });
      const previous = queryClient.getQueryData(memoryKey);
      queryClient.setQueryData(memoryKey, {
        value: {
          ...memory,
          title: values.title,
          body: values.body,
          happenedOn: values.happenedOn
            ? new Date(`${values.happenedOn}T00:00:00Z`)
            : null,
          updatedAt: new Date(),
        },
        source: 'network',
      });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous)
        queryClient.setQueryData(memoryKey, context.previous);
      void queryClient.invalidateQueries({ queryKey: memoryKey });
    },
    onSuccess: async (memory) => {
      attachments.clear();
      setRemovedAttachmentIds(new Set());
      queryClient.setQueryData(memoryKey, { value: memory, source: 'network' });
      await Promise.all([
        invalidateStoryProjections(queryClient, spaceId),
        queryClient.invalidateQueries({ queryKey: memoryKey }),
        invalidateDashboard(queryClient, spaceId),
      ]);
      navigate(memoryDetailPath(memory.id), {
        replace: true,
        state: { taskOriginKey: originKey },
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (memory: MemoryDetail) => {
      try {
        await apis.memories.deleteMemory({
          spaceId,
          memoryId: memory.id,
          ifMatch: memoryIfMatch(memory),
        });
        await deleteProductReadCacheEntry(
          currentAccountId,
          spaceId,
          'memory',
          memory.id,
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: memoryKey });
      await Promise.all([
        invalidateStoryProjections(queryClient, spaceId),
        invalidateDashboard(queryClient, spaceId),
      ]);
      navigate(appRoutePath('story'), { replace: true });
      postSnackbar('snackbar.memoryDeleted');
    },
  });

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
      if (attachments.hasPending) return;
      const data = new FormData(event.currentTarget);
      updateMutation.mutate({
        memory: editableMemory,
        values: {
          title: String(data.get('title') || ''),
          body: String(data.get('body') || ''),
          happenedOn: String(data.get('happenedOn') || ''),
        },
      });
    }

    return (
      <div className="page page-reading create-page product-editor-page">
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
          className="create-heading"
        />

        <section
          className="form-card product-sheet"
          aria-labelledby="memory-edit-heading"
        >
          <h2 id="memory-edit-heading" className="sr-only">
            {t('memoryProduct.formAria')}
          </h2>
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

            {readyAttachments.length > 0 ? (
              <fieldset className="memory-existing-attachments">
                <legend>{t('memoryProduct.existingPhotosHeading')}</legend>
                <p className="field-help">
                  {t('memoryProduct.existingPhotosHelp')}
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
                          loadImage={loadMemoryImage}
                        />
                        <div className="memory-edit-attachment-actions">
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
              attachments={attachments}
              multiple
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
                disabled={updateMutation.isPending || attachments.hasPending}
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
              {!confirmDelete ? (
                <button
                  type="button"
                  className="button-link danger-link"
                  onClick={() => setConfirmDelete(true)}
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
                      disabled={deleteMutation.isPending}
                    >
                      {t('memoryProduct.deleteCancel')}
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => deleteMutation.mutate(memory)}
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending
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
        </section>
      </div>
    );
  }

  const memoryEyebrow = memory.happenedOn
    ? `${t('memoryProduct.detailEyebrow').toUpperCase()} · ${formatDateOnly(memory.happenedOn)}`
    : t('memoryProduct.detailEyebrow').toUpperCase();

  const bodyText = memory.body || t('memoryProduct.noBody');
  const { first: bodyDropCap, rest: bodyRest } = splitFirstGrapheme(bodyText);
  const provenanceAuthor = storyAuthorLabel(memory.author, currentAccountId);

  return (
    <StoryDetailPageShell
      eyebrow={memoryEyebrow}
      title={memory.title}
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
      <p className="memory-detail-body">
        {bodyDropCap ? (
          <span className="drop-cap-letter">{bodyDropCap}</span>
        ) : null}
        {bodyRest}
      </p>

      {readyAttachments.length > 0 ? (
        <section aria-label={t('memory.photoLabel')}>
          <MediaGallery
            items={readyAttachments.map((attachment) => ({
              id: attachment.id,
              mediaType: attachment.mediaType,
            }))}
            loadMedia={(attachmentId) =>
              loadMemoryImage(memory.id, attachmentId)
            }
          />
        </section>
      ) : null}

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
