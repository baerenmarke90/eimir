import { useEffect, useState } from 'react';
import type { SessionView } from '../api/generated/models/SessionView';
import { isCapacitorNative } from '../pwa';
import {
  NativePasskeys,
  nativePasskeyErrorCode,
  PasskeyAlreadyOnDeviceError,
  PasskeyAppNotTrustedError,
  PasskeyNotOnDeviceError,
} from './nativePasskeys';
import { normalizeClientError } from './problemDetails';
import { createReferenceApis } from './referenceFlow';
import {
  assertionToJson,
  attestationToJson,
  creationOptionsFromJson,
  requestOptionsFromJson,
} from './webauthnCodec';

export {
  PasskeyAlreadyOnDeviceError,
  PasskeyAppNotTrustedError,
  PasskeyNotOnDeviceError,
} from './nativePasskeys';

const WEB_DEVICE_NAME = 'eimir. Web';
const WEB_PLATFORM = 'web';
const NATIVE_DEVICE_NAME = 'eimir. Android';
const NATIVE_PLATFORM = 'android';

/** The person closed the system dialog or did not use the authenticator. */
export class PasskeyCancelledError extends Error {
  constructor() {
    super('Passkey ceremony was cancelled.');
    this.name = 'PasskeyCancelledError';
  }
}

let nativeAvailability: boolean | null = null;
let nativeAvailabilityProbe: Promise<boolean> | null = null;

/** Ask the Android app once whether it can run a passkey ceremony. */
export function primePasskeyAvailability(): Promise<boolean> {
  if (!isCapacitorNative()) return Promise.resolve(passkeysAvailable());
  nativeAvailabilityProbe ??= NativePasskeys.isAvailable()
    .then(({ available }) => {
      nativeAvailability = available;
      return available;
    })
    .catch(() => {
      nativeAvailability = false;
      return false;
    });
  return nativeAvailabilityProbe;
}

/**
 * Whether this client can run a passkey ceremony itself. Browsers use
 * WebAuthn. The Android app uses the Credential Manager bridge once it has
 * reported itself available; until then, and wherever it is missing, no dead
 * button is offered.
 */
export function passkeysAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  if (isCapacitorNative()) return nativeAvailability === true;
  return Boolean(window.PublicKeyCredential && navigator.credentials);
}

/**
 * Starts the native availability probe and re-renders the caller once it has
 * answered; read the result with passkeysAvailable().
 */
export function usePasskeyProbe(): void {
  const [, setProbed] = useState(false);
  useEffect(() => {
    if (!isCapacitorNative()) return;
    let cancelled = false;
    void primePasskeyAvailability().then(() => {
      if (!cancelled) setProbed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
}

function isCancellation(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'AbortError')
  );
}

/** Outcomes the caller presents itself; they are not request problems. */
function isCeremonyOutcome(error: unknown): boolean {
  return (
    error instanceof PasskeyCancelledError ||
    error instanceof PasskeyNotOnDeviceError ||
    error instanceof PasskeyAppNotTrustedError ||
    error instanceof PasskeyAlreadyOnDeviceError
  );
}

async function nativeCeremony(
  run: () => Promise<{ responseJson: string }>,
): Promise<Record<string, unknown>> {
  try {
    const { responseJson } = await run();
    return JSON.parse(responseJson) as Record<string, unknown>;
  } catch (error) {
    switch (nativePasskeyErrorCode(error)) {
      case 'CANCELLED':
        throw new PasskeyCancelledError();
      case 'NO_CREDENTIAL':
        throw new PasskeyNotOnDeviceError();
      case 'NOT_TRUSTED':
        throw new PasskeyAppNotTrustedError();
      case 'ALREADY_REGISTERED':
        throw new PasskeyAlreadyOnDeviceError();
      default:
        throw error;
    }
  }
}

/** Sign in with a discoverable passkey; the authenticator picks the Account. */
export async function signInWithPasskey(
  apiBaseUrl: string,
): Promise<SessionView> {
  try {
    const { auth } = createReferenceApis(apiBaseUrl);
    const options =
      await auth.startPasskeyAuthenticationApiV1AuthPasskeysAuthenticationStartPost();
    let credential: Record<string, unknown>;
    if (isCapacitorNative()) {
      credential = await nativeCeremony(() =>
        NativePasskeys.get({ requestJson: JSON.stringify(options) }),
      );
    } else {
      let result: Credential | null;
      try {
        result = await navigator.credentials.get({
          publicKey: requestOptionsFromJson(options),
        });
      } catch (error) {
        if (isCancellation(error)) throw new PasskeyCancelledError();
        throw error;
      }
      if (!(result instanceof PublicKeyCredential)) {
        throw new PasskeyCancelledError();
      }
      credential = assertionToJson(result);
    }
    const native = isCapacitorNative();
    return await auth.finishPasskeyAuthenticationApiV1AuthPasskeysAuthenticationFinishPost(
      {
        passkeyAuthenticationRequest: {
          credential,
          deviceName: native ? NATIVE_DEVICE_NAME : WEB_DEVICE_NAME,
          platform: native ? NATIVE_PLATFORM : WEB_PLATFORM,
        },
      },
    );
  } catch (error) {
    if (isCeremonyOutcome(error)) throw error;
    throw await normalizeClientError(error);
  }
}

/** Register a passkey for the signed-in Account on this device. */
export async function registerPasskey(
  apiBaseUrl: string,
  accessToken: string,
  name: string,
): Promise<void> {
  try {
    const { auth } = createReferenceApis(apiBaseUrl, accessToken);
    const options =
      await auth.startPasskeyRegistrationApiV1AuthPasskeysRegistrationStartPost();
    let credential: Record<string, unknown>;
    if (isCapacitorNative()) {
      credential = await nativeCeremony(() =>
        NativePasskeys.create({ requestJson: JSON.stringify(options) }),
      );
    } else {
      let result: Credential | null;
      try {
        result = await navigator.credentials.create({
          publicKey: creationOptionsFromJson(options),
        });
      } catch (error) {
        if (isCancellation(error)) throw new PasskeyCancelledError();
        throw error;
      }
      if (!(result instanceof PublicKeyCredential)) {
        throw new PasskeyCancelledError();
      }
      credential = attestationToJson(result);
    }
    await auth.finishPasskeyRegistrationApiV1AuthPasskeysRegistrationFinishPost(
      { passkeyRegistrationRequest: { credential, name } },
    );
  } catch (error) {
    if (isCeremonyOutcome(error)) throw error;
    throw await normalizeClientError(error);
  }
}
