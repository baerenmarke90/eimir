import type { NotificationItem } from '../api/generated/models/NotificationItem';

/**
 * Receipt presentation for the three existing partner gestures (#455).
 * This module is presentation policy only: the server owns authorization,
 * pacing, preferences and read state.
 */
export const PARTNER_GESTURE_KINDS = [
  'THINKING_OF_YOU',
  'PARTNER_KISS',
  'PARTNER_CHECK_IN',
] as const;

export type PartnerGestureKind = (typeof PARTNER_GESTURE_KINDS)[number];

/** The reply the receipt may offer; each maps to an existing flow. */
export type PartnerGestureReply = 'THINKING' | 'KISS' | 'CHECK_IN';

export type PartnerGestureMotion = 'heart-pulse' | 'kiss' | 'calm-ring';

export interface PartnerGestureVariant {
  kind: PartnerGestureKind;
  motion: PartnerGestureMotion;
  /** Locale keys below `partnerGestureReceipt`. */
  copy: 'thinking' | 'kiss' | 'checkIn';
  reply: PartnerGestureReply;
}

export const PARTNER_GESTURE_VARIANTS: Record<
  PartnerGestureKind,
  PartnerGestureVariant
> = {
  THINKING_OF_YOU: {
    kind: 'THINKING_OF_YOU',
    motion: 'heart-pulse',
    copy: 'thinking',
    reply: 'THINKING',
  },
  PARTNER_KISS: {
    kind: 'PARTNER_KISS',
    motion: 'kiss',
    copy: 'kiss',
    reply: 'KISS',
  },
  PARTNER_CHECK_IN: {
    kind: 'PARTNER_CHECK_IN',
    motion: 'calm-ring',
    copy: 'checkIn',
    reply: 'CHECK_IN',
  },
};

export function isPartnerGestureKind(kind: string): kind is PartnerGestureKind {
  return (PARTNER_GESTURE_KINDS as readonly string[]).includes(kind);
}

export function isWishDateReceiptKind(kind: string): boolean {
  return (
    kind === 'WISH_DATE_PROPOSED' ||
    kind === 'WISH_DATE_COUNTERED' ||
    kind === 'WISH_DATE_ACCEPTED'
  );
}

export function isPartnerReceipt(item: NotificationItem): boolean {
  return (
    isPartnerGestureKind(item.kind) ||
    (isWishDateReceiptKind(item.kind) &&
      item.target?.concealed !== true &&
      Boolean(item.appointmentStart && item.target?.title))
  );
}

/**
 * The newest unread gesture from the partner that arrived after this shell
 * instance started and was never handled. Anything older stays only in the
 * Notification Center, so a normal app start never replays a receipt.
 */
export function selectArrivedGesture(
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
    if (!isPartnerReceipt(item)) continue;
    if (item.readAt || handled.has(item.id)) continue;
    if (item.actorId === accountId || item.actor?.id === accountId) continue;
    if (item.createdAt.getTime() <= notBefore) continue;
    if (!newest || item.createdAt > newest.createdAt) newest = item;
  }
  return newest;
}

export const PARTNER_GESTURE_RECEIPT_EVENT = 'eimir:partner-gesture-receipt';
export const PARTNER_RECEIPT_REFRESH_EVENT = 'eimir:partner-receipt-refresh';

/** A verified provider wake carries no notification content into the shell. */
export function requestPartnerReceiptRefresh(scope: string): void {
  window.dispatchEvent(
    new CustomEvent(PARTNER_RECEIPT_REFRESH_EVENT, { detail: scope }),
  );
}

export interface PartnerGestureReceiptRequest {
  /** `${accountId}:${spaceId}` of the shell that resolved the item. */
  scope: string;
  item: NotificationItem;
}

/**
 * Asks the mounted shell to present a receipt for a notification the user
 * deliberately opened (for example from a push). The same decoupled
 * window-event pattern as `postSnackbar`; the host rechecks scope, kind and
 * task contention before showing anything.
 */
export function requestPartnerGestureReceipt(
  request: PartnerGestureReceiptRequest,
): void {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined')
    return;
  if (!isPartnerGestureKind(request.item.kind)) return;
  window.dispatchEvent(
    new CustomEvent<PartnerGestureReceiptRequest>(
      PARTNER_GESTURE_RECEIPT_EVENT,
      { detail: request },
    ),
  );
}

/** Route state that asks Wir to open the viewer's own daily check-in. */
export const OPEN_OWN_DAILY_CHECK_IN_STATE = 'openOwnDailyCheckIn';

export function receiptScope(accountId: string, spaceId: string): string {
  return `${accountId}:${spaceId}`;
}
