import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { photoSourcesApi } from './photoSources';

/** Shared account/Space ownership for source selection and personal setup. */
export function usePhotoSources({
  apiBaseUrl,
  accessToken,
  accountId,
  spaceId,
}: {
  apiBaseUrl: string;
  accessToken: string;
  accountId: string;
  spaceId: string;
}) {
  const api = useMemo(
    () => photoSourcesApi(apiBaseUrl, accessToken),
    [apiBaseUrl, accessToken],
  );
  const apiRef = useRef(api);
  useLayoutEffect(() => {
    apiRef.current = api;
  }, [api]);
  const client = useQueryClient();
  const queryKey = ['photo-sources', apiBaseUrl, accountId, spaceId];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      apiRef.current.getPhotoSources({ spaceId }, { signal }),
    retry: false,
  });
  async function refreshAvailability() {
    await client.invalidateQueries(
      { queryKey, exact: true },
      { throwOnError: true },
    );
  }
  return {
    apiRef,
    availability: query.data,
    error: query.error,
    loading: query.isPending,
    refreshAvailability,
  };
}
