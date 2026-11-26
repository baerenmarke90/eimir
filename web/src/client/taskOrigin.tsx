import {
  createContext,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { DateIdeasFilterState } from './dateIdeas';
import { previousEntryIs } from './historyEntries';
import { parseMapPlace } from './photoPlaces';
import {
  ACTIVITY_ROUTE,
  settingsCategoryPath,
  STORY_OURS_ROUTE,
  SETTINGS_CATEGORY_IDS,
  MORE_SETTINGS_ROUTE,
  MORE_PROFILE_ROUTE,
  MORE_PEOPLE_ROUTE,
  MORE_PASSPORT_ROUTE,
  MORE_INSIGHTS_ROUTE,
  GAMES_WISH_DETECTIVE_ROUTE,
  GAMES_MOMENTS_ROUTE,
  DEFAULT_APP_ROUTE,
  appRoutePath,
  DATE_IDEAS_ROUTE,
  MEMORY_MAP_ROUTE,
  MORE_COLLECTIONS_ROUTE,
  MORE_NOTES_ROUTE,
  MORE_NOTIFICATIONS_ROUTE,
  MORE_PLACES_ROUTE,
  MORE_PRIVATE_ROUTE,
  PRIMARY_APP_ROUTES,
  STORY_PHOTOS_ROUTE,
  STORY_RECAPS_ROUTE,
  WISH_SELECTION_ROUTE,
} from './routes';
import { parseStoryFilters, storyFiltersToSearch } from './storyProduct';

const MAX_ORIGINS = 12;
const MAX_AGE_MS = 30 * 60 * 1000;

export interface TaskOriginMetadata {
  selectedKey?: string;
  selectedOffset?: number;
  loadedPageCount?: number;
  /** Restores a Search origin's submitted query/type without ever putting it in the URL. */
  searchQuery?: string;
  searchKind?: string;
  /** Restores the Shared Notes overview search; never published in the URL. */
  sharedNotesSearch?: string;
  /** Restores the Planning peer mode without publishing it in the URL. */
  planningSegment?: 'plans' | 'wishes' | 'dates';
  planningWishStatus?: 'OPEN' | 'PLANNED' | 'COMPLETED';
  planningPlanStatus?: 'OPEN' | 'COMPLETED';
  planningPlanSearch?: string;
  planningWishSearch?: string;
  /** Date-only default for a new Plan started from a shared occasion. */
  planningCreateDate?: string;
  /**
   * Editable catalog text that prefills a new Wish or Plan started from a
   * curated date idea; the idea ID is only the in-session link, never sent.
   */
  planningCreateDraft?: {
    title: string;
    description?: string;
    dateIdeaId?: string;
  };
  /**
   * Editable prefill for converting a known Wish into a Plan; `plannedOn` is a
   * date-only suggestion such as the weekly brief's rhythm day (#2169).
   */
  planningConvertDraft?: {
    title: string;
    description?: string;
    plannedOn?: string;
  };
  /** Restores the date inspiration filters; catalog keys only, never content. */
  dateIdeasFilter?: DateIdeasFilterState;
  /** Bounded, account/Space-scoped map return context; never persisted or logged. */
  memoryMap?: {
    placeId: string | null;
    memoryId?: string;
    viewport?: { latitude: number; longitude: number; zoom: number };
    fullscreen: boolean;
  };
}

export interface TaskOrigin extends TaskOriginMetadata {
  to: string;
  scrollY: number;
  loadedPageCount: number;
}

interface StoredOrigin extends TaskOrigin {
  capturedAt: number;
  historyIndex: number | null;
  taskOriginKey?: string;
}

interface OriginStore {
  active: boolean;
  scope: string;
  entries: Map<string, StoredOrigin>;
  /**
   * What the mounted pages of the current destination want restored, in the
   * order they registered. A capture merges them, later ones last.
   */
  metadata: Set<{ value: TaskOriginMetadata }>;
}

export interface PrimaryDestination {
  to: string;
}

interface TaskOriginContract {
  captureOrigin: (metadata?: TaskOriginMetadata) => string | null;
  resolveOrigin: (key: unknown) => TaskOrigin | null;
  requestReturn: (key: unknown, fallback?: string) => void;
  registerOriginMetadata: (metadata: TaskOriginMetadata) => () => void;
  primaryDestination: (root: string) => PrimaryDestination;
}

const TaskOriginContext = createContext<TaskOriginContract | null>(null);

/** Only existing primary contexts and non-sensitive Timeline scope may return. */
export function taskOriginPath(
  pathname: string,
  search: string,
): string | null {
  if (
    pathname === DEFAULT_APP_ROUTE &&
    new URLSearchParams(search).get('view') === 'wir'
  )
    return `${DEFAULT_APP_ROUTE}?view=wir`;
  // The private overview contains only destinations. Private lists, records
  // and query data stay outside the task origin.
  if (pathname === MORE_PRIVATE_ROUTE || pathname === `${MORE_PRIVATE_ROUTE}/`)
    return MORE_PRIVATE_ROUTE;

  const planningDetail = /^\/plan\/(plans|wishes)\/(?!new$)[^/]+$/.test(
    pathname,
  );
  const secondaryDetail = /^\/plan\/(places|chapters)\/(?!new$)[^/]+$/.test(
    pathname,
  );
  const momentDetail =
    /^\/story\/(memories|heart-moments)\/(?!new$)[^/]+$/.test(pathname);
  // Shared Memory location editing returns to its owning editor, without query data.
  const memoryEditor = /^\/story\/memories\/(?!new\/)[^/]+\/edit$/.test(
    pathname,
  );
  // A shared note read page is a return target for its editor (#1969).
  const sharedNoteDetail = /^\/more\/notes\/(?!new$)[^/]+$/.test(pathname);
  const recapReader = /^\/story\/recaps\/[^/]+$/.test(pathname);
  const referenceDetail =
    /^\/story\/(milestones|happiness|time-travel)\/(?!new$)[^/]+$/.test(
      pathname,
    );
  const peopleDetail = /^\/more\/people\/(?!new$)[^/]+$/.test(pathname);
  const settings = SETTINGS_CATEGORY_IDS.some(
    (id) => settingsCategoryPath(id) === pathname,
  );
  const storyYear = /^\/story\/years\/\d{4}$/.test(pathname);
  if (
    !referenceDetail &&
    !peopleDetail &&
    !settings &&
    !recapReader &&
    !sharedNoteDetail &&
    !storyYear &&
    !memoryEditor &&
    !planningDetail &&
    !secondaryDetail &&
    !momentDetail &&
    ![
      '/today',
      '/story',
      '/story/chapters',
      '/story/years',
      '/story/happiness',
      '/story/time-travel',
      STORY_PHOTOS_ROUTE,
      MEMORY_MAP_ROUTE,
      MORE_COLLECTIONS_ROUTE,
      MORE_NOTES_ROUTE,
      MORE_PLACES_ROUTE,
      '/plan',
      WISH_SELECTION_ROUTE,
      DATE_IDEAS_ROUTE,
      '/more',
      STORY_RECAPS_ROUTE,
      '/search',
      ACTIVITY_ROUTE,
      MORE_NOTIFICATIONS_ROUTE,
      appRoutePath('games'),
      GAMES_MOMENTS_ROUTE,
      GAMES_WISH_DETECTIVE_ROUTE,
      MORE_INSIGHTS_ROUTE,
      MORE_PEOPLE_ROUTE,
      MORE_PROFILE_ROUTE,
      MORE_SETTINGS_ROUTE,
      MORE_PASSPORT_ROUTE,
      STORY_OURS_ROUTE,
    ].includes(pathname)
  )
    return null;
  if (recapReader || pathname === STORY_RECAPS_ROUTE) {
    const input = new URLSearchParams(search);
    const safe = new URLSearchParams();
    if (input.get('tab') === 'years') safe.set('tab', 'years');
    if (
      pathname === STORY_RECAPS_ROUTE &&
      input.get('details') === 'relationship'
    )
      safe.set('details', 'relationship');
    const page = Number(input.get('page'));
    if (recapReader && Number.isInteger(page) && page > 0 && page <= 13)
      safe.set('page', String(page));
    return safe.size ? `${pathname}?${safe}` : pathname;
  }
  if (pathname === MORE_PLACES_ROUTE) {
    const scope = new URLSearchParams(search).get('scope');
    return scope === 'ARCHIVED' || scope === 'ALL'
      ? `${pathname}?scope=${scope}`
      : pathname;
  }
  if (pathname === MORE_COLLECTIONS_ROUTE) {
    const scope = new URLSearchParams(search).get('scope');
    return scope === 'COMPLETED' || scope === 'ALL'
      ? `${pathname}?scope=${scope}`
      : pathname;
  }
  if (pathname === MORE_NOTES_ROUTE) {
    return new URLSearchParams(search).get('scope') === 'PINNED'
      ? `${pathname}?scope=PINNED`
      : pathname;
  }
  if (pathname === ACTIVITY_ROUTE) {
    return new URLSearchParams(search).get('scope') === 'own'
      ? `${pathname}?scope=own`
      : pathname;
  }
  if (pathname === STORY_PHOTOS_ROUTE) {
    return new URLSearchParams(search).get('visibility') === 'private'
      ? `${pathname}?visibility=private`
      : pathname;
  }
  if (pathname === MEMORY_MAP_ROUTE) {
    const input = new URLSearchParams(search);
    const safe = storyFiltersToSearch(parseStoryFilters(input));
    const place = input.get('place') ?? '';
    if (parseMapPlace(place)) safe.set('place', place);
    return safe.size ? `${pathname}?${safe}` : pathname;
  }
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
    metadata: new Set(),
  });
  // Invalidate synchronously, including callbacks retained by a late task result.
  if (storeRef.current.scope !== scope) {
    storeRef.current.active = false;
    storeRef.current.entries.clear();
    storeRef.current = {
      active: true,
      scope,
      entries: new Map(),
      metadata: new Set(),
    };
  }
  const generation = storeRef.current;
  // The contract below is one object for the whole session scope: it reads
  // the current path and navigation when it is called. A contract that
  // changed with every route would render every page that uses it, in every
  // kept tab, on each navigation.
  const pathRef = useRef<string | null>(null);
  pathRef.current = taskOriginPath(location.pathname, location.search);
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

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
      const path = pathRef.current;
      if (!store.active || store !== generation || !path) return null;
      const snapshot: TaskOriginMetadata = Object.assign(
        {},
        ...Array.from(store.metadata, (registered) => registered.value),
        metadata,
      );
      const key = `task-${crypto.randomUUID()}`;
      const currentState = window.history.state;
      const parentKey = currentState?.usr?.taskOriginKey;
      const origin: StoredOrigin = {
        to: path,
        scrollY: Math.max(0, window.scrollY),
        loadedPageCount:
          Number.isInteger(snapshot.loadedPageCount) &&
          (snapshot.loadedPageCount ?? 0) > 0
            ? (snapshot.loadedPageCount ?? 1)
            : 1,
        selectedKey: snapshot.selectedKey,
        selectedOffset: snapshot.selectedOffset,
        searchQuery: snapshot.searchQuery,
        searchKind: snapshot.searchKind,
        sharedNotesSearch: snapshot.sharedNotesSearch,
        planningSegment: snapshot.planningSegment,
        planningWishStatus: snapshot.planningWishStatus,
        planningPlanStatus: snapshot.planningPlanStatus,
        planningPlanSearch: snapshot.planningPlanSearch,
        planningWishSearch: snapshot.planningWishSearch,
        planningCreateDate: snapshot.planningCreateDate,
        planningCreateDraft: snapshot.planningCreateDraft,
        planningConvertDraft: snapshot.planningConvertDraft,
        dateIdeasFilter: snapshot.dateIdeasFilter,
        memoryMap: snapshot.memoryMap,
        taskOriginKey: resolveStored(parentKey) ? parentKey : undefined,
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
    [generation, resolveStored],
  );

  const resolveOrigin = useCallback(
    (key: unknown): TaskOrigin | null => {
      const origin = resolveStored(key);
      if (!origin) return null;
      const {
        capturedAt: _capturedAt,
        historyIndex: _historyIndex,
        taskOriginKey: _taskOriginKey,
        ...rest
      } = origin;
      return rest;
    },
    [resolveStored],
  );

  const requestReturn = useCallback(
    (key: unknown, fallback = '/story') => {
      if (!generation.active || storeRef.current !== generation) return;
      const navigate = navigateRef.current;
      const origin = resolveStored(key);
      if (!origin) {
        // Without a captured origin, a parent directly below is still the
        // natural Back target; replacing would leave it in history twice.
        if (previousEntryIs(fallback)) void navigate(-1);
        else void navigate(fallback, { replace: true });
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
        state: {
          taskReturnKey: key,
          ...(resolveStored(origin.taskOriginKey)
            ? { taskOriginKey: origin.taskOriginKey }
            : {}),
        },
      });
    },
    [resolveStored, generation],
  );

  const primaryDestination = useCallback((root: string): PrimaryDestination => {
    if (!PRIMARY_APP_ROUTES.some((route) => route.path === root))
      return { to: '/today' };
    return { to: root };
  }, []);

  const registerOriginMetadata = useCallback(
    (metadata: TaskOriginMetadata) => {
      if (storeRef.current !== generation) return () => {};
      const registered = { value: metadata };
      generation.metadata.add(registered);
      return () => {
        generation.metadata.delete(registered);
      };
    },
    [generation],
  );

  useEffect(() => {
    storeRef.current.active = true;
    return () => {
      storeRef.current.active = false;
      storeRef.current.entries.clear();
      storeRef.current.metadata.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      captureOrigin,
      resolveOrigin,
      requestReturn,
      registerOriginMetadata,
      primaryDestination,
    }),
    [
      captureOrigin,
      resolveOrigin,
      requestReturn,
      registerOriginMetadata,
      primaryDestination,
    ],
  );
  return (
    <TaskOriginContext.Provider value={value}>
      {children}
    </TaskOriginContext.Provider>
  );
}

