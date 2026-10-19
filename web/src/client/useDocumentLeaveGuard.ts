import { useEffect, useSyncExternalStore } from 'react';

const owners = new Set<object>();
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const isDocumentLeaveBlocked = () => owners.size > 0;

/** Shared document-exit ownership for browser unload and external auth entry. */
export function useDocumentLeaveGuard(blocked: boolean): void {
  useEffect(() => {
    if (!blocked) return;
    const owner = {};
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    owners.add(owner);
    window.addEventListener('beforeunload', beforeUnload);
    notify();
    return () => {
      owners.delete(owner);
      window.removeEventListener('beforeunload', beforeUnload);
      notify();
    };
  }, [blocked]);
}

export function useDocumentLeaveBlocked(): boolean {
  return useSyncExternalStore(subscribe, isDocumentLeaveBlocked, () => false);
}
