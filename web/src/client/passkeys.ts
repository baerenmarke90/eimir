import type { SessionView } from '../api/generated/models/SessionView';
import { isCapacitorNative } from '../pwa';
import { normalizeClientError } from './problemDetails';
import { createReferenceApis } from './referenceFlow';
import {
  assertionToJson,
  attestationToJson,
  creationOptionsFromJson,
  requestOptionsFromJson,
} from './webauthnCodec';

const WEB_DEVICE_NAME = 'eimir. Web';
const WEB_PLATFORM = 'web';

/** The person closed the system dialog or did not use the authenticator. */
export class PasskeyCancelledError extends Error {
  constructor() {
    super('Passkey ceremony was cancelled.');
    this.name = 'PasskeyCancelledError';
  }
}

/**
 * Whether this client can run a passkey ceremony itself. The Android app does
 * not yet (Credential Manager and Digital Asset Links are a separate slice,
 * #630), so the native container reports false instead of offering a dead
 * button.
 */
export function passkeysAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  if (isCapacitorNative()) return false;
  return Boolean(window.PublicKeyCredential && navigator.credentials);
}

function isCancellation(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'AbortError')
  );
}

/** Sign in with a discoverable passkey; the authenticator picks the Account. */
export async function signInWithPasskey(
  apiBaseUrl: string,
): Promise<SessionView> {
  try {
    const { auth } = createReferenceApis(apiBaseUrl);
    const options =
      await auth.startPasskeyAuthenticationApiV1AuthPasskeysAuthenticationStartPost();
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
    return await auth.finishPasskeyAuthenticationApiV1AuthPasskeysAuthenticationFinishPost(
      {
        passkeyAuthenticationRequest: {
          credential: assertionToJson(result),
          deviceName: WEB_DEVICE_NAME,
          platform: WEB_PLATFORM,
        },
      },
    );
  } catch (error) {
    if (error instanceof PasskeyCancelledError) throw error;
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
    await auth.finishPasskeyRegistrationApiV1AuthPasskeysRegistrationFinishPost(
      {
        passkeyRegistrationRequest: {
          credential: attestationToJson(result),
          name,
        },
      },
    );
  } catch (error) {
    if (error instanceof PasskeyCancelledError) throw error;
    throw await normalizeClientError(error);
  }
}
