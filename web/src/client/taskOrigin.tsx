import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { parseStoryFilters, storyFiltersToSearch } from './storyProduct';

const MAX_ORIGINS = 12;
const MAX_AGE_MS = 30 * 60 * 1000;

export interface TaskOriginMetadata {
  focusTarget?: 'quick-create';
  selectedKey?: string;
  selectedOffset?: number;
  loadedPageCount?: number;
}

export interface TaskOrigin extends TaskOriginMetadata {
  to: string;
  scrollY: number;
  loadedPageCount: number;
}

interface StoredOrigin extends TaskOrigin {
  capturedAt: number;
  historyIndex: number | null;
}

interface OriginStore {
  active: boolean;
  scope: string;
  entries: Map<string, StoredOrigin>;
  metadata: { path: string; value: TaskOriginMetadata } | null;
}

interface TaskOriginContract {
  captureOrigin: (metadata?: TaskOriginMetadata) => string | null;
  resolveOrigin: (key: unknown) => TaskOrigin | null;
  requestReturn: (key: unknown) => void;
  registerOriginMetadata: (metadata: TaskOriginMetadata) => () => void;
}

const TaskOriginContext = createContext<TaskOriginContract | null>(null);

/** Only existing primary contexts and non-sensitive Timeline scope may return. */
export function taskOriginPath(
  pathname: string,
  search: string,
): string | null {
  if (!['/today', '/story', '/plan', '/more'].includes(pathname)) return null;
  if (pathname !== '/story') return pathname;
  const input = new URLSearchParams(search);
  const safe = storyFiltersToSearch(parseStoryFilters(input));
  const tab = input.get('tab');
  if (tab === 'timeline' || tab === 'discover') safe.set('tab', tab);
  const query = safe.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function TaskOriginProvider({
  accountId,
  spaceId,
  children,
}: {
  accountId: string;
  spaceId: string;
  children: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const scope = JSON.stringify([accountId, spaceId]);
  const storeRef = useRef<OriginStore>({
    active: true,
    scope,
    entries: new Map(),
    metadata: null,
  });
  // Invalidate synchronously, including callbacks retained by a late task result.
  if (storeRef.current.scope !== scope) {
    storeRef.current.active = false;
    storeRef.current.entries.clear();
    storeRef.current = {
      active: true,
      scope,
      entries: new Map(),
      metadata: null,
    };
  }
  const generation = storeRef.current;
  const path = taskOriginPath(location.pathname, location.search);

  const resolveStored = useCallback(
    (key: unknown): StoredOrigin | null => {
      const store = storeRef.current;
      if (!store.active || store !== generation || typeof key !== 'string')
        return null;
      const origin = store.entries.get(key);
      if (!origin) return null;
      if (Date.now() - origin.capturedAt > MAX_AGE_MS) {
        store.entries.delete(key);
        return null;
      }
      return origin;
    },
    [generation],
  );

  const captureOrigin = useCallback(
    (metadata?: TaskOriginMetadata): string | null => {
      const store = storeRef.current;
      if (!store.active || store !== generation || !path) return null;
      const snapshot = {
        ...(store.metadata?.path === path ? store.metadata.value : {}),
        ...metadata,
      };
      const key = `task-${crypto.randomUUID()}`;
      const currentState = window.history.state;
      const origin: StoredOrigin = {
        to: path,
        scrollY: Math.max(0, window.scrollY),
        loadedPageCount:
          Number.isInteger(snapshot.loadedPageCount) &&
          (snapshot.loadedPageCount ?? 0) > 0
            ? (snapshot.loadedPageCount ?? 1)
            : 1,
        focusTarget: snapshot.focusTarget,
        selectedKey: snapshot.selectedKey,
        selectedOffset: snapshot.selectedOffset,
        historyIndex: Number.isInteger(currentState?.idx)
          ? currentState.idx
          : null,
        capturedAt: Date.now(),
      };
      store.entries.set(key, origin);
      while (store.entries.size > MAX_ORIGINS) {
        const oldest = store.entries.keys().next().value;
        if (oldest) store.entries.delete(oldest);
      }
      // Preserve the router's key/index and existing state. No second history entry
      // and no resource identifiers, text, position or account/Space data in history.
      window.history.replaceState(
        {
          ...currentState,
          usr: { ...currentState?.usr, taskReturnKey: key },
        },
        '',
        window.location.href,
      );
      return key;
    },
    [path, generation],
  );

  const resolveOrigin = useCallback(
    (key: unknown): TaskOrigin | null => {
      const origin = resolveStored(key);
      if (!origin) return null;
      const {
        capturedAt: _capturedAt,
        historyIndex: _historyIndex,
        ...rest
      } = origin;
      return rest;
    },
    [resolveStored],
  );

  const requestReturn = useCallback(
    (key: unknown) => {
      if (!generation.active || storeRef.current !== generation) return;
      const origin = resolveStored(key);
      if (!origin) {
        void navigate('/story', { replace: true });
        return;
      }
      if (
        origin.historyIndex !== null &&
        window.history.state?.idx === origin.historyIndex + 1
      ) {
        void navigate(-1);
        return;
      }
      void navigate(origin.to, {
        replace: true,
        state: { taskReturnKey: key },
      });
    },
    [navigate, resolveStored, generation],
  );

  const registerOriginMetadata = useCallback(
    (metadata: TaskOriginMetadata) => {
      if (!path || storeRef.current !== generation) return () => {};
      const snapshot = { path, value: metadata };
      storeRef.current.metadata = snapshot;
      return () => {
        if (storeRef.current.metadata === snapshot)
          storeRef.current.metadata = null;
      };
    },
    [path, generation],
  );

  useEffect(() => {
    storeRef.current.active = true;
    return () => {
      storeRef.current.active = false;
      storeRef.current.entries.clear();
      storeRef.current.metadata = null;
    };
  }, []);

  const value = useMemo(
    () => ({
      captureOrigin,
      resolveOrigin,
      requestReturn,
      registerOriginMetadata,
    }),
    [captureOrigin, resolveOrigin, requestReturn, registerOriginMetadata],
  );
  return (
    <TaskOriginContext.Provider value={value}>
      {children}
    </TaskOriginContext.Provider>
  );
}

/** Isolated consumers without an authenticated scope retain canonical navigation. */
export function useTaskOrigin(): TaskOriginContract {
  const context = useContext(TaskOriginContext);
  const navigate = useNavigate();
  const fallback = useMemo<TaskOriginContract>(
    () => ({
      captureOrigin: () => null,
      resolveOrigin: () => null,
      requestReturn: () => {
        void navigate('/story', { replace: true });
      },
      registerOriginMetadata: () => () => {},
    }),
    [navigate],
  );
  return context ?? fallback;
}
