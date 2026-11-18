import { useEffect, useMemo, useRef } from 'react';
import { PersonalSettingsApi } from '../api/generated/apis/PersonalSettingsApi';
import { Configuration } from '../client/apiConfiguration';
import { isClientOnline } from '../client/connectivity';
import {
  PersonalSettingsSync,
  personalSettingsTransport,
} from '../client/personalSettingsSync';

/** Foreground returns closer together than this reuse the previous read. */
export const PERSONAL_SETTINGS_RESUME_MIN_INTERVAL_MS = 30_000;

/**
 * Keeps the signed-in person's own settings the same on every device. It
 * renders nothing: the local stores stay authoritative for the UI, and this
 * owner reconciles them with the server on start, after local changes, when
 * the device is back online and when the app returns to the foreground. A
 * Space switch or sign-out unmounts it.
 */
export function PersonalSettingsSyncRuntime({
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
}: {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
}) {
  const api = useMemo(
    () =>
      new PersonalSettingsApi(
        new Configuration({
          basePath: apiBaseUrl,
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ),
    [apiBaseUrl, accessToken],
  );
  // A refreshed token replaces the client without restarting the sync.
  const current = useRef(api);
  current.current = api;

  useEffect(() => {
    const sync = new PersonalSettingsSync({
      context: { instance: apiBaseUrl, accountId, spaceId },
      transport: personalSettingsTransport(() => current.current, spaceId),
      isOnline: isClientOnline,
    });
    let lastRead = Date.now();
    void sync.start();
    const online = () => void sync.flushAll();
    const resume = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastRead < PERSONAL_SETTINGS_RESUME_MIN_INTERVAL_MS) return;
      lastRead = now;
      void sync.reconcileAll();
    };
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', resume);
    return () => {
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', resume);
      sync.dispose();
    };
  }, [apiBaseUrl, accountId, spaceId]);

  return null;
}
