import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ContextTagsApi } from '../api/generated/apis/ContextTagsApi';
import { Configuration } from './apiConfiguration';
import { useApiRuntime } from './apiRuntimeContext';

export function useContextTagSuggestions(
  parentType?: 'MEMORY' | 'HEART_MOMENT' | 'PLAN' | 'WISH',
  parentId?: string,
) {
  const runtime = useApiRuntime();
  const api = useMemo(
    () =>
      runtime
        ? new ContextTagsApi(
            new Configuration({
              basePath: runtime.apiBaseUrl,
              headers: { Authorization: `Bearer ${runtime.accessToken}` },
            }),
          )
        : undefined,
    [runtime],
  );
  const query = useQuery({
    queryKey: [
      'context-tags',
      runtime?.spaceId,
      runtime?.accountId,
      runtime?.apiBaseUrl,
      parentType,
      parentId,
    ],
    enabled: Boolean(api && runtime?.spaceId && runtime.accountId),
    queryFn: ({ signal }) => {
      if (!api || !runtime?.spaceId)
        throw new Error('Tag context is unavailable.');
      return api.getContextTagSuggestions(
        {
          spaceId: runtime.spaceId,
          sharedOnly: parentType !== 'HEART_MOMENT',
          ...(parentId && parentType ? { parentType, parentId } : {}),
        },
        { signal },
      );
    },
    staleTime: 60_000,
    gcTime: 60_000,
    retry: false,
  });
  return query.isError ? undefined : query.data;
}
