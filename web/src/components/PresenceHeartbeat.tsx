import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useApiRuntime } from '../client/apiRuntimeContext';
import {
  createPresenceApi,
  partnerPresenceQueryKey,
  PARTNER_PRESENCE_PRODUCT_ENABLED,
  PRESENCE_EVENT_DEDUPE_MS,
  PRESENCE_HEARTBEAT_INTERVAL_MS,
} from '../client/presence';

function appIsActivelyVisible(): boolean {
  return (
    document.visibilityState === 'visible' &&
    document.hasFocus() &&
    navigator.onLine !== false
  );
}

export function PresenceHeartbeat({
  accountId,
  spaceId,
  enabled = PARTNER_PRESENCE_PRODUCT_ENABLED,
}: {
  accountId: string;
  spaceId: string;
  enabled?: boolean;
}) {
  const runtime = useApiRuntime();
  const queryClient = useQueryClient();
  const api = useMemo(
    () =>
      runtime
        ? createPresenceApi(runtime.apiBaseUrl, runtime.accessToken)
        : null,
    [runtime],
  );

  useEffect(() => {
    if (!enabled || !api || !accountId || !spaceId) return;

    const queryKey = partnerPresenceQueryKey(accountId, spaceId);
    let disposed = false;
    let intervalId: number | null = null;
    let lastTouchStartedAt = Number.NEGATIVE_INFINITY;
    let touchGeneration = 0;

    const stopTimer = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };
    const clearClaim = () => {
      queryClient.setQueryData(queryKey, { state: null });
    };
    const touch = () => {
      if (!appIsActivelyVisible()) return;
      const startedAt = Date.now();
      if (startedAt - lastTouchStartedAt < PRESENCE_EVENT_DEDUPE_MS) return;
      lastTouchStartedAt = startedAt;
      touchGeneration += 1;
      const generation = touchGeneration;
      void api
        .touchPresence({ spaceId })
        .then((view) => {
          if (
            !disposed &&
            generation === touchGeneration &&
            appIsActivelyVisible()
          ) {
            queryClient.setQueryData(queryKey, view);
          }
        })
        .catch(() => {
          if (!disposed && generation === touchGeneration) clearClaim();
        });
    };
    const restart = () => {
      stopTimer();
      if (!appIsActivelyVisible()) {
        clearClaim();
        return;
      }
      touch();
      intervalId = window.setInterval(touch, PRESENCE_HEARTBEAT_INTERVAL_MS);
    };
    const suspend = () => {
      touchGeneration += 1;
      lastTouchStartedAt = Number.NEGATIVE_INFINITY;
      stopTimer();
      clearClaim();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') restart();
      else suspend();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', restart);
    window.addEventListener('blur', suspend);
    window.addEventListener('online', restart);
    window.addEventListener('offline', suspend);
    restart();

    return () => {
      disposed = true;
      touchGeneration += 1;
      stopTimer();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', restart);
      window.removeEventListener('blur', suspend);
      window.removeEventListener('online', restart);
      window.removeEventListener('offline', suspend);
      queryClient.removeQueries({ queryKey, exact: true });
    };
  }, [accountId, api, enabled, queryClient, spaceId]);

  return null;
}
