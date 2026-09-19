import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { AuthApi } from '../api/generated/apis/AuthApi';
import type { CapabilitiesView } from '../api/generated/models/CapabilitiesView';
import { RecentAuthenticationClient } from '../api/generated/models/RecentAuthenticationClient';
import type { RecentAuthenticationView } from '../api/generated/models/RecentAuthenticationView';
import { Configuration } from '../api/generated/runtime';
import { isCapacitorNative } from '../pwa';
import { ClientProblemError, normalizeClientError } from './problemDetails';

const OIDC_POPUP_POLL_MS = 200;
const OIDC_POPUP_TIMEOUT_MS = 2 * 60 * 1000;

export type RecentAuthenticationTarget = 'account-deletion' | 'server-admin';

function api(apiBaseUrl: string, accessToken: string): AuthApi {
  return new AuthApi(
    new Configuration({
      basePath: apiBaseUrl,
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  );
}

function decodeBase64Url(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const raw = window.atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes.buffer;
}

function encodeBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return window
    .btoa(raw)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function requestOptionsFromJson(
  value: Record<string, unknown>,
): PublicKeyCredentialRequestOptions {
  const allowCredentials = Array.isArray(value.allowCredentials)
    ? value.allowCredentials.map((item) => {
        const descriptor = item as Record<string, unknown>;
        return {
          id: decodeBase64Url(String(descriptor.id)),
          type: 'public-key' as const,
          transports: Array.isArray(descriptor.transports)
            ? (descriptor.transports as AuthenticatorTransport[])
            : undefined,
        };
      })
    : undefined;

  return {
    challenge: decodeBase64Url(String(value.challenge)),
    timeout: typeof value.timeout === 'number' ? value.timeout : undefined,
    rpId: typeof value.rpId === 'string' ? value.rpId : undefined,
    allowCredentials,
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

function assertionToJson(
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

async function normalize<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export async function loadRecentAuthenticationCapabilities(
  apiBaseUrl: string,
  accessToken: string,
  client?: RecentAuthenticationClient,
  target: RecentAuthenticationTarget = 'account-deletion',
): Promise<CapabilitiesView> {
  const isNative = isCapacitorNative();
  const effectiveClient =
    client ?? (isNative ? RecentAuthenticationClient.android : undefined);

  const authApi = api(apiBaseUrl, accessToken);
  const capabilities = await normalize(() =>
    target === 'server-admin'
      ? authApi.serverAdminCapabilitiesApiV1AuthRecentAuthenticationServerAdminGet({
          client: effectiveClient,
        })
      : authApi.capabilitiesApiV1AuthRecentAuthenticationAccountDeletionGet({
          client: effectiveClient,
        }),
  );

  if (isNative) {
    // Direct eimir.-WebAuthn via navigator.credentials in Android WebView is not
    // proven/supported in this foundational slice (no Credential Manager/DAL integration).
    // Native container must not offer direct passkey re-authentication.
    return {
      ...capabilities,
      passkey: false,
    };
  }

  return capabilities;
}

export async function authenticateRecentPassword(
  apiBaseUrl: string,
  accessToken: string,
  password: string,
  target: RecentAuthenticationTarget = 'account-deletion',
): Promise<RecentAuthenticationView> {
  return normalize(() => {
    const authApi = api(apiBaseUrl, accessToken);
    return target === 'server-admin'
      ? authApi.serverAdminPasswordApiV1AuthRecentAuthenticationServerAdminPasswordPost({
          passwordRequest: { password },
        })
      : authApi.passwordApiV1AuthRecentAuthenticationAccountDeletionPasswordPost({
          passwordRequest: { password },
        });
  });
}

export async function authenticateRecentPasskey(
  apiBaseUrl: string,
  accessToken: string,
  target: RecentAuthenticationTarget = 'account-deletion',
): Promise<RecentAuthenticationView> {
  if (isCapacitorNative()) {
    throw new Error(
      'Direct passkey authentication is not supported in the native Android container.',
    );
  }
  if (!window.PublicKeyCredential || !navigator.credentials) {
    throw new Error('WebAuthn is not available in this browser.');
  }

  return normalize(async () => {
    const authApi = api(apiBaseUrl, accessToken);
    const options =
      target === 'server-admin'
        ? await authApi.serverAdminStartPasskeyApiV1AuthRecentAuthenticationServerAdminPasskeysStartPost()
        : await authApi.startPasskeyApiV1AuthRecentAuthenticationAccountDeletionPasskeysStartPost();
    const result = await navigator.credentials.get({
      publicKey: requestOptionsFromJson(options),
    });
    if (!(result instanceof PublicKeyCredential)) {
      throw new Error('Passkey authentication was cancelled or unavailable.');
    }
    const passkeyFinishRequest = { credential: assertionToJson(result) };
    return target === 'server-admin'
      ? authApi.serverAdminFinishPasskeyApiV1AuthRecentAuthenticationServerAdminPasskeysFinishPost(
          { passkeyFinishRequest },
        )
      : authApi.finishPasskeyApiV1AuthRecentAuthenticationAccountDeletionPasskeysFinishPost(
          { passkeyFinishRequest },
        );
  });
}

function waitForOidcCallback(
  popup: Window,
  expectedState: string,
): Promise<{ code: string; state: string }> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(timer);
        reject(new Error('OIDC reauthentication was cancelled.'));
        return;
      }
      if (Date.now() - startedAt > OIDC_POPUP_TIMEOUT_MS) {
        popup.close();
        window.clearInterval(timer);
        reject(new Error('OIDC reauthentication timed out.'));
        return;
      }

      try {
        const callback = new URL(popup.location.href);
        const state = callback.searchParams.get('state');
        if (state !== expectedState) return;

        const providerError = callback.searchParams.get('error');
        if (providerError) {
          popup.close();
          window.clearInterval(timer);
          reject(new Error('The identity provider rejected reauthentication.'));
          return;
        }

        const code = callback.searchParams.get('code');
        if (!code) return;
        popup.close();
        window.clearInterval(timer);
        resolve({ code, state });
      } catch {
        // Cross-origin reads fail while the popup is at the identity provider.
        // Once it reaches the configured Eimir redirect URI the URL is
        // same-origin again and can be consumed without exposing provider data.
      }
    }, OIDC_POPUP_POLL_MS);
  });
}

