import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  type ObjectUrlSource,
  type OwnedObjectUrl,
  ownObjectUrlSource,
} from './objectUrlResource';
import {
  captureSynchronousMediaObjectUrl,
  subscribeMediaObjectUrlRevocations,
} from './sharedMediaObjectUrls';

/** A shown resource whose shared object URL was revoked (denied or wiped). */
export class RevokedObjectUrlError extends Error {
  constructor() {
    super('The media object URL was revoked.');
    this.name = 'RevokedObjectUrlError';
  }
}

interface ResourceEntry {
  resourceId: string;
  controller: AbortController;
  resource: OwnedObjectUrl | null;
  status: 'loading' | 'ready' | 'error';
  error: unknown;
}

interface ObjectUrlResourcesState {
  urls: Readonly<Record<string, string>>;
  errors: Readonly<Record<string, unknown>>;
  loading: ReadonlySet<string>;
}

export interface ObjectUrlResourceState {
  url: string | null;
  loading: boolean;
  error: unknown | null;
}

export type ObjectUrlResourceLoader = (
  resourceId: string,
  signal: AbortSignal,
) => Promise<ObjectUrlSource>;

function resourceEntryKey(scopeKey: string, resourceId: string): string {
  return JSON.stringify([scopeKey, resourceId]);
}

function snapshotState(
  entries: ReadonlyMap<string, ResourceEntry>,
  scopeKey: string,
  resourceIds: readonly string[],
): ObjectUrlResourcesState {
  const urls: Record<string, string> = {};
  const errors: Record<string, unknown> = {};
  const loading = new Set<string>();

  for (const resourceId of resourceIds) {
    const entry = entries.get(resourceEntryKey(scopeKey, resourceId));
    if (!entry) continue;
    if (entry.status === 'ready' && entry.resource) {
      urls[resourceId] = entry.resource.url;
    } else if (entry.status === 'error') {
      errors[resourceId] = entry.error;
    } else {
      loading.add(resourceId);
    }
  }

  return { urls, errors, loading };
}

function disposeEntry(entry: ResourceEntry): void {
  entry.controller.abort();
  entry.resource?.dispose();
}

/**
 * Owns a keyed set of single-consumer Object URLs.
 *
 * Contract:
 * - each loaded URL is owned by this hook instance;
 * - removing/replacing a resource disposes its active URL exactly once;
 * - unmount disposes every active URL;
 * - late async results are immediately disposed and never overwrite current
 *   state;
 * - the loader function itself is intentionally not a reload trigger. The
 *   caller must encode transport/resource identity in scopeKey + resourceId;
 * - loaders start before paint. When a shared authorized loader can satisfy a
 *   resource synchronously (an image this runtime already decoded), the view
 *   renders it in its first frame; the hook owns that handle and releases the
 *   separate handle the loader promise resolves with.
 *
 * This is deliberately not a shared cache. Shared resources need a separate
 * reference-counted owner and consumers must never revoke them directly.
 */
