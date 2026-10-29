import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { normalizeClientError } from './problemDetails';
import {
  passportStatisticsKey,
  readPassportStatisticsPreference,
} from './passportPreferences';

const memoryPreferences = new Map<string, boolean>();
const eventName = 'eimir-wir-statistics-preference';
function subscribe(listener: () => void) {
  window.addEventListener(eventName, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(eventName, listener);
    window.removeEventListener('storage', listener);
  };
}

/** Personal device opt-in is independent of grant; revoked Pro never reveals it. */
export function useWirStatistics({
  api,
  instance,
  accountId,
  spaceId,
}: {
  api?: EntitlementsApi;
  instance: string;
  accountId: string;
  spaceId: string;
}) {
  const key = `${passportStatisticsKey(instance, accountId, spaceId)}:wir`;
  const enabled = useSyncExternalStore(
    subscribe,
    () => memoryPreferences.get(key) ?? readPassportStatisticsPreference(key),
    () => false,
  );
  const grant = useQuery({
    queryKey: ['wir-statistics-grant', instance, accountId, spaceId],
    enabled: Boolean(api && instance && accountId),
    retry: false,
    gcTime: 0,
    refetchOnMount: 'always',
    queryFn: async ({ signal }) => {
      if (!api) return false;
      try {
        const view =
          await api.getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet(
            { spaceId },
            { signal },
          );
        return view.capabilities.includes('relationship.passport');
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
  });
  return {
    enabled,
    allowed: Boolean(
      api && instance && accountId && grant.data === true && !grant.isError,
    ),
    grant,
    setEnabled(value: boolean) {
      if (grant.data !== true || grant.isError) return;
      memoryPreferences.set(key, value);
      try {
        window.localStorage.setItem(key, String(value));
        memoryPreferences.delete(key);
      } catch {
        /* Keep the current explicit choice without persistent storage. */
      }
      window.dispatchEvent(new Event(eventName));
    },
  };
}