/**
 * A kept, hidden primary tab must not publish return metadata or capture an
 * origin for the destination that is currently visible.
 *
 * The tab's pages keep one contract while the tab is parked and shown again:
 * the scope itself withdraws their metadata when the tab is parked and
 * publishes it again when the tab is shown, so no page renders for it.
 */
export function PrimaryTabTaskOriginScope({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const context = useContext(TaskOriginContext);
  const activeRef = useRef(active);
  const registrations = useRef(
    new Set<{ value: TaskOriginMetadata; release: (() => void) | null }>(),
  );
  // Before the pages' own effects, which register while the tab is shown.
  useLayoutEffect(() => {
    activeRef.current = active;
  }, [active]);
  useEffect(() => {
    if (!context || !active) return;
    const held = registrations.current;
    for (const registered of held)
      registered.release ??= context.registerOriginMetadata(registered.value);
    return () => {
      for (const registered of held) {
        registered.release?.();
        registered.release = null;
      }
    };
  }, [active, context]);
  const value = useMemo<TaskOriginContract | null>(
    () =>
      context && {
        ...context,
        captureOrigin: (metadata) =>
          activeRef.current ? context.captureOrigin(metadata) : null,
        registerOriginMetadata: (metadata) => {
          const registered = {
            value: metadata,
            release: activeRef.current
              ? context.registerOriginMetadata(metadata)
              : null,
          };
          registrations.current.add(registered);
          return () => {
            registered.release?.();
            registered.release = null;
            registrations.current.delete(registered);
          };
        },
      },
    [context],
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
      requestReturn: (_key, fallback = '/story') => {
        void navigate(fallback, { replace: true });
      },
      registerOriginMetadata: () => () => {},
      primaryDestination: (root) => ({ to: root }),
    }),
    [navigate],
  );
  return context ?? fallback;
}

export function useOpenTaskLink() {
  const navigate = useNavigate();
  const { captureOrigin } = useTaskOrigin();
  return (
    event: MouseEvent<HTMLAnchorElement>,
    to: string,
    selectedKey?: string,
    onFollow?: () => void,
  ) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const taskOriginKey = captureOrigin(
      selectedKey ? { selectedKey } : undefined,
    );
    onFollow?.();
    if (!taskOriginKey) return;
    event.preventDefault();
    void navigate(to, { state: { taskOriginKey } });
  };
}
