import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { clientProblemKind } from './problemDetails';

/** Late operations may reconcile only the exact query that admitted them. */
export function captureQueryIdentity(client: QueryClient, key: QueryKey) {
  const query = client.getQueryCache().find({ queryKey: key, exact: true });
  const identity = query ? new WeakRef(query) : null;
  return () =>
    Boolean(identity?.deref()) &&
    client.getQueryCache().find({ queryKey: key, exact: true }) ===
      identity?.deref();
}

/** A late write cannot replace a newer denied read or recreate missing data. */
export function captureAuthorizedQuery(client: QueryClient, key: QueryKey) {
  const isCurrentQuery = captureQueryIdentity(client, key);
  return () => {
    if (!isCurrentQuery()) return false;
    const state = client.getQueryState(key);
    return (
      state?.data !== undefined &&
      !['unauthorized', 'permission', 'notFound'].includes(
        clientProblemKind(state?.error),
      )
    );
  };
}
