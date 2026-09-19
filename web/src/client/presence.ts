import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { SpacesApi } from '../api/generated/apis/SpacesApi';
import type { PartnerPresenceView } from '../api/generated/models/PartnerPresenceView';
import { Configuration } from '../api/generated/runtime';
import { useApiRuntime } from './apiRuntimeContext';

export const PRESENCE_HEARTBEAT_INTERVAL_MS = 60_000;
export const PRESENCE_EVENT_DEDUPE_MS = 5_000;

export function partnerPresenceQueryKey(accountId: string, spaceId: string) {
  return ['partner-presence', accountId, spaceId] as const;
}

export function createPresenceApi(apiBaseUrl: string, accessToken: string): SpacesApi {
  return new SpacesApi(
    new Configuration({
      basePath: apiBaseUrl,
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  );
}

export function usePartnerPresence({
  accountId,
  spaceId,
  enabled,
}: {
  accountId: string;
  spaceId: string;
  enabled: boolean;
}) {
  const runtime = useApiRuntime();
  const api = useMemo(
    () =>
      runtime
        ? createPresenceApi(runtime.apiBaseUrl, runtime.accessToken)
        : null,
    [runtime],
  );

  return useQuery<PartnerPresenceView>({
    queryKey: partnerPresenceQueryKey(accountId, spaceId),
    queryFn: () => {
      if (!api) throw new Error('Presence API runtime unavailable.');
      return api.getPartnerPresence({ spaceId });
    },
    enabled: enabled && Boolean(api && accountId && spaceId),
    retry: false,
    staleTime: PRESENCE_HEARTBEAT_INTERVAL_MS,
    refetchOnWindowFocus: 'always',
  });
}
