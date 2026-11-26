import type { NotificationItem } from '../api/generated/models/NotificationItem';
import {
  isPartnerGestureKind,
  isWishDateReceiptKind,
} from './partnerGestureReceipt';

export const NOTIFICATION_WAKE_EVENT = 'eimir:notification-wake';

export interface NotificationWakeScope {
  accountId: string;
  apiBaseUrl: string;
  spaceId: string;
}

export function reportNotificationWake(scope: NotificationWakeScope): void {
  window.dispatchEvent(
    new CustomEvent<NotificationWakeScope>(NOTIFICATION_WAKE_EVENT, {
      detail: scope,
    }),
  );
}

export const NOTIFICATION_OPENED_EVENT = 'eimir:notification-opened';

export interface NotificationOpenedDetail {
  /** `${accountId}:${spaceId}` of the shell that resolved the notification. */
  scope: string;
  notificationId: string;
}

/**
 * A notification was opened from outside the app (a system or browser push).
 * It is handled exactly like one opened from Wir: a foreground receipt for it
 * leaves and none is shown later.
 */
export function reportNotificationOpened(detail: NotificationOpenedDetail) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined')
    return;
  window.dispatchEvent(
    new CustomEvent<NotificationOpenedDetail>(NOTIFICATION_OPENED_EVENT, {
      detail,
    }),
  );
}

export function notificationArrivalKey(item: NotificationItem): string {
  // A new event can replace a coalesced inbox row without changing its ID.
  return `${item.id}:${item.sourceEventId}`;
}

/** Only the current, authorized in-app inbox can supply foreground arrivals. */
export function selectArrivedNotification(
  items: readonly NotificationItem[],
  {
    accountId,
    notBefore,
    handled,
  }: {
    accountId: string;
    notBefore: number;
    handled: ReadonlySet<string>;
  },
): NotificationItem | null {
  let newest: NotificationItem | null = null;
  for (const item of items) {
    if (item.readAt || handled.has(notificationArrivalKey(item))) continue;
    if (item.createdAt.getTime() <= notBefore) continue;
    const wishDate = isWishDateReceiptKind(item.kind);
    if (
      wishDate &&
      (!item.appointmentStart || !item.target?.title || item.target.concealed)
    )
      continue;
    if (
      (wishDate || isPartnerGestureKind(item.kind)) &&
      (item.actorId === accountId || item.actor?.id === accountId)
    )
      continue;
    if (!newest || item.createdAt > newest.createdAt) newest = item;
  }
  return newest;
}
