import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { clientProblemKind } from './problemDetails';
import {
  loadProductWithReadCache,
  readWarmOverviewCache,
  deleteProductReadCacheEntry,
  type ProductReadResult,
} from './productReadCache';

export const OVERVIEW_STALE_TIME = 60_000;
export const OVERVIEW_GC_TIME = 30 * 60_000;
const observedClients = new WeakSet<QueryClient>();

/** Keep durable snapshots consistent even when a mutation runs from detail. */
export function observeOverviewInvalidation(client: QueryClient): void {
  if (observedClients.has(client)) return;
  observedClients.add(client);
  client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'invalidate') return;
    const cache = event.query.meta?.sharedOverviewCache as
      | {
          accountId: string;
          spaceId: string;
          kind: 'dashboard-overview' | 'plans-overview';
          resourceId: string;
        }
      | undefined;
    if (!cache) return;
    void deleteProductReadCacheEntry(
      cache.accountId,
      cache.spaceId,
      cache.kind,
      cache.resourceId,
    ).catch(() => undefined);
  });
}

export function overviewCacheResourceId(apiBaseUrl: string): string {
  return new URL(apiBaseUrl || '/', window.location.origin).href;
}

/** Bounded shared snapshots; never persist the whole QueryClient or entitlements. */
export function useWarmOverviewQuery<T>({
  queryKey,
  accountId,
  spaceId,
  apiBaseUrl,
  kind,
  load,
  serialize,
  deserialize,
}: {
  queryKey: QueryKey;
  accountId?: string;
  spaceId: string;
  apiBaseUrl?: string;
  kind: 'dashboard-overview' | 'plans-overview';
  load: (signal: AbortSignal) => Promise<T>;
  serialize: (value: T) => unknown;
  deserialize: (payload: unknown) => T;
}) {
  const client = useQueryClient();
  useEffect(() => observeOverviewInvalidation(client), [client]);
  const resourceId =
    apiBaseUrl === undefined ? '' : overviewCacheResourceId(apiBaseUrl);
  const identity = JSON.stringify([accountId, spaceId, kind, resourceId]);
  const keyRef = useRef(queryKey);
  keyRef.current = queryKey;
  const [snapshot, setSnapshot] = useState<{
    identity: string;
    result: ProductReadResult<T>;
  }>();
  const cacheMeta = useMemo(() => {
    const existing = client
      .getQueryCache()
      .find({ queryKey: keyRef.current, exact: true })?.meta
      ?.sharedOverviewCache as
      | { identity: string; source?: 'cache' | 'network'; refreshedAt?: Date }
      | undefined;
    return {
      accountId: accountId ?? '',
      spaceId,
      kind,
      resourceId,
      identity,
      source: existing?.identity === identity ? existing.source : undefined,
      refreshedAt:
        existing?.identity === identity ? existing.refreshedAt : undefined,
    };
  }, [client, identity, accountId, spaceId, kind, resourceId]);
  const decoder = useRef(deserialize);
  decoder.current = deserialize;

  useEffect(() => {
    if (!accountId || !resourceId) return;
    let cancelled = false;
    void readWarmOverviewCache({
      accountId,
      spaceId,
      kind,
      resourceId,
      deserialize: (payload) => decoder.current(payload),
    })
      .then((result) => {
        if (!cancelled && result) setSnapshot({ identity, result });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [accountId, spaceId, kind, resourceId, identity]);

  const query = useQuery<T>({
    queryKey,
    meta:
      accountId && resourceId ? { sharedOverviewCache: cacheMeta } : undefined,
    queryFn: async ({ signal }) => {
      if (!accountId || !resourceId) {
        return load(signal);
      }
      const result = await loadProductWithReadCache({
        accountId,
        spaceId,
        kind,
        resourceId,
        load: () => load(signal),
        serialize,
        deserialize,
      });
      if (!signal.aborted) {
        cacheMeta.source = result.source;
        cacheMeta.refreshedAt = result.refreshedAt;
      }
      return result.value;
    },
    placeholderData: (snapshot?.identity === identity
      ? snapshot.result.value
      : undefined) as UseQueryOptions<T>['placeholderData'],
    // A known-offline read must still resolve its approved local fallback.
    networkMode: 'always',
    staleTime: () => (cacheMeta.source === 'cache' ? 0 : OVERVIEW_STALE_TIME),
    gcTime: OVERVIEW_GC_TIME,
    retry: false,
  });
  const denied = ['unauthorized', 'permission', 'notFound'].includes(
    clientProblemKind(query.error),
  );
  return {
    ...query,
    data: denied ? undefined : query.data,
    isCached:
      !denied && (query.isPlaceholderData || cacheMeta.source === 'cache'),
    cachedAt: query.isPlaceholderData
      ? snapshot?.result.refreshedAt
      : cacheMeta.refreshedAt,
  };
}
