/**
 * Local change notices for personal settings that follow the Account.
 *
 * A store announces only a deliberate local choice (a person changed the
 * setting on this device). Values applied from the server are written without
 * an announcement, so a synced value never echoes back as a new change. The
 * notice carries the store's local storage key only; the sync layer decides
 * from its closed allowlist whether that key leaves the device at all.
 */

type Listener = (storageKey: string) => void;

const listeners = new Set<Listener>();

export function announcePersonalSettingChange(storageKey: string): void {
  for (const listener of [...listeners]) {
    try {
      listener(storageKey);
    } catch {
      // A failing listener must never break the local setting change.
    }
  }
}

export function onPersonalSettingChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Device-local list of setting names that still wait for an upload. */
export const PERSONAL_SETTINGS_SYNC_STATE_PREFIX =
  'eimir-personal-settings-sync-v1:';

/** Sign-out forgets which local choices still waited for an upload. */
export function clearPersonalSettingsSyncState(): void {
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key?.startsWith(PERSONAL_SETTINGS_SYNC_STATE_PREFIX))
        localStorage.removeItem(key);
    }
  } catch {
    /* Only setting names are stored; nothing sensitive remains. */
  }
}
