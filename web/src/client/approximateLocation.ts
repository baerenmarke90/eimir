import { Capacitor, registerPlugin } from '@capacitor/core';
import type {
  PartnerLocationApi,
  PartnerLocationSettingsView,
} from '../api/generated';
import { isAndroidApp } from './config';

/**
 * Energy-efficient approximate position for partner distance (#1792).
 *
 * The Android app uses the native `ApproximateLocation` plugin (network/fused
 * providers only, cached fix first). Browsers use the Geolocation API with
 * `enableHighAccuracy: false` and a reusable cached fix. Positions are never
 * written to durable client storage; the last publication is remembered in
 * memory only. See docs/m9/PARTNER-LOCATION.md section 6.
 */

export interface ApproximatePosition {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: Date;
}

export type ApproximateLocationErrorCode =
  | 'PERMISSION_DENIED'
  | 'LOCATION_UNAVAILABLE'
  | 'TIMEOUT'
  | 'UNSUPPORTED';

export class ApproximateLocationError extends Error {
  constructor(readonly code: ApproximateLocationErrorCode) {
    super(code);
    this.name = 'ApproximateLocationError';
  }
}

export type LocationPermission =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'unsupported';

export const REUSE_CACHED_FIX_MS = 10 * 60 * 1000;
export const MEASUREMENT_TIMEOUT_MS = 20_000;
export const MIN_PUBLISH_DISPLACEMENT_KM = 1;
export const MAX_PUBLISH_INTERVAL_MS = 6 * 60 * 60 * 1000;

interface NativePermissionStatus {
  location: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';
}

interface NativePosition {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: number;
}

interface ApproximateLocationPlugin {
  checkPermissions(): Promise<NativePermissionStatus>;
  requestPermissions(): Promise<NativePermissionStatus>;
  current(options: { maxAgeMs: number }): Promise<NativePosition>;
}

const nativeLocation = registerPlugin<ApproximateLocationPlugin>(
  'ApproximateLocation',
);

function usesNativePlugin(): boolean {
  return isAndroidApp() && Capacitor.isPluginAvailable('ApproximateLocation');
}

function nativePermission(
  status: NativePermissionStatus,
): Exclude<LocationPermission, 'unsupported'> {
  if (status.location === 'granted') return 'granted';
  if (status.location === 'denied') return 'denied';
  return 'prompt';
}

function browserGeolocation(): Geolocation | null {
  return typeof navigator !== 'undefined' && navigator.geolocation
    ? navigator.geolocation
    : null;
}

export async function locationPermission(): Promise<LocationPermission> {
  if (usesNativePlugin()) {
    return nativePermission(await nativeLocation.checkPermissions());
  }
  if (!browserGeolocation()) return 'unsupported';
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state;
  } catch {
    // Browsers without the Permissions API still show their own prompt.
    return 'prompt';
  }
}

/**
 * Requests only the approximate permission. In browsers the permission prompt
 * is part of the first measurement, so this resolves after one measurement.
 */
export async function requestLocationPermission(): Promise<LocationPermission> {
  if (usesNativePlugin()) {
    return nativePermission(await nativeLocation.requestPermissions());
  }
  if (!browserGeolocation()) return 'unsupported';
  try {
    await currentApproximatePosition();
    return 'granted';
  } catch (error) {
    if (
      error instanceof ApproximateLocationError &&
      error.code === 'PERMISSION_DENIED'
    ) {
      return 'denied';
    }
    return locationPermission();
  }
}

function nativeError(error: unknown): ApproximateLocationError {
  const code = (error as { code?: unknown } | null)?.code;
  if (
    code === 'PERMISSION_DENIED' ||
    code === 'LOCATION_UNAVAILABLE' ||
    code === 'TIMEOUT'
  ) {
    return new ApproximateLocationError(code);
  }
  return new ApproximateLocationError('LOCATION_UNAVAILABLE');
}

