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
  type PersonColoursPreferenceView,
  PersonColoursPreferenceViewFromJSON,
} from '../api/generated/models/PersonColoursPreferenceView';
import { APP_ICON_CAPABILITY } from './appIcon';
import {
  PERSON_COLOUR_PAIRS,
  type PersonColourPairId,
  personColourPair,
  personColourVariables,
} from './personColours';
import {
  forgetPersonColours,
  personColoursStorageKey,
  readPersonColours,
  rememberPersonColours,
} from './personColoursStore';
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
  preference: PersonColoursPreferenceView;
  etag: string;
}

export function personColoursQueryKey(
  instance: string,
  accountId: string,
  spaceId: string,
) {
  return ['person-colours', instance, accountId, spaceId] as const;
}

async function snapshot(response: Response): Promise<Snapshot> {
  const preference = PersonColoursPreferenceViewFromJSON(await response.json());
  const etag = response.headers.get('ETag');
  if (
    !etag ||
    !Number.isInteger(preference.version) ||
    preference.version < 0 ||
    (preference.colours !== null &&
      !PERSON_COLOUR_PAIRS.includes(preference.colours))
  )
    throw new ClientProblemError(
      'server',
      response.status,
      'INVALID_APPEARANCE_RESPONSE',
    );
  return { preference, etag };
}

/** Choosing a pair is part of the bespoke personalization pack (Pro). */
export const PERSON_COLOURS_CAPABILITY = APP_ICON_CAPABILITY;

function usePersonColoursState({
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
  const key = personColoursQueryKey(instance, accountId, spaceId);
  const [inspect, setInspect] = useState(false);
  const storageKey = personColoursStorageKey(instance, accountId, spaceId);
  const remembered = useRef(readPersonColours(storageKey));
  const query = useQuery({
    queryKey: key,
    gcTime: 30 * 60_000,
    retry: false,
    placeholderData:
      remembered.current === undefined
        ? undefined
        : {
            preference: { colours: remembered.current, version: 0 },
            etag: '',
          },
    queryFn: async ({ signal }) => {
      try {
        return await snapshot(
          (await api.getPersonColoursPreferenceRaw({ spaceId }, { signal }))
            .raw,
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
  });
  const mutation = useMutation({
    retry: false,
    mutationFn: async ({
      colours,
      previous,
    }: {
      colours: PersonColourPairId | null;
      previous: Snapshot;
    }) => {
      if (navigator.onLine === false) throw new ClientProblemError('offline');
      try {
        const response = await api.updatePersonColoursPreferenceRaw({
          spaceId,
          ifMatch: previous.etag,
          personColoursPreferencePatch: { colours },
        });
        return await snapshot(response.raw);
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: (result) => {
      client.setQueryData(key, result);
      rememberPersonColours(storageKey, result.preference.colours);
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
          PERSON_COLOURS_CAPABILITY,
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
    capability: PERSON_COLOURS_CAPABILITY,
  });
  const readDenied = ['unauthorized', 'permission', 'notFound'].includes(
    clientProblemKind(query.error),
  );
  const colours: PersonColourPairId | null = readDenied
    ? null
    : (query.data?.preference.colours ?? remembered.current ?? null);

  useEffect(() => {
    if (readDenied) forgetPersonColours(storageKey);
    else if (query.isSuccess && !query.isPlaceholderData && query.data)
      rememberPersonColours(storageKey, query.data.preference.colours);
  }, [
    storageKey,
    readDenied,
    query.isSuccess,
    query.isPlaceholderData,
    query.data,
  ]);

  // Every `person-role-*` surface reads these four variables, so one write
  // recolours lists and the Wir stage without re-rendering them.
  useEffect(() => {
    const root = document.documentElement;
    const variables = personColourVariables(personColourPair(colours));
    for (const [name, value] of Object.entries(variables))
      root.style.setProperty(name, value);
    return () => {
      for (const name of Object.keys(variables))
        root.style.removeProperty(name);
    };
  }, [colours]);

  return {
    colours,
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
    save: async (next: PersonColourPairId | null) => {
      const previous = query.data;
      if (!previous || query.isPlaceholderData || !previous.etag)
        throw new ClientProblemError('unknown');
      return mutation.mutateAsync({ colours: next, previous });
    },
  };
}

type PersonColoursState = ReturnType<typeof usePersonColoursState>;

const Context = createContext<PersonColoursState | null>(null);

export function PersonColoursProvider({
  children,
  ...props
}: Parameters<typeof usePersonColoursState>[0] & { children: ReactNode }) {
  const state = usePersonColoursState(props);
  return <Context.Provider value={state}>{children}</Context.Provider>;
}

/** `null` outside a signed-in Space: callers then fall back to the default pair. */
export function usePersonColours(): PersonColoursState | null {
  return useContext(Context);
}
