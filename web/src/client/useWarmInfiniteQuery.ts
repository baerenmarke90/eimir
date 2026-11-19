import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
  type UseInfiniteQueryOptions,
} from '@tanstack/react-query';
import { useApiRuntime } from './apiRuntimeContext';
import { clientProblemKind } from './problemDetails';
import {
  readWarmOverviewCache,
  saveProductReadCacheEntry,
  deleteProductReadCacheEntry,
  captureSharedListCacheWrite,
} from './productReadCache';
import { captureQueryIdentity } from './queryIdentity';
import { observeOverviewInvalidation } from './useWarmOverviewQuery';

// JSON preserves authored strings exactly; dates receive an explicit typed tag.
export function encodeReadValue(value: unknown): unknown {
  if (value instanceof Date) return { $eimirDate: value.toISOString() };
  if (Array.isArray(value)) return value.map(encodeReadValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, encodeReadValue(item)]),
    );
  return value;
}

export function decodeReadValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeReadValue);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (
      Object.keys(record).length === 1 &&
      typeof record.$eimirDate === 'string'
    ) {
      const date = new Date(record.$eimirDate);
      if (!Number.isFinite(date.getTime()))
        throw new Error('Invalid cached date.');
      return date;
    }
    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => [key, decodeReadValue(item)]),
    );
  }
  return value;
}

/** Only shared browse queries may restore loaded pages from durable storage. */
export function useWarmInfiniteQuery<TPage, TPageParam>(
  options: UseInfiniteQueryOptions<
    TPage,
    Error,
    InfiniteData<TPage, TPageParam>,
    QueryKey,
    TPageParam
  >,
  {
    revalidateOnRestore = false,
    persist = true,
  }: { revalidateOnRestore?: boolean; persist?: boolean } = {},
) {
  const runtime = useApiRuntime();
  const client = useQueryClient();
  const accountId = persist ? runtime?.accountId : undefined;
  const spaceId = persist ? runtime?.spaceId : undefined;
  const resourceId = JSON.stringify([runtime?.apiBaseUrl, options.queryKey]);
  const identity = JSON.stringify([accountId, spaceId, resourceId]);
  const keyRef = useRef(options.queryKey);
  keyRef.current = options.queryKey;
  const [hydrated, setHydrated] = useState('');
  const [restored, setRestored] = useState<{
    identity: string;
    refreshedAt?: Date;
  }>();
  const durable = Boolean(accountId && spaceId);
  const meta = useMemo(
    () =>
      accountId && spaceId
        ? { accountId, spaceId, kind: 'shared-list' as const, resourceId }
        : undefined,
    [accountId, spaceId, resourceId],
  );
  const writeGuard = useRef<() => boolean>(() => false);
  const queryFn = options.queryFn;
  const query = useInfiniteQuery({
    ...options,
    queryFn:
      typeof queryFn === 'function'
        ? async (context) => {
            const current =
              accountId && spaceId
                ? captureSharedListCacheWrite(accountId, spaceId, resourceId)
                : () => false;
            const page = await queryFn(context);
            if (!context.signal.aborted) writeGuard.current = current;
            return page;
          }
        : queryFn,
    enabled: durable && hydrated !== identity ? false : options.enabled,
    staleTime: options.staleTime ?? 5 * 60_000,
    gcTime: 30 * 60_000,
    meta: { ...options.meta, sharedOverviewCache: meta },
  });
  useEffect(() => observeOverviewInvalidation(client), [client]);
  useEffect(() => {
    if (!accountId || !spaceId) return;
    let live = true;
    const key = keyRef.current;
    const current = captureQueryIdentity(client, key);
    void readWarmOverviewCache<InfiniteData<TPage, TPageParam>>({
      accountId,
      spaceId,
      kind: 'shared-list',
      resourceId,
      deserialize: (value) =>
        decodeReadValue(value) as InfiniteData<TPage, TPageParam>,
    })
      .then((cached) => {
        if (!live || !current()) return;
        const state = client.getQueryState(key);
        if (cached && !state?.data && !state?.isInvalidated) {
          client.setQueryData(key, cached.value, {
            // A Plan's former overview contract revalidates a cold snapshot.
            updatedAt: revalidateOnRestore ? 0 : cached.refreshedAt?.getTime(),
          });
          if (revalidateOnRestore)
            setRestored({ identity, refreshedAt: cached.refreshedAt });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (live) setHydrated(identity);
      });
    return () => {
      live = false;
    };
  }, [accountId, spaceId, identity, client, resourceId, revalidateOnRestore]);
  const denied = ['unauthorized', 'permission', 'notFound'].includes(
    clientProblemKind(query.error),
  );
  useEffect(() => {
    if (!accountId || !spaceId) return;
    if (denied) {
      void deleteProductReadCacheEntry(
        accountId,
        spaceId,
        'shared-list',
        resourceId,
      );
      return;
    }
    if (
      !query.data ||
      query.isFetching ||
      query.isStale ||
      !writeGuard.current()
    )
      return;
    // Keep a contiguous prefix so cursor restoration cannot start in the middle.
    const value = {
      pages: query.data.pages.slice(0, 12),
      pageParams: query.data.pageParams.slice(0, 12),
    };
    void saveProductReadCacheEntry({
      accountId,
      spaceId,
      kind: 'shared-list',
      resourceId,
      value,
      serialize: encodeReadValue,
      refreshedAt: new Date(query.dataUpdatedAt),
    });
  }, [
    accountId,
    spaceId,
    resourceId,
    denied,
    query.data,
    query.dataUpdatedAt,
    query.isFetching,
    query.isStale,
  ]);
  return {
    ...query,
    data: denied ? undefined : query.data,
    isCached:
      !denied &&
      Boolean(query.data) &&
      restored?.identity === identity &&
      query.dataUpdatedAt === 0,
    cachedAt:
      restored?.identity === identity ? restored.refreshedAt : undefined,
    isLoading:
      query.isLoading || (durable && hydrated !== identity && !query.data),
  };
}
