import { useCallback, useLayoutEffect } from 'react';
import {
  type NavigateFunction,
  type To,
  useLocation,
  useNavigate,
  useNavigationType,
} from 'react-router-dom';
import { EDITOR_HISTORY_STATE_KEY } from './useEditorHistoryEntry';

/**
 * In-memory pathnames of the router entries in this tab, keyed by the router's
 * history index. Nothing is persisted: after a reload the earlier entries are
 * unknown and every return falls back to a replacing navigation.
 */
const entryPaths = new Map<number, string>();

function normalizePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

function currentHistoryIndex(): number | null {
  const index = window.history.state?.idx;
  return Number.isInteger(index) ? index : null;
}

function targetPathname(to: To): string | null {
  const raw = typeof to === 'string' ? to : to.pathname;
  if (!raw) return null;
  try {
    return normalizePath(new URL(raw, window.location.href).pathname);
  } catch {
    return null;
  }
}

/** Records the current entry; a push discards the entries that were ahead. */
export function useHistoryEntryTracker(): void {
  const location = useLocation();
  const navigationType = useNavigationType();
  useLayoutEffect(() => {
    const index = currentHistoryIndex();
    if (index === null) return;
    if (navigationType === 'PUSH') {
      for (const known of entryPaths.keys())
        if (known > index) entryPaths.delete(known);
    }
    entryPaths.set(index, normalizePath(location.pathname));
  }, [location, navigationType]);
}

/**
 * True when Back would land exactly on `to`: the entry directly below the
 * current one shows that pathname and no layer currently owns this entry.
 */
export function previousEntryIs(to: To): boolean {
  if (window.history.state?.[EDITOR_HISTORY_STATE_KEY]) return false;
  const index = currentHistoryIndex();
  const target = targetPathname(to);
  if (index === null || index < 1 || !target) return false;
  return entryPaths.get(index - 1) === target;
}

function returnTo(
  navigate: NavigateFunction,
  to: string,
  options: {
    state?: Record<string, unknown>;
    restoredState?: Record<string, unknown>;
  } = {},
): void {
  const { state, restoredState } = options;
  if (!previousEntryIs(to)) {
    void navigate(to, {
      replace: true,
      state: restoredState ? { ...state, ...restoredState } : state,
    });
    return;
  }
  if (restoredState) {
    const target = targetPathname(to);
    window.addEventListener(
      'popstate',
      () => {
        if (normalizePath(window.location.pathname) !== target) return;
        const usr = window.history.state?.usr;
        void navigate(to, {
          replace: true,
          state: {
            ...(usr && typeof usr === 'object' ? usr : {}),
            ...restoredState,
          },
        });
      },
      { once: true },
    );
  }
  void navigate(-1);
}

/**
 * Closes a child route (editor, detail) into its parent without stacking a
 * duplicate parent entry. When the parent is directly below, the app goes
 * Back to it and keeps its original state; `restoredState` (for example a
 * saved confirmation) is merged into that entry afterwards. Otherwise the
 * child is replaced by the parent, as before.
 */
export function useReturnTo() {
  const navigate = useNavigate();
  return useCallback(
    (
      to: string,
      options?: {
        state?: Record<string, unknown>;
        restoredState?: Record<string, unknown>;
      },
    ) => returnTo(navigate, to, options),
    [navigate],
  );
}

function isWithin(path: string | undefined, root: string): boolean {
  return path !== undefined && (path === root || path.startsWith(`${root}/`));
}

/**
 * Leaves a deleted resource. When the current entry and the entries directly
 * below it all belong to `deletedRoot` (its detail and editor routes), the app
 * goes Back past them to the page the resource was opened from, so system
 * Back cannot reopen the deleted detail. Otherwise the current entry is
 * replaced by `fallback`, as before.
 */
export function useLeaveDeletedEntries() {
  const navigate = useNavigate();
  return useCallback(
    (deletedRoot: string, fallback: string) => {
      const root = targetPathname(deletedRoot);
      const index = currentHistoryIndex();
      if (
        root &&
        index !== null &&
        !window.history.state?.[EDITOR_HISTORY_STATE_KEY] &&
        isWithin(entryPaths.get(index), root)
      ) {
        let target = index - 1;
        while (target >= 0 && isWithin(entryPaths.get(target), root))
          target -= 1;
        if (target >= 0 && entryPaths.has(target)) {
          void navigate(target - index);
          return;
        }
      }
      void navigate(fallback, { replace: true });
    },
    [navigate],
  );
}

/** Test-only reset of the in-memory entry map. */
export function resetHistoryEntriesForTest(): void {
  entryPaths.clear();
}
