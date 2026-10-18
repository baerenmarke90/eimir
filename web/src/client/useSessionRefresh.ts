import { useEffect } from 'react';
import type { TokenView } from '../api/generated/models/TokenView';
import {
  isAccessTokenValid,
  loadStoredSession,
  refreshSessionTokens,
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
    let cancelled = false;
    let refreshing = false;
    let timer: ReturnType<typeof setTimeout>;
    const refreshToken = tokens.refreshToken;

    const refresh = () => {
      if (cancelled || refreshing) return;
      clearTimeout(timer);
      refreshing = true;
      void refreshSessionTokens(apiBaseUrl, refreshToken)
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
          if (current && current.tokens.refreshToken !== refreshToken) return;
          if ((error as { status?: number })?.status === 401) onRejected();
          else timer = setTimeout(refresh, 30_000);
        })
        .finally(() => {
          refreshing = false;
        });
    };
    const resume = () => {
      if (!isAccessTokenValid(tokens)) refresh();
    };
    const visibility = () => {
      if (document.visibilityState === 'visible') resume();
    };
    timer = setTimeout(
      refresh,
      Math.max(
        0,
        new Date(tokens.accessExpiresAt).getTime() - Date.now() - 60_000,
      ),
    );
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [apiBaseUrl, onRejected, onTokens, restoring, tokens]);
}
