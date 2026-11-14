import { normalizeClientError } from './problemDetails';
import { MEMORY_MAP_ROUTE } from './routes';

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
  return `${MEMORY_MAP_ROUTE}?${new URLSearchParams({ place: `${latitude}:${longitude}` })}`;
}

export function parseMapPlace(
  value: string | null,
): { latitude: number; longitude: number } | undefined {
  if (
    !value ||
    !/^-?\d{1,3}(?:\.\d{1,16})?:-?\d{1,3}(?:\.\d{1,16})?$/.test(value)
  )
    return;
  const [latitude, longitude] = value.split(':').map(Number);
  if (photoPlaceMapUrl(latitude, longitude)) return { latitude, longitude };
}
