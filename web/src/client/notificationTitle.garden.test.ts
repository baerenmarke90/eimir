import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import type { NotificationItem } from '../api/generated/models/NotificationItem';
import coupleExperiences from '../i18n/locales/coupleExperiences';
import { engagementTargetPath } from './m4Product';
import { getNotificationItemTitle } from './notificationTitle';
import { GAMES_GARDEN_ROUTE } from './routes';

const t = ((key: string, values?: Record<string, string>) => {
  const [, kind] = key.split('coupleExperiences.notifications.');
  const template =
    (kind &&
      coupleExperiences.notifications[
        kind as keyof typeof coupleExperiences.notifications
      ]) ||
    key;
  return template.replace('{{name}}', values?.name ?? '');
}) as unknown as TFunction;

function notice(targetType: 'GARDEN_SEED' | 'GARDEN_BOUQUET') {
  return {
    kind: 'GARDEN_SEED_ARRIVED',
    targetType,
    targetId: 'target',
    actor: { id: 'partner', displayName: 'Alex' },
  } as unknown as NotificationItem;
}

describe('garden notices (#1907 H3)', () => {
  it('names a bouquet with its own text on the shared seed notice kind', () => {
    expect(getNotificationItemTitle(notice('GARDEN_SEED'), t, 'me')).toBe(
      'Alex hat dir Saatgut für euren Garten geschenkt.',
    );
    expect(getNotificationItemTitle(notice('GARDEN_BOUQUET'), t, 'me')).toBe(
      'Alex hat dir einen Strauß geschenkt.',
    );
  });

  it('opens the garden for a seed and for a bouquet', () => {
    expect(engagementTargetPath('GARDEN_SEED', 'seed')).toBe(
      GAMES_GARDEN_ROUTE,
    );
    expect(engagementTargetPath('GARDEN_BOUQUET', 'bouquet')).toBe(
      GAMES_GARDEN_ROUTE,
    );
  });
});
