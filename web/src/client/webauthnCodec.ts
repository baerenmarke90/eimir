/**
 * JSON <-> WebAuthn conversion shared by every passkey ceremony. The server
 * speaks base64url JSON (py_webauthn); the browser API wants ArrayBuffers.
 */

export function decodeBase64Url(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const raw = window.atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes.buffer;
}

export function encodeBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return window
    .btoa(raw)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function descriptors(
  value: unknown,
): PublicKeyCredentialDescriptor[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((item) => {
    const descriptor = item as Record<string, unknown>;
    return {
      id: decodeBase64Url(String(descriptor.id)),
      type: 'public-key' as const,
      transports: Array.isArray(descriptor.transports)
        ? (descriptor.transports as AuthenticatorTransport[])
        : undefined,
    };
  });
}

export function requestOptionsFromJson(
  value: Record<string, unknown>,
): PublicKeyCredentialRequestOptions {
  return {
    challenge: decodeBase64Url(String(value.challenge)),
    timeout: typeof value.timeout === 'number' ? value.timeout : undefined,
    rpId: typeof value.rpId === 'string' ? value.rpId : undefined,
    allowCredentials: descriptors(value.allowCredentials),
    userVerification:
      typeof value.userVerification === 'string'
        ? (value.userVerification as UserVerificationRequirement)
        : undefined,
    extensions:
      value.extensions && typeof value.extensions === 'object'
        ? (value.extensions as AuthenticationExtensionsClientInputs)
        : undefined,
  };
}

export function creationOptionsFromJson(
  value: Record<string, unknown>,
): PublicKeyCredentialCreationOptions {
  const rp = (value.rp ?? {}) as Record<string, unknown>;
  const user = (value.user ?? {}) as Record<string, unknown>;
  const selection =
    value.authenticatorSelection &&
    typeof value.authenticatorSelection === 'object'
      ? (value.authenticatorSelection as AuthenticatorSelectionCriteria)
      : undefined;
  return {
    rp: {
      name: String(rp.name ?? ''),
      id: typeof rp.id === 'string' ? rp.id : undefined,
    },
    user: {
      id: decodeBase64Url(String(user.id)),
      name: String(user.name ?? ''),
      displayName: String(user.displayName ?? user.name ?? ''),
    },
    challenge: decodeBase64Url(String(value.challenge)),
    pubKeyCredParams: Array.isArray(value.pubKeyCredParams)
      ? (value.pubKeyCredParams as PublicKeyCredentialParameters[])
      : [],
    timeout: typeof value.timeout === 'number' ? value.timeout : undefined,
    excludeCredentials: descriptors(value.excludeCredentials),
    authenticatorSelection: selection,
    attestation:
      typeof value.attestation === 'string'
        ? (value.attestation as AttestationConveyancePreference)
        : undefined,
    extensions:
      value.extensions && typeof value.extensions === 'object'
        ? (value.extensions as AuthenticationExtensionsClientInputs)
        : undefined,
  };
}

export function assertionToJson(
  credential: PublicKeyCredential,
): Record<string, unknown> {
  if (!(credential.response instanceof AuthenticatorAssertionResponse)) {
    throw new Error('The authenticator did not return a WebAuthn assertion.');
  }
  const response = credential.response;
  return {
    id: credential.id,
    rawId: encodeBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: encodeBase64Url(response.clientDataJSON),
      authenticatorData: encodeBase64Url(response.authenticatorData),
      signature: encodeBase64Url(response.signature),
      userHandle: response.userHandle
        ? encodeBase64Url(response.userHandle)
        : null,
    },
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment,
  };
}

export function attestationToJson(
  credential: PublicKeyCredential,
): Record<string, unknown> {
  if (!(credential.response instanceof AuthenticatorAttestationResponse)) {
    throw new Error('The authenticator did not return a WebAuthn attestation.');
  }
  const response = credential.response;
  return {
    id: credential.id,
    rawId: encodeBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: encodeBase64Url(response.clientDataJSON),
      attestationObject: encodeBase64Url(response.attestationObject),
      transports:
        typeof response.getTransports === 'function'
          ? response.getTransports()
          : [],
    },
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment,
  };
}
