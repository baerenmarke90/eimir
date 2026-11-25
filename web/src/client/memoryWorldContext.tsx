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
import {
  type MemoryWorldPreferenceView,
  MemoryWorldPreferenceViewFromJSON,
} from '../api/generated/models/MemoryWorldPreferenceView';
import {
  DEFAULT_MEMORY_WORLD,
  forgetMemoryWorld,
  isMemoryWorld,
  MEMORY_WORLD_CAPABILITY,
  type MemoryWorld,
  memoryWorldStorageKey,
  readMemoryWorld,
  rememberMemoryWorld,
} from './memoryWorld';
import {
  ClientProblemError,
  clientProblemKind,
  normalizeClientError,
} from './problemDetails';
import {
  entitlementLoader,
  useSpaceCapability,
  withdrawSpaceCapability,
} from './spaceEntitlement';

interface Snapshot {
  preference: MemoryWorldPreferenceView;
  etag: string;
}

export function memoryWorldQueryKey(
  instance: string,
  accountId: string,
  spaceId: string,
) {
  return ['memory-world', instance, accountId, spaceId] as const;
}

async function snapshot(response: Response): Promise<Snapshot> {
  const preference = MemoryWorldPreferenceViewFromJSON(await response.json());
  const etag = response.headers.get('ETag');
  if (
    !etag ||
    !Number.isInteger(preference.version) ||
    preference.version < 0 ||
    !isMemoryWorld(preference.worldId)
  )
    throw new ClientProblemError(
      'server',
      response.status,
      'INVALID_APPEARANCE_RESPONSE',
    );
  return { preference, etag };
}

function useMemoryWorldState({
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
  const key = memoryWorldQueryKey(instance, accountId, spaceId);
  const [inspect, setInspect] = useState(false);
  const storageKey = memoryWorldStorageKey(instance, accountId, spaceId);
  const remembered = useRef(readMemoryWorld(storageKey));
  const query = useQuery({
    queryKey: key,
    gcTime: 30 * 60_000,
    retry: false,
    placeholderData:
      remembered.current === undefined
        ? undefined
        : { preference: { worldId: remembered.current, version: 0 }, etag: '' },
    queryFn: async ({ signal }) => {
      try {
        return await snapshot(
          (await api.getMemoryWorldPreferenceRaw({ spaceId }, { signal })).raw,
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
  });
  const mutation = useMutation({
    retry: false,
    mutationFn: async ({
      world,
      previous,
    }: {
      world: MemoryWorld;
      previous: Snapshot;
    }) => {
      if (navigator.onLine === false) throw new ClientProblemError('offline');
      try {
        const response = await api.updateMemoryWorldPreferenceRaw({
          spaceId,
          ifMatch: previous.etag,
          memoryWorldPreferencePatch: { worldId: world },
        });
        return await snapshot(response.raw);
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: (result) => {
      client.setQueryData(key, result);
      rememberMemoryWorld(storageKey, result.preference.worldId);
      // All appearance choices of a person share one version: the other
      // choices need their fresh concurrency token after this save.
      for (const sibling of ['app-icon', 'wir-design', 'person-colours'])
        void client.invalidateQueries({ queryKey: [sibling] });
    },
    onError: (error) => {
      if (
        error instanceof ClientProblemError &&
        error.code === 'PREMIUM_ENTITLEMENT_REQUIRED'
      )
        withdrawSpaceCapability(
          client,
          accountId,
          spaceId,
          MEMORY_WORLD_CAPABILITY,
        );
    },
  });
  const loadEntitlement = useMemo(
    () => entitlementLoader(entitlementsApi, spaceId),
    [entitlementsApi, spaceId],
  );
  // Read only when the settings sheet opens; reuses the session's entitlement.
  const capability = useSpaceCapability({
    accountId,
    spaceId,
    load: loadEntitlement,
    enabled: inspect,
    capability: MEMORY_WORLD_CAPABILITY,
  });
  const readDenied = ['unauthorized', 'permission', 'notFound'].includes(
    clientProblemKind(query.error),
  );
  const world: MemoryWorld = readDenied
    ? DEFAULT_MEMORY_WORLD
    : (query.data?.preference.worldId ??
      remembered.current ??
      DEFAULT_MEMORY_WORLD);

  useEffect(() => {
    if (readDenied) forgetMemoryWorld(storageKey);
    else if (query.isSuccess && !query.isPlaceholderData && query.data)
      rememberMemoryWorld(storageKey, query.data.preference.worldId);
  }, [
    storageKey,
    readDenied,
    query.isSuccess,
    query.isPlaceholderData,
    query.data,
  ]);

  return {
    world,
    /** True while the chosen world is not known yet (first read without a remembered value). */
    pending: query.isPending && remembered.current === undefined,
    capability,
    inspectCapability: () => {
      if (!inspect) setInspect(true);
      else if (capability.isError) void capability.refetch();
    },
    ready:
      !query.isPlaceholderData &&
      query.isSuccess &&
      Boolean(query.data?.etag) &&
      !query.isFetching,
    saving: mutation.isPending,
    save: async (next: MemoryWorld) => {
      const previous = query.data;
      if (!previous || query.isPlaceholderData || !previous.etag)
        throw new ClientProblemError('unknown');
      return mutation.mutateAsync({ world: next, previous });
    },
  };
}

type MemoryWorldState = ReturnType<typeof useMemoryWorldState>;

const Context = createContext<MemoryWorldState | null>(null);

export function MemoryWorldProvider({
  children,
  ...props
}: Parameters<typeof useMemoryWorldState>[0] & { children: ReactNode }) {
  const state = useMemoryWorldState(props);
  return <Context.Provider value={state}>{children}</Context.Provider>;
}

/** `null` outside a signed-in Space: Erinnerungen then shows the default Story. */
export function useMemoryWorld(): MemoryWorldState | null {
  return useContext(Context);
}
