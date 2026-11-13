import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import type { PartnerLocationApi } from '../api/generated/apis/PartnerLocationApi';
import type { DistanceBandView } from '../api/generated/models/DistanceBandView';
import type { PartnerLocationSettingsView } from '../api/generated/models/PartnerLocationSettingsView';
import type { PartnerMapView } from '../api/generated/models/PartnerMapView';
import {
  type ApproximatePosition,
  currentApproximatePosition,
  type LocationPermission,
  locationPermission,
} from './approximateLocation';
import {
  isEntitlementRequired,
  PARTNER_LOCATION_CAPABILITY,
  partnerLocationSettingsQueryKey,
} from './partnerLocation';
import { normalizeClientError } from './problemDetails';
import { withdrawSpaceCapability } from './spaceEntitlement';

/**
 * Viewer-side partner distance on Wir and the "where we are" map (#1792).
 *
 * The server computes the band; the viewer's own position is only a transient
 * request input and is never written to the query cache or any storage. Reads
 * happen on open and resume only (contract docs/m9/PARTNER-LOCATION.md §6).
 */

/** Values older than this are an earlier state, never live (contract §5). */
export const DISTANCE_FRESH_MS = 2 * 60 * 60 * 1000;
/** Resume reads closer together than this reuse the previous result. */
export const DISTANCE_RESUME_MIN_INTERVAL_MS = 60_000;

export type PartnerDistanceLine =
  | { kind: 'hidden' }
  /** Only the viewer sees this: their own position is missing. */
  | { kind: 'ownMissing' }
  | {
      kind: 'distance';
      band: DistanceBandView;
      asOf: Date;
      /** The partner shares the map level, so the line opens the map. */
      mapAvailable: boolean;
    };

const HIDDEN: PartnerDistanceLine = { kind: 'hidden' };

type DistanceApi = Pick<
  PartnerLocationApi,
  'getPartnerDistance' | 'getPartnerLocationMap'
>;

/** Measures only when already allowed: Wir never opens the OS dialog. */
async function ownPositionIfAllowed(
  permission: () => Promise<LocationPermission>,
  measure: () => Promise<ApproximatePosition>,
): Promise<ApproximatePosition | null> {
  try {
    if ((await permission()) !== 'granted') return null;
    return await measure();
  } catch {
    return null;
  }
}

/**
 * One distance read for the Wir line.
 *
 * Without an own position the server cannot say whether the partner shares
 * only the distance, so the viewer-only hint appears when the viewer shares
 * themselves (their own share then lacks a position too) or the partner's map
 * area is readable. Otherwise the line stays absent without a reason.
 */
export async function readPartnerDistanceLine({
  api,
  spaceId,
  ownSharingActive,
  permission = locationPermission,
  measure = () => currentApproximatePosition(),
}: {
  api: DistanceApi;
  spaceId: string;
  ownSharingActive: boolean;
  permission?: () => Promise<LocationPermission>;
  measure?: () => Promise<ApproximatePosition>;
}): Promise<PartnerDistanceLine> {
  const position = await ownPositionIfAllowed(permission, measure);
  if (!position) {
    if (ownSharingActive) return { kind: 'ownMissing' };
    const map = await api.getPartnerLocationMap({ spaceId });
    return map.available ? { kind: 'ownMissing' } : HIDDEN;
  }
  const distance = await api.getPartnerDistance({
    spaceId,
    presencePosition: {
      latitude: position.latitude,
      longitude: position.longitude,
      capturedAt: position.capturedAt,
    },
  });
  if (!distance.available || !distance.band || !distance.asOf) return HIDDEN;
  // Only availability leaves this function; the area stays on the server.
  const map = await api.getPartnerLocationMap({ spaceId });
  return {
    kind: 'distance',
    band: distance.band,
    asOf: distance.asOf,
    mapAvailable: map.available,
  };
}

export function partnerDistanceQueryKey(accountId: string, spaceId: string) {
  return ['partner-distance', accountId, spaceId] as const;
}

export function partnerMapQueryKey(accountId: string, spaceId: string) {
  return ['partner-location-map', accountId, spaceId] as const;
}

export function isDistanceFresh(asOf: Date, now: Date = new Date()): boolean {
  return now.getTime() - asOf.getTime() <= DISTANCE_FRESH_MS;
}

/** Withdraw the capability on a Premium denial, then rethrow normalized. */
function useNormalizedRead() {
  const queryClient = useQueryClient();
  return async <T>(
    accountId: string,
    spaceId: string,
    read: () => Promise<T>,
  ): Promise<T> => {
    try {
      return await read();
    } catch (error) {
      const problem = await normalizeClientError(error);
      if (isEntitlementRequired(problem)) {
        withdrawSpaceCapability(
          queryClient,
          accountId,
          spaceId,
          PARTNER_LOCATION_CAPABILITY,
        );
      }
      throw problem;
    }
  };
}

const RESUME_QUERY_OPTIONS = {
  retry: false,
  staleTime: DISTANCE_RESUME_MIN_INTERVAL_MS,
  refetchInterval: false,
  refetchOnReconnect: false,
  refetchOnWindowFocus: true,
} as const;

