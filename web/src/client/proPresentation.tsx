import { useQuery } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { Configuration } from './apiConfiguration';
import { useApiRuntime } from './apiRuntimeContext';
import { normalizeClientError } from './problemDetails';

const ProPresentationContext = createContext<boolean | null>(null);

export const proPresentationKey = (
  instance: string,
  accountId: string,
  spaceId: string,
) => ['pro-presentation', instance, accountId, spaceId] as const;

/**
 * Read the effective tier once for this authenticated Account/Space session.
 * Navigation never triggers another read. Explicit invalidation (for example
 * after changing a subscription) may refresh the view. The backend still
 * authorizes capabilities and every protected action independently.
 */
export function ProPresentationProvider({ children }: { children: ReactNode }) {
  const runtime = useApiRuntime();
  const instance = runtime?.apiBaseUrl ?? '';
  const accountId = runtime?.accountId ?? '';
  const spaceId = runtime?.spaceId ?? '';
  const accessToken = runtime?.accessToken ?? '';
  const api = useMemo(
    () =>
      new EntitlementsApi(
        new Configuration({
          basePath: instance,
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ),
    [instance, accessToken],
  );
  const hasOwner = Boolean(instance && accountId && spaceId && accessToken);
  const query = useQuery({
    queryKey: proPresentationKey(instance, accountId, spaceId),
    enabled: hasOwner,
    queryFn: async ({ signal }) => {
      try {
        return await api.getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet(
          { spaceId },
          { signal },
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  // Unknown/new scope never borrows another Space's tier. This controls only
  // decorative upgrade marks, not authorization or the availability of content.
  const hide =
    hasOwner &&
    (query.data?.spaceId !== spaceId || query.data.tier === 'PREMIUM');
  return (
    <ProPresentationContext.Provider value={hide}>
      {children}
    </ProPresentationContext.Provider>
  );
}

export function useHideProFeatureMarks() {
  return useContext(ProPresentationContext) ?? false;
}
