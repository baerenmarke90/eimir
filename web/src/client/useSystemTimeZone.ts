import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AccountApi } from '../api/generated/apis/AccountApi';
import { Configuration } from './apiConfiguration';
import { localDateInputValue } from './dateInput';
import { dashboardQueryKey } from './dashboardQueries';
import { dailyCheckInTodayQueryKey } from './dailyCheckIn';
import { spaceConfigurationQueryKey } from './spaceConfiguration';

/** The OS owns clock/zone; calendar dates already authored are never converted. */
export function useSystemTimeZone(
  apiBaseUrl: string,
  accessToken: string,
  accountId: string,
  spaceId: string,
) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const api = new AccountApi(
      new Configuration({
        basePath: apiBaseUrl,
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    );
    const controller = new AbortController();
    let confirmed = '';
    let pending = false;
    let attemptedAt = 0;
    const sync = async () => {
      if (
        pending ||
        controller.signal.aborted ||
        document.visibilityState === 'hidden' ||
        navigator.onLine === false
      )
        return;
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!timezone) return;
      const identity = `${timezone}:${localDateInputValue()}`;
      if (confirmed === identity || Date.now() - attemptedAt < 60_000) return;
      pending = true;
      attemptedAt = Date.now();
      try {
        await api.updateOwnDeviceContext(
          { deviceContextUpdate: { timezone, spaceId } },
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        confirmed = identity;
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: dashboardQueryKey(spaceId),
          }),
          queryClient.invalidateQueries({
            queryKey: dailyCheckInTodayQueryKey(accountId, spaceId),
          }),
          queryClient.invalidateQueries({
            queryKey: spaceConfigurationQueryKey(accountId, spaceId),
          }),
        ]);
      } catch {
        /* Resume/online retries the current context, never another login's work. */
      } finally {
        pending = false;
      }
    };
    void sync();
    window.addEventListener('focus', sync);
    window.addEventListener('online', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      controller.abort();
      window.removeEventListener('focus', sync);
      window.removeEventListener('online', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [apiBaseUrl, accessToken, accountId, spaceId, queryClient]);
}
