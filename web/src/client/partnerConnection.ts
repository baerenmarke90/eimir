import type { DistanceBandView } from '../api/generated/models/DistanceBandView';
import { isDistanceFresh } from './partnerDistance';

/**
 * The animated connection between the two avatars on the "where we are" map
 * (#1907 H1). It only connects what the map already shows and adds no data:
 * the partner's snapped area centre and the viewer's own approximate
 * position, which never leaves this device.
 */

/** Visual tier of the connection, by distance (contract §4 band limits). */
export type PartnerConnectionTier = 'near' | 'regional' | 'far';

export interface PartnerConnectionStyle {
  tier: PartnerConnectionTier;
  /** The partner's snapshot is an earlier state: muted and without motion. */
  earlier: boolean;
}

interface Point {
  latitude: number;
  longitude: number;
}

/** `NEARBY` ends here; the server never reports anything finer. */
const NEAR_LIMIT_KM = 2;
/** Above this the server switches from ranges to approximate values. */
const REGIONAL_LIMIT_KM = 50;
const EARTH_RADIUS_KM = 6371.0088;

function haversineKm(a: Point, b: Point): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function tierForKm(km: number): PartnerConnectionTier {
  if (km < NEAR_LIMIT_KM) return 'near';
  return km < REGIONAL_LIMIT_KM ? 'regional' : 'far';
}

/** The server band decides the tier; the shown points only stand in for it. */
export function connectionTier(
  band: DistanceBandView | null | undefined,
  partner: Point,
  own: Point,
): PartnerConnectionTier {
  if (band?.kind === 'NEARBY') return 'near';
  if (band?.kind === 'RANGE') return 'regional';
  if (band?.kind === 'APPROXIMATE') return 'far';
  // Deep link or reload without the Wir band: the same limits, applied to
  // the two points already on the map. The value is never displayed.
  return tierForKm(haversineKm(partner, own));
}

/**
 * The connection exists only while both currently share: the partner's map
 * area is readable, the viewer's own sharing is active and the viewer's own
 * position is known. Otherwise there is no line and no hint.
 */
export function partnerConnectionStyle({
  partnerArea,
  ownPosition,
  ownSharingActive,
  band,
  now = new Date(),
}: {
  partnerArea:
    | (Point & { capturedAt?: Date | null | undefined })
    | null
    | undefined;
  ownPosition: Point | null | undefined;
  ownSharingActive: boolean;
  band?: DistanceBandView | null;
  now?: Date;
}): PartnerConnectionStyle | null {
  if (!partnerArea || !ownPosition || !ownSharingActive) return null;
  const capturedAt = partnerArea.capturedAt ?? null;
  return {
    tier: connectionTier(band, partnerArea, ownPosition),
    earlier: !capturedAt || !isDistanceFresh(capturedAt, now),
  };
}
