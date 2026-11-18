import { Capacitor, registerPlugin } from '@capacitor/core';
import type {
  PartnerLocationApi,
  PartnerLocationSettingsView,
  SharingPrecision,
} from '../api/generated';
import { isAndroidApp } from './config';

/**
 * Energy-efficient position for partner distance (#1792).
 *
 * The Android app uses the native `ApproximateLocation` plugin (network/fused
 * providers only, cached fix first). Browsers use the Geolocation API with
 * `enableHighAccuracy: false` and a reusable cached fix. Only a person's own
 * "precise" choice (PO 2026-11-17) asks for a better fix: one measurement on
 * open or resume, never continuous, and the device rounds it to a 0.001 degree
 * grid (about 111 m) before anything is sent. Positions are never written to
 * durable client storage; the last publication is remembered in memory only.
 * See docs/m9/PARTNER-LOCATION.md sections 4 and 6.
 */

export type LocationPrecision = SharingPrecision;

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
/** A precise fix is reused for a shorter time; coarse cached fixes never count as precise. */
export const REUSE_PRECISE_FIX_MS = 3 * 60 * 1000;
/** A fix reported as less accurate than this is not precise; the server agrees. */
export const PRECISE_MAX_ACCURACY_METERS = 500;
export const MEASUREMENT_TIMEOUT_MS = 20_000;
export const MIN_PUBLISH_DISPLACEMENT_KM = 1;
export const MIN_PRECISE_PUBLISH_DISPLACEMENT_KM = 0.2;
export const MAX_PUBLISH_INTERVAL_MS = 6 * 60 * 60 * 1000;

interface NativePermissionStatus {
  location: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';
  /** The Android fine-location grant that sits on top of `location`. */
  preciseLocation?: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';
}

interface NativePosition {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: number;
}

