import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { CollectionDetail } from '../api/generated/models/CollectionDetail';
import {
  type DeleteFocusTarget,
  PLANNING_DELETE_FOCUS_STATE_KEY,
} from '../client/deleteFocusTarget';
import { assertOnlineWrite } from '../client/connectivity';
import { authorSummaryQueryKeys } from '../client/authorSummaryConsumers';
import {
  clientProblemKind,
  normalizeClientError,
} from '../client/problemDetails';
import { captureQueryIdentity } from '../client/queryIdentity';
import { appRoutePath, collectionDetailPath } from '../client/routes';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { useTranslation } from '../i18n';
import { AddIcon, DestinationIcon } from './DestinationIcon';
import { ContentChevron, SharedContentSheet } from './SharedContentSheet';
import type { ShortTaskSheetHandle } from './ShortTaskSheet';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';
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

function nextCursor<T>(page: PageShape<T>): string | undefined {
  return page.nextCursor ?? undefined;
}

export function CollectionsOverviewPage({
  apis,
  spaceId,
}: {
  apis: SharedPlanningApis;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const createInFlightRef = useRef(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDirty, setCreateDirty] = useState(false);
  const createSheetRef = useRef<ShortTaskSheetHandle>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const createActionRef = useRef<HTMLButtonElement>(null);
  const collectionRefs = useRef(new Map<string, HTMLAnchorElement>());
  const restoredDeleteFocusRef = useRef(false);

  const collections = useInfiniteQuery({
    queryKey: ['m5-s3', 'collections', spaceId],
    queryFn: ({ pageParam }) =>
      apiCall(() =>
        apis.collections.listCollections({
          spaceId,
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
    mutationFn: (title: string) =>
      apiCall(() => {
        assertOnlineWrite();
        return apis.collections.createCollection({
          spaceId,
          collectionCreate: { title },
        });
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['m5-s3', 'collections', spaceId],
      });
    },
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
      authorSummaryQueryKeys.collections(spaceId),
    );
    createInFlightRef.current = true;
    createCollection.mutate(String(data.get('title')).trim(), {
      onSuccess: (created) => {
        if (
          !isCurrentQuery() ||
          ['unauthorized', 'permission', 'notFound'].includes(
            clientProblemKind(
              queryClient.getQueryState(
                authorSummaryQueryKeys.collections(spaceId),
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
        createSheetRef.current?.closeForNavigation(() =>
          navigate(collectionDetailPath(created.id)),
        );
      },
    });
  }

  return (
    <div className="page shared-content-page">
      <PageHeader
        before={
          <Link className="back-link" to={appRoutePath('more')}>
            {t('m5s3.common.shortBackToMore')}
          </Link>
        }
        title={t('m5s3.collection.overviewHeading')}
        action={
          <button
            ref={createActionRef}
            id="collection-title"
            type="button"
            onClick={() => {
              createCollection.reset();
              setCreateOpen(true);
            }}
          >
            <AddIcon /> {t('m5s3.collection.create')}
          </button>
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

        {collectionItems.length === 0 &&
        !collections.isLoading &&
        !collections.error ? (
          <p className="planning-empty">{t('m5s3.collection.emptyOverview')}</p>
        ) : (
          <ul className="content-overview-list content-overview-lists">
            {collectionItems.map((collection) => (
              <li className="planning-card-item" key={collection.id}>
                <Link
                  ref={(element) => {
                    if (element)
                      collectionRefs.current.set(collection.id, element);
                    else collectionRefs.current.delete(collection.id);
                  }}
                  className="content-overview-row"
                  to={collectionDetailPath(collection.id)}
                >
                  <span className="content-overview-icon">
                    <DestinationIcon icon="collections" />
                  </span>
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
                    {collection.items.length ? (
                      <p className="content-overview-preview">
                        {[...collection.items]
                          .sort((a, b) => a.position - b.position)
                          .slice(0, 3)
                          .map((item) => item.title)
                          .join(' · ')}
                      </p>
                    ) : null}
                  </div>
                  <ContentChevron />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {collections.hasNextPage ? (
          <button
            type="button"
            className="tertiary compact-action"
            onClick={() => void collections.fetchNextPage()}
            disabled={collections.isFetchingNextPage}
          >
            {collections.isFetchingNextPage
              ? t('m5s3.common.loadingMore')
              : t('m5s3.common.loadMore')}
          </button>
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
          }}
        >
          {(requestClose) => (
            <form
              onSubmit={submitCollection}
              className="form-grid planning-create-form"
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
                <label htmlFor="create-collection-title">
                  {t('m5s3.common.title')}
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
                    ? t('m5s3.common.saving')
                    : t('m5s3.common.save')}
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
