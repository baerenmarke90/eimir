import { registerPlugin } from '@capacitor/core';

/**
 * Android Credential Manager bridge (#630). The server's WebAuthn options go
 * to the platform as JSON and the platform's JSON response goes back to the
 * server unchanged; no credential material is interpreted here. The relying
 * party must be tied to the app through Digital Asset Links.
 */
export type NativePasskeyErrorCode =
  /** The person closed the system sheet. */
  | 'CANCELLED'
  /** This device holds no passkey for the relying party. */
  | 'NO_CREDENTIAL'
  /** No credential provider is available (for example no Play services). */
  | 'UNAVAILABLE'
  /** The platform does not trust this app for the relying party (Digital Asset Links). */
  | 'NOT_TRUSTED'
  /** This device already holds a passkey of this Account for the relying party. */
  | 'ALREADY_REGISTERED'
  /** The platform refused the ceremony. */
  | 'FAILED';

interface PasskeysPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  create(options: { requestJson: string }): Promise<{ responseJson: string }>;
  get(options: { requestJson: string }): Promise<{ responseJson: string }>;
}

export const NativePasskeys = registerPlugin<PasskeysPlugin>('Passkeys');

/** This device has no passkey to offer for the relying party. */
export class PasskeyNotOnDeviceError extends Error {
  constructor() {
    super('No passkey is stored on this device for this service.');
    this.name = 'PasskeyNotOnDeviceError';
  }
}

/** The platform does not trust this app for the relying party. */
export class PasskeyAppNotTrustedError extends Error {
  constructor() {
    super('The platform does not trust this app for this service.');
    this.name = 'PasskeyAppNotTrustedError';
  }
}

/** This device already stores a passkey of the Account for the service. */
export class PasskeyAlreadyOnDeviceError extends Error {
  constructor() {
    super('A passkey of this Account is already stored on this device.');
    this.name = 'PasskeyAlreadyOnDeviceError';
  }
}

export function nativePasskeyErrorCode(
  error: unknown,
): NativePasskeyErrorCode | null {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : null;
  switch (code) {
    case 'CANCELLED':
    case 'NO_CREDENTIAL':
    case 'UNAVAILABLE':
    case 'NOT_TRUSTED':
    case 'ALREADY_REGISTERED':
    case 'FAILED':
      return code;
    default:
      return null;
  }
}
