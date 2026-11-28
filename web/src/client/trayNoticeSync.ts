import type { QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import { notificationUnreadCountQueryKey } from './notificationQueries';

/** A device notification tray that can list and withdraw eimir. notices. */
export type NotificationTray = {
  delivered(): Promise<string[]>;
  withdraw(notificationIds: string[]): Promise<void>;
};

/** Notices answered per lookup; the server bounds the same number. */
const LOOKUP_LIMIT = 50;
/** Several reads in a row (mark all, a game page) settle into one lookup. */
const SETTLE_DELAY_MS = 400;

/**
 * Withdraws tray notices that need no attention any more (#2345): read in the
 * inbox, on a game page or on another device, expired, or no longer current.
 *
 * Every read refreshes the unread count, and the count is re-read on focus and
 * while the app runs, so its successful refetch is the one trigger that covers
 * every path. Only what the server reports as settled is withdrawn; a failed
 * lookup leaves the tray as it is.
 */
export async function syncTrayNotices(
  tray: NotificationTray,
  notificationsApi: Pick<NotificationsApi, 'findSettledNotifications'>,
  spaceId: string,
  signal?: AbortSignal,
): Promise<void> {
  const delivered = (await tray.delivered()).slice(0, LOOKUP_LIMIT);
  if (delivered.length === 0 || signal?.aborted) return;
  const { settledIds } = await notificationsApi.findSettledNotifications(
    {
      spaceId,
      settledNotificationsQuery: { notificationIds: delivered },
    },
    { signal },
  );
  if (settledIds.length === 0 || signal?.aborted) return;
  await tray.withdraw(settledIds);
}

function isUnreadCountOf(queryKey: readonly unknown[], spaceId: string) {
  const expected = notificationUnreadCountQueryKey(spaceId);
  return (
    queryKey.length === expected.length &&
    expected.every((part, index) => queryKey[index] === part)
  );
}

export function useTrayNoticeSync({
  tray,
  notificationsApi,
  queryClient,
  spaceId,
}: {
  /** `null` where the platform has no tray to sync (Web, iOS for now). */
  tray: NotificationTray | null;
  notificationsApi: Pick<NotificationsApi, 'findSettledNotifications'>;
  queryClient: QueryClient;
  spaceId: string;
}): void {
  useEffect(() => {
    if (!tray) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const schedule = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        controller?.abort();
        controller = new AbortController();
        void syncTrayNotices(
          tray,
          notificationsApi,
          spaceId,
          controller.signal,
        ).catch(() => undefined);
      }, SETTLE_DELAY_MS);
    };
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type === 'updated' &&
        event.action.type === 'success' &&
        isUnreadCountOf(event.query.queryKey, spaceId)
      )
        schedule();
    });
    // Notices settled while the app was closed leave at start.
    schedule();
    return () => {
      unsubscribe();
      if (timer !== undefined) clearTimeout(timer);
      controller?.abort();
    };
  }, [notificationsApi, queryClient, spaceId, tray]);
}