/** The Wir line. Refreshes on open and resume only; never polls. */
export function usePartnerDistanceLine({
  api,
  accountId,
  spaceId,
  enabled,
}: {
  api: DistanceApi | undefined;
  accountId: string;
  spaceId: string;
  enabled: boolean;
}) {
  const queryClient = useQueryClient();
  const normalized = useNormalizedRead();
  return useQuery({
    queryKey: partnerDistanceQueryKey(accountId, spaceId),
    queryFn: () =>
      normalized(accountId, spaceId, () => {
        if (!api) return Promise.resolve(HIDDEN);
        const settings = queryClient.getQueryData<PartnerLocationSettingsView>(
          partnerLocationSettingsQueryKey(accountId, spaceId),
        );
        return readPartnerDistanceLine({
          api,
          spaceId,
          ownSharingActive: settings?.state === 'ACTIVE',
        });
      }),
    enabled: enabled && Boolean(api && accountId && spaceId),
    ...RESUME_QUERY_OPTIONS,
  });
}

/**
 * The partner's approximate area for the map task. The cache entry is dropped
 * as soon as the map is closed (`gcTime: 0`), so coordinates never outlive it.
 */
export function usePartnerMapArea({
  api,
  accountId,
  spaceId,
  enabled,
}: {
  api: Pick<PartnerLocationApi, 'getPartnerLocationMap'>;
  accountId: string;
  spaceId: string;
  enabled: boolean;
}) {
  const normalized = useNormalizedRead();
  return useQuery<PartnerMapView>({
    queryKey: partnerMapQueryKey(accountId, spaceId),
    queryFn: () =>
      normalized(accountId, spaceId, () =>
        api.getPartnerLocationMap({ spaceId }),
      ),
    enabled: enabled && Boolean(accountId && spaceId),
    gcTime: 0,
    ...RESUME_QUERY_OPTIONS,
  });
}

/* Units and copy ----------------------------------------------------------- */

export type DistanceUnit = 'kilometer' | 'mile';

const KM_PER_MILE = 1.609344;

/** Miles only for English US/UK; every other locale uses kilometres. */
export function distanceUnitFor(
  appLocale: string,
  deviceLanguages: readonly string[],
): DistanceUnit {
  if (appLocale !== 'en') return 'kilometer';
  const english = deviceLanguages.find((tag) => /^en\b/i.test(tag));
  return english && /^en-(US|GB)$/i.test(english) ? 'mile' : 'kilometer';
}

export function deviceLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length
    ? navigator.languages
    : [navigator.language].filter(Boolean);
}

function roundTo(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

/**
 * The band as display text, or `null` for "nearby", which never shows a
 * number. Converted miles stay as coarse as the kilometre band.
 */
export function formatDistanceBand(
  band: DistanceBandView,
  locale: string,
  unit: DistanceUnit,
): string | null {
  const format = new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: 0,
  });
  const convert = (km: number) => (unit === 'mile' ? km / KM_PER_MILE : km);
  if (band.kind === 'NEARBY') return null;
  if (band.kind === 'RANGE' && band.minKm != null && band.maxKm != null) {
    const min = Math.max(1, Math.round(convert(band.minKm)));
    const max = Math.max(min + 1, Math.round(convert(band.maxKm)));
    // "5–10 km": the unit once, after the upper bound.
    return `${new Intl.NumberFormat(locale).format(min)}–${format.format(max)}`;
  }
  const km = band.approximateKm ?? band.maxKm ?? band.minKm;
  if (km == null) return null;
  if (unit === 'kilometer') return format.format(km);
  const miles = convert(km);
  return format.format(roundTo(miles, km >= 500 ? 50 : 10));
}

/* Viewer-side display preference (Settings › Wir) ------------------------- */

const PREFERENCE_PREFIX = 'eimir-partner-distance-on-wir-v1';
const PREFERENCE_EVENT = 'eimir-partner-distance-on-wir';
const memoryPreferences = new Map<string, boolean>();

/** A device display preference only; it never changes anyone's sharing. */
export function partnerDistanceOnWirKey(
  instance: string,
  accountId: string,
  spaceId: string,
): string {
  return JSON.stringify([
    PREFERENCE_PREFIX,
    instance.replace(/\/+$/, ''),
    accountId,
    spaceId,
  ]);
}

function readPreference(key: string): boolean {
  const remembered = memoryPreferences.get(key);
  if (remembered !== undefined) return remembered;
  try {
    return window.localStorage.getItem(key) !== 'false';
  } catch {
    return true;
  }
}

function subscribePreference(listener: () => void) {
  window.addEventListener(PREFERENCE_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(PREFERENCE_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

/** Shown by default; hiding affects only this viewer's Wir. */
export function usePartnerDistanceOnWir({
  instance,
  accountId,
  spaceId,
}: {
  instance: string;
  accountId: string;
  spaceId: string;
}) {
  const key = partnerDistanceOnWirKey(instance, accountId, spaceId);
  const shown = useSyncExternalStore(
    subscribePreference,
    () => readPreference(key),
    () => true,
  );
  return {
    shown,
    setShown(value: boolean) {
      memoryPreferences.set(key, value);
      try {
        window.localStorage.setItem(key, String(value));
        memoryPreferences.delete(key);
      } catch {
        // The in-memory choice still holds for this session.
      }
      window.dispatchEvent(new Event(PREFERENCE_EVENT));
    },
  };
}

/** Test seam: forget in-memory display preferences. */
export function resetPartnerDistanceOnWirMemory(): void {
  memoryPreferences.clear();
}
