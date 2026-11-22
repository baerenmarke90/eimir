import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PartnerLocationApi } from '../api/generated/apis/PartnerLocationApi';
import type { DistanceBandView } from '../api/generated/models/DistanceBandView';
import type { PartnerLocationSettingsView } from '../api/generated/models/PartnerLocationSettingsView';
import type { PartnerMapView } from '../api/generated/models/PartnerMapView';
import {
  type ApproximatePosition,
  currentApproximatePosition,
  type LocationPermission,
  type LocationPrecision,
  locationPermission,
  roundToGrid,
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
  /**
   * The viewer shares, the partner does not (yet). Product Owner 2026-11-13:
   * a status chip only; nothing about the partner's position is derived.
   */
  | { kind: 'sharing' }
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
  precision = 'APPROXIMATE',
  permission = locationPermission,
  measure = () => currentApproximatePosition(undefined, precision),
}: {
  api: DistanceApi;
  spaceId: string;
  ownSharingActive: boolean;
  /** The viewer's own choice; a precise choice measures better and is rounded on the device. */
  precision?: LocationPrecision;
  permission?: () => Promise<LocationPermission>;
  measure?: () => Promise<ApproximatePosition>;
}): Promise<PartnerDistanceLine> {
  const position = await ownPositionIfAllowed(permission, measure);
  if (!position) {
    if (ownSharingActive) return { kind: 'ownMissing' };
    const map = await api.getPartnerLocationMap({ spaceId });
    return map.available ? { kind: 'ownMissing' } : HIDDEN;
  }
  const rounded = roundToGrid(position, precision);
  const distance = await api.getPartnerDistance({
    spaceId,
    presencePosition: {
      latitude: rounded.latitude,
      longitude: rounded.longitude,
      accuracyMeters: position.accuracyMeters,
      capturedAt: position.capturedAt,
    },
  });
  if (!distance.available || !distance.band || !distance.asOf) {
    return ownSharingActive ? { kind: 'sharing' } : HIDDEN;
  }
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
          precision: settings?.precision,
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

/** How a range band is put into words (#1907 H4). */
export type DistanceWords =
  | 'aroundCorner'
  | 'stonesThrow'
  | 'notFar'
  | 'shortTrip';

/**
 * Range bands (2–50 km) are described in words instead of a numeric range,
 * which says little to a couple (Product Owner, 2026-11-15). The words follow
 * the server band only, so they are never more precise than the band.
 */
export function distanceBandWords(
  band: DistanceBandView,
): DistanceWords | null {
  if (band.kind !== 'RANGE' || band.maxKm == null) return null;
  if (band.maxKm <= 5) return 'aroundCorner';
  if (band.maxKm <= 10) return 'stonesThrow';
  if (band.maxKm <= 25) return 'notFar';
  return 'shortTrip';
}

/** The farthest of the seven steps the Wir heart and light can show. */
export const DISTANCE_STAGE_MAX = 6;

/**
 * The band as a step from together (0) to far apart (6) for the Wir heart and
 * light. It follows the server band only, so it is never more precise than
 * the band: everything under 2 km is one step.
 */
export function distanceStage(band: DistanceBandView): number {
  if (band.kind === 'NEARBY' || band.kind === 'CLOSE') return 0;
  if (band.kind === 'RANGE' && band.maxKm != null) {
    if (band.maxKm <= 5) return 1;
    if (band.maxKm <= 10) return 2;
    if (band.maxKm <= 25) return 3;
    return 4;
  }
  const km = band.approximateKm ?? band.maxKm ?? band.minKm;
  return km != null && km < 500 ? 5 : DISTANCE_STAGE_MAX;
}

const FEET_PER_METRE = 3.28084;
const METRES_PER_KM = 1000;
/** From here on a converted distance reads better in miles than in feet. */
const MILES_FROM_METRES = 800;

function metresText(
  metres: number,
  locale: string,
  unit: DistanceUnit,
  withUnit: boolean,
): string {
  const plain = (value: number, digits: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(
      value,
    );
  const withUnitText = (value: number, name: string, digits: number) =>
    new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: name,
      unitDisplay: 'short',
      maximumFractionDigits: digits,
    }).format(value);
  if (unit === 'kilometer') {
    if (metres >= METRES_PER_KM) {
      const km = metres / METRES_PER_KM;
      return withUnit ? withUnitText(km, 'kilometer', 1) : plain(km, 1);
    }
    return withUnit ? withUnitText(metres, 'meter', 0) : plain(metres, 0);
  }
  if (metres >= MILES_FROM_METRES) {
    const miles = metres / KM_PER_MILE / METRES_PER_KM;
    return withUnit ? withUnitText(miles, 'mile', 1) : plain(miles, 1);
  }
  const feet = Math.round((metres * FEET_PER_METRE) / 100) * 100;
  return withUnit ? withUnitText(feet, 'foot', 0) : plain(feet, 0);
}

/**
 * A fine band (both positions precise, below 2 km) as text: "300 m" with
 * `under` for the first tier ("less than 300 m"), otherwise a range such as
 * "300 m–1 km". Never finer than the server band.
 */
export function formatCloseBand(
  band: DistanceBandView,
  locale: string,
  unit: DistanceUnit,
): { under: boolean; value: string } | null {
  if (band.kind !== 'CLOSE' || band.minMeters == null || band.maxMeters == null)
    return null;
  if (band.minMeters <= 0) {
    return {
      under: true,
      value: metresText(band.maxMeters, locale, unit, true),
    };
  }
  const sameUnit =
    band.minMeters >= METRES_PER_KM === band.maxMeters >= METRES_PER_KM;
  const minText = metresText(band.minMeters, locale, unit, !sameUnit);
  const maxText = metresText(band.maxMeters, locale, unit, true);
  return { under: false, value: `${minText}–${maxText}` };
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
  if (band.kind === 'CLOSE')
    return formatCloseBand(band, locale, unit)?.value ?? null;
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
