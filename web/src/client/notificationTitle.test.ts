import type { NotificationItem } from '../api/generated/models/NotificationItem';
import { i18n } from '../i18n';
import { getNotificationItemTitle } from './notificationTitle';
import { isPartnerNoticeKind } from './partnerGestureReceipt';

const t = i18n.t.bind(i18n);

function item(overrides: Partial<NotificationItem>): NotificationItem {
  return {
    id: 'notice-1',
    kind: 'SHARED_NOTE_CHANGED',
    actor: { id: 'account-2', displayName: 'Jonas Example' },
    targetType: 'SHARED_NOTE',
    targetId: 'note-1',
    target: { title: 'Door code 4172' },
    createdAt: new Date('2026-11-12T18:42:00Z'),
    ...overrides,
  } as NotificationItem;
}

describe('shared note notifications', () => {
  it.each([
    ['SHARED_NOTE_CREATED', 'sharedNotes.notification.SHARED_NOTE_CREATED'],
    ['SHARED_NOTE_CHANGED', 'sharedNotes.notification.SHARED_NOTE_CHANGED'],
  ] as const)(
    'says who did what for %s and never repeats the note words',
    (kind, key) => {
      const title = getNotificationItemTitle(item({ kind }), t, 'account-1');
      expect(title).toBe(t(key, { name: 'Jonas Example' }));
      expect(title).not.toContain('4172');
    },
  );

  it('shows both kinds as calm partner notices in the Notification Center', () => {
    expect(isPartnerNoticeKind('SHARED_NOTE_CREATED')).toBe(true);
    expect(isPartnerNoticeKind('SHARED_NOTE_CHANGED')).toBe(true);
  });

  it('falls back to a neutral name when the actor is not known', () => {
    const title = getNotificationItemTitle(
      item({ actor: undefined }),
      t,
      'account-1',
    );
    expect(title).toBe(
      t('sharedNotes.notification.SHARED_NOTE_CHANGED', {
        name: t('m5s5.today.relationshipSignal.partnerFallback'),
      }),
    );
  });
});
