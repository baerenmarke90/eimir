import type { CalendarSyncView } from '../api/generated/models/CalendarSyncView';
import { NotificationChannel } from '../api/generated/models/NotificationChannel';
import { NotificationKind } from '../api/generated/models/NotificationKind';
import type { NotificationPreferencesView } from '../api/generated/models/NotificationPreferencesView';
import type { SignInMethodsView } from '../api/generated/models/SignInMethodsView';
import type { SpaceConfigurationView } from '../api/generated/models/SpaceConfigurationView';
import {
  activeNotificationChannels,
  calendarConnectionState,
  passkeyCount,
  sharedFeatureCounts,
} from './settingsStatus';

function preferences(
  available: Record<NotificationChannel, boolean>,
  enabled: Record<NotificationChannel, boolean>,
): NotificationPreferencesView {
  const channels = Object.values(NotificationChannel);
  return {
    capabilities: channels.map((channel) => ({
      channel,
      available: available[channel],
      reason: null,
    })),
    items: [
      {
        kind: NotificationKind.COMMENT_CREATED,
        deliveryClass: 'DIGESTIBLE',
        channels: channels.map((channel) => ({
          channel,
          enabled: enabled[channel],
          configurable: true,
        })),
      },
    ],
    quietHours: { enabled: false, start: null, end: null, timeZone: 'UTC' },
  } as unknown as NotificationPreferencesView;
}

describe('settings overview statuses', () => {
  it('lists only channels that are chosen and able to deliver, in fixed order', () => {
    const view = preferences(
      {
        [NotificationChannel.IN_APP]: true,
        [NotificationChannel.PUSH]: false,
        [NotificationChannel.EMAIL]: true,
      },
      {
        [NotificationChannel.IN_APP]: true,
        [NotificationChannel.PUSH]: true,
        [NotificationChannel.EMAIL]: true,
      },
    );
    // Push is chosen but cannot deliver, so it is not reported as active.
    expect(activeNotificationChannels(view)).toEqual([
      NotificationChannel.IN_APP,
      NotificationChannel.EMAIL,
    ]);
  });

  it('reports no channel when nothing is chosen', () => {
    const view = preferences(
      {
        [NotificationChannel.IN_APP]: true,
        [NotificationChannel.PUSH]: true,
        [NotificationChannel.EMAIL]: true,
      },
      {
        [NotificationChannel.IN_APP]: false,
        [NotificationChannel.PUSH]: false,
        [NotificationChannel.EMAIL]: false,
      },
    );
    expect(activeNotificationChannels(view)).toEqual([]);
  });

  it('counts the four shared features the settings page lists', () => {
    const configuration = {
      supportGesturesEnabled: true,
      sharedAchievementsEnabled: false,
      vibeCheckEnabled: true,
      energyCheckInEnabled: false,
    } as unknown as SpaceConfigurationView;
    expect(sharedFeatureCounts(configuration)).toEqual({
      enabled: 2,
      total: 4,
    });
  });

  it('keeps the static line when the instance offers no calendar sync', () => {
    expect(
      calendarConnectionState({ available: false } as CalendarSyncView),
    ).toBeNull();
    expect(
      calendarConnectionState({
        available: true,
        target: null,
      } as CalendarSyncView),
    ).toBe('notConnected');
    expect(
      calendarConnectionState({
        available: true,
        target: { id: 'target' },
      } as unknown as CalendarSyncView),
    ).toBe('connected');
  });

  it('counts passkeys', () => {
    expect(
      passkeyCount({ passkeys: [{}, {}] } as unknown as SignInMethodsView),
    ).toBe(2);
  });
});
