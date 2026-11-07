import { useQuery } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { Configuration } from './apiConfiguration';
import { useApiRuntime } from './apiRuntimeContext';
import { normalizeClientError } from './problemDetails';

const ProPresentationContext = createContext<{
  hide: boolean;
  register: () => () => void;
} | null>(null);

export const proPresentationKey = (
  instance: string,
  accountId: string,
  spaceId: string,
) => ['pro-presentation', instance, accountId, spaceId] as const;

/** Presentation only. Backend capabilities continue to authorize every action. */
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
  const [readers, setReaders] = useState(0);
  const register = useCallback(() => {
    setReaders((count) => count + 1);
    return () => setReaders((count) => Math.max(0, count - 1));
  }, []);
  // Inspect only where feature marks are actually present, and share that read.
  const enabled = hasOwner && readers > 0;
  const query = useQuery({
    queryKey: proPresentationKey(instance, accountId, spaceId),
    enabled,
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
    staleTime: 30_000,
    gcTime: 0,
    refetchInterval: 60_000,
  });
  // Avoid flashing upgrade marks before the effective Space tier is known.
  // A retained authorized tier is safe for decoration, never for capability grants.
  const hide =
    hasOwner &&
    (query.data?.spaceId !== spaceId || query.data.tier === 'PREMIUM');
  const value = useMemo(() => ({ hide, register }), [hide, register]);
  return (
    <ProPresentationContext.Provider value={value}>
      {children}
    </ProPresentationContext.Provider>
  );
}

export function useHideProFeatureMarks() {
  const context = useContext(ProPresentationContext);
  const register = context?.register;
  useEffect(() => register?.(), [register]);
  return context?.hide ?? false;
}
