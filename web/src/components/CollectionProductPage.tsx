import './FreeComposer.css';
import {
  onlineManager,
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
import type { DashboardApi } from '../api/generated/apis/DashboardApi';
import {
  type CollectionDetail,
  CollectionDetailFromJSON,
  CollectionDetailToJSON,
} from '../api/generated/models/CollectionDetail';
import type { CollectionItemDetail } from '../api/generated/models/CollectionItemDetail';
import {
  authorSummaryQueryKeys,
  invalidateCollectionConsumers,
} from '../client/authorSummaryConsumers';
import {
  knownPersonName,
  partnerTone,
  summarizeSharedList,
} from '../client/sharedListSummary';
import { useTaskOrigin } from '../client/taskOrigin';
import { captureCollectionItemUpdate } from '../client/collectionItemUpdate';
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
  deleteCollectionOutbox,
  deleteProductReadCacheEntry,
  loadProductWithReadCache,
} from '../client/productReadCache';
import { captureAuthorizedQuery } from '../client/queryIdentity';
import { MORE_COLLECTIONS_ROUTE } from '../client/routes';
import {
  planningIfMatch,
  type SharedPlanningApis,
} from '../client/sharedPlanning';
import { useTranslation } from '../i18n';
import { AddActionButton } from './AddAction';
import { ListEntryIconButton, useListItemReorder } from './ListEntryActions';
import { PageHeader } from './PageHeader';
import {
  PlanningDiscardConfirmation,
  usePlanningEditorLifecycle,
} from './PlanningEditorLifecycle';
import { ProblemState } from './ProblemState';
import { SharedCollectionItemRow } from './SharedCollectionItemRow';
import { SharedListCartBar } from './SharedListCartBar';
import { SharedListSummary } from './SharedListSummary';
import { UiState } from './UiState';
import { useCollectionOutbox } from './useCollectionOutbox';
import { useCollectionPin } from './useCollectionPin';
import { useTransientFlag } from './useTransientFlag';
import './SharedPlanningPages.css';
import './SharedContentPages.css';

