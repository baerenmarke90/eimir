// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { NotificationItem } from '../api/generated/models/NotificationItem';
import { NotificationKind } from '../api/generated/models/NotificationKind';
import {
  notificationArrivalKey,
  selectArrivedNotification,
} from './foregroundNotifications';
import {
  isPartnerGestureKind,
  isPartnerNoticeKind,
  PARTNER_GESTURE_RECEIPT_EVENT,
  PARTNER_GESTURE_VARIANTS,
  PARTNER_NOTICE_ICONS,
  requestPartnerGestureReceipt,
} from './partnerGestureReceipt';

const ME = 'account-me';
const PARTNER = 'account-partner';
const START = Date.parse('2026-11-15T10:00:00Z');

function item(
  id: string,
  kind: NotificationKind,
  overrides: Partial<NotificationItem> = {},
): NotificationItem {
  return {
    id,
    kind,
    actorId: PARTNER,
    actor: { id: PARTNER, displayName: 'Ronja' },
    createdAt: new Date(START + 60_000),
    readAt: null,
    sourceEventId: `event-${id}`,
    targetId: null,
    targetType: null,
    ...overrides,
  };
}

const select = (items: NotificationItem[], handled = new Set<string>()) =>
  selectArrivedNotification(items, {
    accountId: ME,
    notBefore: START,
    handled,
  });

describe('partner gesture receipt policy', () => {
  it('knows exactly the three existing gesture kinds and their variants', () => {
    expect(
      Object.values(NotificationKind).filter(isPartnerGestureKind),
    ).toEqual(['THINKING_OF_YOU', 'PARTNER_KISS', 'PARTNER_CHECK_IN']);
    expect(PARTNER_GESTURE_VARIANTS.THINKING_OF_YOU).toMatchObject({
      motion: 'heart-pulse',
      reply: 'THINKING',
    });
    expect(PARTNER_GESTURE_VARIANTS.PARTNER_KISS).toMatchObject({
      motion: 'kiss',
      reply: 'KISS',
    });
    expect(PARTNER_GESTURE_VARIANTS.PARTNER_CHECK_IN).toMatchObject({
      motion: 'calm-ring',
      reply: 'CHECK_IN',
    });
  });

  it('gives partner-caused notices a badge and leaves system kinds plain', () => {
    expect(isPartnerNoticeKind('WISH_SELECTION_SHARED')).toBe(true);
    expect(PARTNER_NOTICE_ICONS.WISH_SELECTION_SHARED.badge).toBe('gemeinsam');
    // The plain wish heart is never a badge: it belongs to "thinking of you".
    for (const icons of Object.values(PARTNER_NOTICE_ICONS))
      expect(icons.badge).not.toBe('wuensche');
    for (const kind of [
      'TRANSFER_READY',
      'TRANSFER_COMPLETED',
      'TRANSFER_FAILED',
      'VIDEO_PROCESSING_FAILED',
      'REMINDER_DUE',
      'WISH_REMINDER_DUE',
      'GENTLE_PROMPT',
      'THINKING_OF_YOU',
      'PARTNER_KISS',
      'PARTNER_CHECK_IN',
    ])
      expect(isPartnerNoticeKind(kind), kind).toBe(false);
  });

  it('selects the newest new, unread gesture from the partner', () => {
    const older = item('older', NotificationKind.THINKING_OF_YOU);
    const newer = item('newer', NotificationKind.PARTNER_KISS, {
      createdAt: new Date(START + 120_000),
    });
    expect(select([older, newer])?.id).toBe('newer');
  });

  it('never replays history from before the shell started', () => {
    expect(
      select([
        item('history', NotificationKind.THINKING_OF_YOU, {
          createdAt: new Date(START - 1),
        }),
      ]),
    ).toBeNull();
  });

  it('ignores read, handled and own gestures', () => {
    const handled = item('handled', NotificationKind.PARTNER_CHECK_IN);
    expect(
      select(
        [
          item('read', NotificationKind.THINKING_OF_YOU, {
            readAt: new Date(START + 90_000),
          }),
          item('own', NotificationKind.PARTNER_KISS, { actorId: ME }),
          handled,
        ],
        new Set([notificationArrivalKey(handled)]),
      ),
    ).toBeNull();
  });

  it('accepts ordinary in-app items, own outcomes and new coalesced events', () => {
    const first = item('round', NotificationKind.WISH_SELECTION_SHARED);
    const next = { ...first, sourceEventId: 'renewed-round' };
    const ownReminder = item('reminder', NotificationKind.WISH_REMINDER_DUE, {
      actorId: ME,
    });
    expect(select([next], new Set([notificationArrivalKey(first)]))).toBe(next);
    expect(select([ownReminder])).toBe(ownReminder);
  });

  it('dispatches open requests only for gesture kinds', () => {
    const listener = vi.fn();
    window.addEventListener(PARTNER_GESTURE_RECEIPT_EVENT, listener);
    requestPartnerGestureReceipt({
      scope: 'a:s',
      item: item('comment', NotificationKind.COMMENT_CREATED),
    });
    requestPartnerGestureReceipt({
      scope: 'a:s',
      item: item('kiss', NotificationKind.PARTNER_KISS),
    });
    window.removeEventListener(PARTNER_GESTURE_RECEIPT_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
