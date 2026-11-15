// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { NotificationItem } from '../api/generated/models/NotificationItem';
import { NotificationKind } from '../api/generated/models/NotificationKind';
import {
  isPartnerGestureKind,
  PARTNER_GESTURE_RECEIPT_EVENT,
  PARTNER_GESTURE_VARIANTS,
  requestPartnerGestureReceipt,
  selectArrivedGesture,
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
  selectArrivedGesture(items, { accountId: ME, notBefore: START, handled });

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

  it('ignores read, handled, own and non-gesture notifications', () => {
    expect(
      select([
        item('read', NotificationKind.THINKING_OF_YOU, {
          readAt: new Date(START + 90_000),
        }),
        item('own', NotificationKind.PARTNER_KISS, {
          actorId: ME,
          actor: { id: ME, displayName: 'Me' },
        }),
        item('comment', NotificationKind.COMMENT_CREATED),
        item('handled', NotificationKind.PARTNER_CHECK_IN),
      ]),
    ).not.toBeNull();
    expect(
      select(
        [
          item('read', NotificationKind.THINKING_OF_YOU, {
            readAt: new Date(START + 90_000),
          }),
          item('own', NotificationKind.PARTNER_KISS, { actorId: ME }),
          item('comment', NotificationKind.COMMENT_CREATED),
          item('handled', NotificationKind.PARTNER_CHECK_IN),
        ],
        new Set(['handled']),
      ),
    ).toBeNull();
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
