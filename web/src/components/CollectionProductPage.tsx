import {
  type ButtonHTMLAttributes,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { DashboardApi } from '../api/generated/apis/DashboardApi';
import type { CollectionDetail } from '../api/generated/models/CollectionDetail';
import type { CollectionItemDetail } from '../api/generated/models/CollectionItemDetail';
import {
  dashboardPreferencesQueryKey,
  PINNED_COLLECTION_MODULE_KEY,
  selectedDashboardCollectionId,
} from '../client/dashboardPreferences';
import { normalizeClientError } from '../client/problemDetails';
import {
  planningIfMatch,
  type SharedPlanningApis,
} from '../client/sharedPlanning';
import { MORE_COLLECTIONS_ROUTE } from '../client/routes';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import {
  deleteFocusTargetFromInfiniteData,
  type InfiniteItemsData,
  PLANNING_DELETE_FOCUS_STATE_KEY,
} from '../client/deleteFocusTarget';
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
import { useTransientFlag } from './useTransientFlag';
import './SharedPlanningPages.css';

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
      <div className="planning-item-title-form">
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
          disabled={!item.capabilities.canEdit}
        />
      </div>
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
    </li>
  );
}

export function CollectionProductPage({
  apis,
  spaceId,
  dashboardApi,
  accountId,
}: {
  apis: SharedPlanningApis;
  spaceId: string;
  dashboardApi?: DashboardApi;
  accountId?: string;
}) {
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
  const deleteHeadingRef = useRef<HTMLHeadingElement>(null);
  const restoreDeleteTriggerRef = useRef(false);
  const key = authorSummaryQueryKeys.collectionDetail(spaceId, collectionId);

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

  const dashboardPreferencesQuery = useQuery({
    queryKey: dashboardPreferencesQueryKey(accountId ?? '', spaceId),
    queryFn: () => {
      if (!dashboardApi) throw new Error('Dashboard API is not available.');
      return apiCall(() =>
        dashboardApi.listDashboardModulePreferences({ spaceId }),
      );
    },
    enabled: Boolean(dashboardApi && accountId && spaceId),
    retry: false,
  });

  const pinnedCollectionId = selectedDashboardCollectionId(
    dashboardPreferencesQuery.data,
    PINNED_COLLECTION_MODULE_KEY,
  );

  const pinCollection = useMutation({
    mutationFn: (selectedCollectionId: string | null) => {
      if (!dashboardApi) throw new Error('Dashboard API is not available.');
      return apiCall(() =>
        dashboardApi.updateDashboardModulePreference({
          moduleKey: PINNED_COLLECTION_MODULE_KEY,
          spaceId,
          dashboardModulePreferenceUpdate: {
            selectedCollectionId,
            visible: selectedCollectionId ? true : undefined,
          },
        }),
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: dashboardPreferencesQueryKey(accountId ?? '', spaceId),
      });
    },
  });

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
      }),
      queryClient.invalidateQueries({ queryKey: key }),
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
    }) =>
      apiCall(() =>
        apis.collections.updateCollectionItem({
          spaceId,
          collectionId: collection.id,
          itemId: item.id,
          ifMatch: planningIfMatch(item),
          collectionItemUpdate: { title, completed },
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: key });
    },
  });

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
    mutationFn: ({
      collection,
      itemIds,
    }: {
      collection: CollectionDetail;
      itemIds: string[];
    }) =>
      apiCall(() =>
        apis.collections.reorderCollectionItems({
          spaceId,
          collectionId: collection.id,
          ifMatch: planningIfMatch(collection),
          collectionOrder: { itemIds },
        }),
      ),
    onSuccess: commitCollection,
  });

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
      !collectionQuery.data?.capabilities.canEdit || reorderItems.isPending,
    onReorder: (itemIds) => {
      const currentCollection = collectionQuery.data;
      if (!currentCollection) return;
      reorderItems.mutate({ collection: currentCollection, itemIds });
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
    if (!collection) return;
    const data = new FormData(event.currentTarget);
    updateCollection.mutate({
      collection,
      title: String(data.get('title')).trim(),
    });
  }

  function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!collection) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    createItem.mutate(
      { collection, title: String(data.get('title')).trim() },
      { onSuccess: () => form.reset() },
    );
  }

  const itemMutationError =
    createItem.error ||
    updateItem.error ||
    deleteItem.error ||
    reorderItems.error;

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
                    deleteCollection.isPending
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
            disabled={
              dashboardPreferencesQuery.isPending || pinCollection.isPending
            }
            onClick={() =>
              pinCollection.mutate(
                pinnedCollectionId === collection.id ? null : collection.id,
              )
            }
          >
            {pinnedCollectionId === collection.id
              ? t('m5s3.collection.unpinFromToday')
              : t('m5s3.collection.pinToToday')}
          </button>
          {pinCollection.error ? (
            <ProblemState
              error={pinCollection.error}
              onRetry={() => {
                if (pinCollection.variables !== undefined) {
                  pinCollection.mutate(pinCollection.variables);
                }
              }}
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
              disabled={createItem.isPending}
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
                  updateItem.mutate({ collection, item: targetItem, title })
                }
                onToggleComplete={(targetItem) =>
                  updateItem.mutate({
                    collection,
                    item: targetItem,
                    completed: !targetItem.completed,
                  })
                }
                onDelete={(targetItem) =>
                  deleteItem.mutate({ collection, item: targetItem })
                }
                isUpdating={updateItem.isPending}
                isDeleting={deleteItem.isPending}
              />
            ))}
          </ol>
        ) : (
          <p className="planning-empty">{t('m5s3.collection.itemsEmpty')}</p>
        )}
        {reorderItems.isPending ? (
          <p role="status">{t('m5s3.collection.reordering')}</p>
        ) : null}
        {itemMutationError ? (
          <ProblemState
            error={itemMutationError}
            onRetry={() => void collectionQuery.refetch()}
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
