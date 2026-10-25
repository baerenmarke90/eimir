import type { QueryClient } from '@tanstack/react-query';
import type { NotificationItem } from '../api/generated/models/NotificationItem';
import { assertOnlineWrite, isClientOnline } from './connectivity';
import {
  notificationUnreadCountQueryKey,
  notificationsListQueryKey,
} from './notificationQueries';
import { ClientProblemError } from './problemDetails';
import { captureAuthorizedQuery } from './queryIdentity';

type NotificationCache = {
  pages: Array<{
    items: NotificationItem[];
    nextCursor: string | null;
  }>;
  pageParams: unknown[];
};

type UnreadCount = { unreadCount: number };
type CounterOwner = {
  generation: number;
  lastLocal: UnreadCount | undefined;
};

/**
 * Local optimistic counter updates share an ownership generation. Independent
 * pending marks can undo their own delta; a newer server read cannot be
 * mistaken for another optimistic update.
 */
const counterOwners = new WeakMap<object, CounterOwner>();

/**
 * One admitted unread notification, from one authorized Query lifetime.
 * Used by both the header preview and the full notifications page.
 */
export function beginNotificationRead(
  client: QueryClient,
  spaceId: string,
  notificationId: string,
) {
  const listKey = notificationsListQueryKey(spaceId);
  const countKey = notificationUnreadCountQueryKey(spaceId);
  const ownsList = captureAuthorizedQuery(client, listKey);
  const ownsCount = captureAuthorizedQuery(client, countKey);
  if (!ownsList()) return null;

  const item = client
    .getQueryData<NotificationCache>(listKey)
    ?.pages.flatMap((page) => page.items)
    .find((entry) => entry.id === notificationId);
  if (!item || item.readAt) return null;

  // Cancellation happens before the local projection. Dispatch awaits it,
  // but the user sees the optimistic state without waiting for the network.
  const cancellation = Promise.all([
    client.cancelQueries({ queryKey: listKey, exact: true }),
    client.cancelQueries({ queryKey: countKey, exact: true }),
  ]);
  const optimisticItem = { ...item, readAt: new Date() };
  let admitted = false;
  if (ownsList()) {
    client.setQueryData<NotificationCache>(listKey, (current) => {
      if (!current || !ownsList()) return current;
      return {
        ...current,
        pages: current.pages.map((page) => ({
          ...page,
          items: page.items.map((entry) => {
            if (entry !== item || entry.readAt) return entry;
            admitted = true;
            return optimisticItem;
          }),
        })),
      };
    });
  }
  if (!admitted) return null;

  let counter: CounterOwner | null = null;
  let counterGeneration = -1;
  let decremented = false;
  const countQuery = client.getQueryCache().find({
    queryKey: countKey,
    exact: true,
  });
  if (countQuery && ownsCount()) {
    const current = client.getQueryData<UnreadCount>(countKey);
    counter = counterOwners.get(countQuery) ?? {
      generation: 0,
      lastLocal: current,
    };
    counterOwners.set(countQuery, counter);
    if (counter.lastLocal !== current) {
      counter.generation += 1;
      counter.lastLocal = current;
    }
    counterGeneration = counter.generation;
    if (current && current.unreadCount > 0) {
      client.setQueryData<UnreadCount>(countKey, (value) => {
        if (!value || !ownsCount() || value.unreadCount < 1) return value;
        decremented = true;
        return { ...value, unreadCount: value.unreadCount - 1 };
      });
      if (decremented) {
        counter.lastLocal = client.getQueryData<UnreadCount>(countKey);
      }
    }
  }

  function rollback() {
    if (!ownsList()) return;
    let restored = false;
    client.setQueryData<NotificationCache>(listKey, (current) => {
      if (!current || !ownsList()) return current;
      return {
        ...current,
        pages: current.pages.map((page) => ({
          ...page,
          items: page.items.map((entry) => {
            if (entry !== optimisticItem) return entry;
            restored = true;
            return item;
          }),
        })),
      };
    });

    // Do not write over a newer count read or another Query lifetime.
    if (
      !restored ||
      !decremented ||
      !counter ||
      counter.generation !== counterGeneration ||
      !ownsCount() ||
      client.getQueryData<UnreadCount>(countKey) !== counter.lastLocal
    )
      return;
    client.setQueryData<UnreadCount>(countKey, (current) =>
      current ? { ...current, unreadCount: current.unreadCount + 1 } : current,
    );
    counter.lastLocal = client.getQueryData<UnreadCount>(countKey);
  }

  async function perform(send: () => Promise<unknown>) {
    await cancellation;
    if (!ownsList()) throw new ClientProblemError('permission');
    assertOnlineWrite();
    await send();
  }

  async function refresh() {
    if (!ownsList()) return;
    const refetchType = isClientOnline() ? 'active' : 'none';
    const refreshes = [
      client.invalidateQueries({ queryKey: listKey, exact: true, refetchType }),
    ];
    if (ownsCount())
      refreshes.push(
        client.invalidateQueries({
          queryKey: countKey,
          exact: true,
          refetchType,
        }),
      );
    await Promise.all(refreshes);
  }

  return {
    notificationId,
    spaceId,
    isCurrentList: ownsList,
    perform,
    rollback,
    refresh,
  };
}

export type NotificationReadAttempt = NonNullable<
  ReturnType<typeof beginNotificationRead>
>;
