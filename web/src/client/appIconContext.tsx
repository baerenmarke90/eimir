import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppearanceApi } from '../api/generated/apis/AppearanceApi';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { AppIconId } from '../api/generated/models/AppIconId';
import { setDocumentAppIcon } from '../theme';
import {
  APP_ICON_CAPABILITY,
  appIconQueryKey,
  loadAppIcon,
  saveAppIcon,
  type AppIconSnapshot,
} from './appIcon';
import { normalizeClientError, ClientProblemError } from './problemDetails';
import { captureQueryIdentity } from './queryIdentity';

function useAppIconState({
  api,
  entitlementsApi,
  instance,
  accountId,
  spaceId,
}: {
  api: AppearanceApi;
  entitlementsApi: EntitlementsApi;
  instance: string;
  accountId: string;
  spaceId: string;
}) {
  const client = useQueryClient();
  const key = appIconQueryKey(instance, accountId, spaceId);
  const capabilityKey = [...key, 'capability'] as const;
  const active = useRef(true);
  const pendingController = useRef<AbortController | null>(null);
  const [inspectCapability, setInspectCapability] = useState(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      pendingController.current?.abort();
      setDocumentAppIcon('original');
    };
  }, []);
  const preference = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => loadAppIcon(api, spaceId, signal),
    retry: false,
    gcTime: 0,
  });
  const capability = useQuery({
    enabled: inspectCapability,
    queryKey: capabilityKey,
    queryFn: async ({ signal }) => {
      try {
        const state =
          await entitlementsApi.getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet(
            { spaceId },
            { signal },
          );
        return state.capabilities.includes(APP_ICON_CAPABILITY);
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    retry: false,
    gcTime: 0,
  });
  useEffect(() => {
    // Personal preference affects this browser tab, never an installed launcher.
    // An unavailable refresh retains the last authorized read for this owner.
    setDocumentAppIcon(preference.data?.preference.iconId ?? 'original');
  }, [preference.data]);
  const mutation = useMutation({
    mutationFn: async ({
      iconId,
      snapshot,
      ownsQuery,
    }: {
      iconId: AppIconId;
      snapshot: AppIconSnapshot;
      ownsQuery: () => boolean;
    }) => {
      const controller = new AbortController();
      pendingController.current = controller;
      try {
        const result = await saveAppIcon(
          api,
          spaceId,
          snapshot,
          iconId,
          controller.signal,
        );
        if (!active.current || !ownsQuery())
          throw new ClientProblemError('unknown');
        return result;
      } finally {
        if (pendingController.current === controller)
          pendingController.current = null;
      }
    },
    onSuccess: (snapshot, { ownsQuery }) => {
      if (active.current && ownsQuery()) client.setQueryData(key, snapshot);
    },
    onError: (error, { ownsQuery }) => {
      if (
        active.current &&
        ownsQuery() &&
        error instanceof ClientProblemError &&
        error.code === 'PREMIUM_ENTITLEMENT_REQUIRED'
      ) {
        client.setQueryData(capabilityKey, false);
      }
    },
    retry: false,
  });
  return {
    preference,
    capability,
    mutation,
    inspectCapability: () => {
      if (inspectCapability) void capability.refetch();
      else setInspectCapability(true);
    },
    save: async (iconId: AppIconId) => {
      const snapshot = preference.data;
      if (!snapshot) throw new ClientProblemError('unknown');
      const ownsQuery = captureQueryIdentity(client, key);
      return mutation.mutateAsync({ iconId, snapshot, ownsQuery });
    },
  };
}

const Context = createContext<ReturnType<typeof useAppIconState> | null>(null);

export function AppIconProvider(
  props: Parameters<typeof useAppIconState>[0] & { children: ReactNode },
) {
  const state = useAppIconState(props);
  return <Context.Provider value={state}>{props.children}</Context.Provider>;
}

export function useAppIcon() {
  return useContext(Context);
}
