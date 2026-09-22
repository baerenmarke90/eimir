import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import { ProfilesApi } from '../api/generated/apis/ProfilesApi';
import type { NotificationItem } from '../api/generated/models/NotificationItem';
import { Configuration } from '../api/generated/runtime';
import { formatRelativeTime } from '../client/formatRecency';
import { engagementTargetPath, opaqueNextCursor } from '../client/m4Product';
import {
  notificationsListQueryKey,
  notificationUnreadCountQueryKey,
} from '../client/notificationQueries';
import { getNotificationItemTitle } from '../client/notificationTitle';
import { MORE_NOTIFICATIONS_ROUTE } from '../client/routes';
import { useDismissiblePopover } from '../client/useDismissiblePopover';
import { useTranslation } from '../i18n';
import { DestinationIcon } from './DestinationIcon';
import { AuthorAvatar } from './PersonIdentity';
import { containModalTabFocus, useModalLifecycle } from './useModalLifecycle';

function useIsCompact(query = '(max-width: 640px)'): boolean {
  const [isCompact, setIsCompact] = useState(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return false;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }
    const media = window.matchMedia(query);
    setIsCompact(media.matches);

    const listener = (event: MediaQueryListEvent) => {
      setIsCompact(event.matches);
    };

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
    media.addListener?.(listener);
    return () => media.removeListener?.(listener);
  }, [query]);

  return isCompact;
}

export interface HeaderNotificationsMenuProps {
  apiBaseUrl: string;
  accessToken: string;
  spaceId: string;
  unreadCount: number;
  currentAccountId?: string;
}

const PREVIEW_LIMIT = 5;

