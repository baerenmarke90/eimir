import type { AccountView } from '../api/generated/models/AccountView';
import type { TokenView } from '../api/generated/models/TokenView';
import { normalizeClientError } from './problemDetails';
import { createReferenceApis } from './referenceFlow';

export const SESSION_STORAGE_KEY = 'eimir-session-v1';
export const LEGACY_SESSION_STORAGE_KEY = 'sidebyside-session-v1';

const inFlightRefreshes = new Map<string, Promise<TokenView>>();

function parseStoredDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(0);
}

function parseStoredTokens(raw: unknown): TokenView | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.accessToken !== 'string' ||
    typeof obj.refreshToken !== 'string'
  ) {
    return null;
  }

  return {
    accessToken: obj.accessToken,
    refreshToken: obj.refreshToken,
    accessExpiresAt: parseStoredDate(obj.accessExpiresAt),
    refreshExpiresAt: parseStoredDate(obj.refreshExpiresAt),
  };
}

function parseStoredAccount(raw: unknown): AccountView | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string' || typeof obj.displayName !== 'string') {
    return null;
  }
  return { id: obj.id, displayName: obj.displayName };
}

export type StoredSession = {
  account: AccountView;
  tokens: TokenView;
  spaceId?: string | null;
};

export function storeSession(session: StoredSession): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    const serialized = JSON.stringify({
      account: session.account,
      tokens: {
        accessToken: session.tokens.accessToken,
        refreshToken: session.tokens.refreshToken,
        accessExpiresAt:
          session.tokens.accessExpiresAt instanceof Date
            ? session.tokens.accessExpiresAt.toISOString()
            : new Date(session.tokens.accessExpiresAt).toISOString(),
        refreshExpiresAt:
          session.tokens.refreshExpiresAt instanceof Date
            ? session.tokens.refreshExpiresAt.toISOString()
            : new Date(session.tokens.refreshExpiresAt).toISOString(),
      },
      spaceId: session.spaceId ?? null,
    });
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, serialized);
  } catch {
    // Storage might be disabled or quota exceeded in restrictive environments.
  }
}

export function loadStoredSession(): StoredSession | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    const canonical = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    const raw =
      canonical ?? window.sessionStorage.getItem(LEGACY_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      account?: unknown;
      tokens?: unknown;
      spaceId?: unknown;
    };
    const tokens = parseStoredTokens(parsed.tokens);
    const account = parseStoredAccount(parsed.account);
    if (!tokens || !account) {
      clearStoredSession();
      return null;
    }
    const spaceId =
      typeof parsed.spaceId === 'string' && parsed.spaceId.trim()
        ? parsed.spaceId.trim()
        : null;
    if (canonical === null) {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, raw);
      window.sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
    }
    return { account, tokens, spaceId };
  } catch {
    clearStoredSession();
    return null;
  }
}

export function clearStoredSession(): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    window.sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
  } catch {
    // Storage might be disabled in restrictive environments.
  }
}

export function hasStoredSession(): boolean {
  return loadStoredSession() !== null;
}

export const DEFAULT_ACCESS_TOKEN_REFRESH_BUFFER_MS = 60_000;

export function isAccessTokenValid(
  tokens: TokenView,
  thresholdMs = DEFAULT_ACCESS_TOKEN_REFRESH_BUFFER_MS,
): boolean {
  const expiresAt = new Date(tokens.accessExpiresAt).getTime();
  return expiresAt > Date.now() + thresholdMs;
}

export function isRefreshTokenValid(
  tokens: TokenView,
  thresholdMs = 0,
): boolean {
  const expiresAt = new Date(tokens.refreshExpiresAt).getTime();
  return expiresAt > Date.now() + thresholdMs;
}

export async function refreshSessionTokens(
  apiBaseUrl: string,
  refreshToken: string,
): Promise<TokenView> {
  const refreshKey = `${apiBaseUrl}\u0000${refreshToken}`;
  const existingRefresh = inFlightRefreshes.get(refreshKey);
  if (existingRefresh) return existingRefresh;

  const refreshPromise = (async () => {
    try {
      const apis = createReferenceApis(apiBaseUrl);
      const newTokens = await apis.auth.refreshApiV1AuthRefreshPost({
        refreshRequest: { refreshToken },
      });

      // A refresh response belongs to exactly the session generation that
      // started it. Logout, re-authentication, or an Account switch may replace
      // sessionStorage while the request is in flight; never write old tokens
      // into that newer session.
      const currentSession = loadStoredSession();
      if (currentSession?.tokens.refreshToken === refreshToken) {
        storeSession({
          account: currentSession.account,
          tokens: newTokens,
          spaceId: currentSession.spaceId,
        });
      }

      return newTokens;
    } catch (error) {
      const normalized = await normalizeClientError(error);
      if (normalized.status === 401) {
        const currentSession = loadStoredSession();
        if (currentSession?.tokens.refreshToken === refreshToken) {
          clearStoredSession();
        }
      }
      throw normalized;
    }
  })();

  inFlightRefreshes.set(refreshKey, refreshPromise);
  try {
    return await refreshPromise;
  } finally {
    if (inFlightRefreshes.get(refreshKey) === refreshPromise) {
      inFlightRefreshes.delete(refreshKey);
    }
  }
}
