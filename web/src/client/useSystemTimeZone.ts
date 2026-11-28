import {
  type QueryClient,
  type QueryKey,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { AccountApi } from '../api/generated/apis/AccountApi';
import { Configuration } from './apiConfiguration';
import { dailyCheckInTodayQueryKey } from './dailyCheckIn';
import { dashboardQueryKey } from './dashboardQueries';
import { localDateInputValue } from './dateInput';
import { spaceConfigurationQueryKey } from './spaceConfiguration';

/** Whether any cached read under these keys was made on another local day. */
function hasReadFromEarlierDay(
  queryClient: QueryClient,
  queryKeys: QueryKey[],
  today: string,
): boolean {
  return queryKeys.some((queryKey) =>
    queryClient
      .getQueryCache()
      .findAll({ queryKey })
      .some(
        ({ state }) =>
          state.dataUpdatedAt > 0 &&
          localDateInputValue(new Date(state.dataUpdatedAt)) !== today,
      ),
  );
}

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
      const today = localDateInputValue();
      const identity = `${timezone}:${today}`;
      if (confirmed === identity || Date.now() - attemptedAt < 60_000) return;
      pending = true;
      attemptedAt = Date.now();
      try {
        const context = await api.updateOwnDeviceContext(
          { deviceContextUpdate: { timezone, spaceId } },
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        confirmed = identity;
        const dayDependentKeys = [
          dashboardQueryKey(spaceId),
          dailyCheckInTodayQueryKey(accountId, spaceId),
          spaceConfigurationQueryKey(accountId, spaceId),
        ];
        // An unchanged context leaves reads of the current local day valid.
        // Older servers omit the result; treat that as a possible change.
        if (
          context.changed === false &&
          !hasReadFromEarlierDay(queryClient, dayDependentKeys, today)
        )
          return;
        // Device context changes the current day, not authored content or read
        // authorization. Refresh it without revoking durable warm-start data.
        await Promise.all(
          dayDependentKeys.map((queryKey) =>
            queryClient.refetchQueries({ queryKey, type: 'all' }),
          ),
        );
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