export function HeaderNotificationsMenu({
  apiBaseUrl,
  accessToken,
  spaceId,
  unreadCount,
  currentAccountId,
}: HeaderNotificationsMenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isOpen, close, toggle, triggerRef, panelRef } =
    useDismissiblePopover();
  const compactDialogRef = useRef<HTMLDivElement>(null);
  const compactNavigatingRef = useRef(false);

  const configuration = useMemo(
    () =>
      new Configuration({
        basePath: apiBaseUrl,
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    [apiBaseUrl, accessToken],
  );

  const notificationsApi = useMemo(
    () => new NotificationsApi(configuration),
    [configuration],
  );

  const profilesApi = useMemo(
    () => new ProfilesApi(configuration),
    [configuration],
  );

  const listKey = notificationsListQueryKey(spaceId);
  const unreadKey = notificationUnreadCountQueryKey(spaceId);

  const notificationsQuery = useInfiniteQuery({
    queryKey: listKey,
    queryFn: ({ pageParam }) =>
      notificationsApi.getNotifications({
        spaceId,
        cursor: pageParam,
        limit: 20,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: opaqueNextCursor,
    enabled: Boolean(spaceId && accessToken && isOpen),
    retry: false,
  });

  const allItems =
    notificationsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const previewItems = allItems.slice(0, PREVIEW_LIMIT);

  const bellAriaLabel =
    unreadCount > 0
      ? t('navigation.notificationsWithUnread', { count: unreadCount })
      : t('navigation.notifications');

  const isCompact = useIsCompact();

  async function handleNotificationClick(item: NotificationItem) {
    const path = engagementTargetPath(item.targetType, item.targetId);

    if (!item.readAt) {
      // Optimistic update of unread count
      queryClient.setQueryData<{ unreadCount: number }>(unreadKey, (old) => {
        if (!old) return old;
        return { unreadCount: Math.max(0, old.unreadCount - 1) };
      });

      // Optimistic update of list
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
              it.id === item.id ? { ...it, readAt: new Date() } : it,
            ),
          })),
        };
      });

      // Perform API call
      notificationsApi
        .markNotificationRead({ notificationId: item.id, spaceId })
        .catch(() => {
          void queryClient.invalidateQueries({ queryKey: unreadKey });
          void queryClient.invalidateQueries({ queryKey: listKey });
        });
    }

    if (isCompact && path) compactNavigatingRef.current = true;
    close();

    if (path) {
      navigate(path);
    }
  }

  useEffect(() => {
    if (isOpen && isCompact) compactNavigatingRef.current = false;
  }, [isCompact, isOpen]);

  useModalLifecycle({
    active: isOpen && isCompact,
    initialFocusRef: compactDialogRef,
    restoreFocusRef: triggerRef,
    deferRestoreFocus: true,
    shouldRestoreFocus: () => !compactNavigatingRef.current,
  });

  const popoverContent = (
    <section
      ref={panelRef as React.RefObject<HTMLElement>}
      className={`header-notifications-popover${isCompact ? ' header-notifications-bottom-sheet' : ''}`}
      aria-label={t('m5s5.notifications.previewTitle')}
      hidden={!isOpen}
    >
      <div className="header-notifications-head">
        <h2 className="header-notifications-title">
          {t('m5s5.notifications.previewTitle')}
        </h2>
      </div>

      <div className="header-notifications-body">
        {notificationsQuery.isLoading ? (
          <div
            className="header-notifications-loading"
            role="status"
            aria-busy="true"
          >
            {t('states.loading.title')}
          </div>
        ) : previewItems.length === 0 ? (
          <div className="header-notifications-empty" role="status">
            {t('m5s5.notifications.emptyPreview')}
          </div>
        ) : (
          <ul className="header-notifications-list">
            {previewItems.map((item) => {
              const isUnread = !item.readAt;
              const isOwn = Boolean(
                currentAccountId && item.actor?.id === currentAccountId,
              );
              const title = getNotificationItemTitle(item, t, currentAccountId);
              const relativeTime = formatRelativeTime(item.createdAt, t);

              return (
                <li key={item.id} className="header-notifications-item-wrapper">
                  <button
                    type="button"
                    className={`header-notifications-item${isUnread ? ' header-notifications-item-unread' : ''}`}
                    onClick={() => handleNotificationClick(item)}
                  >
                    <div
                      className="header-notifications-item-avatar"
                      aria-hidden="true"
                    >
                      {item.actor ? (
                        <AuthorAvatar
                          author={
                            isOwn
                              ? {
                                  ...item.actor,
                                  displayName: t('m5s5.activity.you'),
                                }
                              : item.actor
                          }
                          profilesApi={profilesApi}
                          spaceId={spaceId}
                          size="small"
                        />
                      ) : item.kind === 'THINKING_OF_YOU' ? (
                        <span
                          className="notification-heart-icon"
                          aria-hidden="true"
                        >
                          ♥
                        </span>
                      ) : (
                        <span className="header-notifications-fallback-icon">
                          <DestinationIcon icon="notifications" />
                        </span>
                      )}
                    </div>
                    <div className="header-notifications-item-content">
                      <p className="header-notifications-item-title">{title}</p>
                      <time
                        className="header-notifications-item-time"
                        dateTime={item.createdAt.toISOString()}
                      >
                        {relativeTime}
                      </time>
                    </div>
                    {isUnread ? (
                      <span
                        className="header-notification-unread-dot"
                        aria-hidden="true"
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="header-notifications-footer">
        <Link
          to={MORE_NOTIFICATIONS_ROUTE}
          className="header-notifications-all-link"
          onClick={() => {
            if (isCompact) compactNavigatingRef.current = true;
            close();
          }}
        >
          {t('m5s5.notifications.showAll')}
        </Link>
      </div>
    </section>
  );

  return (
    <div className="header-notifications-menu">
      <button
        ref={triggerRef as React.RefObject<HTMLButtonElement>}
        type="button"
        className="shell-utility-link header-notifications-trigger"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={bellAriaLabel}
        title={bellAriaLabel}
        onClick={(e) => {
          e.preventDefault();
          toggle();
        }}
      >
        <span className="shell-nav-icon" aria-hidden="true">
          <DestinationIcon icon="notifications" />
          {unreadCount > 0 ? (
            <span className="notification-dot" aria-hidden="true" />
          ) : null}
        </span>
      </button>

      {/* Mobile: Viewport-level bottom sheet portalled outside header containing block */}
      {isCompact && isOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={compactDialogRef}
              className="header-notifications-portal"
              data-testid="header-notifications-portal"
              role="dialog"
              aria-modal="true"
              aria-label={t('m5s5.notifications.previewTitle')}
              tabIndex={-1}
              onKeyDown={(event) => {
                containModalTabFocus(event, panelRef.current, {
                  wrapFromOutside: true,
                });
              }}
            >
              <div
                className="header-notifications-backdrop"
                aria-hidden="true"
                onClick={() => close()}
              />
              {popoverContent}
            </div>,
            document.body,
          )
        : null}

      {/* Desktop: Anchored popover in normal header flow */}
      {!isCompact ? popoverContent : null}
    </div>
  );
}
