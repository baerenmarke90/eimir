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
import type { AppIconId } from '../api/generated/models/AppIconId';
import { setDocumentAppIcon } from '../theme';
import {
  APP_ICON_CAPABILITY,
  type AppIconSnapshot,
  appIconQueryKey,
  loadAppIcon,
  saveAppIcon,
} from './appIcon';
import { ClientProblemError } from './problemDetails';
import { captureQueryIdentity } from './queryIdentity';
import {
  entitlementLoader,
  useSpaceCapability,
  withdrawSpaceCapability,
} from './spaceEntitlement';
import { useNativeAppIcon } from './useNativeAppIcon';

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
  const launcher = useNativeAppIcon(preference.data?.preference.iconId);
  const loadEntitlement = useMemo(
    () => entitlementLoader(entitlementsApi, spaceId),
    [entitlementsApi, spaceId],
  );
  // Reuses the session's single entitlement read from app start.
  const capability = useSpaceCapability({
    accountId,
    spaceId,
    load: loadEntitlement,
    enabled: inspectCapability,
    capability: APP_ICON_CAPABILITY,
  });
  useEffect(() => {
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
      if (active.current && ownsQuery()) {
        client.setQueryData(key, snapshot);
        void client.invalidateQueries({
          queryKey: ['wir-design', instance, accountId, spaceId],
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
      ) {
        withdrawSpaceCapability(
          client,
          accountId,
          spaceId,
          APP_ICON_CAPABILITY,
        );
      }
    },
    retry: false,
  });
  return {
    launcher,
    preference,
    capability,
    mutation,
    inspectCapability: () => {
      // Opening the settings never re-reads a completed startup read.
      if (!inspectCapability) setInspectCapability(true);
      else if (capability.isError) void capability.refetch();
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