function browserError(
  error: GeolocationPositionError,
): ApproximateLocationError {
  if (error.code === error.PERMISSION_DENIED) {
    return new ApproximateLocationError('PERMISSION_DENIED');
  }
  if (error.code === error.TIMEOUT) {
    return new ApproximateLocationError('TIMEOUT');
  }
  return new ApproximateLocationError('LOCATION_UNAVAILABLE');
}

export async function currentApproximatePosition(
  maxAgeMs: number = REUSE_CACHED_FIX_MS,
): Promise<ApproximatePosition> {
  if (usesNativePlugin()) {
    try {
      const position = await nativeLocation.current({ maxAgeMs });
      return {
        latitude: position.latitude,
        longitude: position.longitude,
        accuracyMeters: position.accuracyMeters,
        capturedAt: new Date(position.capturedAt),
      };
    } catch (error) {
      throw nativeError(error);
    }
  }
  const geolocation = browserGeolocation();
  if (!geolocation) throw new ApproximateLocationError('UNSUPPORTED');
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          capturedAt: new Date(position.timestamp),
        }),
      (error) => reject(browserError(error)),
      {
        enableHighAccuracy: false,
        maximumAge: maxAgeMs,
        timeout: MEASUREMENT_TIMEOUT_MS,
      },
    );
  });
}

const EARTH_RADIUS_KM = 6371.0088;

export function distanceKm(
  a: Pick<ApproximatePosition, 'latitude' | 'longitude'>,
  b: Pick<ApproximatePosition, 'latitude' | 'longitude'>,
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dPhi = radians(b.latitude - a.latitude);
  const dLambda = radians(b.longitude - a.longitude);
  const h =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(dLambda / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface LastPublication {
  latitude: number;
  longitude: number;
  publishedAt: Date;
  generation: number;
}

/** Publish only after meaningful movement or before the shared value goes stale. */
export function shouldPublish(
  last: LastPublication | undefined,
  next: ApproximatePosition,
  generation: number,
  now: Date = new Date(),
): boolean {
  if (!last || last.generation !== generation) return true;
  if (now.getTime() - last.publishedAt.getTime() >= MAX_PUBLISH_INTERVAL_MS) {
    return true;
  }
  return distanceKm(last, next) >= MIN_PUBLISH_DISPLACEMENT_KM;
}

const lastPublications = new Map<string, LastPublication>();

function publicationKey(spaceId: string, accountId: string): string {
  return `${spaceId}:${accountId}`;
}

/** Forget the in-memory publication state, e.g. on sign-out or Space switch. */
export function clearPublicationMemory(): void {
  lastPublications.clear();
}

/**
 * Measure once and publish the owner's position when sharing is active and the
 * publish rules require it. Returns the server's current view of the owner's
 * sharing, or `null` when nothing was sent.
 */
export async function publishOwnPositionIfDue({
  api,
  spaceId,
  accountId,
  settings,
  now = new Date(),
}: {
  api: Pick<PartnerLocationApi, 'publishPartnerLocationSnapshot'>;
  spaceId: string;
  accountId: string;
  settings: Pick<PartnerLocationSettingsView, 'state' | 'generation'>;
  now?: Date;
}): Promise<PartnerLocationSettingsView | null> {
  if (settings.state !== 'ACTIVE') return null;
  if ((await locationPermission()) !== 'granted') return null;
  const position = await currentApproximatePosition();
  const key = publicationKey(spaceId, accountId);
  if (
    !shouldPublish(
      lastPublications.get(key),
      position,
      settings.generation,
      now,
    )
  ) {
    return null;
  }
  const view = await api.publishPartnerLocationSnapshot({
    spaceId,
    presencePublish: {
      latitude: position.latitude,
      longitude: position.longitude,
      accuracyMeters: position.accuracyMeters,
      capturedAt: position.capturedAt,
      consentGeneration: settings.generation,
    },
  });
  if (view.state === 'ACTIVE') {
    lastPublications.set(key, {
      latitude: position.latitude,
      longitude: position.longitude,
      publishedAt: now,
      generation: settings.generation,
    });
  } else {
    lastPublications.delete(key);
  }
  return view;
}
