import { useMemo, useSyncExternalStore } from 'react';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import {
  passportStatisticsKey,
  readPassportStatisticsPreference,
} from './passportPreferences';
import { entitlementLoader, useSpaceCapability } from './spaceEntitlement';

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
  const loadEntitlement = useMemo(
    () => (api ? entitlementLoader(api, spaceId) : undefined),
    [api, spaceId],
  );
  // Reuses the session's single entitlement read from app start.
  const grant = useSpaceCapability({
    accountId,
    spaceId,
    load: loadEntitlement,
    enabled: Boolean(instance),
    capability: 'relationship.passport',
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
