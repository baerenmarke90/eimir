import { useSyncExternalStore } from 'react';
import { announcePersonalSettingChange } from './personalSettingsBus';

const PREFERENCE_EVENT = 'eimir:occasion-holidays-changed';
const PREFERENCE_VERSION = 'eimir-occasion-holidays-v1';
const sessionFallback = new Map<string, boolean>();

/**
 * Display-only preference, isolated by instance, Account and Space. The
 * personal settings sync carries it to the person's other devices.
 */
export function occasionHolidayPreferenceKey(
  instance: string,
  accountId: string,
  spaceId: string,
): string {
  if (!instance || !accountId || !spaceId) return '';
  return JSON.stringify([
    PREFERENCE_VERSION,
    instance.replace(/\/+$/, ''),
    accountId,
    spaceId,
  ]);
}

export function readOccasionHolidayPreference(key: string): boolean {
  if (!key) return false;
  if (sessionFallback.has(key)) return sessionFallback.get(key) ?? false;
  try {
    return window.localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

/** A person's own choice on this device; it follows the Account to other devices. */
export function saveOccasionHolidayPreference(
  key: string,
  enabled: boolean,
): void {
  if (!key) return;
  writeOccasionHolidayPreference(key, enabled);
  announcePersonalSettingChange(key);
}

/** Applies the Account's saved choice from another device without echoing it back. */
export function applySyncedOccasionHolidayPreference(
  key: string,
  enabled: boolean,
): void {
  if (!key) return;
  writeOccasionHolidayPreference(key, enabled);
}

function writeOccasionHolidayPreference(key: string, enabled: boolean): void {
  sessionFallback.set(key, enabled);
  try {
    window.localStorage.setItem(key, String(enabled));
    sessionFallback.delete(key);
  } catch {
    // The visible selection remains functional when device storage is blocked.
  }
  window.dispatchEvent(new Event(PREFERENCE_EVENT));
}

function subscribe(listener: () => void): () => void {
  window.addEventListener(PREFERENCE_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(PREFERENCE_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

/** Both Settings and the agenda observe the same account-scoped choice. */
export function useOccasionHolidayPreference({
  instance,
  accountId,
  spaceId,
}: {
  instance: string;
  accountId: string;
  spaceId: string;
}): {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
} {
  const key = occasionHolidayPreferenceKey(instance, accountId, spaceId);
  const enabled = useSyncExternalStore(
    subscribe,
    () => readOccasionHolidayPreference(key),
    () => false,
  );
  return {
    enabled,
    setEnabled: (value) => saveOccasionHolidayPreference(key, value),
  };
}
