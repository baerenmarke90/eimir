import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { NotificationsApi } from '../api/generated/apis/NotificationsApi';
import { SpacesApi } from '../api/generated/apis/SpacesApi';
import { NotificationChannel } from '../api/generated/models/NotificationChannel';
import { resolvedLocale, useTranslation } from '../i18n';
import { readThemePreference } from '../theme';
import { Configuration } from './apiConfiguration';
import { useCalendarSync } from './calendarSync';
import type { SettingsCategoryId } from './routes';
import {
  activeNotificationChannels,
  calendarConnectionState,
  passkeyCount,
  sharedFeatureCounts,
} from './settingsStatus';
import { spaceConfigurationQueryOptions } from './spaceConfiguration';
import { loadSignInMethods, SIGN_IN_METHODS_QUERY_KEY } from './signInMethods';

export interface SettingsStatusOwner {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
  demoMode: boolean;
}

const STATUS_STALE_MS = 60_000;

const CHANNEL_LABEL_KEYS = {
  [NotificationChannel.IN_APP]: 'inApp',
  [NotificationChannel.PUSH]: 'push',
  [NotificationChannel.EMAIL]: 'email',
} as const;

function languageName(locale: string): string {
  try {
    const name = new Intl.DisplayNames([locale], { type: 'language' }).of(
      locale,
    );
    if (name) return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
  } catch {
    // An unsupported locale falls back to its code.
  }
  return locale;
}

/**
 * One calm status line per overview row, read from data the owning pages
 * already use (same query keys). Rows without a status keep their static
 * summary. Failures and loading are silent: the overview never shows an
 * error for a hint.
 */
export function useSettingsStatuses(
  owner: SettingsStatusOwner,
): Partial<Record<SettingsCategoryId, string>> {
  const { t } = useTranslation();
  const configuration = useMemo(
    () =>
      new Configuration({
        basePath: owner.apiBaseUrl,
        headers: { Authorization: `Bearer ${owner.accessToken}` },
      }),
    [owner.apiBaseUrl, owner.accessToken],
  );
  const notificationsApi = useMemo(
    () => new NotificationsApi(configuration),
    [configuration],
  );
  const spacesApi = useMemo(
    () => new SpacesApi(configuration),
    [configuration],
  );

  const notifications = useQuery({
    queryKey: ['notification-preferences', owner.accountId],
    queryFn: ({ signal }) =>
      notificationsApi.getOwnNotificationPreferences({ signal }),
    retry: false,
    staleTime: STATUS_STALE_MS,
  });
  const shared = useQuery({
    ...spaceConfigurationQueryOptions(
      spacesApi,
      owner.accountId,
      owner.spaceId,
    ),
    refetchInterval: false,
    refetchOnWindowFocus: false,
    staleTime: STATUS_STALE_MS,
  });
  const calendar = useCalendarSync(owner);
  const methods = useQuery({
    queryKey: [...SIGN_IN_METHODS_QUERY_KEY, owner.apiBaseUrl],
    queryFn: () => loadSignInMethods(owner.apiBaseUrl, owner.accessToken),
    enabled: !owner.demoMode,
    retry: false,
    staleTime: STATUS_STALE_MS,
  });

  const statuses: Partial<Record<SettingsCategoryId, string>> = {};

  if (notifications.data) {
    const channels = activeNotificationChannels(notifications.data);
    statuses.notifications = channels.length
      ? channels
          .map((channel) =>
            t(`notificationSettings.${CHANNEL_LABEL_KEYS[channel]}`),
          )
          .join(' · ')
      : t('profileIdentity.statusNotificationsNone');
  }

  if (shared.data) {
    const counts = sharedFeatureCounts(shared.data.configuration);
    statuses.shared = t('profileIdentity.statusSharedCount', counts);
  }

  if (calendar.view) {
    const state = calendarConnectionState(calendar.view);
    if (state) {
      statuses.calendar = t(
        state === 'connected'
          ? 'profileIdentity.statusConnected'
          : 'profileIdentity.statusNotConnected',
      );
    }
  }

  if (methods.data) {
    const count = passkeyCount(methods.data);
    statuses.account =
      count === 0
        ? t('profileIdentity.statusPasskeysNone')
        : count === 1
          ? t('profileIdentity.statusPasskeysOne')
          : t('profileIdentity.statusPasskeysMany', { count });
  }

  statuses.appearance = [
    t(`theme.${readThemePreference()}`),
    languageName(resolvedLocale()),
  ].join(' · ');

  return statuses;
}
