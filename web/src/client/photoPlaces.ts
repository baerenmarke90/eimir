import { normalizeClientError } from './problemDetails';

export async function photoPlacesRequest<T>(
  request: () => Promise<T>,
): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

/** No map SDK, preview, geocoder or request is used before deliberate navigation. */
export function photoPlaceMapUrl(
  latitude: number | null,
  longitude: number | null,
): string | null {
  if (
    latitude === null ||
    longitude === null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    return null;
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', `${latitude},${longitude}`);
  return url.href;
}
