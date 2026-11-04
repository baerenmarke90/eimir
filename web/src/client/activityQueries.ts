import { useInfiniteQuery } from '@tanstack/react-query';
import type { ActivityApi } from '../api/generated/apis/ActivityApi';
import type { ActivityItem } from '../api/generated/models/ActivityItem';
import { authorSummaryQueryKeys } from './authorSummaryConsumers';
import { opaqueNextCursor } from './m4Product';
import { clientProblemKind, normalizeClientError } from './problemDetails';

/** Wir and Activities own the same authorized event pages and chronology. */
export function useActivityQuery(
  api: ActivityApi,
  spaceId: string,
  accountId?: string,
  scope: 'shared' | 'own' = 'shared',
) {
  return useInfiniteQuery({
    queryKey: [...authorSummaryQueryKeys.activity(spaceId), accountId, scope],
    queryFn: async ({ pageParam }) => {
      try {
        return await api.getActivity({
          spaceId,
          cursor: pageParam,
          limit: 20,
          scope,
        });
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    initialPageParam: null as string | null,
    getNextPageParam: opaqueNextCursor,
    enabled: Boolean(api && spaceId),
    retry: false,
  });
}

export function readableActivityItems(query: {
  data?: { pages: { items: ActivityItem[] }[] };
  error: unknown;
}): ActivityItem[] {
  return ['unauthorized', 'permission', 'notFound'].includes(
    clientProblemKind(query.error),
  )
    ? []
    : (query.data?.pages.flatMap((page) => page.items) ?? []);
}
