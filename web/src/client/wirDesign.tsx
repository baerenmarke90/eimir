import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { AppearanceApi } from '../api/generated/apis/AppearanceApi';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { WirDesignId } from '../api/generated/models/WirDesignId';
import type { WirDesignPreferencePatch } from '../api/generated/models/WirDesignPreferencePatch';
import {
  type WirDesignPreferenceView,
  WirDesignPreferenceViewFromJSON,
} from '../api/generated/models/WirDesignPreferenceView';
import {
  APP_DESIGNS,
  APP_PALETTE_IDS,
  type AppDesignLayout,
  DEFAULT_APP_DESIGN,
} from '../design/appDesigns.generated';
import { syncDocumentThemeColor } from '../theme';
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
  parseDesignPaletteId,
  parseWirDesignId,
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
  WirDesignId.quiet_together,
  WirDesignId.home_rooms,
  WirDesignId.shared_rhythm,
];
const paletteIds = new Set<WirDesignId>(APP_PALETTE_IDS);
export const DESIGN_PALETTES = WIR_DESIGNS.filter((design) =>
  paletteIds.has(design),
);
/** The design every account starts with; it needs no entitlement. */
export const DEFAULT_WIR_DESIGN: WirDesignId = DEFAULT_APP_DESIGN;
/** Designs that never require Pro: the default and the earlier default. */
export const FREE_WIR_DESIGNS: readonly WirDesignId[] = [
  WirDesignId.connected,
  WirDesignId.warm,
];
export function isFreeWirDesign(design: WirDesignId): boolean {
  return FREE_WIR_DESIGNS.includes(design);
}
/**
 * The layout mode of a design with a token file in design/designs/ (#1907
 * C1). Undefined for designs that still style Wir through their own CSS.
 */
export function wirDesignLayout(
  design: WirDesignId,
): AppDesignLayout | undefined {
  return APP_DESIGNS[design]?.layout;
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
  const designId = parseWirDesignId(preference.designId);
  const etag = response.headers.get('ETag');
  if (
    !etag ||
    !designId ||
    !Number.isInteger(preference.version) ||
    preference.version < 0
  )
    throw new ClientProblemError(
      'server',
      response.status,
      'INVALID_APPEARANCE_RESPONSE',
    );
  return {
    preference: {
      ...preference,
      designId,
      paletteId: parseDesignPaletteId(preference.paletteId),
    },
    etag,
  };
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
    selection: readWirDesign(storageKey),
  }));
  const initialSelection =
    remembered.key === storageKey ? remembered.selection : undefined;
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
    placeholderData: initialSelection
      ? { preference: { ...initialSelection, version: 0 }, etag: '' }
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
      patch,
      ownsQuery,
      previous,
    }: {
      patch: WirDesignPreferencePatch;
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
            wirDesignPreferencePatch: patch,
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
        const { designId, paletteId } = result.preference;
        rememberWirDesign(storageKey, designId, paletteId);
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
      const { designId, paletteId } = preference.data.preference;
      rememberWirDesign(storageKey, designId, paletteId);
    }
  }, [
    storageKey,
    readDenied,
    preference.isSuccess,
    preference.isPlaceholderData,
    preference.data,
  ]);
  const selection = readDenied
    ? undefined
    : (preference.data?.preference ?? initialSelection);

  async function savePreference(patch: WirDesignPreferencePatch) {
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
        patch,
        previous: preference.data,
        ownsQuery,
      });
    } finally {
      writing.current = false;
    }
  }

  return {
    preference,
    capability,
    mutation,
    presentationReady: initialSelection !== undefined || preference.isFetched,
    current: selection?.designId ?? DEFAULT_WIR_DESIGN,
    palette: selection?.paletteId ?? null,
    inspectCapability: () => {
      // Opening the settings never re-reads a completed startup read.
      if (!inspect) setInspect(true);
      else if (capability.isError) void capability.refetch();
    },
    save: (designId: WirDesignId) => savePreference({ designId }),
    savePalette: (paletteId: WirDesignId | null) =>
      savePreference({ paletteId }),
  };
}
const Context = createContext<ReturnType<typeof useWirDesignState> | null>(
  null,
);

/**
 * What the pages compose with. The full state above is a new object on every
 * render of the provider, which renders with the app on each navigation; the
 * pages of every kept tab read only this, which changes with the design.
 */
interface WirDesignPresentation {
  current: WirDesignId;
  presentationReady: boolean;
}
const PresentationContext = createContext<WirDesignPresentation | null>(null);
export function WirDesignProvider(
  props: Parameters<typeof useWirDesignState>[0] & { children: ReactNode },
) {
  const state = useWirDesignState(props);
  const applied = state.presentationReady ? state.current : undefined;
  const palette = applied ? (state.palette ?? applied) : undefined;
  useLayoutEffect(() => {
    if (!applied) return;
    const root = document.documentElement;
    root.setAttribute('data-app-design', applied);
    const layout = wirDesignLayout(applied);
    if (layout) root.setAttribute('data-wir-layout', layout);
    return () => {
      root.removeAttribute('data-app-design');
      root.removeAttribute('data-wir-layout');
    };
  }, [applied]);
  // Palette tokens reach every tab and portaled sheet without changing layout.
  useLayoutEffect(() => {
    if (!palette) return;
    const root = document.documentElement;
    root.setAttribute('data-app-palette', palette);
    syncDocumentThemeColor();
    return () => {
      root.removeAttribute('data-app-palette');
      syncDocumentThemeColor();
    };
  }, [palette]);
  const { current, presentationReady } = state;
  const presentation = useMemo(
    () => ({ current, presentationReady }),
    [current, presentationReady],
  );
  return (
    <Context.Provider value={state}>
      <PresentationContext.Provider value={presentation}>
        {props.children}
      </PresentationContext.Provider>
    </Context.Provider>
  );
}
/** The full design state with its reads and saving, for the settings. */
export function useWirDesign() {
  return useContext(Context);
}

/** The applied design for composing a page; `null` outside a signed-in Space. */
export function useWirDesignPresentation() {
  return useContext(PresentationContext);
}

/** A saved layout is visible as soon as its scoped preference is ready. */
export function useAppLayout() {
  const design = useWirDesignPresentation();
  return design?.presentationReady
    ? wirDesignLayout(design.current)
    : undefined;
}