interface ApproximateLocationPlugin {
  checkPermissions(): Promise<NativePermissionStatus>;
  requestPermissions(options: {
    permissions: Array<'location' | 'preciseLocation'>;
  }): Promise<NativePermissionStatus>;
  current(options: {
    maxAgeMs: number;
    precise?: boolean;
  }): Promise<NativePosition>;
  deviceId(): Promise<{ deviceId: string }>;
  backgroundStatus(): Promise<{
    permission: 'granted' | 'denied' | 'prompt';
    enabled: boolean;
  }>;
  requestBackgroundPermission(): Promise<{
    permission: 'granted' | 'denied' | 'prompt';
  }>;
  enableBackground(options: {
    instance: string;
    credential: string;
    expiresAt: string;
    precise?: boolean;
  }): Promise<void>;
  disableBackground(): Promise<void>;
  openAppSettings(): Promise<void>;
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
 * Whether this device also granted the precise permission: `approximate-only`
 * when Android 12+ gave only the approximate grant, `unknown` where the
 * platform cannot tell (browsers, plugin missing).
 */
export type DevicePreciseAccess = 'granted' | 'approximate-only' | 'unknown';

export async function devicePreciseAccess(): Promise<DevicePreciseAccess> {
  if (!usesNativePlugin()) return 'unknown';
  try {
    const status = await nativeLocation.checkPermissions();
    if (status.location !== 'granted') return 'unknown';
    return status.preciseLocation === 'granted'
      ? 'granted'
      : 'approximate-only';
  } catch {
    return 'unknown';
  }
}

/**
 * Requests the approximate permission, plus the precise one only after a
 * precise choice (one request, so Android 12+ shows its Precise/Approximate
 * switch). In browsers the permission prompt is part of the first
 * measurement, so this resolves after one measurement.
 */
export async function requestLocationPermission(
  precision: LocationPrecision = 'APPROXIMATE',
): Promise<LocationPermission> {
  if (usesNativePlugin()) {
    // Background is a separate, later step.
    return nativePermission(
      await nativeLocation.requestPermissions({
        permissions:
          precision === 'PRECISE'
            ? ['location', 'preciseLocation']
            : ['location'],
      }),
    );
  }
  if (!browserGeolocation()) return 'unsupported';
  try {
    await currentApproximatePosition(REUSE_CACHED_FIX_MS, precision);
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
  precision: LocationPrecision = 'APPROXIMATE',
): Promise<ApproximatePosition> {
  const precise = precision === 'PRECISE';
  if (usesNativePlugin()) {
    try {
      const position = await nativeLocation.current(
        precise ? { maxAgeMs, precise: true } : { maxAgeMs },
      );
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
        enableHighAccuracy: precise,
        maximumAge: precise
          ? Math.min(maxAgeMs, REUSE_PRECISE_FIX_MS)
          : maxAgeMs,
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

/**
 * Rounds a position on the device before it is published or sent for a
 * distance: 0.001 degrees (about 111 m) for a precise choice backed by a
 * precise fix, 0.01 degrees (about 1.1 km) otherwise. The raw fix never leaves
 * the device (docs/m9/PARTNER-LOCATION.md section 4).
 */
export function roundToGrid(
  position: Pick<
    ApproximatePosition,
    'latitude' | 'longitude' | 'accuracyMeters'
  >,
  precision: LocationPrecision,
): { latitude: number; longitude: number } {
  const precise =
    precision === 'PRECISE' &&
    position.accuracyMeters <= PRECISE_MAX_ACCURACY_METERS;
  const grid = precise ? 1000 : 100;
  const round = (degrees: number) => Math.round(degrees * grid) / grid;
  return {
    latitude: round(position.latitude),
    longitude: round(position.longitude),
  };
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
  next: Pick<ApproximatePosition, 'latitude' | 'longitude'>,
  generation: number,
  now: Date = new Date(),
  precision: LocationPrecision = 'APPROXIMATE',
): boolean {
  if (!last || last.generation !== generation) return true;
  if (now.getTime() - last.publishedAt.getTime() >= MAX_PUBLISH_INTERVAL_MS) {
    return true;
  }
  const threshold =
    precision === 'PRECISE'
      ? MIN_PRECISE_PUBLISH_DISPLACEMENT_KM
      : MIN_PUBLISH_DISPLACEMENT_KM;
  return distanceKm(last, next) >= threshold;
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
  settings: Pick<
    PartnerLocationSettingsView,
    'state' | 'generation' | 'precision'
  >;
  now?: Date;
}): Promise<PartnerLocationSettingsView | null> {
  if (settings.state !== 'ACTIVE') return null;
  if ((await locationPermission()) !== 'granted') return null;
  const position = await currentApproximatePosition(
    undefined,
    settings.precision,
  );
  const rounded = roundToGrid(position, settings.precision);
  const key = publicationKey(spaceId, accountId);
  if (
    !shouldPublish(
      lastPublications.get(key),
      rounded,
      settings.generation,
      now,
      settings.precision,
    )
  ) {
    return null;
  }
  const view = await api.publishPartnerLocationSnapshot({
    spaceId,
    presencePublish: {
      latitude: rounded.latitude,
      longitude: rounded.longitude,
      accuracyMeters: position.accuracyMeters,
      capturedAt: position.capturedAt,
      consentGeneration: settings.generation,
    },
  });
  if (view.state === 'ACTIVE') {
    lastPublications.set(key, {
      latitude: rounded.latitude,
      longitude: rounded.longitude,
      publishedAt: now,
      generation: settings.generation,
    });
  } else {
    lastPublications.delete(key);
  }
  return view;
}

export interface BackgroundLocationStatus {
  /** Android only; browsers and other platforms report `unsupported`. */
  permission: LocationPermission;
  enabled: boolean;
}

/** Whether location access is managed by the Android app settings here. */
export function usesNativeLocationSettings(): boolean {
  return usesNativePlugin();
}

/** Opens the Android app settings; browsers keep their own site settings. */
export async function openLocationSettings(): Promise<boolean> {
  if (!usesNativePlugin()) return false;
  try {
    await nativeLocation.openAppSettings();
    return true;
  } catch {
    return false;
  }
}

export async function backgroundLocationStatus(): Promise<BackgroundLocationStatus> {
  if (!usesNativePlugin()) return { permission: 'unsupported', enabled: false };
  return nativeLocation.backgroundStatus();
}

/** Asks for "Allow all the time" after the approximate grant (Android 10+). */
export async function requestBackgroundLocationPermission(): Promise<LocationPermission> {
  if (!usesNativePlugin()) return 'unsupported';
  try {
    return (await nativeLocation.requestBackgroundPermission()).permission;
  } catch {
    return 'denied';
  }
}

type DeviceCredentialApi = Pick<
  PartnerLocationApi,
  | 'issuePartnerLocationDeviceCredential'
  | 'revokePartnerLocationDeviceCredential'
>;

/**
 * Turns on background updates for the active share: issues a scoped device
 * credential (it can only publish this owner's snapshot) and hands it to the
 * native passive-location service. Never refreshes the Web session natively.
 */
export async function enableBackgroundSharing({
  api,
  spaceId,
  instance,
  precision = 'APPROXIMATE',
}: {
  api: DeviceCredentialApi;
  spaceId: string;
  instance: string;
  precision?: LocationPrecision;
}): Promise<void> {
  if (!usesNativePlugin()) {
    throw new ApproximateLocationError('UNSUPPORTED');
  }
  const status = await nativeLocation.backgroundStatus();
  if (status.permission !== 'granted') {
    throw new ApproximateLocationError('PERMISSION_DENIED');
  }
  const { deviceId } = await nativeLocation.deviceId();
  const issued = await api.issuePartnerLocationDeviceCredential({
    spaceId,
    presenceDeviceCredentialRequest: { deviceId },
  });
  await nativeLocation.enableBackground({
    instance,
    credential: issued.credential,
    expiresAt: issued.expiresAt.toISOString(),
    ...(precision === 'PRECISE' ? { precise: true } : {}),
  });
}

/** Stops background updates on this device; the server credential is revoked best-effort. */
export async function disableBackgroundSharing({
  api,
  spaceId,
}: {
  api: DeviceCredentialApi;
  spaceId: string;
}): Promise<void> {
  if (!usesNativePlugin()) return;
  await nativeLocation.disableBackground();
  const { deviceId } = await nativeLocation.deviceId();
  try {
    await api.revokePartnerLocationDeviceCredential({ spaceId, deviceId });
  } catch {
    // Offline: the credential still ends with the next settings change,
    // sign-out or its 30-day expiry.
  }
}

/**
 * On app open/resume: keep an enabled background share consistent with the
 * server. Active shares get a freshly rotated credential (any settings change
 * invalidated the old one); inactive shares stop background updates.
 */
export async function syncBackgroundSharing({
  api,
  spaceId,
  instance,
  settings,
}: {
  api: DeviceCredentialApi;
  spaceId: string;
  instance: string;
  settings: Pick<PartnerLocationSettingsView, 'state' | 'precision'>;
}): Promise<'enabled' | 'disabled' | 'unchanged'> {
  if (!usesNativePlugin()) return 'unchanged';
  const status = await nativeLocation.backgroundStatus();
  if (!status.enabled) return 'unchanged';
  if (settings.state !== 'ACTIVE' || status.permission !== 'granted') {
    await disableBackgroundSharing({ api, spaceId });
    return 'disabled';
  }
  await enableBackgroundSharing({
    api,
    spaceId,
    instance,
    precision: settings.precision,
  });
  return 'enabled';
}
