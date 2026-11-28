/**
 * Device-local choice whether memories with a sensitive photo appear in the
 * memory worlds (Momente › Erinnerungen). Hidden by default. It is a privacy
 * convenience of this device, never synced and never an authorization: the
 * photos themselves keep their sensitive cover.
 */
import { useSyncExternalStore } from 'react';

export const SENSITIVE_IN_WORLDS_KEY = 'eimir.memoryWorlds.sensitive';

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SENSITIVE_IN_WORLDS_KEY || event.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function readShowSensitive(): boolean {
  try {
    return window.localStorage.getItem(SENSITIVE_IN_WORLDS_KEY) === 'show';
  } catch {
    return false;
  }
}

export function setShowSensitiveInWorlds(show: boolean): void {
  try {
    window.localStorage.setItem(
      SENSITIVE_IN_WORLDS_KEY,
      show ? 'show' : 'hide',
    );
  } catch {
    // Storage unavailable: the default (hidden) stays.
  }
  notify();
}

/** Whether memories with a sensitive photo appear in the worlds. */
export function useShowSensitiveInWorlds(): boolean {
  return useSyncExternalStore(subscribe, readShowSensitive, () => false);
}
