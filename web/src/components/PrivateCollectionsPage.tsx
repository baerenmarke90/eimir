import { type FormEvent, useEffect, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { PrivateAreaApi } from '../api/generated/apis/PrivateAreaApi';
import type { PrivateCollectionDetail } from '../api/generated/models/PrivateCollectionDetail';
import type { PrivateCollectionItemDetail } from '../api/generated/models/PrivateCollectionItemDetail';
import {
  PRIVATE_COLLECTIONS_PATH,
  privateApiCall,
  privateAreaQueryKeys,
  privateCollectionPath,
} from '../client/privateArea';
import { useTaskEditorLifecycle } from '../client/useTaskEditorLifecycle';
import { useTranslation } from '../i18n';
import { ListEntryIconButton, useListItemReorder } from './ListEntryActions';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import './SharedPlanningPages.css';
import {
  LoadMoreButton,
  PrivateAreaBackToHub,
  PrivateAreaDetailBack,
  PrivateEditorDiscardSheet,
  usePrivateTaskEditorLifecycle,
} from './PrivateAreaLayout';
import { UiState } from './UiState';
import { useRequiredTitleValidation } from './useRequiredTitleValidation';

const PAGE_SIZE = 20;

type Props = {
  api: PrivateAreaApi;
  accountId: string;
  spaceId: string;
};

function usePrivateCollection(
  api: PrivateAreaApi,
  accountId: string,
  spaceId: string,
) {
  const { collectionId } = useParams();
  const query = useQuery({
    queryKey: privateAreaQueryKeys.collection(
      accountId,
      spaceId,
      collectionId ?? 'missing',
    ),
    queryFn: () => {
      if (!collectionId)
        throw new Error('Missing private collection route parameter.');
      return privateApiCall(() =>
        api.getPrivateCollection({ spaceId, collectionId }),
      );
    },
    enabled: Boolean(collectionId),
    retry: false,
  });
  return { collectionId, query };
}

function CollectionFields({
  collection,
  titleValidation,
}: {
  collection?: PrivateCollectionDetail;
  titleValidation: ReturnType<typeof useRequiredTitleValidation>;
}) {
  const { t } = useTranslation();
  return (
    <div className="field-group">
      <label htmlFor="private-collection-title">
        {t('privateArea.collections.titleLabel')}
      </label>
      <input
        ref={titleValidation.inputRef}
        id="private-collection-title"
        name="title"
        required
        maxLength={200}
        defaultValue={collection?.title ?? ''}
        aria-invalid={titleValidation.invalid || undefined}
        aria-describedby={
          titleValidation.invalid ? 'private-collection-title-error' : undefined
        }
        onChange={(event) =>
          titleValidation.handleChange(event.currentTarget.value)
        }
      />
      {titleValidation.invalid ? (
        <p
          id="private-collection-title-error"
          className="status status-error"
          role="alert"
        >
          {t('privateArea.titleRequired')}
        </p>
      ) : null}
    </div>
  );
}

export function PrivateCollectionsListPage({ api, accountId, spaceId }: Props) {
  const { t } = useTranslation();
  const query = useInfiniteQuery({
    queryKey: privateAreaQueryKeys.collections(accountId, spaceId),
    queryFn: ({ pageParam }) =>
      privateApiCall(() =>
        api.listPrivateCollections({
          spaceId,
          cursor: pageParam,
          limit: PAGE_SIZE,
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => (page.hasMore ? page.nextCursor : undefined),
    retry: false,
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <PageHeader
        before={<PrivateAreaBackToHub />}
        eyebrow={t('privateArea.privacyLabel')}
        title={t('privateArea.collections.title')}
        description={t('privateArea.collections.intro')}
        action={
          <Link className="button-link" to={`${PRIVATE_COLLECTIONS_PATH}/new`}>
            {t('privateArea.collections.add')}
          </Link>
        }
      />
      {query.isLoading ? (
        <UiState kind="loading" title={t('privateArea.collections.loading')} />
      ) : null}
      {query.error ? (
        <ProblemState
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.data && items.length === 0 ? (
        <UiState
          kind="empty"
          title={t('privateArea.collections.emptyTitle')}
          body={t('privateArea.collections.emptyBody')}
        />
      ) : null}
      {items.length > 0 ? (
        <section className="private-area-section">
          <ul className="private-area-list layout-columns layout-columns-dense">
            {items.map((collection) => (
              <li key={collection.id}>
                <Link
                  className="private-area-card private-area-card-clickable"
                  to={privateCollectionPath(collection.id)}
                >
                  <div className="private-area-card-heading">
                    <h2>{collection.title}</h2>
                  </div>
                  <span className="private-area-card-arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <LoadMoreButton
            hasMore={Boolean(query.hasNextPage)}
            loading={query.isFetchingNextPage}
            onLoadMore={() => void query.fetchNextPage()}
          />
        </section>
      ) : null}
    </>
  );
}

export function PrivateCollectionCreatePage({
  api,
  accountId,
  spaceId,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dirty, setDirty] = useState(false);
  const mutation = useMutation({
    mutationFn: (title: string) =>
      privateApiCall(() =>
        api.createPrivateCollection({
          spaceId,
          privateCollectionCreate: { title },
        }),
      ),
    onSuccess: async (collection) => {
      await queryClient.invalidateQueries({
        queryKey: privateAreaQueryKeys.collections(accountId, spaceId),
      });
      closeTask(() => {
        navigate(privateCollectionPath(collection.id), {
          replace: true,
          state: navigationState,
        });
      });
    },
  });
  const titleValidation = useRequiredTitleValidation(
    mutation.error,
    'PRIVATE_COLLECTION_TITLE_REQUIRED',
    mutation.reset,
  );
  const {
    navigationState,
    showDiscardConfirm,
    keepEditing,
    closeConfirmed: closeTask,
    requestClose,
  } = usePrivateTaskEditorLifecycle({
    fallbackPath: PRIVATE_COLLECTIONS_PATH,
    isDirty: dirty,
    isCloseBlocked: mutation.isPending,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    const data = new FormData(event.currentTarget);
    const title = titleValidation.validate(String(data.get('title') || ''));
    if (title === null) return;
    mutation.mutate(title);
  }

  return (
    <>
      <PageHeader
        before={
          <button
            type="button"
            className="back-link tertiary"
            onClick={requestClose}
            aria-disabled={mutation.isPending}
          >
            {t('privateArea.collections.detailBack')}
          </button>
        }
        title={t('privateArea.collections.createTitle')}
        description={t('privateArea.collections.intro')}
      />
      <section className="form-card private-area-editor">
        <form
          className="form-grid"
          onSubmit={submit}
          onChange={() => setDirty(true)}
        >
          <CollectionFields titleValidation={titleValidation} />
          <div className="form-actions">
            <button
              type="button"
              className="button-link secondary-link"
              onClick={requestClose}
              disabled={mutation.isPending}
            >
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? t('privateArea.saving')
                : t('privateArea.save')}
            </button>
          </div>
        </form>
        {mutation.error && !titleValidation.serverInvalid ? (
          <ProblemState error={mutation.error} />
        ) : null}
      </section>
      <PrivateEditorDiscardSheet
        open={showDiscardConfirm}
        onKeep={keepEditing}
        onDiscard={() => closeTask()}
      />
    </>
  );
}

function CollectionItems({
  api,
  accountId,
  spaceId,
  collection,
  editing,
}: Props & { collection: PrivateCollectionDetail; editing: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const collectionKey = privateAreaQueryKeys.collection(
    accountId,
    spaceId,
    collection.id,
  );
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: collectionKey });
    await queryClient.invalidateQueries({
      queryKey: privateAreaQueryKeys.collections(accountId, spaceId),
    });
  };

  const createMutation = useMutation({
    mutationFn: (title: string) =>
      privateApiCall(() =>
        api.createPrivateCollectionItem({
          spaceId,
          collectionId: collection.id,
          privateCollectionItemCreate: { title },
        }),
      ),
    onSuccess: refresh,
  });
  const updateMutation = useMutation({
    mutationFn: ({
      item,
      update,
    }: {
      item: PrivateCollectionItemDetail;
      update: { title?: string; completed?: boolean };
    }) =>
      privateApiCall(() =>
        api.updatePrivateCollectionItem({
          spaceId,
          collectionId: collection.id,
          itemId: item.id,
          ifMatch: String(item.version),
          privateCollectionItemUpdate: update,
        }),
      ),
    onSuccess: refresh,
  });
  const deleteMutation = useMutation({
    mutationFn: (item: PrivateCollectionItemDetail) =>
      privateApiCall(() =>
        api.deletePrivateCollectionItem({
          spaceId,
          collectionId: collection.id,
          itemId: item.id,
          ifMatch: String(item.version),
        }),
      ),
    onSuccess: refresh,
  });
  const reorderMutation = useMutation({
    mutationFn: (itemIds: string[]) =>
      privateApiCall(() =>
        api.reorderPrivateCollectionItems({
          spaceId,
          collectionId: collection.id,
          ifMatch: String(collection.version),
          privateCollectionOrder: { itemIds },
        }),
      ),
    onSuccess: async (updated) => {
      queryClient.setQueryData(collectionKey, updated);
      await queryClient.invalidateQueries({
        queryKey: privateAreaQueryKeys.collections(accountId, spaceId),
      });
    },
  });

  const baseItems = [...collection.items].sort(
    (left, right) => left.position - right.position,
  );
  const reorder = useListItemReorder({
    itemIds: baseItems.map((item) => item.id),
    disabled:
      !editing ||
      !collection.capabilities.canEdit ||
      reorderMutation.isPending,
    onReorder: (itemIds) => reorderMutation.mutate(itemIds),
  });
  const itemById = new Map(baseItems.map((item) => [item.id, item]));
  const items = reorder.orderedItemIds
    .map((itemId) => itemById.get(itemId))
    .filter((item): item is PrivateCollectionItemDetail => Boolean(item));

  function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get('title') || '').trim();
    if (!title) return;
    createMutation.mutate(title, { onSuccess: () => form.reset() });
  }

  function commitRename(
    item: PrivateCollectionItemDetail,
    rawTitle: string,
    inputElement: HTMLInputElement,
  ) {
    const title = rawTitle.trim();
    if (!title) {
      inputElement.value = item.title;
      return;
    }
    if (title === item.title) return;
    updateMutation.mutate({ item, update: { title } });
  }

  function renderChecklistItem(item: PrivateCollectionItemDetail) {
    return (
      <li
        key={item.id}
        data-sortable-item-id={item.id}
        className={[
          item.completed ? 'planning-item-completed' : null,
          reorder.activeItemId === item.id ? 'list-entry-dragging' : null,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <button
          type="button"
          className="planning-check is-private"
          aria-pressed={item.completed}
          aria-label={
            item.completed
              ? t('privateArea.collections.markOpen')
              : t('privateArea.collections.markComplete')
          }
          onClick={() =>
            updateMutation.mutate({
              item,
              update: { completed: !item.completed },
            })
          }
          disabled={
            !collection.capabilities.canEdit || updateMutation.isPending
          }
        >
          {item.completed ? '✓' : ''}
        </button>
        {editing ? (
          <>
            <div className="planning-item-title-form">
              <label className="sr-only" htmlFor={`private-item-${item.id}`}>
                {t('privateArea.collections.rename')}
              </label>
              <input
                id={`private-item-${item.id}`}
                name="title"
                className={`private-checklist-title-input${item.completed ? ' is-completed' : ''}`}
                defaultValue={item.title}
                required
                maxLength={200}
                disabled={!collection.capabilities.canEdit}
                onBlur={(event) => {
                  commitRename(
                    item,
                    event.currentTarget.value,
                    event.currentTarget,
                  );
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    event.currentTarget.blur();
                  } else if (event.key === 'Escape') {
                    event.currentTarget.value = item.title;
                    event.currentTarget.blur();
                  }
                }}
              />
            </div>
            {collection.capabilities.canEdit ? (
              <ListEntryIconButton
                icon="reorder"
                className="tertiary"
                label={t('privateArea.collections.reorderItem')}
                {...reorder.handleProps(item.id)}
              />
            ) : null}
            {collection.capabilities.canEdit ? (
              <ListEntryIconButton
                icon="delete"
                className="tertiary"
                label={t('privateArea.collections.removeItem')}
                onClick={() => deleteMutation.mutate(item)}
                disabled={deleteMutation.isPending}
              />
            ) : null}
          </>
        ) : (
          <span
            className={`private-collection-item-title${item.completed ? ' is-completed' : ''}`}
          >
            {item.title}
          </span>
        )}
      </li>
    );
  }

  return (
    <section
      className="planning-subsection private-collection-items-section"
      aria-labelledby="private-list-items-title"
    >
      <h2 id="private-list-items-title" className="sr-only">
        {t('privateArea.collections.itemsTitle')}
      </h2>

      {editing && collection.capabilities.canEdit ? (
        <form className="planning-inline-create" onSubmit={submitItem}>
          <label className="sr-only" htmlFor="private-list-new-item">
            {t('privateArea.collections.itemTitleLabel')}
          </label>
          <input
            id="private-list-new-item"
            name="title"
            required
            maxLength={200}
            placeholder={t('privateArea.collections.itemTitleLabel')}
          />
          <ListEntryIconButton
            type="submit"
            icon="add"
            className="list-entry-add-button is-private"
            label={
              createMutation.isPending
                ? t('common.saving')
                : t('privateArea.collections.addItem')
            }
            disabled={createMutation.isPending}
          />
        </form>
      ) : null}

      {createMutation.error ? (
        <ProblemState error={createMutation.error} />
      ) : null}

      {items.length > 0 ? (
        <ol className="planning-collection-items private-collection-items">
          {items.map(renderChecklistItem)}
        </ol>
      ) : (
        <p className="planning-empty">{t('privateArea.collections.noItems')}</p>
      )}

      {reorderMutation.isPending ? (
        <p role="status">{t('privateArea.collections.reordering')}</p>
      ) : null}
      {updateMutation.error ? (
        <ProblemState error={updateMutation.error} />
      ) : null}
      {deleteMutation.error ? (
        <ProblemState error={deleteMutation.error} />
      ) : null}
      {reorderMutation.error ? (
        <ProblemState error={reorderMutation.error} />
      ) : null}
    </section>
  );
}

export function PrivateCollectionDetailPage({
  api,
  accountId,
  spaceId,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { collectionId, query } = usePrivateCollection(api, accountId, spaceId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [showTitleSaved, setShowTitleSaved] = useState(false);

  const collection = query.data;

  useEffect(() => {
    if (collection?.title) {
      setTitleDraft(collection.title);
    }
  }, [collection?.title]);

  const updateCollectionMutation = useMutation({
    mutationFn: (newTitle: string) => {
      if (!collection) throw new Error('Missing collection');
      return privateApiCall(() =>
        api.updatePrivateCollection({
          spaceId,
          collectionId: collection.id,
          ifMatch: String(collection.version),
          privateCollectionUpdate: { title: newTitle },
        }),
      );
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(
        privateAreaQueryKeys.collection(accountId, spaceId, updated.id),
        updated,
      );
      void queryClient.invalidateQueries({
        queryKey: privateAreaQueryKeys.collections(accountId, spaceId),
      });
      closeCollectionEdit(() => {
        setIsEditing(false);
        setConfirmDelete(false);
        setTitleDraft(updated.title);
        setShowTitleSaved(true);
        setTimeout(() => setShowTitleSaved(false), 2000);
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (collectionToDelete: PrivateCollectionDetail) =>
      privateApiCall(() =>
        api.deletePrivateCollection({
          spaceId,
          collectionId: collectionToDelete.id,
          ifMatch: String(collectionToDelete.version),
        }),
      ),
    onSuccess: async () => {
      if (collectionId) {
        queryClient.removeQueries({
          queryKey: privateAreaQueryKeys.collection(
            accountId,
            spaceId,
            collectionId,
          ),
        });
      }
      await queryClient.invalidateQueries({
        queryKey: privateAreaQueryKeys.collections(accountId, spaceId),
      });
      closeCollectionEdit(() =>
        navigate(PRIVATE_COLLECTIONS_PATH, { replace: true }),
      );
    },
  });

  const hasTitleChanges = collection
    ? titleDraft !== collection.title
    : false;
  const isTitleDirty = collection
    ? titleDraft.trim().length > 0 &&
      titleDraft.trim() !== collection.title
    : false;
  const {
    showDiscardConfirm: showEditDiscard,
    keepEditing: keepCollectionEditing,
    closeConfirmed: closeCollectionEdit,
    requestClose: requestCollectionEditClose,
  } = useTaskEditorLifecycle({
    isActive: isEditing && Boolean(collection),
    isDirty: hasTitleChanges,
    isCloseBlocked:
      updateCollectionMutation.isPending || deleteMutation.isPending,
    onClose: () => {
      setIsEditing(false);
      setConfirmDelete(false);
      if (collection) setTitleDraft(collection.title);
    },
  });

  if (query.isLoading) {
    return (
      <UiState kind="loading" title={t('privateArea.collections.loading')} />
    );
  }
  if (query.error) {
    return (
      <ProblemState error={query.error} onRetry={() => void query.refetch()} />
    );
  }
  if (!collection) return null;

  function submitCollectionTitle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isTitleDirty || updateCollectionMutation.isPending) return;
    updateCollectionMutation.mutate(titleDraft.trim());
  }

  return (
    <div className="page planning-page private-collection-page">
      <PageHeader
        className="page-heading-collection"
        before={
          <PrivateAreaDetailBack
            fallbackPath={PRIVATE_COLLECTIONS_PATH}
            fallbackLabel={t('privateArea.collections.detailBack')}
          />
        }
        eyebrow={t('privateArea.privacyLabel')}
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
              icon="edit"
              className="tertiary"
              label={t('common.edit')}
              onClick={() => setIsEditing(true)}
            />
          ) : undefined
        }
        titleEditor={
          isEditing ? (
            <form
              className="planning-collection-title-form"
              onSubmit={(e) => {
                submitCollectionTitle(e);
              }}
            >
              <label
                htmlFor="private-collection-edit-title"
                className="sr-only"
              >
                {t('privateArea.collections.titleLabel')}
              </label>
              <div className="planning-collection-title-row">
                <input
                  id="private-collection-edit-title"
                  name="title"
                  required
                  maxLength={200}
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  placeholder={t('privateArea.collections.titleLabel')}
                  aria-label={t('privateArea.collections.titleLabel')}
                />
                <ListEntryIconButton
                  type="submit"
                  icon="save"
                  className="tertiary"
                  label={
                    updateCollectionMutation.isPending
                      ? t('common.saving')
                      : t('m5s3.common.saveChanges')
                  }
                  disabled={!isTitleDirty || updateCollectionMutation.isPending}
                />
                <button
                  type="button"
                  className="button-link secondary-link"
                  onClick={requestCollectionEditClose}
                  disabled={
                    updateCollectionMutation.isPending ||
                    deleteMutation.isPending
                  }
                >
                  {t('common.cancel')}
                </button>
              </div>
              {updateCollectionMutation.error ? (
                <ProblemState
                  error={updateCollectionMutation.error}
                  onRetry={() => void query.refetch()}
                />
              ) : null}
            </form>
          ) : undefined
        }
        description={t('m5s3.collection.itemCount', {
          count: collection.items.length,
        })}
      />

      <CollectionItems
        api={api}
        accountId={accountId}
        spaceId={spaceId}
        collection={collection}
        editing={isEditing}
      />

      {isEditing && collection.capabilities.canDelete ? (
        <section
          className="planning-danger-zone"
          aria-labelledby="private-collection-delete-heading"
        >
          <h2 id="private-collection-delete-heading">
            {t('m5s3.common.deleteHeading')}
          </h2>
          <p>{t('privateArea.deleteConfirmBody')}</p>
          {!confirmDelete ? (
            <button
              type="button"
              className="danger"
              onClick={() => setConfirmDelete(true)}
            >
              {t('m5s3.common.delete')}
            </button>
          ) : (
            <div className="planning-confirm-row">
              <button
                type="button"
                className="danger"
                onClick={() => deleteMutation.mutate(collection)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending
                  ? t('m5s3.common.deleting')
                  : t('m5s3.common.confirmDelete')}
              </button>
              <button
                type="button"
                className="tertiary"
                onClick={() => setConfirmDelete(false)}
              >
                {t('common.cancel')}
              </button>
            </div>
          )}
          {deleteMutation.error ? (
            <ProblemState
              error={deleteMutation.error}
              onRetry={() => void query.refetch()}
            />
          ) : null}
        </section>
      ) : null}
      <PrivateEditorDiscardSheet
        open={showEditDiscard}
        onKeep={keepCollectionEditing}
        onDiscard={() => closeCollectionEdit()}
      />
    </div>
  );
}

export function PrivateCollectionEditPage({ api, accountId, spaceId }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dirty, setDirty] = useState(false);
  const { collectionId, query } = usePrivateCollection(api, accountId, spaceId);
  const mutation = useMutation({
    mutationFn: ({
      collection,
      title,
    }: {
      collection: PrivateCollectionDetail;
      title: string;
    }) =>
      privateApiCall(() =>
        api.updatePrivateCollection({
          spaceId,
          collectionId: collection.id,
          ifMatch: String(collection.version),
          privateCollectionUpdate: { title },
        }),
      ),
    onSuccess: async (collection) => {
      queryClient.setQueryData(
        privateAreaQueryKeys.collection(accountId, spaceId, collection.id),
        collection,
      );
      await queryClient.invalidateQueries({
        queryKey: privateAreaQueryKeys.collections(accountId, spaceId),
      });
      closeTask(() => {
        navigate(privateCollectionPath(collection.id), {
          replace: true,
          state: navigationState,
        });
      });
    },
  });
  const titleValidation = useRequiredTitleValidation(
    mutation.error,
    'PRIVATE_COLLECTION_TITLE_REQUIRED',
    mutation.reset,
  );
  const detailFallback = collectionId
    ? privateCollectionPath(collectionId)
    : PRIVATE_COLLECTIONS_PATH;
  const {
    navigationState,
    showDiscardConfirm,
    keepEditing,
    closeConfirmed: closeTask,
    requestClose,
  } = usePrivateTaskEditorLifecycle({
    fallbackPath: detailFallback,
    isDirty: dirty,
    isCloseBlocked: mutation.isPending,
    closeToFallback: true,
  });

  if (query.isLoading) {
    return (
      <UiState kind="loading" title={t('privateArea.collections.loading')} />
    );
  }
  if (query.error) {
    return (
      <ProblemState error={query.error} onRetry={() => void query.refetch()} />
    );
  }
  const collection = query.data;
  if (!collection) return null;
  if (!collection.capabilities.canEdit) {
    return (
      <UiState
        kind="permission"
        title={t('states.permission.title')}
        body={t('states.permission.body')}
      />
    );
  }
  const editableCollection: PrivateCollectionDetail = collection;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    const data = new FormData(event.currentTarget);
    const title = titleValidation.validate(String(data.get('title') || ''));
    if (title === null) return;
    mutation.mutate({
      collection: editableCollection,
      title,
    });
  }

  return (
    <>
      <PageHeader
        before={
          <button
            type="button"
            className="back-link tertiary"
            onClick={requestClose}
            aria-disabled={mutation.isPending}
          >
            {t('privateArea.collections.detailBack')}
          </button>
        }
        title={t('privateArea.collections.editTitle')}
        description={t('privateArea.collections.intro')}
      />
      <section className="form-card private-area-editor">
        <form
          className="form-grid"
          onSubmit={submit}
          onChange={() => setDirty(true)}
        >
          <CollectionFields
            collection={collection}
            titleValidation={titleValidation}
          />
          <div className="form-actions">
            <button
              type="button"
              className="button-link secondary-link"
              onClick={requestClose}
              disabled={mutation.isPending}
            >
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? t('privateArea.saving')
                : t('privateArea.save')}
            </button>
          </div>
        </form>
        {mutation.error && !titleValidation.serverInvalid ? (
          <ProblemState error={mutation.error} />
        ) : null}
      </section>
      <PrivateEditorDiscardSheet
        open={showDiscardConfirm}
        onKeep={keepEditing}
        onDiscard={() => closeTask()}
      />
    </>
  );
}
