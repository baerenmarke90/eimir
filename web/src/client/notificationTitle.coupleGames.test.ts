import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import type { EngagementTarget } from '../api/generated/models/EngagementTarget';
import type { NotificationItem } from '../api/generated/models/NotificationItem';
import coupleExperiences from '../i18n/locales/coupleExperiences';
import { engagementTargetPath } from './m4Product';
import { getNotificationItemTitle } from './notificationTitle';
import {
  GAMES_MOMENTS_ROUTE,
  GAMES_PICTURE_PING_PONG_ROUTE,
  GAMES_WHO_OF_US_ROUTE,
  GAMES_WISH_DETECTIVE_ROUTE,
} from './routes';

type NoticeKey = keyof typeof coupleExperiences.notifications;

const t = ((key: string, values?: Record<string, string>) => {
  const [, kind] = key.split('coupleExperiences.notifications.');
  const template =
    (kind && coupleExperiences.notifications[kind as NoticeKey]) || key;
  return template.replace('{{name}}', values?.name ?? '');
}) as unknown as TFunction;

function expected(key: NoticeKey): string {
  return coupleExperiences.notifications[key].replace('{{name}}', 'Alex');
}

function notice(kind: string, targetType: EngagementTarget) {
  return {
    kind,
    targetType,
    targetId: 'target',
    actor: { id: 'partner', displayName: 'Alex' },
  } as unknown as NotificationItem;
}

describe('remote couple game notices', () => {
  it('names the game from the target on the one shared kind', () => {
    expect(
      getNotificationItemTitle(
        notice('COUPLE_GAME_TURN', 'WHO_OF_US_GAME'),
        t,
        'me',
      ),
    ).toBe(expected('COUPLE_GAME_TURN_WHO_OF_US'));
    expect(
      getNotificationItemTitle(
        notice('COUPLE_GAME_TURN', 'WISH_DETECTIVE_GAME'),
        t,
        'me',
      ),
    ).toBe(expected('COUPLE_GAME_TURN_WISH_DETECTIVE'));
    expect(
      getNotificationItemTitle(
        notice('COUPLE_GAME_TURN', 'OUR_MOMENTS_GAME'),
        t,
        'me',
      ),
    ).toBe(expected('COUPLE_GAME_TURN_OUR_MOMENTS'));
  });

  it('opens each game page', () => {
    expect(engagementTargetPath('WHO_OF_US_GAME', 'game')).toBe(
      GAMES_WHO_OF_US_ROUTE,
    );
    expect(engagementTargetPath('WISH_DETECTIVE_GAME', 'game')).toBe(
      GAMES_WISH_DETECTIVE_ROUTE,
    );
    expect(engagementTargetPath('OUR_MOMENTS_GAME', 'game')).toBe(
      GAMES_MOMENTS_ROUTE,
    );
  });
});

describe('finished picture notice', () => {
  it('has its own text and opens the picture', () => {
    expect(
      getNotificationItemTitle(
        notice('PICTURE_PING_PONG_FINISHED', 'PICTURE_GAME'),
        t,
        'me',
      ),
    ).toBe(expected('PICTURE_PING_PONG_FINISHED'));
    expect(engagementTargetPath('PICTURE_GAME', 'picture')).toBe(
      GAMES_PICTURE_PING_PONG_ROUTE,
    );
  });
});
