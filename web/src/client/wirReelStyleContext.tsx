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
  type WirReelStylePreferenceView,
  WirReelStylePreferenceViewFromJSON,
} from '../api/generated/models/WirReelStylePreferenceView';
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
import {
  DEFAULT_WIR_REEL_STYLE,
  forgetWirReelStyle,
  isWirReelStyle,
  readWirReelStyle,
  rememberWirReelStyle,
  WIR_REEL_STYLE_CAPABILITY,
  type WirReelStyle,
  wirReelStyleStorageKey,
} from './wirReelStyle';

interface Snapshot {
  preference: WirReelStylePreferenceView;
  etag: string;
}

export function wirReelStyleQueryKey(
  instance: string,
  accountId: string,
  spaceId: string,
) {
  return ['wir-reel-style', instance, accountId, spaceId] as const;
}

/** All appearance choices of a person share one version token (#2283). */
const SIBLING_APPEARANCE_KEYS = [
  'app-icon',
  'wir-design',
  'person-colours',
  'memory-world',
] as const;

async function snapshot(response: Response): Promise<Snapshot> {
  const preference = WirReelStylePreferenceViewFromJSON(await response.json());
  const etag = response.headers.get('ETag');
  if (
    !etag ||
    !Number.isInteger(preference.version) ||
    preference.version < 0 ||
    !isWirReelStyle(preference.styleId)
  )
    throw new ClientProblemError(
      'server',
      response.status,
      'INVALID_APPEARANCE_RESPONSE',
    );
  return { preference, etag };
}

function useWirReelStyleState({
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
  const key = wirReelStyleQueryKey(instance, accountId, spaceId);
  const [inspect, setInspect] = useState(false);
  const storageKey = wirReelStyleStorageKey(instance, accountId, spaceId);
  const remembered = useRef(readWirReelStyle(storageKey));
  const query = useQuery({
    queryKey: key,
    gcTime: 30 * 60_000,
    retry: false,
    placeholderData:
      remembered.current === undefined
        ? undefined
        : { preference: { styleId: remembered.current, version: 0 }, etag: '' },
    queryFn: async ({ signal }) => {
      try {
        return await snapshot(
          (await api.getWirReelStylePreferenceRaw({ spaceId }, { signal })).raw,
        );
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
  });
  const mutation = useMutation({
    retry: false,
    mutationFn: async ({
      style,
      previous,
    }: {
      style: WirReelStyle;
      previous: Snapshot;
    }) => {
      if (navigator.onLine === false) throw new ClientProblemError('offline');
      try {
        const response = await api.updateWirReelStylePreferenceRaw({
          spaceId,
          ifMatch: previous.etag,
          wirReelStylePreferencePatch: { styleId: style },
        });
        return await snapshot(response.raw);
      } catch (error) {
        throw await normalizeClientError(error);
      }
    },
    onSuccess: (result) => {
      client.setQueryData(key, result);
      rememberWirReelStyle(storageKey, result.preference.styleId);
      // The other choices need their fresh concurrency token after this save.
      for (const sibling of SIBLING_APPEARANCE_KEYS)
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
          WIR_REEL_STYLE_CAPABILITY,
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
    capability: WIR_REEL_STYLE_CAPABILITY,
  });
  const readDenied = ['unauthorized', 'permission', 'notFound'].includes(
    clientProblemKind(query.error),
  );
  const style: WirReelStyle = readDenied
    ? DEFAULT_WIR_REEL_STYLE
    : (query.data?.preference.styleId ??
      remembered.current ??
      DEFAULT_WIR_REEL_STYLE);

  useEffect(() => {
    if (readDenied) forgetWirReelStyle(storageKey);
    else if (query.isSuccess && !query.isPlaceholderData && query.data)
      rememberWirReelStyle(storageKey, query.data.preference.styleId);
  }, [
    storageKey,
    readDenied,
    query.isSuccess,
    query.isPlaceholderData,
    query.data,
  ]);

  return {
    style,
    /** True while the chosen style is not known yet (first read without a remembered value). */
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
    save: async (next: WirReelStyle) => {
      const previous = query.data;
      if (!previous || query.isPlaceholderData || !previous.etag)
        throw new ClientProblemError('unknown');
      return mutation.mutateAsync({ style: next, previous });
    },
  };
}

type WirReelStyleState = ReturnType<typeof useWirReelStyleState>;

const Context = createContext<WirReelStyleState | null>(null);
/**
 * The chosen style alone. The full state is a new object on every render of
 * the provider, which renders with the app on each navigation; the kept Wir
 * tab reads only this, which changes with the style.
 */
const StyleIdContext = createContext<{
  style: WirReelStyle;
  pending: boolean;
} | null>(null);

export function WirReelStyleProvider({
  children,
  ...props
}: Parameters<typeof useWirReelStyleState>[0] & { children: ReactNode }) {
  const state = useWirReelStyleState(props);
  const { style, pending } = state;
  const id = useMemo(() => ({ style, pending }), [style, pending]);
  return (
    <Context.Provider value={state}>
      <StyleIdContext.Provider value={id}>{children}</StyleIdContext.Provider>
    </Context.Provider>
  );
}

/** The full style state with its reads and saving, for the settings. */
export function useWirReelStyle(): WirReelStyleState | null {
  return useContext(Context);
}

/** `null` outside a signed-in Space: the reels then show the default circles. */
export function useWirReelStyleId(): {
  style: WirReelStyle;
  pending: boolean;
} | null {
  return useContext(StyleIdContext);
}