export function useObjectUrlResources(
  scopeKey: string,
  resourceIds: readonly string[],
  loadResource: ObjectUrlResourceLoader,
): ObjectUrlResourcesState {
  const entriesRef = useRef(new Map<string, ResourceEntry>());
  const mountedRef = useRef(false);
  const loadResourceRef = useRef(loadResource);
  loadResourceRef.current = loadResource;

  const [, setState] = useState<ObjectUrlResourcesState>(() => ({
    urls: {},
    errors: {},
    loading: new Set(),
  }));

  const identitySignature = JSON.stringify([
    scopeKey,
    Array.from(new Set(resourceIds)),
  ]);

  useEffect(() => {
    mountedRef.current = true;
    // A revoked shared URL must also leave this (possibly kept) view.
    const unsubscribe = subscribeMediaObjectUrlRevocations((revoked) => {
      let changed = false;
      for (const entry of entriesRef.current.values()) {
        if (entry.status !== 'ready' || !entry.resource) continue;
        if (!revoked.has(entry.resource.url)) continue;
        entry.resource.dispose();
        entry.resource = null;
        entry.status = 'error';
        entry.error = new RevokedObjectUrlError();
        changed = true;
      }
      if (changed) setState((current) => ({ ...current }));
    });
    return () => {
      unsubscribe();
      mountedRef.current = false;
      for (const entry of entriesRef.current.values()) {
        disposeEntry(entry);
      }
      entriesRef.current.clear();
    };
  }, []);

  useLayoutEffect(() => {
    const [activeScopeKey, activeResourceIds] = JSON.parse(
      identitySignature,
    ) as [string, string[]];
    const desiredKeys = new Set(
      activeResourceIds.map((resourceId) =>
        resourceEntryKey(activeScopeKey, resourceId),
      ),
    );

    for (const [key, entry] of entriesRef.current) {
      if (desiredKeys.has(key)) continue;
      entriesRef.current.delete(key);
      disposeEntry(entry);
    }

    const addedEntries: Array<{ key: string; entry: ResourceEntry }> = [];
    for (const resourceId of activeResourceIds) {
      const key = resourceEntryKey(activeScopeKey, resourceId);
      if (entriesRef.current.has(key)) continue;

      const entry: ResourceEntry = {
        resourceId,
        controller: new AbortController(),
        resource: null,
        status: 'loading',
        error: null,
      };
      entriesRef.current.set(key, entry);
      addedEntries.push({ key, entry });
    }

    const started = addedEntries.map(({ key, entry }) => {
      let pending: Promise<ObjectUrlSource>;
      try {
        const captured = captureSynchronousMediaObjectUrl(() =>
          loadResourceRef.current(entry.resourceId, entry.controller.signal),
        );
        pending = Promise.resolve(captured.result);
        if (captured.handle) {
          entry.resource = captured.handle;
          entry.status = 'ready';
        }
      } catch (error) {
        pending = Promise.reject(error);
      }
      return { key, entry, pending };
    });

    setState(
      snapshotState(entriesRef.current, activeScopeKey, activeResourceIds),
    );

    for (const { key, entry, pending } of started) {
      if (entry.status === 'ready') {
        // The synchronous handle is authoritative; the promise owns another.
        void pending.then(
          (source) => ownObjectUrlSource(source).dispose(),
          () => undefined,
        );
        continue;
      }
      void pending
        .then((source) => {
          const resource = ownObjectUrlSource(source);
          if (
            !mountedRef.current ||
            entriesRef.current.get(key) !== entry ||
            entry.controller.signal.aborted
          ) {
            resource.dispose();
            return;
          }

          entry.resource = resource;
          entry.status = 'ready';
          entry.error = null;
          setState((current) => {
            if (entriesRef.current.get(key) !== entry) return current;
            const urls = { ...current.urls, [entry.resourceId]: resource.url };
            const errors = { ...current.errors };
            delete errors[entry.resourceId];
            const loading = new Set(current.loading);
            loading.delete(entry.resourceId);
            return { urls, errors, loading };
          });
        })
        .catch((error: unknown) => {
          if (
            !mountedRef.current ||
            entriesRef.current.get(key) !== entry ||
            entry.controller.signal.aborted
          ) {
            return;
          }

          entry.status = 'error';
          entry.error = error;
          setState((current) => {
            if (entriesRef.current.get(key) !== entry) return current;
            const urls = { ...current.urls };
            delete urls[entry.resourceId];
            const errors = { ...current.errors, [entry.resourceId]: error };
            const loading = new Set(current.loading);
            loading.delete(entry.resourceId);
            return { urls, errors, loading };
          });
        });
    }
  }, [identitySignature]);

  // The requested scope is authoritative during render, before effect cleanup.
  // A context/identity switch must never expose the preceding render's URLs.
  return snapshotState(entriesRef.current, scopeKey, resourceIds);
}

export function useObjectUrlResource(
  scopeKey: string,
  resourceId: string | null | undefined,
  loadResource: ObjectUrlResourceLoader,
): ObjectUrlResourceState {
  const state = useObjectUrlResources(
    scopeKey,
    resourceId === null || resourceId === undefined ? [] : [resourceId],
    loadResource,
  );

  if (resourceId === null || resourceId === undefined) {
    return { url: null, loading: false, error: null };
  }

  return {
    url: state.urls[resourceId] ?? null,
    loading: state.loading.has(resourceId),
    error: resourceId in state.errors ? state.errors[resourceId] : null,
  };
}
