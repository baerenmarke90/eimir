import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { AuthApi } from '../api/generated/apis/AuthApi';
import type { CapabilitiesView } from '../api/generated/models/CapabilitiesView';
import { RecentAuthenticationClient } from '../api/generated/models/RecentAuthenticationClient';
import type { RecentAuthenticationView } from '../api/generated/models/RecentAuthenticationView';
import { Configuration } from './apiConfiguration';
import { isCapacitorNative } from '../pwa';
import { normalizeClientError } from './problemDetails';
import { assertionToJson, requestOptionsFromJson } from './webauthnCodec';

const OIDC_POPUP_POLL_MS = 200;
const OIDC_POPUP_TIMEOUT_MS = 2 * 60 * 1000;

function api(apiBaseUrl: string, accessToken: string): AuthApi {
  return new AuthApi(
    new Configuration({
      basePath: apiBaseUrl,
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  );
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
): Promise<CapabilitiesView> {
  const isNative = isCapacitorNative();
  const effectiveClient =
    client ?? (isNative ? RecentAuthenticationClient.android : undefined);

  const authApi = api(apiBaseUrl, accessToken);
  const capabilities = await normalize(() =>
    authApi.capabilitiesApiV1AuthRecentAuthenticationAccountDeletionGet({
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
): Promise<RecentAuthenticationView> {
  return normalize(() =>
    api(
      apiBaseUrl,
      accessToken,
    ).passwordApiV1AuthRecentAuthenticationAccountDeletionPasswordPost({
      passwordRequest: { password },
    }),
  );
}

export async function authenticateRecentPasskey(
  apiBaseUrl: string,
  accessToken: string,
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
      await authApi.startPasskeyApiV1AuthRecentAuthenticationAccountDeletionPasskeysStartPost();
    const result = await navigator.credentials.get({
      publicKey: requestOptionsFromJson(options),
    });
    if (!(result instanceof PublicKeyCredential)) {
      throw new Error('Passkey authentication was cancelled or unavailable.');
    }
    const passkeyFinishRequest = { credential: assertionToJson(result) };
    return authApi.finishPasskeyApiV1AuthRecentAuthenticationAccountDeletionPasskeysFinishPost(
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
      callback.protocol === 'de.eimir.app:' &&
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
): Promise<RecentAuthenticationView> {
  return normalize(async () => {
    const authApi = api(apiBaseUrl, accessToken);

    if (isCapacitorNative()) {
      const started =
        await authApi.startOidcApiV1AuthRecentAuthenticationAccountDeletionOidcConnectionIdStartPost(
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
        return await authApi.completeOidcApiV1AuthRecentAuthenticationAccountDeletionOidcConnectionIdCallbackPost(
          request,
        );
      } finally {
        await Browser.close().catch(() => {});
      }
    }

    const started =
      await authApi.startOidcApiV1AuthRecentAuthenticationAccountDeletionOidcConnectionIdStartPost(
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
    return authApi.completeOidcApiV1AuthRecentAuthenticationAccountDeletionOidcConnectionIdCallbackPost(
      request,
    );
  });
}
