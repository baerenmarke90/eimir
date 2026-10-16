import { type FormEvent, useEffect, useRef } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import type { CollectionDetail } from '../api/generated/models/CollectionDetail';
import {
  type DeleteFocusTarget,
  PLANNING_DELETE_FOCUS_STATE_KEY,
} from '../client/deleteFocusTarget';
import { normalizeClientError } from '../client/problemDetails';
import { appRoutePath, collectionDetailPath } from '../client/routes';
import type { SharedPlanningApis } from '../client/sharedPlanning';
import { useTranslation } from '../i18n';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';
import './SharedPlanningPages.css';

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
  const queryClient = useQueryClient();
  const createActionRef = useRef<HTMLElement>(null);
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
    mutationFn: (title: string) =>
      apiCall(() =>
        apis.collections.createCollection({
          spaceId,
          collectionCreate: { title },
        }),
      ),
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
    const form = event.currentTarget;
    const data = new FormData(form);
    createCollection.mutate(String(data.get('title')).trim(), {
      onSuccess: () => form.reset(),
    });
  }

  return (
    <div className="page planning-page planning-sanctuary">
      <PageHeader
        before={
          <Link className="back-link" to={appRoutePath('more')}>
            {t('m5s3.common.backToMore')}
          </Link>
        }
        eyebrow={t('navigation.more')}
        title={t('m5s3.collection.heading')}
        description={t('m5s3.collection.intro')}
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
          <ul className="planning-list">
            {collectionItems.map((collection) => (
              <li className="planning-card-item" key={collection.id}>
                <Link
                  ref={(element) => {
                    if (element)
                      collectionRefs.current.set(collection.id, element);
                    else collectionRefs.current.delete(collection.id);
                  }}
                  className="planning-card planning-card-link"
                  to={collectionDetailPath(collection.id)}
                >
                  <div className="planning-card-copy">
                    <h3>{collection.title}</h3>
                  </div>
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

        <details className="planning-create" id="collection-create-details">
          <summary ref={createActionRef} id="collection-title">
            {t('m5s3.collection.create')}
          </summary>
          <form
            onSubmit={submitCollection}
            className="form-grid planning-create-form"
          >
            <label htmlFor="create-collection-title">
              {t('m5s3.common.title')}
            </label>
            <input
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
          </form>
        </details>
      </section>
    </div>
  );
}
