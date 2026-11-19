import { useSyncExternalStore } from 'react';

/**
 * The adjacent primary tab that is revealed beside the current one while a
 * swipe drags the pages (a pager, like a native tab host). The swipe gesture
 * owns it; the tab panels render it. It carries no content, only the path.
 */
let peekPath: string | null = null;
const listeners = new Set<() => void>();

export function setPrimaryTabPeek(path: string | null): void {
  if (peekPath === path) return;
  peekPath = path;
  for (const listener of listeners) listener();
}

export function usePrimaryTabPeek(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => peekPath,
    () => null,
  );
}
