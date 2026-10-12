import type { QueryClient, QueryKey } from '@tanstack/react-query';

/** Late operations may reconcile only the exact query that admitted them. */
export function captureQueryIdentity(client: QueryClient, key: QueryKey) {
  const query = client.getQueryCache().find({ queryKey: key, exact: true });
  return () =>
    Boolean(query) &&
    client.getQueryCache().find({ queryKey: key, exact: true }) === query;
}
