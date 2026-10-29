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
import { WirDesignId } from '../api/generated/models/WirDesignId';
import {
  WirDesignPreferenceViewFromJSON,
  type WirDesignPreferenceView,
} from '../api/generated/models/WirDesignPreferenceView';
import { APP_ICON_CAPABILITY, appIconQueryKey } from './appIcon';
import { captureAuthorizedQuery } from './queryIdentity';
import {
  ClientProblemError,
  clientProblemKind,
  normalizeClientError,
} from './problemDetails';

export const WIR_DESIGNS = Object.values(WirDesignId);
export interface WirDesignSnapshot {
  preference: WirDesignPreferenceView;
  etag: string;
}
export function wirDesignQueryKey(
  instance: string,
  accountId: string,
  spaceId: string,
) {
  return ['wir-design', instance, accountId, spaceId] as const;
}
async function snapshot(response: Response): Promise<WirDesignSnapshot> {
  const preference = WirDesignPreferenceViewFromJSON(await response.json());
  const etag = response.headers.get('ETag');
  if (
    !etag ||
    !WIR_DESIGNS.includes(preference.designId) ||
    !Number.isInteger(preference.version) ||
    preference.version < 0
  )
    throw new ClientProblemError(
      'server',
      response.status,
      'INVALID_APPEARANCE_RESPONSE',
    );
  return { preference, etag };
}
function useWirDesignState({
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
  const key = wirDesignQueryKey(instance, accountId, spaceId);
  const capabilityKey = [...key, 'capability'] as const;
  const active = useRef(true);
  const writing = useRef(false);
  const pendingController = useRef<AbortController | null>(null);
  const [inspect, setInspect] = useState(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      pendingController.current?.abort();
    };
  }, []);
  const preference = useQuery({
    queryKey: key,
    gcTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      try {
        return await snapshot(
          (await api.getWirDesignPreferenceRaw({ spaceId }, { signal })).raw,
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
  });
  const capability = useQuery({
    queryKey: capabilityKey,
    gcTime: 0,
    retry: false,
    enabled: inspect,
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
  });
  const mutation = useMutation({
    retry: false,
    mutationFn: async ({
      designId,
      ownsQuery,
      previous,
    }: {
      designId: WirDesignId;
      ownsQuery: () => boolean;
      previous: WirDesignSnapshot;
    }) => {
      const controller = new AbortController();
      pendingController.current = controller;
      try {
        await client.cancelQueries({ queryKey: key, exact: true });
        if (!active.current || !ownsQuery())
          throw new ClientProblemError('unknown');
        if (navigator.onLine === false) throw new ClientProblemError('offline');
        const response = await api.updateWirDesignPreferenceRaw(
          {
            spaceId,
            ifMatch: previous.etag,
            wirDesignPreferencePatch: { designId },
          },
          { signal: controller.signal },
        );
        const result = await snapshot(response.raw);
        if (!active.current || !ownsQuery())
          throw new ClientProblemError('unknown');
        return result;
      } catch (error) {
        throw await normalizeClientError(error);
      } finally {
        if (pendingController.current === controller)
          pendingController.current = null;
      }
    },
    onSuccess: (result, { ownsQuery }) => {
      if (active.current && ownsQuery()) {
        client.setQueryData(key, result);
        void client.invalidateQueries({
          queryKey: appIconQueryKey(instance, accountId, spaceId),
          exact: true,
        });
      }
    },
    onError: (error, { ownsQuery }) => {
      if (
        active.current &&
        ownsQuery() &&
        error instanceof ClientProblemError &&
        error.code === 'PREMIUM_ENTITLEMENT_REQUIRED'
      )
        client.setQueryData(capabilityKey, false);
    },
  });
  const readDenied = ['unauthorized', 'permission', 'notFound'].includes(
    clientProblemKind(preference.error),
  );
  return {
    preference,
    capability,
    mutation,
    current: readDenied
      ? WirDesignId.warm
      : (preference.data?.preference.designId ?? WirDesignId.warm),
    inspectCapability: () => {
      if (inspect) void capability.refetch();
      else setInspect(true);
    },
    save: async (designId: WirDesignId) => {
      if (
        writing.current ||
        !preference.data ||
        preference.error ||
        preference.isFetching
      )
        throw new ClientProblemError('unknown');
      writing.current = true;
      const ownsQuery = captureAuthorizedQuery(client, key);
      try {
        return await mutation.mutateAsync({
          designId,
          previous: preference.data,
          ownsQuery,
        });
      } finally {
        writing.current = false;
      }
    },
  };
}
const Context = createContext<ReturnType<typeof useWirDesignState> | null>(
  null,
);
export function WirDesignProvider(
  props: Parameters<typeof useWirDesignState>[0] & { children: ReactNode },
) {
  const state = useWirDesignState(props);
  return <Context.Provider value={state}>{props.children}</Context.Provider>;
}
export function useWirDesign() {
  return useContext(Context);
}