export function parseOidcCallbackUrl(
  rawUrl: string,
  expectedState: string,
): { code: string; state: string } | null {
  try {
    const callback = new URL(rawUrl);
    if (
      callback.protocol === 'de.sidebyside.app:' &&
      callback.host === 'recent-authentication' &&
      callback.pathname === '/oidc'
    ) {
      const state = callback.searchParams.get('state');
      if (state !== expectedState) return null;

      const providerError = callback.searchParams.get('error');
      if (providerError) {
        throw new Error('The identity provider rejected reauthentication.');
      }

      const code = callback.searchParams.get('code');
      if (!code) return null;
      return { code, state };
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('identity provider rejected')
    ) {
      throw error;
    }
  }
  return null;
}

export function waitForCapacitorOidcCallback(
  expectedState: string,
): Promise<{ code: string; state: string }> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const startedAt = Date.now();

    const cleanup = () => {
      resolved = true;
      clearInterval(timer);
      void listenerPromise.then((handle) => handle.remove());
    };

    const handleUrl = (rawUrl: string) => {
      if (resolved) return;
      try {
        const result = parseOidcCallbackUrl(rawUrl, expectedState);
        if (result) {
          cleanup();
          resolve(result);
        }
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    // 1. Listen for intent URL open while running in background
    const listenerPromise = App.addListener('appUrlOpen', (event) => {
      handleUrl(event.url);
    });

    // 2. Check cold start launch URL
    void App.getLaunchUrl().then((launchUrl) => {
      if (launchUrl?.url) {
        handleUrl(launchUrl.url);
      }
    });

    // 3. Timeout polling
    const timer = setInterval(() => {
      if (Date.now() - startedAt > OIDC_POPUP_TIMEOUT_MS) {
        cleanup();
        reject(new Error('OIDC reauthentication timed out.'));
      }
    }, OIDC_POPUP_POLL_MS);
  });
}

