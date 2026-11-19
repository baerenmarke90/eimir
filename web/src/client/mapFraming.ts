/**
 * Chooses which places an overview map frames when it opens (#2063).
 *
 * Fitting every place let a single distant trip (one memory abroad) zoom the
 * map out to a world view, leaving the couple's many nearby places as one
 * clipped stack at the edge. The map now frames the densest region: the places
 * within `radiusKm` of the place with the most neighbours. Distant places stay
 * on the map and are reached by zooming out; nothing is hidden.
 */

export type FramingPoint = { latitude: number; longitude: number };

/** Places further apart than this are not framed together on open. */
export const FRAMING_RADIUS_KM = 800;

const EARTH_RADIUS_KM = 6371;

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance between two points in kilometres. */
export function distanceKm(a: FramingPoint, b: FramingPoint): number {
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Returns the points to frame: the largest group within `radiusKm` of one
 * anchor point. Ties keep the earlier anchor, so the result is stable for an
 * unchanged list. Lists of up to two points are framed unchanged.
 */
export function framingPoints<T extends FramingPoint>(
  points: readonly T[],
  radiusKm: number = FRAMING_RADIUS_KM,
): T[] {
  if (points.length <= 2) return [...points];
  let best: T[] = [];
  for (const anchor of points) {
    const group = points.filter(
      (point) => distanceKm(anchor, point) <= radiusKm,
    );
    if (group.length > best.length) best = group;
  }
  return best.length > 0 ? best : [...points];
}
