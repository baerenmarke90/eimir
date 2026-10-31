import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { DashboardApi } from '../api/generated/apis/DashboardApi';
import type { CollectionDetail } from '../api/generated/models/CollectionDetail';
import type { CollectionItemDetail } from '../api/generated/models/CollectionItemDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { captureCollectionOrder } from '../client/collectionOrder';
import { captureCollectionItemUpdate } from '../client/collectionItemUpdate';
import { assertOnlineWrite, isClientOnline } from '../client/connectivity';
import { dashboardPreferencesQueryKey } from '../client/dashboardPreferences';
import {
  deleteFocusTargetFromInfiniteData,
  type InfiniteItemsData,
  PLANNING_DELETE_FOCUS_STATE_KEY,
} from '../client/deleteFocusTarget';
import {
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';
import {
  captureAuthorizedQuery,
  captureQueryIdentity,
} from '../client/queryIdentity';
import { MORE_COLLECTIONS_ROUTE } from '../client/routes';
import {
  planningIfMatch,
  type SharedPlanningApis,
} from '../client/sharedPlanning';
import { useTranslation } from '../i18n';
import { SharedCollectionItemRow } from './SharedCollectionItemRow';
import { ListEntryIconButton, useListItemReorder } from './ListEntryActions';
import { PageHeader } from './PageHeader';
import {
  PlanningDiscardConfirmation,
  usePlanningEditorLifecycle,
} from './PlanningEditorLifecycle';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';
import { useCollectionPin } from './useCollectionPin';
import { useTransientFlag } from './useTransientFlag';
import './SharedPlanningPages.css';
import './SharedContentPages.css';

type Props = {
  apis: SharedPlanningApis;
  spaceId: string;
  dashboardApi?: DashboardApi;
  accountId?: string;
};
type ReorderRequest = { collection: CollectionDetail; itemIds: string[] };

async function apiCall<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export function CollectionProductPage(props: Props) {
  const { collectionId } = useParams();
  return (
    <CollectionProductDetail
      key={`${props.accountId ?? ''}:${props.spaceId}:${collectionId}`}
      {...props}
    />
  );
}

function CollectionProductDetail({
  apis,
  spaceId,
  dashboardApi,
  accountId,
}: Props) {
  const { t } = useTranslation();
  const { collectionId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSorting, setIsSorting] = useState(false);
  const createItemInFlightRef = useRef(false);
  const addInputRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const itemsRef = useRef<HTMLOListElement>(null);
  const deleteFocusRef = useRef<{ removedId: string; nextId?: string } | null>(
    null,
  );
  const [titleDraft, setTitleDraft] = useState('');
  const [showTitleSaved, showTitleSavedForFeedbackWindow] =
    useTransientFlag(2500);
  const editTriggerRef = useRef<HTMLButtonElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const reorderInFlightRef = useRef<{
    variables: ReorderRequest;
    isCurrentQuery: () => boolean;
  } | null>(null);
  const deleteHeadingRef = useRef<HTMLHeadingElement>(null);
  const restoreDeleteTriggerRef = useRef(false);
  const itemUpdateInFlightRef = useRef(false);
  const key = authorSummaryQueryKeys.collectionDetail(spaceId, collectionId);
  const hasCurrentReorder = () =>
    Boolean(reorderInFlightRef.current?.isCurrentQuery());

  const collectionQuery = useQuery({
    queryKey: key,
    queryFn: () => {
      if (!collectionId) throw new Error('Missing Collection route parameter.');
      return apiCall(() =>
        apis.collections.getCollection({ spaceId, collectionId }),
      );
    },
    enabled: Boolean(collectionId),
    retry: false,
  });

  useEffect(() => {
    const target = deleteFocusRef.current;
    if (
      !target ||
      !collectionQuery.data ||
      collectionQuery.data.items.some((item) => item.id === target.removedId)
    )
      return;
    deleteFocusRef.current = null;
    const row = Array.from(itemsRef.current?.children ?? []).find(
      (element) =>
        (element as HTMLElement).dataset.sortableItemId === target.nextId,
    );
    (
      row?.querySelector<HTMLButtonElement>('button') ?? addButtonRef.current
    )?.focus();
  }, [collectionQuery.data]);

  const pinCollection = useCollectionPin({ dashboardApi, accountId, spaceId });
  const pinnedCollectionId = pinCollection.selectedCollectionId;

  useEffect(() => {
    if (collectionQuery.data?.title) {
      setTitleDraft(collectionQuery.data.title);
    }
  }, [collectionQuery.data?.title]);

  const isTitleDirty =
    Boolean(collectionQuery.data?.title) &&
    titleDraft !== collectionQuery.data?.title;

  const commitCollection = async (collection: CollectionDetail) => {
    queryClient.setQueryData(key, collection);
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['m5-s3', 'collections', spaceId],
        refetchType: isClientOnline() ? 'active' : 'none',
      }),
      queryClient.invalidateQueries({
        queryKey: key,
        refetchType: isClientOnline() ? 'active' : 'none',
      }),
    ]);
  };

  const updateCollection = useMutation({
    mutationFn: ({
      collection,
      title,
    }: {
      collection: CollectionDetail;
      title: string;
    }) =>
      apiCall(() =>
        apis.collections.updateCollection({
          spaceId,
          collectionId: collection.id,
          ifMatch: planningIfMatch(collection),
          collectionUpdate: { title },
        }),
      ),
    onSuccess: async (data) => {
      await commitCollection(data);
      setIsEditing(false);
      setConfirmDelete(false);
      showTitleSavedForFeedbackWindow();
    },
  });

  const createItem = useMutation({
    onSettled: () => {
      createItemInFlightRef.current = false;
    },
    networkMode: 'always',
    mutationFn: ({
      collection,
      title,
    }: {
      collection: CollectionDetail;
      title: string;
    }) =>
      apiCall(() => {
        assertOnlineWrite();
        return apis.collections.createCollectionItem({
          spaceId,
          collectionId: collection.id,
          collectionItemCreate: { title },
        });
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: key });
      await queryClient.invalidateQueries({
        queryKey: ['m5-s3', 'collections', spaceId],
      });
    },
  });

  const updateItem = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: ({
      collection,
      item,
      title,
      completed,
    }: {
      collection: CollectionDetail;
      item: CollectionItemDetail;
      title?: string;
      completed?: boolean;
    }) => {
      assertOnlineWrite();
      return apiCall(() =>
        apis.collections.updateCollectionItem({
          spaceId: collection.spaceId,
          collectionId: collection.id,
          itemId: item.id,
          ifMatch: planningIfMatch(item),
          collectionItemUpdate: { title, completed },
        }),
      );
    },
    onMutate: ({ collection, item, title, completed }) =>
      captureCollectionItemUpdate<CollectionDetail>(
        queryClient,
        authorSummaryQueryKeys.collectionDetail(
          collection.spaceId,
          collection.id,
        ),
        item,
        { title, completed },
      ),
    onError: (_error, _variables, context) => context?.rollback(),
    onSuccess: async (updatedItem, _variables, context) => {
      if (!context?.isCurrentQuery()) return;
      context.confirm(updatedItem);
      await queryClient.invalidateQueries({
        queryKey: context.key,
        exact: true,
        refetchType: isClientOnline() ? 'active' : 'none',
      });
    },
    onSettled: () => {
      itemUpdateInFlightRef.current = false;
    },
  });

  const submitItemUpdate = (variables: {
    collection: CollectionDetail;
    item: CollectionItemDetail;
    title?: string;
    completed?: boolean;
  }) => {
    if (itemUpdateInFlightRef.current || hasCurrentReorder())
      return Promise.resolve(false);
    itemUpdateInFlightRef.current = true;
    return updateItem.mutateAsync(variables).then(
      () => true,
      () => false,
    );
  };

  const retryItemUpdate = () => {
    const failed = updateItem.variables;
    if (
      !failed ||
      !updateItem.context?.isCurrentQuery() ||
      failed.collection.spaceId !== spaceId ||
      failed.collection.id !== collectionId ||
      clientProblemKind(updateItem.error) === 'conflict'
    ) {
      updateItem.reset();
      void collectionQuery.refetch();
      return;
    }
    const current = queryClient.getQueryData<CollectionDetail>(key);
    const item = current?.items.find((entry) => entry.id === failed.item.id);
    if (!current || !item) {
      updateItem.reset();
      void collectionQuery.refetch();
      return;
    }
    submitItemUpdate({ ...failed, collection: current, item });
  };

  const deleteItem = useMutation({
    networkMode: 'always',
    mutationFn: ({
      collection,
      item,
    }: {
      collection: CollectionDetail;
      item: CollectionItemDetail;
    }) =>
      apiCall(() => {
        assertOnlineWrite();
        return apis.collections.deleteCollectionItem({
          spaceId,
          collectionId: collection.id,
          itemId: item.id,
          ifMatch: planningIfMatch(item),
        });
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: key });
      await queryClient.invalidateQueries({
        queryKey: ['m5-s3', 'collections', spaceId],
      });
    },
  });

  const reorderItems = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: ({ collection, itemIds }: ReorderRequest) => {
      assertOnlineWrite();
      return apiCall(() =>
        apis.collections.reorderCollectionItems({
          spaceId: collection.spaceId,
          collectionId: collection.id,
          ifMatch: planningIfMatch(collection),
          collectionOrder: { itemIds },
        }),
      );
    },
    onMutate: async ({ collection, itemIds }) => {
      const key = authorSummaryQueryKeys.collectionDetail(
        collection.spaceId,
        collection.id,
      );
      const listKey = authorSummaryQueryKeys.collections(collection.spaceId);
      const isCurrentList = captureQueryIdentity(queryClient, listKey);
      const order = await captureCollectionOrder<CollectionDetail>(
        queryClient,
        key,
        collection.version,
        itemIds,
      );
      return { ...order, listKey, isCurrentList };
    },
    onError: async (error, _variables, context) => {
      if (!context?.isCurrentQuery()) return;
      context.rollback();
      if (clientProblemKind(error) === 'conflict') {
        await queryClient.invalidateQueries({
          queryKey: context.key,
          exact: true,
          refetchType: isClientOnline() ? 'active' : 'none',
        });
      }
    },
    onSuccess: async (updated, _variables, context) => {
      if (!context?.isCurrentQuery()) return;
      context.confirm(updated);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: context.key,
          exact: true,
          refetchType: isClientOnline() ? 'active' : 'none',
        }),
        context.isCurrentList()
          ? queryClient.invalidateQueries({
              queryKey: context.listKey,
              exact: true,
              refetchType: isClientOnline() ? 'active' : 'none',
            })
          : Promise.resolve(),
      ]);
    },
    onSettled: (_data, _error, variables) => {
      if (reorderInFlightRef.current?.variables === variables)
        reorderInFlightRef.current = null;
    },
  });

  const isReordering = reorderItems.isPending && hasCurrentReorder();
  const submitReorder = (collection: CollectionDetail, itemIds: string[]) => {
    if (hasCurrentReorder()) return;
    const variables = { collection, itemIds };
    reorderInFlightRef.current = {
      variables,
      isCurrentQuery: captureAuthorizedQuery(
        queryClient,
        authorSummaryQueryKeys.collectionDetail(
          collection.spaceId,
          collection.id,
        ),
      ),
    };
    reorderItems.mutate(variables);
  };

  const retryReorder = () => {
    const failed = reorderItems.variables;
    if (
      !failed ||
      !reorderItems.context?.isCurrentQuery() ||
      failed.collection.spaceId !== spaceId ||
      failed.collection.id !== collectionId ||
      clientProblemKind(reorderItems.error) === 'conflict'
    ) {
      reorderItems.reset();
      void collectionQuery.refetch();
      return;
    }
    const current = queryClient.getQueryData<CollectionDetail>(key);
    if (
      !current ||
      current.items.length !== failed.itemIds.length ||
      !failed.itemIds.every((itemId) =>
        current.items.some((item) => item.id === itemId),
      )
    ) {
      reorderItems.reset();
      void collectionQuery.refetch();
      return;
    }
    submitReorder(current, failed.itemIds);
  };

  const deleteCollection = useMutation({
    mutationFn: (collection: CollectionDetail) =>
      apiCall(() =>
        apis.collections.deleteCollection({
          spaceId,
          collectionId: collection.id,
          ifMatch: planningIfMatch(collection),
        }),
      ),
    onMutate: (collection) => ({
      focusTarget: deleteFocusTargetFromInfiniteData(
        queryClient.getQueryData<InfiniteItemsData<CollectionDetail>>(
          authorSummaryQueryKeys.collections(spaceId),
        ),
        collection.id,
      ),
    }),
    onSuccess: async (_result, _collection, context) => {
      queryClient.removeQueries({ queryKey: key });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['m5-s3', 'collections', spaceId],
        }),
        queryClient.invalidateQueries({
          queryKey: dashboardPreferencesQueryKey(accountId ?? '', spaceId),
        }),
      ]);
      navigate(MORE_COLLECTIONS_ROUTE, {
        replace: true,
        state: {
          [PLANNING_DELETE_FOCUS_STATE_KEY]: context.focusTarget,
        },
      });
    },
  });

  const editorLifecycle = usePlanningEditorLifecycle({
    isActive: isEditing,
    isDirty: isTitleDirty,
    isPending: updateCollection.isPending || deleteCollection.isPending,
    initialFocusRef: titleInputRef,
    restoreFocusRef: editTriggerRef,
    onEscape: () => {
      if (!confirmDelete) return false;
      restoreDeleteTriggerRef.current = true;
      setConfirmDelete(false);
      return true;
    },
    onClose: () => {
      setIsEditing(false);
      setConfirmDelete(false);
      setTitleDraft(collectionQuery.data?.title ?? '');
      updateCollection.reset();
      deleteCollection.reset();
    },
  });

  useEffect(() => {
    if (confirmDelete) deleteHeadingRef.current?.focus();
    else if (restoreDeleteTriggerRef.current) {
      restoreDeleteTriggerRef.current = false;
      deleteTriggerRef.current?.focus();
    }
  }, [confirmDelete]);

  const baseItemIds = [...(collectionQuery.data?.items ?? [])]
    .sort((left, right) => left.position - right.position)
    .map((item) => item.id);
  const reorder = useListItemReorder({
    itemIds: baseItemIds,
    disabled:
      !collectionQuery.data?.capabilities.canEdit ||
      isReordering ||
      updateItem.isPending ||
      createItem.isPending ||
      deleteItem.isPending ||
      updateCollection.isPending,
    onReorder: (itemIds) => {
      const currentCollection = queryClient.getQueryData<CollectionDetail>(key);
      if (!currentCollection) return;
      submitReorder(currentCollection, itemIds);
    },
  });

  if (!collectionId)
    return (
      <UiState
        kind="error"
        title={t('states.unknown.title')}
        body={t('states.unknown.body')}
      />
    );
  if (collectionQuery.isLoading)
    return <UiState kind="loading" title={t('m5s3.collection.loading')} />;
  if (
    collectionQuery.error &&
    (!collectionQuery.data ||
      ['unauthorized', 'permission', 'notFound'].includes(
        clientProblemKind(collectionQuery.error),
      ))
  )
    return (
      <ProblemState
        error={collectionQuery.error}
        onRetry={() => void collectionQuery.refetch()}
      />
    );
  const collection = collectionQuery.data;
  if (!collection) return null;
  const itemById = new Map(collection.items.map((item) => [item.id, item]));
  const items = reorder.orderedItemIds
    .map((itemId) => itemById.get(itemId))
    .filter((item): item is CollectionItemDetail => Boolean(item));

  function submitCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!collection || hasCurrentReorder()) return;
    const data = new FormData(event.currentTarget);
    updateCollection.mutate({
      collection,
      title: String(data.get('title')).trim(),
    });
  }

  function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!collection || hasCurrentReorder() || createItemInFlightRef.current)
      return;
    createItemInFlightRef.current = true;
    const form = event.currentTarget;
    const data = new FormData(form);
    createItem.mutate(
      { collection, title: String(data.get('title')).trim() },
      { onSuccess: () => form.reset() },
    );
  }

  const itemUpdateError =
    updateItem.variables?.collection.id === collectionId &&
    updateItem.variables.collection.spaceId === spaceId &&
    updateItem.context?.isCurrentQuery()
      ? updateItem.error
      : null;
  const reorderError =
    reorderItems.variables?.collection.spaceId === spaceId &&
    reorderItems.variables?.collection.id === collectionId &&
    reorderItems.context?.isCurrentQuery()
      ? reorderItems.error
      : null;
  const itemMutationError =
    createItem.error || itemUpdateError || deleteItem.error || reorderError;

  return (
    <div className="page shared-content-page">
      <PageHeader
        className="shared-authored-heading"
        title={
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
            }}
          >
            {collection.title}
            {showTitleSaved ? (
              <span
                className="planning-title-saved-hint"
                role="status"
                aria-live="polite"
              >
                ✓
              </span>
            ) : null}
          </span>
        }
        titleAction={
          collection.capabilities.canEdit && !isEditing ? (
            <ListEntryIconButton
              ref={editTriggerRef}
              icon="edit"
              className="tertiary"
              label={t('common.edit')}
              onClick={() => {
                setTitleDraft(collection.title);
                setIsEditing(true);
              }}
            />
          ) : undefined
        }
        titleEditor={
          isEditing ? (
            <form
              className="planning-collection-title-form"
              onSubmit={(e) => {
                e.preventDefault();
                submitCollection(e);
              }}
            >
              <label htmlFor="collection-edit-title" className="sr-only">
                {t('m5s3.common.title')}
              </label>
              <div className="planning-collection-title-row">
                <input
                  ref={titleInputRef}
                  id="collection-edit-title"
                  name="title"
                  required
                  maxLength={200}
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  placeholder={t('m5s3.common.title')}
                  aria-label={t('m5s3.common.title')}
                />
                <ListEntryIconButton
                  type="submit"
                  icon="save"
                  className="tertiary"
                  label={
                    updateCollection.isPending
                      ? t('m5s3.common.saving')
                      : t('m5s3.common.saveChanges')
                  }
                  disabled={
                    !isTitleDirty ||
                    updateCollection.isPending ||
                    deleteCollection.isPending ||
                    isReordering
                  }
                />
                <button
                  type="button"
                  className="button-link secondary-link"
                  onClick={editorLifecycle.requestClose}
                  disabled={
                    updateCollection.isPending || deleteCollection.isPending
                  }
                >
                  {t('common.cancel')}
                </button>
              </div>
              {editorLifecycle.showDiscardConfirm ? (
                <PlanningDiscardConfirmation
                  onKeepEditing={editorLifecycle.keepEditing}
                  onDiscard={editorLifecycle.discard}
                />
              ) : null}
              {updateCollection.error ? (
                <ProblemState
                  error={updateCollection.error}
                  onRetry={() => void collectionQuery.refetch()}
                />
              ) : null}
            </form>
          ) : undefined
        }
        action={
          dashboardApi && accountId ? (
            <div className="planning-collection-dashboard-action">
              <button
                type="button"
                className="button-link secondary-link"
                disabled={pinCollection.isBlocked}
                aria-pressed={pinnedCollectionId === collection.id}
                aria-label={t(
                  pinnedCollectionId === collection.id
                    ? 'm5s3.collection.unpinFromToday'
                    : 'm5s3.collection.pinToToday',
                )}
                aria-describedby={
                  pinCollection.isSaving ? 'collection-pin-pending' : undefined
                }
                onClick={() =>
                  pinCollection.changeSelection(
                    pinnedCollectionId === collection.id ? null : collection.id,
                  )
                }
              >
                {pinnedCollectionId === collection.id ? (
                  <span aria-hidden="true">✓ </span>
                ) : null}
                {t('m5s3.collection.pinLabel')}
              </button>
              {pinCollection.isSaving ? (
                <small id="collection-pin-pending" role="status">
                  {t('common.saving')}
                </small>
              ) : null}
              {pinCollection.error ? (
                <ProblemState
                  error={pinCollection.error}
                  onRetry={() => void pinCollection.retryRead()}
                />
              ) : null}
            </div>
          ) : null
        }
      />

      {collectionQuery.error ? (
        <ProblemState
          error={collectionQuery.error}
          onRetry={() => void collectionQuery.refetch()}
        />
      ) : null}

      <section
        className="planning-subsection"
        aria-labelledby="collection-items-heading"
      >
        <h2 id="collection-items-heading" className="sr-only">
          {t('m5s3.collection.itemsHeading')}
        </h2>

        <div className="shared-list-toolbar">
          <p>
            {t('m5s3.collection.progress', {
              count: items.length,
              completed: items.filter((item) => item.completed).length,
            })}
          </p>
          {collection.capabilities.canEdit &&
          (items.length > 1 || isSorting) ? (
            <button
              type="button"
              className="tertiary"
              aria-pressed={isSorting}
              disabled={isReordering}
              onClick={() => setIsSorting((value) => !value)}
            >
              {t(
                isSorting
                  ? 'm5s3.collection.finishSorting'
                  : 'm5s3.collection.sort',
              )}
            </button>
          ) : null}
        </div>
        {isSorting ? (
          <p className="planning-meta">{t('m5s3.collection.sortHelp')}</p>
        ) : null}
        {collection.capabilities.canEdit && !isSorting ? (
          <form className="planning-inline-create" onSubmit={submitItem}>
            <label className="sr-only" htmlFor="collection-new-item">
              {t('m5s3.collection.newItem')}
            </label>
            <input
              disabled={createItem.isPending || isReordering}
              ref={addInputRef}
              id="collection-new-item"
              name="title"
              required
              maxLength={200}
              placeholder={t('m5s3.collection.newItemPlaceholder')}
            />
            <ListEntryIconButton
              ref={addButtonRef}
              type="submit"
              icon="add"
              className="list-entry-add-button"
              label={
                createItem.isPending
                  ? t('m5s3.common.saving')
                  : t('m5s3.collection.addItem')
              }
              disabled={createItem.isPending || isReordering}
            />
          </form>
        ) : null}

        {items.length > 0 ? (
          <ol ref={itemsRef} className="shared-list-items">
            {items.map((item) => (
              <SharedCollectionItemRow
                key={item.id}
                item={item}
                canSort={collection.capabilities.canEdit}
                isSorting={isSorting}
                activeItemId={reorder.activeItemId}
                handleProps={reorder.handleProps}
                onUpdateTitle={(targetItem, title) =>
                  submitItemUpdate({ collection, item: targetItem, title })
                }
                onToggleComplete={(targetItem) =>
                  submitItemUpdate({
                    collection,
                    item: targetItem,
                    completed: !targetItem.completed,
                  })
                }
                onDelete={(targetItem) => {
                  const index = items.findIndex(
                    (item) => item.id === targetItem.id,
                  );
                  deleteFocusRef.current = {
                    removedId: targetItem.id,
                    nextId: items[index + 1]?.id ?? items[index - 1]?.id,
                  };
                  return deleteItem
                    .mutateAsync({ collection, item: targetItem })
                    .then(
                      () => true,
                      () => {
                        deleteFocusRef.current = null;
                        return false;
                      },
                    );
                }}
                onRetry={() => {
                  if (itemUpdateError) retryItemUpdate();
                  else void collectionQuery.refetch();
                }}
                error={
                  updateItem.variables?.item.id === item.id
                    ? itemUpdateError
                    : deleteItem.variables?.item.id === item.id
                      ? deleteItem.error
                      : null
                }
                isUpdating={updateItem.isPending || isReordering}
                isTogglePending={
                  updateItem.isPending &&
                  updateItem.variables?.completed !== undefined &&
                  updateItem.variables.item.id === item.id
                }
                isDeleting={
                  deleteItem.isPending || updateItem.isPending || isReordering
                }
              />
            ))}
          </ol>
        ) : (
          <p className="planning-empty">{t('m5s3.collection.itemsEmpty')}</p>
        )}
        {isReordering ? (
          <p role="status">{t('m5s3.collection.reordering')}</p>
        ) : null}
        {itemMutationError ? (
          <ProblemState
            error={itemMutationError}
            onRetry={() => {
              if (itemUpdateError) retryItemUpdate();
              else if (reorderError) retryReorder();
              else void collectionQuery.refetch();
            }}
          />
        ) : null}
      </section>

      {isEditing && collection.capabilities.canDelete ? (
        <section
          className="planning-danger-zone"
          aria-labelledby="collection-delete-heading"
        >
          <h2 id="collection-delete-heading">
            {t('m5s3.common.deleteHeading')}
          </h2>
          <p>{t('m5s3.collection.deleteConsequence')}</p>
          {!confirmDelete ? (
            <button
              ref={deleteTriggerRef}
              type="button"
              className="danger"
              onClick={() => setConfirmDelete(true)}
              disabled={updateCollection.isPending}
            >
              {t('m5s3.common.delete')}
            </button>
          ) : (
            <div className="planning-confirm-row">
              <h2
                ref={deleteHeadingRef}
                id="collection-delete-confirmation-heading"
                className="sr-only"
                tabIndex={-1}
              >
                {t('m5s3.common.deleteHeading')}
              </h2>
              <button
                type="button"
                className="danger"
                onClick={() => deleteCollection.mutate(collection)}
                disabled={deleteCollection.isPending}
              >
                {deleteCollection.isPending
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
                disabled={deleteCollection.isPending}
              >
                {t('common.cancel')}
              </button>
            </div>
          )}
          {deleteCollection.error ? (
            <ProblemState
              error={deleteCollection.error}
              onRetry={() => void collectionQuery.refetch()}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
