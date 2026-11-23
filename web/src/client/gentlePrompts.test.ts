import { QueryClient } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import type { NotificationPreferencesView } from '../api/generated/models/NotificationPreferencesView';
import { enableGentlePrompts, prepareGentlePrompts } from './gentlePrompts';

const preferences: NotificationPreferencesView = {
  catalogVersion: 1,
  capabilities: [],
  items: [],
  quietHours: { enabled: false, timeZone: 'UTC', start: null, end: null },
};

it.each(['pending', 'complete'])(
  'reuses the %s onboarding preference read after device registration',
  async (phase) => {
    const client = new QueryClient();
    const api = new NotificationsApi();
    let release!: (data: NotificationPreferencesView) => void;
    const read = vi.spyOn(api, 'getOwnNotificationPreferences').mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const write = vi
      .spyOn(api, 'updateOwnNotificationPreference')
      .mockResolvedValue({
        kind: 'GENTLE_PROMPT',
        channel: 'PUSH',
        enabled: true,
      });

    const preparation = prepareGentlePrompts(client, api, 'owner');
    expect(read).toHaveBeenCalledTimes(1);
    if (phase === 'complete') {
      release(preferences);
      await preparation;
    }
    // The device controller invalidates channel capabilities on registration.
    await client.invalidateQueries({
      queryKey: ['notification-preferences', 'owner'],
    });
    expect(write).not.toHaveBeenCalled();
    const confirmation = enableGentlePrompts(client, api, 'owner');
    if (phase === 'pending') {
      expect(write).not.toHaveBeenCalled();
      release(preferences);
    }
    await confirmation;
    expect(read).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
    client.clear();
  },
);
