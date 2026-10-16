import {
  type FormEvent,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { ActivityItem } from '../api/generated/models/ActivityItem';
import type { NotificationItem } from '../api/generated/models/NotificationItem';
import type { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import type { SearchKind } from '../api/generated/models/SearchKind';
import type { SearchResult } from '../api/generated/models/SearchResult';
import { authorDisplayName } from '../client/authorPresentation';
import {
  engagementTargetPath,
  opaqueNextCursor,
  searchResultPath,
  type M4ProductApis,
} from '../client/m4Product';
import {
  notificationsListQueryKey,
  notificationUnreadCountQueryKey,
} from '../client/notificationQueries';
import { getNotificationItemTitle } from '../client/notificationTitle';
import { normalizeClientError } from '../client/problemDetails';
import { usePartnerNickname } from '../client/partnerNickname';
import { taskOriginPath, useTaskOrigin } from '../client/taskOrigin';
import { resolvedLocale, useTranslation } from '../i18n';
import { DestinationIcon } from './DestinationIcon';
import { AuthorAvatar } from './PersonIdentity';
import { PageHeader } from './PageHeader';
import { ProblemState } from './ProblemState';
import { UiState } from './UiState';
import './M4ProductPages.css';

const PAGE_SIZE = 20;

const SEARCH_KINDS: readonly SearchKind[] = [
  'MEMORY',
  'HEART_MOMENT',
  'MILESTONE',
  'WISH',
  'PLAN',
  'PLACE',
  'CHAPTER',
  'COLLECTION',
  'COLLECTION_ITEM',
  'PRIVATE_NOTE',
  'GIFT_IDEA',
  'PRIVATE_COLLECTION',
  'PRIVATE_COLLECTION_ITEM',
];

async function apiCall<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

function formatDate(value: Date | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'medium',
  }).format(value);
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat(resolvedLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

function isPlainPrimaryClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

function SearchResultCard({
  item,
  onOpen,
}: {
  item: SearchResult;
  onOpen?: (event: MouseEvent<HTMLAnchorElement>, path: string) => void;
}) {
  const { t } = useTranslation();
  const path = searchResultPath(item.type, item.id, item.parentId);
  const date = formatDate(item.occurredOn);

  const inner = (
    <div
      className={`search-result-card search-result-${item.type.toLowerCase()} eimir-motion-lift`}
    >
      <div className="search-result-content">
        <span className="search-result-kind">
          {t(`m5s5.kind.${item.type}`)}
          {item.scope !== 'SHARED' && ` · ${t(`m5s5.scope.${item.scope}`)}`}
        </span>
        <h3 className="search-result-title">
          {item.title || t('m5s5.search.resultFallback')}
        </h3>
        {item.excerpt && (
          <p className="search-result-excerpt">{item.excerpt}</p>
        )}
        {date && <span className="search-result-date">{date}</span>}
      </div>
    </div>
  );

  return (
    <li className="search-result-wrapper">
      {path ? (
        <Link
          className="search-result-link"
          to={path}
          onClick={(event) => onOpen?.(event, path)}
        >
          {inner}
        </Link>
      ) : (
        inner
      )}
    </li>
  );
}

export function SearchProductPage({
  apis,
  spaceId,
}: {
  apis: M4ProductApis;
  spaceId: string;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { captureOrigin, resolveOrigin, registerOriginMetadata } =
    useTaskOrigin();
  const [draftQuery, setDraftQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [kind, setKind] = useState<SearchKind | ''>('');

  const returnKey = (location.state as { taskReturnKey?: unknown } | null)
    ?.taskReturnKey;
  const restoredKeyRef = useRef<unknown>(undefined);
  useEffect(() => {
    if (restoredKeyRef.current === returnKey) return;
    restoredKeyRef.current = returnKey;
    const candidateOrigin = resolveOrigin(returnKey);
    const returnOrigin =
      candidateOrigin?.to === taskOriginPath(location.pathname, location.search)
        ? candidateOrigin
        : null;
    if (returnOrigin?.searchQuery) {
      setDraftQuery(returnOrigin.searchQuery);
      setSubmittedQuery(returnOrigin.searchQuery);
      setKind((returnOrigin.searchKind as SearchKind | undefined) ?? '');
    }
  }, [returnKey, resolveOrigin, location.pathname, location.search]);

  useEffect(
    () =>
      registerOriginMetadata({
        searchQuery: submittedQuery || undefined,
        searchKind: kind || undefined,
      }),
    [submittedQuery, kind, registerOriginMetadata],
  );

  const searchQuery = useInfiniteQuery({
    queryKey: ['m5-s5', 'search', spaceId, submittedQuery, kind],
    queryFn: ({ pageParam }) =>
      apiCall(() =>
        apis.search.searchSpaceContent({
          spaceId,
          q: submittedQuery,
          type: kind ? [kind] : undefined,
          cursor: pageParam,
          limit: PAGE_SIZE,
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: opaqueNextCursor,
    enabled: submittedQuery.length > 0,
    retry: false,
  });

  const items = searchQuery.data?.pages.flatMap((page) => page.items) ?? [];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedQuery(draftQuery.trim());
  }

  return (
    <div className="page m4-product-page">
      <PageHeader
        eyebrow={t('m5s5.search.eyebrow')}
        title={t('m5s5.search.title')}
        description={t('m5s5.search.intro')}
      />

      <form className="layout-panel m4-toolbar" onSubmit={submit}>
        <div className="m4-toolbar-row">
          <div className="field-group m4-search-field">
            <label htmlFor="m4-search-query">{t('m5s5.search.label')}</label>
            <div className="m4-search-input-shell">
              <span className="m4-search-input-icon" aria-hidden="true">
                <DestinationIcon icon="search" />
              </span>
              <input
                id="m4-search-query"
                type="search"
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.currentTarget.value)}
                placeholder={t('m5s5.search.placeholder')}
                autoComplete="off"
              />
            </div>
          </div>
          <div className="field-group">
            <label htmlFor="m4-search-kind">{t('m5s5.search.typeLabel')}</label>
            <select
              id="m4-search-kind"
              value={kind}
              onChange={(event) =>
                setKind(event.currentTarget.value as SearchKind | '')
              }
            >
              <option value="">{t('m5s5.search.allTypes')}</option>
              {SEARCH_KINDS.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {t(`m5s5.kind.${candidate}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="m4-toolbar-submit">
            <button
              type="submit"
              disabled={!draftQuery.trim() || searchQuery.isFetching}
            >
              {searchQuery.isFetching && !searchQuery.isFetchingNextPage
                ? t('m5s5.search.searching')
                : t('m5s5.search.submit')}
            </button>
          </div>
        </div>
      </form>

      {!submittedQuery ? (
        <UiState
          kind="empty"
          title={t('m5s5.search.startTitle')}
          body={t('m5s5.search.startBody')}
        />
      ) : null}
      {searchQuery.isLoading ? (
        <UiState kind="loading" title={t('m5s5.search.searching')} />
      ) : null}
      {searchQuery.error ? (
        <ProblemState
          error={searchQuery.error}
          onRetry={() => void searchQuery.refetch()}
        />
      ) : null}
      {submittedQuery && searchQuery.data && items.length === 0 ? (
        <UiState
          kind="empty"
          title={t('m5s5.search.emptyTitle')}
          body={t('m5s5.search.emptyBody')}
        />
      ) : null}
      {items.length > 0 ? (
        <section className="m4-results" aria-live="polite">
          <h2 className="m4-results-heading">
            {t('m5s5.search.resultsHeading')}
          </h2>
          <ul className="m4-list layout-columns layout-columns-dense">
            {items.map((item) => (
              <SearchResultCard
                key={`${item.type}:${item.id}`}
                item={item}
                onOpen={(event, path) => {
                  if (!isPlainPrimaryClick(event)) return;
                  const taskOriginKey = captureOrigin();
                  if (!taskOriginKey) return;
                  event.preventDefault();
                  void navigate(path, { state: { taskOriginKey } });
                }}
              />
            ))}
          </ul>
          {searchQuery.hasNextPage ? (
            <button
              type="button"
              className="secondary"
              onClick={() => void searchQuery.fetchNextPage()}
              disabled={searchQuery.isFetchingNextPage}
            >
              {searchQuery.isFetchingNextPage
                ? t('m5s5.search.loadingMore')
                : t('m5s5.search.loadMore')}
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function ActivityCard({
  item,
  profilesApi,
  spaceId,
  currentAccountId,
  onOpen,
}: {
  item: ActivityItem;
  profilesApi?: ProfilesApi | null;
  spaceId: string;
  currentAccountId?: string;
  onOpen?: (event: MouseEvent<HTMLAnchorElement>, path: string) => void;
}) {
  const { t } = useTranslation();
  const { relationshipLabel } = usePartnerNickname();
  const path = engagementTargetPath(item.targetType, item.targetId);

  const isOwn = Boolean(
    currentAccountId && item.actor?.id === currentAccountId,
  );
  const actorName = isOwn
    ? t('m5s5.activity.you')
    : item.actor
      ? item.actor.isFormerMember
        ? authorDisplayName(item.actor)
        : relationshipLabel(
            item.actor.id,
            item.actor.displayName,
            t('couplePresencePartnerFallback'),
          )
      : undefined;

  const actionText = isOwn
    ? t(`m5s5.activityActionOwn.${item.kind}`)
    : item.actor
      ? t(`m5s5.activityAction.${item.kind}`)
      : t(`m5s5.activityKind.${item.kind}`);

  const inner = (
    <div
      className={`activity-card ${path ? 'activity-card-interactive eimir-motion-lift' : 'activity-card-static'} activity-card-${item.targetType?.toLowerCase() ?? 'unknown'}`}
    >
      <div className="activity-card-header">
        {item.actor ? (
          <AuthorAvatar
            author={
              isOwn
                ? { ...item.actor, displayName: t('m5s5.activity.you') }
                : item.actor
            }
            profilesApi={profilesApi}
            spaceId={spaceId}
            size="small"
          />
        ) : null}
        <div className="activity-card-actor-copy">
          <p className="activity-card-title">
            {actorName ? (
              <>
                <strong>{actorName}</strong> {actionText}
              </>
            ) : (
              actionText
            )}
          </p>
          <time
            className="activity-card-date"
            dateTime={item.occurredAt.toISOString()}
          >
            {formatDateTime(item.occurredAt)}
          </time>
        </div>
        {path ? (
          <span className="activity-card-chevron" aria-hidden="true">
            ›
          </span>
        ) : null}
      </div>
      {item.target?.title ? (
        <div className="activity-card-target">
          <span className="activity-card-target-title">
            {item.target.title}
          </span>
        </div>
      ) : null}
    </div>
  );

  return (
    <li className="activity-result-wrapper">
      {path ? (
        <Link
          className="activity-result-link"
          to={path}
          onClick={(event) => onOpen?.(event, path)}
        >
          {inner}
        </Link>
      ) : (
        inner
      )}
    </li>
  );
}

export function ActivityProductPage({
  apis,
  spaceId,
  profilesApi,
  currentAccountId,
}: {
  apis: M4ProductApis;
  spaceId: string;
  profilesApi?: ProfilesApi | null;
  currentAccountId?: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { captureOrigin } = useTaskOrigin();
  const activityQuery = useInfiniteQuery({
    queryKey: ['m5-s5', 'activity', spaceId],
    queryFn: ({ pageParam }) =>
      apiCall(() =>
        apis.activity.getActivity({
          spaceId,
          cursor: pageParam,
          limit: PAGE_SIZE,
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: opaqueNextCursor,
    retry: false,
  });
  const items = activityQuery.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="page m4-product-page">
      <PageHeader
        eyebrow={t('m5s5.activity.eyebrow')}
        title={t('m5s5.activity.title')}
        description={t('m5s5.activity.intro')}
        action={
          <button
            type="button"
            className="secondary compact-action"
            onClick={() => void activityQuery.refetch()}
            disabled={activityQuery.isFetching}
          >
            {activityQuery.isFetching && !activityQuery.isFetchingNextPage
              ? t('m5s5.common.refreshing')
              : t('m5s5.common.refresh')}
          </button>
        }
      />
      {activityQuery.isLoading ? (
        <UiState kind="loading" title={t('states.loading.title')} />
      ) : null}
      {activityQuery.error ? (
        <ProblemState
          error={activityQuery.error}
          onRetry={() => void activityQuery.refetch()}
        />
      ) : null}
      {activityQuery.data && items.length === 0 ? (
        <UiState
          kind="empty"
          title={t('m5s5.activity.emptyTitle')}
          body={t('m5s5.activity.emptyBody')}
        />
      ) : null}
      {items.length > 0 ? (
        <section className="m4-results" aria-live="polite">
          <ul className="m4-list layout-columns layout-columns-dense">
            {items.map((item) => (
              <ActivityCard
                key={item.id}
                item={item}
                profilesApi={profilesApi}
                spaceId={spaceId}
                currentAccountId={currentAccountId}
                onOpen={(event, path) => {
                  if (!isPlainPrimaryClick(event)) return;
                  const taskOriginKey = captureOrigin();
                  if (!taskOriginKey) return;
                  event.preventDefault();
                  void navigate(path, { state: { taskOriginKey } });
                }}
              />
            ))}
          </ul>
          {activityQuery.hasNextPage ? (
            <button
              type="button"
              className="secondary"
              onClick={() => void activityQuery.fetchNextPage()}
              disabled={activityQuery.isFetchingNextPage}
            >
              {activityQuery.isFetchingNextPage
                ? t('m5s5.activity.loadingMore')
                : t('m5s5.activity.loadMore')}
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function NotificationCard({
  item,
  spaceId,
  profilesApi,
  currentAccountId,
  onMarkRead,
  isMarkingRead,
  onOpen,
}: {
  item: NotificationItem;
  spaceId: string;
  profilesApi?: ProfilesApi | null;
  currentAccountId?: string;
  onMarkRead: (id: string) => void;
  isMarkingRead: boolean;
  onOpen?: (event: MouseEvent<HTMLAnchorElement>, path: string) => void;
}) {
  const { t } = useTranslation();
  const path = engagementTargetPath(item.targetType, item.targetId);
  const isOwn = Boolean(
    currentAccountId && item.actor?.id === currentAccountId,
  );
  const titleContent = getNotificationItemTitle(item, t, currentAccountId);

  const inner = (
    <div
      className={`m4-item eimir-motion-lift ${path ? 'm4-item-interactive' : 'm4-item-static'}${item.readAt ? '' : ' m4-item-unread'}`}
    >
      <div className="m4-notification-header">
        {item.actor ? (
          <AuthorAvatar
            author={
              isOwn
                ? { ...item.actor, displayName: t('m5s5.activity.you') }
                : item.actor
            }
            profilesApi={profilesApi}
            spaceId={spaceId}
            size="small"
          />
        ) : item.kind === 'THINKING_OF_YOU' ? (
          <span className="notification-heart-icon" aria-hidden="true">
            ♥
          </span>
        ) : null}
        <div className="m4-notification-copy">
          <p className="m4-notification-title">{titleContent}</p>
          <time
            className="m4-item-meta"
            dateTime={item.createdAt.toISOString()}
          >
            {formatDateTime(item.createdAt)}
          </time>
        </div>
        {path ? (
          <span className="activity-card-chevron" aria-hidden="true">
            ›
          </span>
        ) : !item.readAt ? (
          <button
            type="button"
            className="secondary compact-action m4-mark-read-btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onMarkRead(item.id);
            }}
            disabled={isMarkingRead}
          >
            {isMarkingRead
              ? t('m5s5.notifications.markingRead')
              : t('m5s5.notifications.markRead')}
          </button>
        ) : (
          <span className="m4-item-kind m4-read-status">
            {t('m5s5.notifications.read')}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <li className="m4-notification-wrapper">
      {path ? (
        <Link
          className="m4-notification-link"
          to={path}
          onClick={(event) => {
            if (!item.readAt) {
              onMarkRead(item.id);
            }
            onOpen?.(event, path);
          }}
        >
          {inner}
        </Link>
      ) : (
        inner
      )}
    </li>
  );
}

export function NotificationsProductPage({
  apis,
  spaceId,
  profilesApi,
  currentAccountId,
}: {
  apis: M4ProductApis;
  spaceId: string;
  profilesApi?: ProfilesApi | null;
  currentAccountId?: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { captureOrigin } = useTaskOrigin();
  const queryClient = useQueryClient();
  const listKey = notificationsListQueryKey(spaceId);
  const unreadKey = notificationUnreadCountQueryKey(spaceId);

  const notificationsQuery = useInfiniteQuery({
    queryKey: listKey,
    queryFn: ({ pageParam }) =>
      apiCall(() =>
        apis.notifications.getNotifications({
          spaceId,
          cursor: pageParam,
          limit: PAGE_SIZE,
        }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: opaqueNextCursor,
    retry: false,
  });
  const unreadQuery = useQuery({
    queryKey: unreadKey,
    queryFn: () =>
      apiCall(() => apis.notifications.getNotificationUnreadCount({ spaceId })),
    retry: false,
  });

  async function refreshNotifications() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: listKey }),
      queryClient.invalidateQueries({ queryKey: unreadKey }),
    ]);
  }

  const markOne = useMutation({
    mutationFn: (notificationId: string) =>
      apiCall(() =>
        apis.notifications.markNotificationRead({ notificationId, spaceId }),
      ),
    onMutate: async (notificationId: string) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: listKey }),
        queryClient.cancelQueries({ queryKey: unreadKey }),
      ]);

      // Track only whether *this* notification actually transitioned to read,
      // not a snapshot of the whole cache: two notifications can be marked
      // read in quick succession while both requests are still in flight, and
      // restoring a stale whole-cache snapshot on one's failure would also
      // wipe out the other's already-applied (and possibly already
      // successful) optimistic update.
      let markedReadNow = false;
      queryClient.setQueryData<{
        pages: Array<{ items: NotificationItem[]; nextCursor: string | null }>;
        pageParams: unknown[];
      }>(listKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.map((it) => {
              if (it.id !== notificationId || it.readAt) return it;
              markedReadNow = true;
              return { ...it, readAt: new Date() };
            }),
          })),
        };
      });

      if (markedReadNow) {
        queryClient.setQueryData<{ unreadCount: number }>(unreadKey, (old) => {
          if (!old) return old;
          return { unreadCount: Math.max(0, old.unreadCount - 1) };
        });
      }

      return { markedReadNow };
    },
    onError: (_err, notificationId, context) => {
      if (!context?.markedReadNow) return;
      queryClient.setQueryData<{
        pages: Array<{ items: NotificationItem[]; nextCursor: string | null }>;
        pageParams: unknown[];
      }>(listKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.map((it) =>
              it.id === notificationId ? { ...it, readAt: null } : it,
            ),
          })),
        };
      });
      queryClient.setQueryData<{ unreadCount: number }>(unreadKey, (old) => {
        if (!old) return old;
        return { unreadCount: old.unreadCount + 1 };
      });
    },
    onSettled: refreshNotifications,
  });
  const markAll = useMutation({
    mutationFn: () =>
      apiCall(() => apis.notifications.markAllNotificationsRead({ spaceId })),
    onSuccess: refreshNotifications,
  });

  const items =
    notificationsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const unreadCount = unreadQuery.data?.unreadCount;

  return (
    <div className="page m4-product-page">
      <PageHeader
        eyebrow={t('m5s5.notifications.eyebrow')}
        title={t('m5s5.notifications.title')}
        description={t('m5s5.notifications.intro')}
        action={
          <button
            type="button"
            className="secondary compact-action"
            onClick={() => {
              void notificationsQuery.refetch();
              void unreadQuery.refetch();
            }}
            disabled={notificationsQuery.isFetching || unreadQuery.isFetching}
          >
            {notificationsQuery.isFetching || unreadQuery.isFetching
              ? t('m5s5.common.refreshing')
              : t('m5s5.common.refresh')}
          </button>
        }
      />

      {unreadQuery.isLoading ? (
        <section
          className="layout-panel layout-panel-quiet m4-notification-summary-panel"
          aria-live="polite"
        >
          <p className="planning-meta">
            {t('m5s5.notifications.unreadLoading')}
          </p>
        </section>
      ) : unreadQuery.isSuccess && unreadCount !== undefined ? (
        <section
          className="layout-panel layout-panel-quiet m4-notification-summary-panel"
          aria-labelledby="m4-notification-summary"
        >
          <div className="m4-notification-summary">
            <h2
              id="m4-notification-summary"
              className="m4-unread-badge"
              aria-live="polite"
            >
              {t('m5s5.notifications.unreadCount', { count: unreadCount })}
            </h2>
            <button
              type="button"
              className="secondary"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending || unreadCount === 0}
            >
              {markAll.isPending
                ? t('m5s5.notifications.markingAllRead')
                : t('m5s5.notifications.markAllRead')}
            </button>
          </div>
        </section>
      ) : null}

      {notificationsQuery.isLoading ? (
        <UiState kind="loading" title={t('states.loading.title')} />
      ) : null}
      {notificationsQuery.error ? (
        <ProblemState
          error={notificationsQuery.error}
          onRetry={() => void notificationsQuery.refetch()}
        />
      ) : null}
      {unreadQuery.error ? (
        <ProblemState
          error={unreadQuery.error}
          onRetry={() => void unreadQuery.refetch()}
        />
      ) : null}
      {markOne.error ? <ProblemState error={markOne.error} /> : null}
      {markAll.error ? <ProblemState error={markAll.error} /> : null}

      {notificationsQuery.data && items.length === 0 ? (
        <UiState
          kind="empty"
          title={t('m5s5.notifications.emptyTitle')}
          body={t('m5s5.notifications.emptyBody')}
        />
      ) : null}

      {items.length > 0 ? (
        <section className="layout-panel" aria-live="polite">
          <ul className="m4-list m4-list-rows">
            {items.map((item) => (
              <NotificationCard
                key={item.id}
                item={item}
                spaceId={spaceId}
                profilesApi={profilesApi}
                currentAccountId={currentAccountId}
                onMarkRead={(id) => markOne.mutate(id)}
                isMarkingRead={
                  markOne.isPending && markOne.variables === item.id
                }
                onOpen={(event, path) => {
                  if (!isPlainPrimaryClick(event)) return;
                  const taskOriginKey = captureOrigin();
                  if (!taskOriginKey) return;
                  event.preventDefault();
                  void navigate(path, { state: { taskOriginKey } });
                }}
              />
            ))}
          </ul>
          {notificationsQuery.hasNextPage ? (
            <button
              type="button"
              className="secondary"
              onClick={() => void notificationsQuery.fetchNextPage()}
              disabled={notificationsQuery.isFetchingNextPage}
            >
              {notificationsQuery.isFetchingNextPage
                ? t('m5s5.notifications.loadingMore')
                : t('m5s5.notifications.loadMore')}
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
