import type { AccountView } from '../api/generated/models/AccountView';
import type { TokenView } from '../api/generated/models/TokenView';
import { normalizeClientError } from './problemDetails';
import { clearAuthorizedMediaCache } from './authorizedMediaCache';
import { clearRetrospectiveDismissal } from './todayRetrospectiveDismissal';
import { createReferenceApis } from './referenceFlow';
import {
  isNativeSessionStorageAvailable,
  readNativeSessionSnapshot,
  writeNativeSessionSnapshot,
} from './nativeSessionStorage';

export const SESSION_STORAGE_KEY = 'eimir-session-v1';
export const LEGACY_SESSION_STORAGE_KEY = 'sidebyside-session-v1';

const inFlightRefreshes = new Map<string, Promise<TokenView>>();
let nativeWrites: Promise<void> = Promise.resolve();
let storageRevision = 0;

/** In-memory identity of one login, retained only across its own rotations. */
export type SessionOwner = {
  accountId: string;
  tokens: TokenView;
  previousTokens?: TokenView;
  refreshApiBaseUrl?: string;
};
let sessionOwner: SessionOwner | null = null;
const refreshListeners = new Set<
  (tokens: TokenView | null, previousRefreshToken: string) => void
>();

export function captureSessionOwner(accessToken: string): SessionOwner | null {
  const stored = loadStoredSession();
  if (!stored) return null;
  if (
    !sessionOwner ||
    sessionOwner.accountId !== stored.account.id ||
    sessionOwner.tokens.refreshToken !== stored.tokens.refreshToken
  ) {
    sessionOwner = { accountId: stored.account.id, tokens: stored.tokens };
  }
  return sessionOwner.tokens.accessToken === accessToken ||
    sessionOwner.previousTokens?.accessToken === accessToken
    ? sessionOwner
    : null;
}

export function currentSessionTokens(owner: SessionOwner): TokenView | null {
  const stored = loadStoredSession();
  return sessionOwner === owner &&
    stored?.account.id === owner.accountId &&
    stored.tokens.accessToken === owner.tokens.accessToken &&
    stored.tokens.refreshToken === owner.tokens.refreshToken
    ? owner.tokens
    : null;
}

export function subscribeSessionRefresh(
  listener: (tokens: TokenView | null, previousRefreshToken: string) => void,
): () => void {
  refreshListeners.add(listener);
  return () => {
    refreshListeners.delete(listener);
  };
}

export function pendingSessionRefresh(
  apiBaseUrl: string,
  refreshToken: string,
): Promise<TokenView> | undefined {
  return inFlightRefreshes.get(`${apiBaseUrl}\u0000${refreshToken}`);
}

function persistNativeSnapshot(value: string | null): Promise<void> {
  storageRevision += 1;
  if (!isNativeSessionStorageAvailable()) return Promise.resolve();
  nativeWrites = nativeWrites.then(async () => {
    try {
      await writeNativeSessionSnapshot(value);
    } catch {
      // Never retain an obsolete refresh generation or use plaintext fallback.
      try {
        await writeNativeSessionSnapshot(null);
      } catch {
        // The current in-memory/WebView session can still be used.
      }
    }
  });
  return nativeWrites;
}

export async function restoreNativeSession(): Promise<void> {
  if (!isNativeSessionStorageAvailable()) return;
  const existing = loadStoredSession();
  if (existing) {
    await storeSession(existing);
    return;
  }
  const revision = storageRevision;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    await nativeWrites;
    const raw = await Promise.race([
      readNativeSessionSnapshot(),
      new Promise<never>((_resolve, reject) => {
        deadline = setTimeout(
          () => reject(new Error('Native session read timed out')),
          5_000,
        );
      }),
    ]);
    if (revision !== storageRevision || raw === null) return;
    if (raw.length > 16_384) {
      await clearStoredSession();
      return;
    }
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, raw);
    const restored = loadStoredSession();
    if (!restored || !isRefreshTokenValid(restored.tokens)) {
      await clearStoredSession();
    }
  } catch {
    // No native credential is usable; never fall back to localStorage.
  } finally {
    clearTimeout(deadline);
  }
}

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

export function storeSession(session: StoredSession): Promise<void> {
  // Space selection or a late verified read can still carry the previous
  // render's tokens. Metadata updates must not roll back a consumed generation.
  if (
    sessionOwner?.accountId === session.account.id &&
    sessionOwner.previousTokens?.refreshToken === session.tokens.refreshToken &&
    currentSessionTokens(sessionOwner)
  ) {
    session = { ...session, tokens: sessionOwner.tokens };
  }
  return persistSession(session);
}

function persistSession(
  session: StoredSession,
  rotatedFrom?: string,
  refreshApiBaseUrl?: string,
): Promise<void> {
  if (typeof window === 'undefined' || !window.sessionStorage)
    return Promise.resolve();
  try {
    const previous = loadStoredSession();
    if (
      previous?.account.id !== session.account.id ||
      previous?.spaceId !== (session.spaceId ?? null) ||
      (sessionOwner &&
        sessionOwner.tokens.refreshToken !== session.tokens.refreshToken &&
        sessionOwner.tokens.refreshToken !== rotatedFrom)
    ) {
      clearAuthorizedMediaCache();
    }
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
    if (
      sessionOwner?.accountId === session.account.id &&
      (sessionOwner.tokens.refreshToken === session.tokens.refreshToken ||
        sessionOwner.tokens.refreshToken === rotatedFrom)
    ) {
      if (sessionOwner.tokens.refreshToken === rotatedFrom) {
        sessionOwner.previousTokens = sessionOwner.tokens;
        sessionOwner.refreshApiBaseUrl = refreshApiBaseUrl;
      }
      sessionOwner.tokens = session.tokens;
    } else {
      sessionOwner = { accountId: session.account.id, tokens: session.tokens };
    }
    return persistNativeSnapshot(serialized);
  } catch {
    // Storage might be disabled or quota exceeded in restrictive environments.
    return Promise.resolve();
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

export function clearStoredSession(): Promise<void> {
  clearAuthorizedMediaCache();
  clearRetrospectiveDismissal();
  sessionOwner = null;
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage?.removeItem(SESSION_STORAGE_KEY);
      window.sessionStorage?.removeItem(LEGACY_SESSION_STORAGE_KEY);
    }
  } catch {
    // Storage might be disabled in restrictive environments.
  }
  return persistNativeSnapshot(null);
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

  const stored = loadStoredSession();
  const owner = stored ? captureSessionOwner(stored.tokens.accessToken) : null;
  if (
    owner?.previousTokens?.refreshToken === refreshToken &&
    owner.refreshApiBaseUrl === apiBaseUrl &&
    currentSessionTokens(owner)
  ) {
    // A queued timer/resume callback may outlive the completed promise. Sending
    // that consumed token again would correctly revoke the entire server family.
    return owner.tokens;
  }

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
        await persistSession(
          {
            account: currentSession.account,
            tokens: newTokens,
            spaceId: currentSession.spaceId,
          },
          refreshToken,
          apiBaseUrl,
        );
        if (
          loadStoredSession()?.tokens.refreshToken === newTokens.refreshToken
        ) {
          for (const listener of refreshListeners)
            listener(newTokens, refreshToken);
        }
      }

      return newTokens;
    } catch (error) {
      const normalized = await normalizeClientError(error);
      if (normalized.status === 401 || normalized.status === 403) {
        const currentSession = loadStoredSession();
        if (currentSession?.tokens.refreshToken === refreshToken) {
          await clearStoredSession();
          if (!loadStoredSession()) {
            for (const listener of refreshListeners)
              listener(null, refreshToken);
          }
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
