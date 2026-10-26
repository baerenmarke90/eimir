import type { PlaceCreate } from '../api/generated/models/PlaceCreate';
import type { PlaceDetail } from '../api/generated/models/PlaceDetail';
import { i18n } from '../i18n';

export function placeDisplayName(
  place: Pick<PlaceDetail, 'name' | 'photoLocation'>,
): string {
  return place.photoLocation ? i18n.t('photoLocations.photoPlace') : place.name;
}

export function placeMapsUrl(
  place: Pick<PlaceDetail, 'name'> &
    Partial<Pick<PlaceDetail, 'address' | 'latitude' | 'longitude' | 'mapUrl'>>,
): string {
  if (place.mapUrl && safeMapUrl(place.mapUrl)) return place.mapUrl;
  const query =
    typeof place.latitude === 'number' && typeof place.longitude === 'number'
      ? `${place.latitude},${place.longitude}`
      : place.address?.trim() || place.name;
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', query);
  return url.toString();
}

function coordinatePair(
  value: string,
): { latitude: number; longitude: number } | null {
  const match = value.match(
    /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/,
  );
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    return null;
  return { latitude, longitude };
}

/** Parse explicit Google map pins locally; never fetch or follow user URLs. */
function safeMapUrl(text: string): boolean {
  try {
    const url = new URL(text);
    const longLink =
      [
        'google.com',
        'www.google.com',
        'maps.google.com',
        'google.de',
        'www.google.de',
      ].includes(url.hostname) &&
      (url.pathname === '/maps' || url.pathname.startsWith('/maps/'));
    const shortLink =
      url.hostname === 'maps.app.goo.gl' &&
      Boolean(url.pathname.replaceAll('/', ''));
    const legacyLink =
      url.hostname === 'goo.gl' && url.pathname.startsWith('/maps/');
    return (
      text.length <= 2048 &&
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === '443') &&
      (longLink || shortLink || legacyLink)
    );
  } catch {
    return false;
  }
}

export function manualPlace(name: string, addressOrLink: string): PlaceCreate {
  const text = addressOrLink.trim();
  const pair = coordinatePair(text);
  if (pair) return { name: name.trim(), ...pair };
  if (/^-?[\d.]+\s*,\s*-?[\d.]+$/.test(text))
    throw new Error('MAP_COORDINATES_INVALID');
  if (!/^https?:\/\//i.test(text))
    return { name: name.trim(), ...(text ? { address: text } : {}) };
  const url = new URL(text);
  if (!safeMapUrl(text)) throw new Error('MAP_LINK_UNSUPPORTED');
  const base = { name: name.trim(), mapUrl: url.toString() };
  // !3d/!4d identifies a selected place, unlike @latitude,longitude which may
  // only be the viewport center. Never turn a viewport into an asserted pin.
  const embedded = url.pathname.match(
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
  );
  const pin = embedded ? coordinatePair(`${embedded[1]},${embedded[2]}`) : null;
  const query = url.searchParams.get('query') || url.searchParams.get('q');
  const queryPin = query ? coordinatePair(query) : null;
  const coordinate = pin ?? queryPin;
  if (coordinate) return { ...base, ...coordinate };
  if (query && !/^[a-z]+:/i.test(query) && query.length <= 500)
    return { ...base, address: query };
  return base;
}
