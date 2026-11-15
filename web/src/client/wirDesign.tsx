import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { AppearanceApi } from '../api/generated/apis/AppearanceApi';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { WirDesignId } from '../api/generated/models/WirDesignId';
import {
  type WirDesignPreferenceView,
  WirDesignPreferenceViewFromJSON,
} from '../api/generated/models/WirDesignPreferenceView';
import { APP_ICON_CAPABILITY, appIconQueryKey } from './appIcon';
import {
  ClientProblemError,
  clientProblemKind,
  normalizeClientError,
} from './problemDetails';
import { captureAuthorizedQuery } from './queryIdentity';
import {
  entitlementLoader,
  useSpaceCapability,
  withdrawSpaceCapability,
} from './spaceEntitlement';
import {
  forgetWirDesign,
  readWirDesign,
  rememberWirDesign,
  wirDesignStorageKey,
} from './wirDesignPreferenceStore';

export const WIR_DESIGNS: readonly WirDesignId[] = [
  WirDesignId.connected,
  WirDesignId.shared_album,
  WirDesignId.warm,
  WirDesignId.modern,
  WirDesignId.classic,
];
/** The design every account starts with; it needs no entitlement. */
export const DEFAULT_WIR_DESIGN: WirDesignId = WirDesignId.connected;
/** Designs that never require Pro: the default and the earlier default. */
export const FREE_WIR_DESIGNS: readonly WirDesignId[] = [
  WirDesignId.connected,
  WirDesignId.warm,
];
export function isFreeWirDesign(design: WirDesignId): boolean {
  return FREE_WIR_DESIGNS.includes(design);
}
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
  const storageKey = wirDesignStorageKey(instance, accountId, spaceId);
  const [remembered] = useState(() => ({
    key: storageKey,
    design: readWirDesign(storageKey),
  }));
  const initialDesign =
    remembered.key === storageKey ? remembered.design : undefined;
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
    gcTime: 30 * 60_000,
    placeholderData: initialDesign
      ? { preference: { designId: initialDesign, version: 0 }, etag: '' }
      : undefined,
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
  const loadEntitlement = useMemo(
    () => entitlementLoader(entitlementsApi, spaceId),
    [entitlementsApi, spaceId],
  );
  // Reuses the session's single entitlement read from app start.
  const capability = useSpaceCapability({
    accountId,
    spaceId,
    load: loadEntitlement,
    enabled: inspect,
    capability: APP_ICON_CAPABILITY,
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
        rememberWirDesign(storageKey, result.preference.designId);
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
        withdrawSpaceCapability(
          client,
          accountId,
          spaceId,
          APP_ICON_CAPABILITY,
        );
    },
  });
  const readDenied = ['unauthorized', 'permission', 'notFound'].includes(
    clientProblemKind(preference.error),
  );
  useEffect(() => {
    if (readDenied) forgetWirDesign(storageKey);
    else if (
      preference.isSuccess &&
      !preference.isPlaceholderData &&
      preference.data
    ) {
      rememberWirDesign(storageKey, preference.data.preference.designId);
    }
  }, [
    storageKey,
    readDenied,
    preference.isSuccess,
    preference.isPlaceholderData,
    preference.data,
  ]);
  return {
    preference,
    capability,
    mutation,
    presentationReady: initialDesign !== undefined || preference.isFetched,
    current: readDenied
      ? DEFAULT_WIR_DESIGN
      : (preference.data?.preference.designId ??
        initialDesign ??
        DEFAULT_WIR_DESIGN),
    inspectCapability: () => {
      // Opening the settings never re-reads a completed startup read.
      if (!inspect) setInspect(true);
      else if (capability.isError) void capability.refetch();
    },
    save: async (designId: WirDesignId) => {
      if (
        writing.current ||
        !preference.data ||
        preference.isPlaceholderData ||
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
