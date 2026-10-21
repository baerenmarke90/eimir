import { useEffect } from 'react';
import type { TokenView } from '../api/generated/models/TokenView';
import {
  captureSessionOwner,
  currentSessionTokens,
  DEFAULT_ACCESS_TOKEN_REFRESH_BUFFER_MS,
  isAccessTokenValid,
  loadStoredSession,
  refreshSessionTokens,
  subscribeSessionRefresh,
} from './sessionPersistence';

/** Resume and transport retry must not turn access expiry into manual login. */
export function useSessionRefresh(
  apiBaseUrl: string,
  tokens: TokenView | null,
  restoring: boolean,
  onTokens: (tokens: TokenView) => void,
  onRejected: () => void,
): void {
  useEffect(() => {
    if (!tokens || restoring) return;
    const owner = captureSessionOwner(tokens.accessToken);
    if (!owner) return;
    let cancelled = false;
    let refreshing = false;
    let rejected = false;
    let timer: ReturnType<typeof setTimeout>;
    const refreshToken = tokens.refreshToken;
    const rejectSession = () => {
      if (!cancelled && !rejected) {
        rejected = true;
        onRejected();
      }
    };
    const unsubscribe = subscribeSessionRefresh(
      (next, previousRefreshToken) => {
        if (cancelled) return;
        if (!next) {
          if (!loadStoredSession()) rejectSession();
        } else if (
          previousRefreshToken === refreshToken ||
          (owner &&
            currentSessionTokens(owner)?.refreshToken === next.refreshToken)
        ) {
          onTokens(next);
        }
      },
    );

    const refresh = () => {
      if (cancelled || refreshing) return;
      clearTimeout(timer);
      const currentTokens = currentSessionTokens(owner);
      if (!currentTokens) return;
      if (isAccessTokenValid(currentTokens)) {
        schedule(currentTokens);
        return;
      }
      const requestedRefreshToken = currentTokens.refreshToken;
      refreshing = true;
      void refreshSessionTokens(apiBaseUrl, requestedRefreshToken)
        .then((next) => {
          if (
            !cancelled &&
            loadStoredSession()?.tokens.refreshToken === next.refreshToken
          )
            onTokens(next);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          const current = loadStoredSession();
          if (current && current.tokens.refreshToken !== requestedRefreshToken)
            return;
          const status = (error as { status?: number })?.status;
          if (status === 401 || status === 403) rejectSession();
          else timer = setTimeout(refresh, 30_000);
        })
        .finally(() => {
          refreshing = false;
        });
    };
    const resume = () => {
      refresh();
    };
    const visibility = () => {
      if (document.visibilityState === 'visible') resume();
    };
    function schedule(current: TokenView) {
      timer = setTimeout(
        refresh,
        Math.max(
          0,
          new Date(current.accessExpiresAt).getTime() -
            Date.now() -
            DEFAULT_ACCESS_TOKEN_REFRESH_BUFFER_MS,
        ),
      );
    }
    schedule(currentSessionTokens(owner) ?? tokens);
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelled = true;
      unsubscribe();
      clearTimeout(timer);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [apiBaseUrl, onRejected, onTokens, restoring, tokens]);
}
