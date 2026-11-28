import {
  type InfiniteData,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import type { CollectionScope } from '../api/generated/models/CollectionScope';
import type { CollectionDetail } from '../api/generated/models/CollectionDetail';
import type { CollectionItemDetail } from '../api/generated/models/CollectionItemDetail';
import type { CollectionKind } from '../api/generated/models/CollectionKind';
import {
  authorSummaryQueryKeys,
  invalidateCollectionConsumers,
} from '../client/authorSummaryConsumers';
import { assertOnlineWrite } from '../client/connectivity';
import {
  type DeleteFocusTarget,
  PLANNING_DELETE_FOCUS_STATE_KEY,
} from '../client/deleteFocusTarget';
import {
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';
import { captureQueryIdentity } from '../client/queryIdentity';
import { collectionDetailPath, MORE_COLLECTIONS_ROUTE } from '../client/routes';
import {
  planningIfMatch,
  type SharedPlanningApis,
} from '../client/sharedPlanning';
import { useRootTabIntro } from '../client/rootTabIntro';
import { useTaskOrigin } from '../client/taskOrigin';
import { useWarmInfiniteQuery } from '../client/useWarmInfiniteQuery';
import { useTranslation } from '../i18n';
import { AddActionButton } from './AddAction';
import { AutoLoadMore } from './AutoLoadMore';
import { DefaultShoppingListCard } from './DefaultShoppingListCard';
import { SharedContentTabs } from './SharedContentTabs';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { SharedContentSheet } from './SharedContentSheet';
import type { ShortTaskSheetHandle } from './ShortTaskSheet';
import { UiState } from './UiState';
import { StatusScope } from './StatusScope';
import './SharedPlanningPages.css';
import './SharedContentPages.css';

const PAGE_SIZE = 20;

type PageShape<T> = { items: T[]; nextCursor: string | null };

async function apiCall<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

const PREVIEW_ITEM_LIMIT = 4;

type PreviewItem = CollectionItemDetail;

function previewHiddenCount(items: readonly PreviewItem[]): number {
  return Math.max(0, items.length - PREVIEW_ITEM_LIMIT);
}

/**
 * The first entries of the list on its card, open ones first. Each entry is a
 * real checkbox that saves at once, so a list can be ticked off without
 * opening it; the card heading above opens the list.
 */
function CollectionCardPreview({
  items,
  expanded,
  canEdit,
  pendingItemId,
  onToggle,
}: {
  items: readonly PreviewItem[];
  /** Expanded cards show every entry instead of the first few. */
  expanded: boolean;
  canEdit: boolean;
  pendingItemId: string | null;
  onToggle: (item: PreviewItem) => void;
}) {
  if (items.length === 0) return null;
  const ordered = [...items].sort(
    (a, b) =>
      Number(a.completed) - Number(b.completed) || a.position - b.position,
  );
  const shown = expanded ? ordered : ordered.slice(0, PREVIEW_ITEM_LIMIT);
  return (
    <ul className="collection-card-items">
      {shown.map((item) => (
        <li key={item.id} className={item.completed ? 'is-done' : undefined}>
          <label className="collection-card-check">
            <input
              type="checkbox"
              className="collection-card-input"
              checked={item.completed}
              disabled={!canEdit || pendingItemId === item.id}
              onChange={() => onToggle(item)}
            />
            <span className="collection-card-mark" aria-hidden="true" />
            <span>{item.title}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
function nextCursor<T>(page: PageShape<T>): string | undefined {
  return page.nextCursor ?? undefined;
}

export function CollectionsOverviewPage({
  apis,
  spaceId,
  initialCreate = false,
}: {
  apis: SharedPlanningApis;
  spaceId: string;
  initialCreate?: boolean;
}) {
  const { t } = useTranslation();
  const rootIntro = useRootTabIntro<HTMLDivElement>('shared');
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const scope: CollectionScope =
    searchParams.get('scope') === 'COMPLETED'
      ? 'COMPLETED'
      : searchParams.get('scope') === 'ALL'
        ? 'ALL'
        : 'OPEN';
  // Cards whose entries are all shown; the rest show the first few.
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const createInFlightRef = useRef(false);
  const openingCreatedRef = useRef(false);
  const [createOpen, setCreateOpen] = useState(initialCreate);
  const { requestReturn, captureOrigin } = useTaskOrigin();
  const originKey = (location.state as { taskOriginKey?: unknown } | null)
    ?.taskOriginKey;
  const [createDirty, setCreateDirty] = useState(false);
  const [createKind, setCreateKind] = useState<CollectionKind>('GENERIC');
  const createSheetRef = useRef<ShortTaskSheetHandle>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const createActionRef = useRef<HTMLButtonElement>(null);
  const collectionRefs = useRef(new Map<string, HTMLAnchorElement>());
  const restoredDeleteFocusRef = useRef(false);

  const collections = useWarmInfiniteQuery({
    queryKey: authorSummaryQueryKeys.collectionOverview(spaceId, scope),
    queryFn: ({ pageParam }) =>
      apiCall(() =>
        apis.collections.listCollections({
          spaceId,
          scope,
          cursor: pageParam,
          limit: PAGE_SIZE,
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: nextCursor<CollectionDetail>,
    retry: false,
  });

  const createCollection = useMutation({
    onSettled: () => {
      createInFlightRef.current = false;
    },
    networkMode: 'always',
    mutationFn: ({ title, kind }: { title: string; kind: CollectionKind }) =>
      apiCall(() => {
        assertOnlineWrite();
        return apis.collections.createCollection({
          spaceId,
          // A plain list sends no kind, exactly as before shopping lists.
          collectionCreate: kind === 'SHOPPING' ? { title, kind } : { title },
        });
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['m5-s3', 'collections', spaceId],
      });
    },
  });

  // Ticking an entry on its card saves at once and shows the change first.
  const toggleItem = useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: ({
      collection,
      item,
    }: {
      collection: CollectionDetail;
      item: CollectionItemDetail;
    }) =>
      apiCall(() => {
        assertOnlineWrite();
        return apis.collections.updateCollectionItem({
          spaceId,
          collectionId: collection.id,
          itemId: item.id,
          ifMatch: planningIfMatch(item),
          collectionItemUpdate: { completed: !item.completed },
        });
      }),
    onMutate: async ({ collection, item }) => {
      const key = ['m5-s3', 'collections', spaceId];
      await queryClient.cancelQueries({ queryKey: key });
      const snapshots = queryClient.getQueriesData<
        InfiniteData<PageShape<CollectionDetail>>
      >({ queryKey: key });
      queryClient.setQueriesData<InfiniteData<PageShape<CollectionDetail>>>(
        { queryKey: key },
        // Other queries share this key prefix (for example the default
        // shopping list); only the paged overviews are patched.
        (data) =>
          !data || !Array.isArray(data.pages)
            ? data
            : {
                ...data,
                pages: data.pages.map((page) => ({
                  ...page,
                  items: page.items.map((entry) =>
                    entry.id === collection.id
                      ? {
                          ...entry,
                          items: entry.items.map((row) =>
                            row.id === item.id
                              ? { ...row, completed: !row.completed }
                              : row,
                          ),
                        }
                      : entry,
                  ),
                })),
              },
      );
      return { snapshots };
    },
    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.snapshots ?? [])
        queryClient.setQueryData(key, data);
    },
    onSettled: () => invalidateCollectionConsumers(queryClient, spaceId),
  });

  const collectionItems =
    collections.data?.pages.flatMap((page) => page.items) ?? [];
  const deleteFocusTarget = (
    location.state as Record<string, unknown> | null
  )?.[PLANNING_DELETE_FOCUS_STATE_KEY] as DeleteFocusTarget | undefined;

  useEffect(() => {
    if (restoredDeleteFocusRef.current || !deleteFocusTarget) return;
    const requestedTarget =
      deleteFocusTarget.kind === 'item'
        ? collectionRefs.current.get(deleteFocusTarget.id)
        : createActionRef.current;
    if (!requestedTarget && collections.isFetching) return;
    (requestedTarget ?? createActionRef.current)?.focus();
    restoredDeleteFocusRef.current = true;
  }, [collections.isFetching, deleteFocusTarget]);

  function submitCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createInFlightRef.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const isCurrentQuery = captureQueryIdentity(
      queryClient,
      authorSummaryQueryKeys.collectionOverview(spaceId, scope),
    );
    createInFlightRef.current = true;
    createCollection.mutate(
      { title: String(data.get('title')).trim(), kind: createKind },
      {
        onSuccess: (created) => {
          if (
            !isCurrentQuery() ||
            ['unauthorized', 'permission', 'notFound'].includes(
              clientProblemKind(
                queryClient.getQueryState(
                  authorSummaryQueryKeys.collectionOverview(spaceId, scope),
                )?.error,
              ),
            )
          )
            return;
          form.reset();
          setCreateDirty(false);
          queryClient.setQueryData(
            authorSummaryQueryKeys.collectionDetail(spaceId, created.id),
            created,
          );
          openingCreatedRef.current = true;
          createSheetRef.current?.closeForNavigation(() =>
            navigate(collectionDetailPath(created.id), {
              state: initialCreate
                ? location.state
                : { taskOriginKey: captureOrigin() },
              replace: initialCreate,
            }),
          );
        },
      },
    );
  }

  return (
    <div className="page shared-content-page shared-root-page" ref={rootIntro}>
      <PageHeader
        variant="root"
        className="content-overview-heading"
        title={t('navigation.sharedHeading')}
        action={
          <AddActionButton
            floating
            label={t('m5s3.collection.create')}
            icon="listen"
            ref={createActionRef}
            id="collection-title"
            onClick={() => {
              createCollection.reset();
              setCreateKind('GENERIC');
              setCreateOpen(true);
            }}
          />
        }
      />

      <SharedContentTabs activeView="lists" />

      <DefaultShoppingListCard
        apis={apis}
        spaceId={spaceId}
        onCreated={(created) =>
          navigate(collectionDetailPath(created.id), {
            state: { taskOriginKey: captureOrigin() },
          })
        }
      />

      <StatusScope<CollectionScope>
        label={t('m5s3.collection.scopeLabel')}
        value={scope}
        options={(['OPEN', 'COMPLETED', 'ALL'] as const).map((value) => ({
          value,
          label: t(`m5s3.collection.scope.${value}`),
        }))}
        onChange={(next) =>
          setSearchParams(
            (previous) => {
              const params = new URLSearchParams(previous);
              if (next === 'OPEN') params.delete('scope');
              else params.set('scope', next);
              return params;
            },
            { replace: true },
          )
        }
      />

      <section className="planning-subsection">
        {collections.isLoading ? (
          <UiState kind="loading" title={t('states.loading.title')} />
        ) : null}
        {collections.error ? (
          <ProblemState
            error={collections.error}
            onRetry={() => void collections.refetch()}
          />
        ) : null}
        {toggleItem.error ? <ProblemState error={toggleItem.error} /> : null}

        {collectionItems.length === 0 &&
        !collections.isLoading &&
        !collections.error ? (
          <p className="planning-empty">{t('m5s3.collection.emptyScope')}</p>
        ) : (
          <ul className="content-overview-list content-overview-lists">
            {collectionItems.map((collection) => {
              const hiddenCount = previewHiddenCount(collection.items);
              const expanded = expandedIds.has(collection.id);
              return (
                <li className="planning-card-item" key={collection.id}>
                  <Link
                    ref={(element) => {
                      if (element)
                        collectionRefs.current.set(collection.id, element);
                      else collectionRefs.current.delete(collection.id);
                    }}
                    className="content-overview-row collection-card"
                    to={collectionDetailPath(collection.id)}
                    onClick={(event) => {
                      if (
                        event.button ||
                        event.metaKey ||
                        event.ctrlKey ||
                        event.altKey ||
                        event.shiftKey
                      )
                        return;
                      event.preventDefault();
                      void navigate(collectionDetailPath(collection.id), {
                        state: {
                          taskOriginKey: captureOrigin({
                            selectedKey: collection.id,
                          }),
                        },
                      });
                    }}
                  >
                    <div className="content-overview-copy">
                      <h2>{collection.title}</h2>
                      <p>
                        {t('m5s3.collection.progress', {
                          count: collection.items.length,
                          completed: collection.items.filter(
                            (item) => item.completed,
                          ).length,
                        })}
                      </p>
                    </div>
                  </Link>
                  <CollectionCardPreview
                    items={collection.items}
                    expanded={expanded}
                    canEdit={collection.capabilities.canEdit}
                    pendingItemId={
                      toggleItem.isPending
                        ? (toggleItem.variables?.item.id ?? null)
                        : null
                    }
                    onToggle={(item) => toggleItem.mutate({ collection, item })}
                  />
                  {hiddenCount > 0 ? (
                    <button
                      type="button"
                      className="collection-card-toggle tertiary"
                      aria-expanded={expanded}
                      onClick={() =>
                        setExpandedIds((current) => {
                          const next = new Set(current);
                          if (next.has(collection.id))
                            next.delete(collection.id);
                          else next.add(collection.id);
                          return next;
                        })
                      }
                    >
                      {expanded
                        ? t('m5s3.collection.previewLess')
                        : t('m5s3.collection.previewMore', {
                            count: hiddenCount,
                          })}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {collections.hasNextPage ? (
          <AutoLoadMore
            query={collections}
            className="tertiary compact-action"
            blocked={collections.isFetchingNextPage}
          >
            {collections.isFetchingNextPage
              ? t('m5s3.common.loadingMore')
              : t('m5s3.common.loadMore')}
          </AutoLoadMore>
        ) : null}

        <SharedContentSheet
          open={createOpen}
          title={t('m5s3.collection.create')}
          isDirty={createDirty}
          isPending={createCollection.isPending}
          initialFocusRef={nameInputRef}
          restoreFocusRef={createActionRef}
          sheetRef={createSheetRef}
          onClose={() => {
            setCreateOpen(false);
            setCreateDirty(false);
            if (initialCreate && !openingCreatedRef.current)
              requestReturn(originKey, MORE_COLLECTIONS_ROUTE);
          }}
        >
          {(requestClose) => (
            <form
              onSubmit={submitCollection}
              className="form-grid planning-create-form free-composer"
              onChange={(event) =>
                setCreateDirty(
                  Array.from(new FormData(event.currentTarget).values()).some(
                    (value) => String(value).length > 0,
                  ),
                )
              }
            >
              <fieldset
                className="form-grid shared-content-fields"
                disabled={createCollection.isPending}
              >
                <StatusScope<CollectionKind>
                  label={t('m5s3.collection.kindLabel')}
                  value={createKind}
                  options={(['GENERIC', 'SHOPPING'] as const).map((value) => ({
                    value,
                    label: t(`m5s3.collection.kind.${value}`),
                  }))}
                  onChange={setCreateKind}
                />
                <label htmlFor="create-collection-title">
                  {t('common.title')}
                </label>
                <input
                  ref={nameInputRef}
                  id="create-collection-title"
                  name="title"
                  required
                  maxLength={200}
                />
                <button type="submit" disabled={createCollection.isPending}>
                  {createCollection.isPending
                    ? t('common.saving')
                    : t('common.save')}
                </button>
                {createCollection.error ? (
                  <ProblemState error={createCollection.error} />
                ) : null}
                <button
                  type="button"
                  className="tertiary"
                  disabled={createCollection.isPending}
                  onClick={requestClose}
                >
                  {t('common.cancel')}
                </button>
              </fieldset>
            </form>
          )}
        </SharedContentSheet>
      </section>
    </div>
  );
}
