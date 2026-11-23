import { useQuery } from '@tanstack/react-query';
import { useApiRuntime } from './apiRuntimeContext';
import { loadInstanceAccessStatus } from './instanceStatus';

/** The public instance status query App and More already share. */
export function instanceStatusQueryOptions(apiBaseUrl: string) {
  return {
    queryKey: ['instance-status', apiBaseUrl],
    queryFn: () => loadInstanceAccessStatus(apiBaseUrl),
    staleTime: 60_000,
  } as const;
}

/**
 * True only for a signed-in session on an instance that accepts support
 * reports (#2189). Unknown, loading and failed status all read as false, so an
 * entry point never promises a reader that may not exist. Call it only below a
 * `QueryClientProvider`.
 */
export function useSupportReportsAvailable(): boolean {
  const runtime = useApiRuntime();
  const signedIn = Boolean(runtime?.accountId);
  const status = useQuery({
    ...instanceStatusQueryOptions(runtime?.apiBaseUrl ?? ''),
    enabled: signedIn,
  });
  return signedIn && status.data?.supportReportsAvailable === true;
}