export async function authenticateRecentOidc(
  apiBaseUrl: string,
  accessToken: string,
  connectionId: string,
  target: RecentAuthenticationTarget = 'account-deletion',
): Promise<RecentAuthenticationView> {
  return normalize(async () => {
    const authApi = api(apiBaseUrl, accessToken);

    if (isCapacitorNative()) {
      const started =
        target === 'server-admin'
          ? await authApi.serverAdminStartOidcApiV1AuthRecentAuthenticationServerAdminOidcConnectionIdStartPost(
              {
                connectionId,
                client: RecentAuthenticationClient.android,
              },
            )
          : await authApi.startOidcApiV1AuthRecentAuthenticationAccountDeletionOidcConnectionIdStartPost(
              {
                connectionId,
                client: RecentAuthenticationClient.android,
              },
            );

      const callbackPromise = waitForCapacitorOidcCallback(started.state);
      await Browser.open({ url: started.authorizationUrl });

      try {
        const callback = await callbackPromise;
        const request = {
          connectionId,
          eimirApiV1RecentAuthenticationOidcCallbackRequest: callback,
        };
        return target === 'server-admin'
          ? await authApi.serverAdminCompleteOidcApiV1AuthRecentAuthenticationServerAdminOidcConnectionIdCallbackPost(
              request,
            )
          : await authApi.completeOidcApiV1AuthRecentAuthenticationAccountDeletionOidcConnectionIdCallbackPost(
              request,
            );
      } finally {
        await Browser.close().catch(() => {});
      }
    }

    const started =
      target === 'server-admin'
        ? await authApi.serverAdminStartOidcApiV1AuthRecentAuthenticationServerAdminOidcConnectionIdStartPost(
            { connectionId },
          )
        : await authApi.startOidcApiV1AuthRecentAuthenticationAccountDeletionOidcConnectionIdStartPost(
            { connectionId },
          );
    const popup = window.open(
      started.authorizationUrl,
      'eimir-recent-authentication',
      'popup,width=520,height=720',
    );
    if (!popup) {
      throw new Error('The browser blocked the reauthentication window.');
    }
    const callback = await waitForOidcCallback(popup, started.state);
    const request = {
      connectionId,
      eimirApiV1RecentAuthenticationOidcCallbackRequest: callback,
    };
    return target === 'server-admin'
      ? authApi.serverAdminCompleteOidcApiV1AuthRecentAuthenticationServerAdminOidcConnectionIdCallbackPost(
          request,
        )
      : authApi.completeOidcApiV1AuthRecentAuthenticationAccountDeletionOidcConnectionIdCallbackPost(
          request,
        );
  });
}


export function loadServerAdminRecentAuthenticationCapabilities(
  apiBaseUrl: string,
  accessToken: string,
  client?: RecentAuthenticationClient,
): Promise<CapabilitiesView> {
  return loadRecentAuthenticationCapabilities(
    apiBaseUrl,
    accessToken,
    client,
    'server-admin',
  );
}

export function authenticateServerAdminRecentPassword(
  apiBaseUrl: string,
  accessToken: string,
  password: string,
): Promise<RecentAuthenticationView> {
  return authenticateRecentPassword(
    apiBaseUrl,
    accessToken,
    password,
    'server-admin',
  );
}

export function authenticateServerAdminRecentPasskey(
  apiBaseUrl: string,
  accessToken: string,
): Promise<RecentAuthenticationView> {
  return authenticateRecentPasskey(apiBaseUrl, accessToken, 'server-admin');
}

export function authenticateServerAdminRecentOidc(
  apiBaseUrl: string,
  accessToken: string,
  connectionId: string,
): Promise<RecentAuthenticationView> {
  return authenticateRecentOidc(
    apiBaseUrl,
    accessToken,
    connectionId,
    'server-admin',
  );
}

export function isRecentAuthRequired(error: unknown): boolean {
  return (
    error instanceof ClientProblemError &&
    error.status === 403 &&
    error.code === 'RECENT_AUTHENTICATION_REQUIRED'
  );
}
