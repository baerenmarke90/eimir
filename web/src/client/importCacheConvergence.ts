import { useEffect, useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { TransferImportDetail } from '../api/generated/models/TransferImportDetail';
import { ImportStatus } from '../api/generated/models/ImportStatus';
import { clearProductReadCache } from './productReadCache';

function isActiveSpaceProductQuery(
  queryKey: readonly unknown[],
  spaceId: string,
): boolean {
  return queryKey[0] !== 'transfer' && queryKey.includes(spaceId);
}

/**
 * Converge both Web cache layers after an import mutates the active Space.
 * The QueryClient itself is Account-lifecycle scoped; matching the Space id
 * avoids invalidating cached data for another Space in the same session.
 */
export async function convergeImportedProductReads(
  queryClient: QueryClient,
  spaceId: string,
): Promise<void> {
  await Promise.all([
    clearProductReadCache(),
    queryClient.invalidateQueries({
      predicate: (query) => isActiveSpaceProductQuery(query.queryKey, spaceId),
    }),
  ]);
}

export function useImportCacheConvergence(
  detail: TransferImportDetail | undefined,
  spaceId: string,
): unknown {
  const queryClient = useQueryClient();
  const attemptedImportIds = useRef(new Set<string>());
  const previousImportId = useRef<string | null>(null);
  const mounted = useRef(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (detail?.id !== previousImportId.current) {
      previousImportId.current = detail?.id ?? null;
      setError(null);
    }
    if (
      detail?.status !== ImportStatus.COMPLETED ||
      attemptedImportIds.current.has(detail.id)
    ) {
      return;
    }

    attemptedImportIds.current.add(detail.id);
    void convergeImportedProductReads(queryClient, spaceId).catch(
      (convergenceError: unknown) => {
        if (mounted.current && previousImportId.current === detail.id) {
          setError(convergenceError);
        }
      },
    );
  }, [detail?.id, detail?.status, queryClient, spaceId]);

  return error;
}
