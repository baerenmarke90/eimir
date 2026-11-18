import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import type { NotificationItem } from '../api/generated/models/NotificationItem';
import recaps from '../i18n/locales/recaps';
import { engagementTargetPath, notificationPath } from './m4Product';
import { getNotificationItemTitle } from './notificationTitle';
import { recapNoticePeriod } from './recaps';
import { recapDetailPath, STORY_RECAPS_ROUTE } from './routes';

const t = ((key: string, values?: Record<string, string>) => {
  const [, name] = key.split('recaps.notice.');
  const template =
    (name && recaps.notice[name as keyof typeof recaps.notice]) || key;
  return template.replace('{{period}}', values?.period ?? '');
}) as unknown as TFunction;
const fill = (template: string, period: string) =>
  template.replace('{{period}}', period);

function notice(
  kind: 'RECAP_READY' | 'RECAP_GREW',
  period: string | null,
  createdAt = new Date('2026-11-07T09:00:00Z'),
) {
  return {
    kind,
    actor: null,
    actorId: null,
    targetType: period === null ? null : 'RECAP',
    targetId: period === null ? null : 'edition',
    target:
      period === null
        ? null
        : { targetType: 'RECAP', targetId: 'edition', title: period },
    createdAt,
  } as unknown as NotificationItem;
}

describe('recap notices (#1744)', () => {
  it('names only the period, with the year when it is not the current one', () => {
    expect(getNotificationItemTitle(notice('RECAP_READY', '2026-10'), t)).toBe(
      fill(recaps.notice.readyMonth, 'Oktober'),
    );
    expect(getNotificationItemTitle(notice('RECAP_READY', '2026'), t)).toBe(
      fill(recaps.notice.readyYear, '2026'),
    );
    expect(
      getNotificationItemTitle(
        notice('RECAP_READY', '2026', new Date('2027-01-07T09:00:00Z')),
        t,
      ),
    ).toBe(fill(recaps.notice.readyYear, '2026'));
    expect(getNotificationItemTitle(notice('RECAP_GREW', '2024-03'), t)).toBe(
      fill(recaps.notice.grewMonth, 'März 2024'),
    );
    expect(getNotificationItemTitle(notice('RECAP_GREW', '2025'), t)).toBe(
      fill(recaps.notice.grewYear, '2025'),
    );
  });

  it('collects several earlier recaps and falls back without a readable period', () => {
    expect(getNotificationItemTitle(notice('RECAP_READY', null), t)).toBe(
      recaps.notice.earlier,
    );
    expect(
      getNotificationItemTitle(notice('RECAP_READY', 'Unser Spaziergang'), t),
    ).toBe(recaps.notice.ready);
    expect(recapNoticePeriod('2026-13', new Date(), 'de')).toBeNull();
  });

  it('opens the recap, or the overview for a collected notice', () => {
    expect(engagementTargetPath('RECAP', 'edition')).toBe(
      recapDetailPath('edition'),
    );
    expect(notificationPath(notice('RECAP_READY', '2026-10'))).toBe(
      recapDetailPath('edition'),
    );
    expect(notificationPath(notice('RECAP_READY', null))).toBe(
      STORY_RECAPS_ROUTE,
    );
  });
});