type Props = {
  apis: SharedPlanningApis;
  spaceId: string;
  dashboardApi?: DashboardApi;
  accountId?: string;
  collectionId?: string;
  embedded?: boolean;
  onPendingChange?: (pending: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
};
/**
 * How often an open list asks for its partner's changes (#1808). It runs only
 * while the page is visible and online; coming back to the app refetches once
 * the saved copy is older than `LIST_RETURN_STALE_MS`.
 */
const LIST_POLL_INTERVAL_MS = 12_000;
const LIST_RETURN_STALE_MS = 10_000;
type ReorderRequest = { collection: CollectionDetail; itemIds: string[] };

async function apiCall<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export function CollectionProductPage(props: Props) {
  const { collectionId: routeId } = useParams();
  const collectionId = props.collectionId ?? routeId;
  return (
    <CollectionProductDetail
      key={`${props.accountId ?? ''}:${props.spaceId}:${collectionId}`}
      {...props}
      collectionId={collectionId}
    />
  );
}

function CollectionProductDetail({
  apis,
  spaceId,
  dashboardApi,
  accountId,
  collectionId,
  embedded = false,
  onPendingChange,
  onDirtyChange,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { resolveOrigin, requestReturn } = useTaskOrigin();
  const originKey = (location.state as { taskOriginKey?: unknown } | null)
    ?.taskOriginKey;
  const origin = resolveOrigin(originKey);
  const rawScope = origin
    ? new URL(origin.to, 'https://eimir.invalid').searchParams.get('scope')
    : null;
  const overviewScope =
    rawScope === 'COMPLETED' || rawScope === 'ALL' ? rawScope : 'OPEN';
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSorting, setIsSorting] = useState(false);
  const createItemInFlightRef = useRef(false);
  const refocusAddRef = useRef(false);
  const refocusToggleRef = useRef<string | null>(null);
  // Refreshing under the person's hands would fight an edit in progress.
  const pollPausedRef = useRef(false);
  const addInputRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const itemsRef = useRef<HTMLDivElement>(null);
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
    queryFn: async () => {
      if (!collectionId) throw new Error('Missing Collection route parameter.');
      const load = () =>
        apiCall(() =>
          apis.collections.getCollection({ spaceId, collectionId }),
        );
      if (!accountId) return load();
      // A list opens from its last saved copy when there is no connection, so
      // a shopping list still works after the app was closed in a store.
      const read = await loadProductWithReadCache({
        accountId,
        spaceId,
        kind: 'collection',
        resourceId: collectionId,
        load,
        // A saved copy is an extra: if it cannot be written, reading still works.
        serialize: (value) => {
          try {
            return CollectionDetailToJSON(value);
          } catch {
            return null;
          }
        },
        deserialize: (payload) => CollectionDetailFromJSON(payload),
      });
      return read.value;
    },
    enabled: Boolean(collectionId),
    // A read that knows it is offline must still resolve its saved copy.
    networkMode: 'always',
    retry: false,
    staleTime: embedded ? undefined : LIST_RETURN_STALE_MS,
    refetchInterval: () =>
      embedded || pollPausedRef.current || !onlineManager.isOnline()
        ? false
        : LIST_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });

  // Shopping lists keep their changes on the device while there is no
  // connection and send them later (#1808).
  const outbox = useCollectionOutbox({
    apis,
    queryClient,
    queryKey: key,
    accountId,
    spaceId,
    collectionId,
    enabled: collectionQuery.data?.kind === 'SHOPPING',
  });
  const viewed = collectionQuery.data
    ? outbox.apply(collectionQuery.data, {
        id: accountId ?? '',
        displayName: knownPersonName(collectionQuery.data, accountId),
      })
    : undefined;
  const online =
    useSyncExternalStore(
      (listener) => onlineManager.subscribe(listener),
      () => onlineManager.isOnline(),
      () => true,
    ) && navigator.onLine !== false;

  useEffect(() => {
    const target = deleteFocusRef.current;
    if (
      !target ||
      !collectionQuery.data ||
      collectionQuery.data.items.some((item) => item.id === target.removedId)
    )
      return;
    deleteFocusRef.current = null;
    const row = Array.from(
      itemsRef.current?.querySelectorAll<HTMLElement>(
        '[data-sortable-item-id]',
      ) ?? [],
    ).find((element) => element.dataset.sortableItemId === target.nextId);
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
      invalidateCollectionConsumers(queryClient, spaceId),
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
      quantity,
    }: {
      collection: CollectionDetail;
      title: string;
      quantity?: string;
    }) =>
      apiCall(() => {
        assertOnlineWrite();
        return apis.collections.createCollectionItem({
          spaceId,
          collectionId: collection.id,
          collectionItemCreate: quantity ? { title, quantity } : { title },
        });
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: key });
      await invalidateCollectionConsumers(queryClient, spaceId);
    },
  });

  // Checking an entry moves it into the tray, which mounts a new button. Focus
  // follows the entry so keyboard and screen-reader users keep their place.
  useEffect(() => {
    const id = refocusToggleRef.current;
    if (!id) return;
    const toggle = Array.from(
      itemsRef.current?.querySelectorAll<HTMLElement>(
        '[data-sortable-item-id]',
      ) ?? [],
    )
      .find((row) => row.dataset.sortableItemId === id)
      ?.querySelector<HTMLButtonElement>('.checklist-toggle');
    if (!toggle || toggle.disabled) return;
    refocusToggleRef.current = null;
    if (!document.activeElement || document.activeElement === document.body)
      toggle.focus();
  });

  // The input is disabled while an entry is being saved, so focus goes back
  // to it once saving has finished and the next entry can be typed (#1808).
  useEffect(() => {
    if (createItem.isPending || !refocusAddRef.current) return;
    refocusAddRef.current = false;
    addInputRef.current?.focus();
  }, [createItem.isPending]);

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
    onSuccess: async (updatedItem, variables, context) => {
      if (!context?.isCurrentQuery()) return;
      context.confirm(updatedItem);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: context.key,
          exact: true,
          refetchType: isClientOnline() ? 'active' : 'none',
        }),
        invalidateCollectionConsumers(
          queryClient,
          variables.collection.spaceId,
        ),
      ]);
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
      await invalidateCollectionConsumers(queryClient, spaceId);
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
      const order = await captureCollectionOrder<CollectionDetail>(
        queryClient,
        key,
        collection.version,
        itemIds,
      );
      return order;
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
        invalidateCollectionConsumers(queryClient, spaceId),
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
          authorSummaryQueryKeys.collectionOverview(spaceId, overviewScope),
        ),
        collection.id,
      ),
    }),
    onSuccess: async (_result, deleted, context) => {
      queryClient.removeQueries({ queryKey: key });
      if (accountId) {
        // The list is gone: its saved copy and unsent changes go with it.
        void deleteProductReadCacheEntry(
          accountId,
          spaceId,
          'collection',
          deleted.id,
        );
        void deleteCollectionOutbox(accountId, spaceId, deleted.id);
      }
      await Promise.all([
        invalidateCollectionConsumers(queryClient, spaceId),
        queryClient.invalidateQueries({
          queryKey: dashboardPreferencesQueryKey(accountId ?? '', spaceId),
        }),
      ]);
      if (origin && !origin.to.startsWith(MORE_COLLECTIONS_ROUTE)) {
        requestReturn(originKey, MORE_COLLECTIONS_ROUTE);
        return;
      }
      navigate(origin?.to ?? MORE_COLLECTIONS_ROUTE, {
        replace: true,
        state: {
          [PLANNING_DELETE_FOCUS_STATE_KEY]: context.focusTarget,
          taskReturnKey: originKey,
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

  const embeddedPending =
    createItem.isPending ||
    updateItem.isPending ||
    deleteItem.isPending ||
    isReordering;
  useEffect(() => {
    onPendingChange?.(embeddedPending);
    return () => onPendingChange?.(false);
  }, [embeddedPending, onPendingChange]);

  const baseItemIds = [...(viewed?.collection.items ?? [])]
    .sort((left, right) => left.position - right.position)
    .map((item) => item.id);
  const reorder = useListItemReorder({
    itemIds: baseItemIds,
    disabled:
      !collectionQuery.data?.capabilities.canEdit ||
      outbox.pendingCount > 0 ||
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
  pollPausedRef.current =
    isSorting ||
    isEditing ||
    outbox.pendingCount > 0 ||
    createItem.isPending ||
    updateItem.isPending ||
    deleteItem.isPending ||
    reorderItems.isPending ||
    updateCollection.isPending;

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
  const shown = viewed?.collection ?? collection;
  const itemById = new Map(shown.items.map((item) => [item.id, item]));
  const items = reorder.orderedItemIds
    .map((itemId) => itemById.get(itemId))
    .filter((item): item is CollectionItemDetail => Boolean(item));
  const shopping = collection.kind === 'SHOPPING';
  const summary = summarizeSharedList(collection, items);
  const markerFor = (item: CollectionItemDetail) => {
    const finisher = item.completed ? item.completer : null;
    const person = finisher ?? item.creator;
    if (!person) return undefined;
    const name =
      person.displayName ||
      (person.id === accountId ? t('m5s3.collection.you') : '');
    return {
      name,
      tone: partnerTone(collection, person.id),
      caption: name
        ? t(
            finisher
              ? shopping
                ? 'm5s3.collection.completedByShopping'
                : 'm5s3.collection.completedByGeneric'
              : 'm5s3.collection.addedBy',
            { name },
          )
        : '',
    };
  };
  const openItems = items.filter((item) => !item.completed);
  const doneItems = items.filter((item) => item.completed);
  const groups = isSorting
    ? [{ key: 'all', title: null, list: items }]
    : [
        { key: 'open', title: null, list: openItems },
        {
          key: 'done',
          title: t(
            shopping
              ? 'm5s3.collection.trayShopping'
              : 'm5s3.collection.trayGeneric',
          ),
          list: doneItems,
        },
      ].filter((group) => group.list.length > 0);

  function submitCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!collection || hasCurrentReorder()) return;
    const data = new FormData(event.currentTarget);
    updateCollection.mutate({
      collection,
      title: String(data.get('title')).trim(),
    });
  }

  function toggleItem(targetItem: CollectionItemDetail) {
    if (!collection) return;
    refocusToggleRef.current = targetItem.id;
    if (outbox.active)
      void outbox.setCompleted(targetItem.id, !targetItem.completed);
    else
      submitItemUpdate({
        collection,
        item: targetItem,
        completed: !targetItem.completed,
      });
  }

  function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!collection || hasCurrentReorder() || createItemInFlightRef.current)
      return;
    const form = event.currentTarget;
    const data = new FormData(form);
    if (outbox.active) {
      // Kept on the device first, then sent when a connection is there.
      const title = String(data.get('title')).trim();
      if (!title) return;
      const quantity = String(data.get('quantity') ?? '').trim() || null;
      void outbox.addItem({ title, quantity }).then((kept) => {
        if (!kept) return;
        form.reset();
        onDirtyChange?.(false);
        addInputRef.current?.focus();
      });
      return;
    }
    createItemInFlightRef.current = true;
    createItem.mutate(
      {
        collection,
        title: String(data.get('title')).trim(),
        quantity: String(data.get('quantity') ?? '').trim() || undefined,
      },
      {
        onSuccess: () => {
          form.reset();
          onDirtyChange?.(false);
          refocusAddRef.current = true;
        },
      },
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
    <div
      className={embedded ? 'shared-list-composer' : 'page shared-content-page'}
    >
      {!embedded ? (
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
                className="planning-collection-title-form free-composer"
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
                    pinCollection.isSaving
                      ? 'collection-pin-pending'
                      : undefined
                  }
                  onClick={() =>
                    pinCollection.changeSelection(
                      pinnedCollectionId === collection.id
                        ? null
                        : collection.id,
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
      ) : null}

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

        {!embedded ? (
          <SharedListSummary summary={summary} shopping={shopping} />
        ) : null}
        <div className="shared-list-toolbar">
          {embedded ? (
            <p>
              {t('composer.sharedListProgress', {
                count: items.length,
                completed: doneItems.length,
              })}
            </p>
          ) : null}
          {!embedded &&
          collection.capabilities.canEdit &&
          (items.length > 1 || isSorting) ? (
            <button
              type="button"
              className="tertiary"
              aria-pressed={isSorting}
              disabled={isReordering || outbox.pendingCount > 0}
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
        {outbox.active ? (
          <>
            {outbox.pendingCount > 0 ? (
              <p className="shared-list-outbox" role="status">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                  className="shared-list-outbox-icon"
                >
                  {online ? (
                    <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" />
                  ) : (
                    <>
                      <path d="M7 18h10a4 4 0 0 0 .8-7.9A6 6 0 0 0 6.3 9.5 4.4 4.4 0 0 0 7 18z" />
                      <path d="M4 4l16 16" />
                    </>
                  )}
                </svg>
                {t(
                  online
                    ? 'm5s3.collection.outbox.waitingOnline'
                    : 'm5s3.collection.outbox.waitingOffline',
                  { count: outbox.pendingCount },
                )}
              </p>
            ) : null}
            {outbox.storageFailed ? (
              <p className="shared-list-outbox-warning" role="alert">
                {t('m5s3.collection.outbox.storageFailed')}
              </p>
            ) : null}
            {outbox.notices.map((notice) => (
              <p
                key={notice.id}
                className="shared-list-outbox-notice"
                role="status"
              >
                <span>
                  {notice.kind === 'addDropped'
                    ? t(
                        notice.reason === 'expired'
                          ? 'm5s3.collection.outbox.noticeExpired'
                          : 'm5s3.collection.outbox.noticeRejected',
                        { title: notice.title },
                      )
                    : t(
                        {
                          itemGone: 'm5s3.collection.outbox.noticeItemGone',
                          collectionGone:
                            'm5s3.collection.outbox.noticeCollectionGone',
                          full: 'm5s3.collection.outbox.noticeFull',
                        }[notice.kind],
                      )}
                </span>
                <button
                  type="button"
                  className="tertiary"
                  onClick={() => outbox.dismissNotice(notice.id)}
                >
                  {t('m5s3.collection.outbox.dismiss')}
                </button>
              </p>
            ))}
          </>
        ) : null}
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
              className="composer-authored-field"
              name="title"
              required
              maxLength={200}
              placeholder={t('m5s3.collection.newItemPlaceholder')}
              onChange={(event) =>
                onDirtyChange?.(Boolean(event.target.value.trim()))
              }
            />
            {shopping ? (
              <>
                <label className="sr-only" htmlFor="collection-new-quantity">
                  {t('m5s3.collection.quantityLabel')}
                </label>
                <input
                  disabled={createItem.isPending || isReordering}
                  id="collection-new-quantity"
                  className="composer-authored-field shared-list-quantity-field"
                  name="quantity"
                  maxLength={40}
                  placeholder={t('m5s3.collection.quantityPlaceholder')}
                  autoComplete="off"
                />
              </>
            ) : null}
            <AddActionButton
              ref={addButtonRef}
              type="submit"
              label={t('m5s3.collection.addItem')}
              pending={createItem.isPending}
              pendingLabel={t('m5s3.common.saving')}
              disabled={createItem.isPending || isReordering}
            />
          </form>
        ) : null}

        {items.length > 0 ? (
          <div ref={itemsRef} className="shared-list-groups">
            {groups.map((group) => (
              <section
                key={group.key}
                className={
                  shopping && group.key === 'done'
                    ? 'shared-list-group shared-list-group-cart'
                    : 'shared-list-group'
                }
                aria-label={group.title ?? undefined}
              >
                {group.title ? (
                  <h3 className="shared-list-tray-heading">
                    {group.title}
                    <span className="shared-list-tray-count">
                      {group.list.length}
                    </span>
                  </h3>
                ) : null}
                <ol className="shared-list-items">
                  {group.list.map((item) => (
                    <SharedCollectionItemRow
                      key={item.id}
                      item={item}
                      canSort={collection.capabilities.canEdit}
                      isSorting={isSorting}
                      activeItemId={reorder.activeItemId}
                      handleProps={reorder.handleProps}
                      onUpdateTitle={(targetItem, title) =>
                        submitItemUpdate({
                          collection,
                          item: targetItem,
                          title,
                        })
                      }
                      onUpdateQuantity={
                        outbox.active
                          ? (targetItem, quantity) =>
                              outbox.setQuantity(targetItem.id, quantity)
                          : undefined
                      }
                      onToggleComplete={toggleItem}
                      waiting={viewed?.pendingItemIds.has(item.id)}
                      marker={markerFor(item)}
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
                        deleteItem.isPending ||
                        updateItem.isPending ||
                        isReordering
                      }
                    />
                  ))}
                </ol>
              </section>
            ))}
          </div>
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

      {shopping && !embedded && !isSorting ? (
        <SharedListCartBar
          entries={doneItems.map((entry) => ({
            item: entry,
            marker: markerFor(entry),
          }))}
          disabled={updateItem.isPending || isReordering}
          onPutBack={toggleItem}
        />
      ) : null}

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
