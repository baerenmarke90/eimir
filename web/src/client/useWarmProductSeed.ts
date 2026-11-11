import { useEffect, useRef } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { clientProblemKind } from './problemDetails';
import {
  readWarmOverviewCache,
  type ProductReadResult,
} from './productReadCache';

/**
 * Paint a stored snapshot while the query's own network read is in flight.
 * The read replaces it; an authoritative denial removes it from the screen.
 */
export function useWarmProductSeed<T, TData>({
  queryKey,
  accountId,
  spaceId,
  kind,
  resourceId,
  deserialize,
  toQueryData,
  error,
  enabled = true,
}: {
  queryKey: QueryKey;
  accountId: string;
  spaceId: string;
  kind: 'story' | 'story-discover' | 'memory' | 'heartMoment' | 'milestone';
  resourceId: string;
  deserialize: (payload: unknown) => T;
  toQueryData: (snapshot: ProductReadResult<T>) => TData;
  error: unknown;
  /** False while a form owns the data: a stale snapshot must not seed an edit. */
  enabled?: boolean;
}): void {
  const client = useQueryClient();
  const identity = JSON.stringify(queryKey);
  const latest = useRef({ queryKey, deserialize, toQueryData });
  latest.current = { queryKey, deserialize, toQueryData };
  const seeded = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !resourceId) return;
    let live = true;
    void readWarmOverviewCache({
      accountId,
      spaceId,
      kind,
      resourceId,
      deserialize: (payload) => latest.current.deserialize(payload),
    })
      .then((snapshot) => {
        if (!live || !snapshot) return;
        const key = latest.current.queryKey;
        const state = client.getQueryState(key);
        if (state?.data !== undefined || state?.status === 'error') return;
        seeded.current = identity;
        client.setQueryData(
          key,
          latest.current.toQueryData({ ...snapshot, source: 'warm' }),
          { updatedAt: 0 },
        );
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [client, accountId, spaceId, kind, resourceId, identity, enabled]);

  const denied = ['unauthorized', 'permission', 'notFound'].includes(
    clientProblemKind(error),
  );
  useEffect(() => {
    if (!denied || seeded.current !== identity) return;
    seeded.current = null;
    const query = client
      .getQueryCache()
      .find({ queryKey: latest.current.queryKey, exact: true });
    if (query) query.setState({ data: undefined, dataUpdatedAt: 0 });
  }, [client, denied, identity]);
}
