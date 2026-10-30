import {
  Configuration as GeneratedConfiguration,
  type ConfigurationParameters,
} from '../api/generated/runtime';
import type { TokenView } from '../api/generated/models/TokenView';
import { ClientProblemError } from './problemDetails';
import {
  captureSessionOwner,
  currentSessionTokens,
  isAccessTokenValid,
  loadStoredSession,
  pendingSessionRefresh,
  refreshSessionTokens,
  type SessionOwner,
} from './sessionPersistence';
import {
  mediaCacheScopeForOwner,
  type MediaCacheScope,
} from './authorizedMediaCache';

function requireTokens(owner: SessionOwner): TokenView {
  const tokens = currentSessionTokens(owner);
  if (!tokens) throw new ClientProblemError('unauthorized', 401);
  return tokens;
}

/** Shared generated-client adapter for one login's rotating credentials. */
export class Configuration extends GeneratedConfiguration {
  readonly mediaCacheScope: MediaCacheScope;

  constructor(parameters: ConfigurationParameters = {}) {
    const authorization = parameters.headers?.Authorization;
    const owner = authorization?.startsWith('Bearer ')
      ? captureSessionOwner(authorization.slice(7))
      : null;
    if (!owner) {
      super(parameters);
      this.mediaCacheScope = mediaCacheScopeForOwner(
        this,
        parameters.basePath ?? '',
        () => true,
      );
      return;
    }
    const apiBaseUrl = parameters.basePath ?? '';
    const baseUrl = new URL(apiBaseUrl || '/', window.location.href);
    const transport = parameters.fetchApi ?? ((url, init) => fetch(url, init));
    super({
      ...parameters,
      fetchApi: async (url, init) => {
        const target =
          typeof url === 'string' || url instanceof URL ? url : url.url;
        if (new URL(target, baseUrl).origin !== baseUrl.origin) {
          throw new ClientProblemError('unauthorized', 401);
        }
        let tokens = requireTokens(owner);
        const pending = pendingSessionRefresh(apiBaseUrl, tokens.refreshToken);
        if (pending) await pending;
        else if (!isAccessTokenValid(tokens)) {
          await refreshSessionTokens(apiBaseUrl, tokens.refreshToken);
        }
        tokens = requireTokens(owner);
        const send = (accessToken: string) => {
          init?.signal?.throwIfAborted();
          const headers = new Headers(init?.headers);
          headers.set('Authorization', `Bearer ${accessToken}`);
          return transport(url, { ...init, headers });
        };
        const response = await send(tokens.accessToken);
        if (response.status !== 401) return response;

        // A 401 rejects authentication before the operation. Never replay an
        // uncertain network/server outcome, nor migrate work to another login.
        const current = requireTokens(owner);
        if (current.accessToken === tokens.accessToken) {
          await refreshSessionTokens(apiBaseUrl, current.refreshToken);
        }
        return send(requireTokens(owner).accessToken);
      },
    });
    this.mediaCacheScope = mediaCacheScopeForOwner(
      owner,
      apiBaseUrl,
      (spaceId) => {
        const stored = loadStoredSession();
        return (
          currentSessionTokens(owner) !== null &&
          (!stored?.spaceId || stored.spaceId === spaceId)
        );
      },
      owner.accountId,
    );
  }
}

/** The same session contract for authenticated media, including XHR progress. */
export function createSessionFetch(
  apiBaseUrl: string,
  accessToken: string,
  transport: typeof fetch,
): typeof fetch {
  return (
    new Configuration({
      basePath: apiBaseUrl,
      headers: { Authorization: `Bearer ${accessToken}` },
      fetchApi: transport,
    }).fetchApi ?? transport
  );
}
