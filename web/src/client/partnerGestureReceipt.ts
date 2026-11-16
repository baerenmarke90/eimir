import type { NotificationItem } from '../api/generated/models/NotificationItem';
import type { NotificationKind } from '../api/generated/models/NotificationKind';
import type { EimirIconName } from '../components/EimirIcon';

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

const WISH_DATE_RECEIPT_KINDS = [
  'WISH_DATE_PROPOSED',
  'WISH_DATE_COUNTERED',
  'WISH_DATE_ACCEPTED',
] as const;

export type WishDateReceiptKind = (typeof WISH_DATE_RECEIPT_KINDS)[number];

/** Round notices that carry the feature's own question (#1907 J1). */
export const WISH_SELECTION_RECEIPT_COPY = {
  WISH_SELECTION_SHARED: 'shared',
  WISH_SELECTION_READY: 'ready',
  WISH_SELECTION_RANDOM_REQUESTED: 'requested',
  WISH_SELECTION_RANDOM_ACCEPTED: 'accepted',
  WISH_SELECTION_RANDOM_DECLINED: 'declined',
} as const;

export type WishSelectionReceiptKind = keyof typeof WISH_SELECTION_RECEIPT_COPY;

export function isWishSelectionReceiptKind(
  kind: string,
): kind is WishSelectionReceiptKind {
  return Object.hasOwn(WISH_SELECTION_RECEIPT_COPY, kind);
}

export function isWishDateReceiptKind(
  kind: string,
): kind is WishDateReceiptKind {
  return (WISH_DATE_RECEIPT_KINDS as readonly string[]).includes(kind);
}

/**
 * The partner-caused notices that share the calm receipt: the same quiet
 * arrival as the check-in, told apart by a small badge on the partner's
 * avatar. `center` fills the avatar circle when no actor is available.
 * Owner-only and system kinds (data transfers, due reminders, gentle prompts)
 * are deliberately absent and keep the plain notification surface.
 */
export interface PartnerNoticeIcons {
  badge: EimirIconName;
  center: EimirIconName;
}

export const PARTNER_NOTICE_ICONS = {
  WISH_DATE_PROPOSED: { badge: 'kalender', center: 'kalender' },
  WISH_DATE_COUNTERED: { badge: 'kalender', center: 'kalender' },
  WISH_DATE_ACCEPTED: { badge: 'kalender', center: 'kalender' },
  WISH_SELECTION_SHARED: { badge: 'gemeinsam', center: 'wuensche' },
  WISH_SELECTION_READY: { badge: 'sparkle', center: 'wuensche' },
  WISH_SELECTION_RANDOM_REQUESTED: { badge: 'sparkle', center: 'wuensche' },
  WISH_SELECTION_RANDOM_ACCEPTED: { badge: 'sparkle', center: 'wuensche' },
  WISH_SELECTION_RANDOM_DECLINED: { badge: 'gemeinsam', center: 'wuensche' },
  HEART_HUNT_HIDDEN: { badge: 'sparkle', center: 'foto' },
  HEART_HUNT_FOUND: { badge: 'sparkle', center: 'foto' },
  GARDEN_SEED_ARRIVED: { badge: 'sparkle', center: 'spiele' },
  PLAN_CREATED: { badge: 'kalender', center: 'kalender' },
  PLAN_CHANGED: { badge: 'kalender', center: 'kalender' },
  PLAN_CANCELLED: { badge: 'close', center: 'kalender' },
  COMMENT_CREATED: { badge: 'nachrichten', center: 'nachrichten' },
  PHOTO_REACTION: { badge: 'foto', center: 'foto' },
  COUPLE_EXPERIENCE_SHARED: { badge: 'momente', center: 'momente' },
  REMINDER_CREATED: {
    badge: 'benachrichtigungen',
    center: 'benachrichtigungen',
  },
  PARTNER_JOINED: { badge: 'gemeinsam', center: 'gemeinsam' },
  COLLECTION_SENT: { badge: 'gemeinsam', center: 'listen' },
  ONCE_MESSAGE_RECEIVED: { badge: 'nachrichten', center: 'nachrichten' },
} as const satisfies Partial<Record<NotificationKind, PartnerNoticeIcons>>;

export type PartnerNoticeKind = keyof typeof PARTNER_NOTICE_ICONS;

export function isPartnerNoticeKind(kind: string): kind is PartnerNoticeKind {
  return Object.hasOwn(PARTNER_NOTICE_ICONS, kind);
}

export const PARTNER_GESTURE_RECEIPT_EVENT = 'eimir:partner-gesture-receipt';

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
