import { useMemo, useSyncExternalStore } from 'react';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import {
  passportStatisticsKey,
  readPassportStatisticsPreference,
} from './passportPreferences';
import { announcePersonalSettingChange } from './personalSettingsBus';
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

export function wirStatisticsKey(
  instance: string,
  accountId: string,
  spaceId: string,
): string {
  return `${passportStatisticsKey(instance, accountId, spaceId)}:wir`;
}

function writeWirStatistics(key: string, value: boolean): void {
  memoryPreferences.set(key, value);
  try {
    window.localStorage.setItem(key, String(value));
    memoryPreferences.delete(key);
  } catch {
    /* Keep the current explicit choice without persistent storage. */
  }
  window.dispatchEvent(new Event(eventName));
}

/**
 * Applies the Account's saved opt-in from another device without echoing it
 * back. It grants nothing: the counts still show only while Pro allows them.
 */
export function applySyncedWirStatistics(key: string, value: boolean): void {
  writeWirStatistics(key, value);
}

/**
 * The personal opt-in is independent of the grant and follows the Account to
 * the person's other devices; revoked Pro never reveals it.
 */
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
  const key = wirStatisticsKey(instance, accountId, spaceId);
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
      writeWirStatistics(key, value);
      announcePersonalSettingChange(key);
    },
  };
}
