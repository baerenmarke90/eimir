import {
  type ComponentType,
  lazy,
  useEffect,
  useReducer,
  useState,
} from 'react';

type Load = () => Promise<unknown>;

/**
 * Chunks that first paint does not need. The background prefetch walks this
 * list by index, so chunks registered by a module the prefetch loaded are
 * fetched too.
 */
const deferredModules: Load[] = [
  // The map renderer, used by the map pages, place pickers and the passport.
  () => import('./components/PlaceMapCanvas'),
];

/** Fetch this chunk in the background after the first paint. */
export function registerDeferredModule(load: Load): void {
  deferredModules.push(load);
}

/** A value in its own chunk, loaded once and kept; see `deferredModule`. */
export interface DeferredModule<T> {
  /**
   * Load the chunk, sharing one pending load. A failed load is forgotten,
   * so the next call tries again.
   */
  load: () => Promise<T>;
  /** The loaded value, or null before the chunk has loaded. */
  current: () => T | null;
}

/**
 * A chunk outside the startup bundle that the background prefetch fetches
 * after the first paint and that callers can load on demand.
 */
export function deferredModule<T>(load: () => Promise<T>): DeferredModule<T> {
  let loaded: T | null = null;
  let pending: Promise<T> | null = null;
  const loadOnce = () => {
    pending ??= load().then(
      (value) => {
        loaded = value;
        return value;
      },
      (error: unknown) => {
        pending = null;
        throw error;
      },
    );
    return pending;
  };
  registerDeferredModule(loadOnce);
  return { load: loadOnce, current: () => loaded };
}

/**
 * A component in its own chunk, outside the startup bundle. Before its chunk
 * has loaded it suspends like `React.lazy`. Once loaded, by the background
 * prefetch or an earlier visit, it renders in the same frame: `React.lazy`
 * would still suspend for one frame and flash the loading state.
 */
export function deferredComponent<P extends object>(
  load: () => Promise<ComponentType<P>>,
): ComponentType<P> {
  const module = deferredModule(load);
  const Lazy = lazy(() =>
    module.load().then((component) => ({ default: component })),
  );

  function Deferred(props: P) {
    // Chosen once per mount, so a mounted page never changes component identity.
    const [Component] = useState<ComponentType<P>>(
      () => module.current() ?? Lazy,
    );
    return <Component {...props} />;
  }
  return Deferred;
}

/**
 * An optional component in its own chunk: it renders nothing until its chunk
 * has loaded, and nothing when the load fails (offline, Save-Data skipped the
 * prefetch), so a failed load never suspends or throws into the tree around
 * it. The next mount tries the load again. Errors thrown while the loaded
 * component renders are not caught here.
 */
export function optionalDeferredComponent<P extends object>(
  load: () => Promise<ComponentType<P>>,
): ComponentType<P> {
  const module = deferredModule(load);

  function OptionalDeferred(props: P) {
    const [, loadedNow] = useReducer((count: number) => count + 1, 0);
    const Component = module.current();
    useEffect(() => {
      if (Component) return;
      let live = true;
      module.load().then(
        () => {
          if (live) loadedNow();
        },
        () => {
          // Stays empty; the next mount loads again.
        },
      );
      return () => {
        live = false;
      };
    }, [Component]);
    return Component ? <Component {...props} /> : null;
  }
  return OptionalDeferred;
}

/** Wait after the shell appeared, so the prefetch never competes with its opening. */
export const DEFERRED_PREFETCH_DELAY_MS = 1500;

let prefetchRun: { cancel: () => void } | null = null;

function whenIdle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => resolve(), { timeout: 2000 });
    } else {
      window.setTimeout(resolve, 50);
    }
  });
}

function saveDataRequested(): boolean {
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection;
  return connection?.saveData === true;
}

/**
 * Prefetch every deferred chunk, one at a time in idle periods, starting a
 * moment after the shell appeared. Later navigations then render from memory.
 * A failed fetch is ignored: that chunk loads on demand later. Skipped when
 * the browser asks to save data. Returns a cancel function.
 */
export function scheduleDeferredPrefetch(
  delayMs = DEFERRED_PREFETCH_DELAY_MS,
): () => void {
  if (typeof window === 'undefined' || prefetchRun || saveDataRequested()) {
    return () => {};
  }
  let cancelled = false;
  const run = async () => {
    for (let index = 0; index < deferredModules.length; index++) {
      await whenIdle();
      if (cancelled) return;
      try {
        await deferredModules[index]();
      } catch {
        // The chunk loads on demand when it is needed.
      }
    }
  };
  const timer = window.setTimeout(() => void run(), delayMs);
  const current = {
    cancel: () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (prefetchRun === current) prefetchRun = null;
    },
  };
  prefetchRun = current;
  return current.cancel;
}
