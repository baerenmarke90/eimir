import type { CalendarSyncView } from '../api/generated/models/CalendarSyncView';
import { NotificationChannel } from '../api/generated/models/NotificationChannel';
import type { NotificationPreferencesView } from '../api/generated/models/NotificationPreferencesView';
import type { SignInMethodsView } from '../api/generated/models/SignInMethodsView';
import type { SpaceConfigurationView } from '../api/generated/models/SpaceConfigurationView';

/**
 * Pure derivations behind the one-line status of Settings overview rows. They
 * only read data the owning settings pages already load; a row keeps its
 * static summary until its data arrives or when it fails to load.
 */

const CHANNEL_ORDER = [
  NotificationChannel.IN_APP,
  NotificationChannel.PUSH,
  NotificationChannel.EMAIL,
] as const;

/** Channels that are both chosen for at least one event and able to deliver. */
export function activeNotificationChannels(
  view: NotificationPreferencesView,
): NotificationChannel[] {
  const available = new Set(
    view.capabilities
      .filter((capability) => capability.available)
      .map((capability) => capability.channel),
  );
  return CHANNEL_ORDER.filter(
    (channel) =>
      available.has(channel) &&
      view.items.some((item) =>
        item.channels.some(
          (choice) => choice.channel === channel && choice.enabled,
        ),
      ),
  );
}

const SHARED_FEATURE_FIELDS = [
  'supportGesturesEnabled',
  'sharedAchievementsEnabled',
  'vibeCheckEnabled',
  'energyCheckInEnabled',
] as const satisfies ReadonlyArray<keyof SpaceConfigurationView>;

/** The same four features the Shared features page lists. */
export function sharedFeatureCounts(configuration: SpaceConfigurationView): {
  enabled: number;
  total: number;
} {
  return {
    enabled: SHARED_FEATURE_FIELDS.filter((field) => configuration[field])
      .length,
    total: SHARED_FEATURE_FIELDS.length,
  };
}

/** null when the instance offers no calendar sync: the static line stays. */
export function calendarConnectionState(
  view: CalendarSyncView,
): 'connected' | 'notConnected' | null {
  if (!view.available) return null;
  return view.target ? 'connected' : 'notConnected';
}

export function passkeyCount(view: SignInMethodsView): number {
  return view.passkeys.length;
}
