import { useSyncExternalStore } from 'react';

/**
 * The adjacent primary tab that is revealed beside the current one while a
 * swipe drags the pages (a pager, like a native tab host). The swipe gesture
 * owns it; the tab panels render it. It carries no content, only the path.
 */
let peekPath: string | null = null;
const listeners = new Set<() => void>();

/**
 * Where the revealed tab is laid over the viewport: the main column's left
 * edge and width and the page origin in document coordinates. The gesture
 * measures it before it reveals the tab, while layout is still clean, so
 * revealing never forces a synchronous layout of the whole tab.
 */
export interface PrimaryTabPeekGeometry {
  left: number;
  width: number;
  origin: number;
}

let peekGeometry: PrimaryTabPeekGeometry | null = null;

export function primaryTabPeekGeometry(): PrimaryTabPeekGeometry | null {
  return peekGeometry;
}

export function setPrimaryTabPeek(
  path: string | null,
  geometry: PrimaryTabPeekGeometry | null = null,
): void {
  if (geometry || !path) peekGeometry = geometry;
  if (peekPath === path) return;
  peekPath = path;
  for (const listener of listeners) listener();
}

/**
 * Whether `path` is the tab being revealed right now. Subscribes to this one
 * answer, so a page re-renders when its own preview starts or ends, not for
 * every neighbour that is peeked. A page whose preview would look the same
 * as its parked view passes `enabled: false` and is not rendered again during
 * the swipe at all.
 */
export function usePrimaryTabPeeked(path: string, enabled = true): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => enabled && peekPath === path,
    () => false,
  );
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
