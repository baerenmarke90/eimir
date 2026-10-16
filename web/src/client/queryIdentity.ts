import type { QueryClient, QueryKey } from '@tanstack/react-query';

/** Late operations may reconcile only the exact query that admitted them. */
export function captureQueryIdentity(client: QueryClient, key: QueryKey) {
  const query = client.getQueryCache().find({ queryKey: key, exact: true });
  const identity = query ? new WeakRef(query) : null;
  return () =>
    Boolean(identity?.deref()) &&
    client.getQueryCache().find({ queryKey: key, exact: true }) ===
      identity?.deref();
}
