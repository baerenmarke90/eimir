import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ButtonHTMLAttributes,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { DashboardApi } from '../api/generated/apis/DashboardApi';
import type { CollectionDetail } from '../api/generated/models/CollectionDetail';
import type { CollectionItemDetail } from '../api/generated/models/CollectionItemDetail';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import { captureCollectionOrder } from '../client/collectionOrder';
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
import { ChecklistToggle } from './ChecklistToggle';
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

function CollectionItemRow({
  item,
  collection,
  activeItemId,
  handleProps,
  onUpdateTitle,
  onToggleComplete,
  onDelete,
  isUpdating,
  isTogglePending,
  isDeleting,
}: {
  item: CollectionItemDetail;
  collection: CollectionDetail;
  activeItemId: string | null;
  handleProps: (id: string) => ButtonHTMLAttributes<HTMLButtonElement>;
  onUpdateTitle: (item: CollectionItemDetail, title: string) => void;
  onToggleComplete: (item: CollectionItemDetail) => void;
  onDelete: (item: CollectionItemDetail) => void;
  isUpdating: boolean;
  isTogglePending: boolean;
  isDeleting: boolean;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(item.title);

  useEffect(() => {
    setDraft(item.title);
  }, [item.title]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed.length > 0 && trimmed !== item.title) {
      onUpdateTitle(item, trimmed);
    } else if (trimmed.length === 0) {
      setDraft(item.title);
    }
  }

  return (
    <li
      data-sortable-item-id={item.id}
      className={[
        item.completed ? 'planning-item-completed' : null,
        activeItemId === item.id ? 'list-entry-dragging' : null,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <ChecklistToggle
        completed={item.completed}
        label={
          item.completed
            ? t('m5s3.collection.markOpen', { title: item.title })
            : t('m5s3.collection.markDone', { title: item.title })
        }
        onToggle={() => onToggleComplete(item)}
        disabled={!item.capabilities.canEdit || isUpdating}
      />
      <div className="planning-item-title-form planning-collection-item-title-form">
        <label className="sr-only" htmlFor={`collection-item-${item.id}`}>
          {t('m5s3.collection.itemTitle')}
        </label>
        <input
          id={`collection-item-${item.id}`}
          name="title"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
              e.currentTarget.blur();
            }
          }}
          required
          maxLength={200}
          disabled={!item.capabilities.canEdit || isUpdating}
        />
        {isTogglePending ? (
          <small className="planning-collection-item-pending" role="status">
            {t('m5s3.common.saving')}
          </small>
        ) : null}
      </div>
      {collection.capabilities.canEdit || item.capabilities.canDelete ? (
        <div className="planning-collection-item-actions">
          {collection.capabilities.canEdit ? (
            <ListEntryIconButton
              icon="reorder"
              className="tertiary"
              label={t('m5s3.collection.reorderItem', {
                title: item.title,
              })}
              {...handleProps(item.id)}
            />
          ) : null}
          {item.capabilities.canDelete ? (
            <ListEntryIconButton
              icon="delete"
              className="tertiary"
              label={t('m5s3.collection.deleteItem', {
                title: item.title,
              })}
              onClick={() => onDelete(item)}
              disabled={isDeleting}
            />
          ) : null}
        </div>
      ) : null}
    </li>
  );
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
    mutationFn: ({
      collection,
      title,
    }: {
      collection: CollectionDetail;
      title: string;
    }) =>
      apiCall(() =>
        apis.collections.createCollectionItem({
          spaceId,
          collectionId: collection.id,
          collectionItemCreate: { title },
        }),
      ),
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
    onMutate: async ({ collection, item, completed }) => {
      const key = authorSummaryQueryKeys.collectionDetail(
        collection.spaceId,
        collection.id,
      );
      const isCurrentQuery = captureQueryIdentity(queryClient, key);
      if (completed === undefined) return { key, isCurrentQuery };
      await queryClient.cancelQueries({ queryKey: key, exact: true });
      if (!isCurrentQuery()) return { key, isCurrentQuery };
      const previousItem = queryClient
        .getQueryData<CollectionDetail>(key)
        ?.items.find((entry) => entry.id === item.id);
      // A read may have advanced the row while cancellation was pending.
      if (previousItem?.version === item.version) {
        queryClient.setQueryData<CollectionDetail>(key, (current) =>
          current
            ? {
                ...current,
                items: current.items.map((entry) =>
                  entry === previousItem ? { ...entry, completed } : entry,
                ),
              }
            : current,
        );
        return { key, isCurrentQuery, previousItem };
      }
      return { key, isCurrentQuery };
    },
    onError: (_error, { completed }, context) => {
      if (
        completed === undefined ||
        !context?.isCurrentQuery() ||
        !context.previousItem
      )
        return;
      const previousItem = context.previousItem;
      queryClient.setQueryData<CollectionDetail>(context.key, (current) =>
        current
          ? {
              ...current,
              items: current.items.map((entry) =>
                entry.id === previousItem.id &&
                entry.version === previousItem.version &&
                entry.completed === completed
                  ? { ...entry, completed: previousItem.completed }
                  : entry,
              ),
            }
          : current,
      );
    },
    onSuccess: async (updatedItem, { completed }, context) => {
      if (!context?.isCurrentQuery()) return;
      if (completed !== undefined) {
        queryClient.setQueryData<CollectionDetail>(context.key, (current) =>
          current
            ? {
                ...current,
                items: current.items.map((entry) =>
                  entry.id === updatedItem.id &&
                  entry.version < updatedItem.version
                    ? {
                        ...entry,
                        completed: updatedItem.completed,
                        version: updatedItem.version,
                        updatedAt: updatedItem.updatedAt,
                      }
                    : entry,
                ),
              }
            : current,
        );
      }
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
    if (itemUpdateInFlightRef.current || hasCurrentReorder()) return;
    itemUpdateInFlightRef.current = true;
    updateItem.mutate(variables);
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
    mutationFn: ({
      collection,
      item,
    }: {
      collection: CollectionDetail;
      item: CollectionItemDetail;
    }) =>
      apiCall(() =>
        apis.collections.deleteCollectionItem({
          spaceId,
          collectionId: collection.id,
          itemId: item.id,
          ifMatch: planningIfMatch(item),
        }),
      ),
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
  if (collectionQuery.error)
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
    if (!collection || hasCurrentReorder()) return;
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
    <div className="page planning-page">
      <PageHeader
        className="page-heading-collection"
        before={
          <Link className="back-link" to={MORE_COLLECTIONS_ROUTE}>
            {t('m5s3.common.backToCollections')}
          </Link>
        }
        eyebrow={t('m5s3.collection.detailEyebrow')}
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
        description={t('m5s3.collection.itemCount', { count: items.length })}
      />

      {dashboardApi && accountId ? (
        <div className="planning-collection-dashboard-action">
          <button
            type="button"
            className="button-link secondary-link"
            disabled={pinCollection.isBlocked}
            aria-pressed={pinnedCollectionId === collection.id}
            aria-describedby={
              pinCollection.isSaving ? 'collection-pin-pending' : undefined
            }
            onClick={() =>
              pinCollection.changeSelection(
                pinnedCollectionId === collection.id ? null : collection.id,
              )
            }
          >
            {pinnedCollectionId === collection.id
              ? t('m5s3.collection.unpinFromToday')
              : t('m5s3.collection.pinToToday')}
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
      ) : null}

      <section
        className="planning-subsection"
        aria-labelledby="collection-items-heading"
      >
        <h2 id="collection-items-heading" className="sr-only">
          {t('m5s3.collection.itemsHeading')}
        </h2>

        {collection.capabilities.canEdit ? (
          <form className="planning-inline-create" onSubmit={submitItem}>
            <label className="sr-only" htmlFor="collection-new-item">
              {t('m5s3.collection.newItem')}
            </label>
            <input
              id="collection-new-item"
              name="title"
              required
              maxLength={200}
              placeholder={t('m5s3.collection.newItemPlaceholder')}
            />
            <ListEntryIconButton
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
          <ol className="planning-collection-items">
            {items.map((item) => (
              <CollectionItemRow
                key={item.id}
                item={item}
                collection={collection}
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
                onDelete={(targetItem) =>
                  deleteItem.mutate({ collection, item: targetItem })
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
