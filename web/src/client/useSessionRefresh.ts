import { useEffect, useRef } from 'react';
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

/**
 * The longest delay a timer honours. Browsers run a longer one at once (a
 * 32-bit limit), which would reschedule it immediately and spin the page.
 */
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

/**
 * Refresh ahead while the app is in use. An access token lasts 24 hours; when
 * less than this is left, a quiet background refresh gives the device a fresh
 * one, so the next app start finds a valid token and does not wait for a
 * refresh round trip before any data loads.
 */
const REFRESH_AHEAD_WINDOW_MS = 12 * 60 * 60 * 1000;
/**
 * Below this, the normal timer just before expiry refreshes an open app. The
 * floor also keeps short-lived tokens (an older server's 15 minutes, a
 * one-hour fixture) out of this path: they never reach it, so they cannot
 * start a refresh loop or an unexpected request.
 */
const REFRESH_AHEAD_FLOOR_MS = 2 * 60 * 60 * 1000;
/** At most one refresh ahead per device in this time. */
const REFRESH_AHEAD_MIN_INTERVAL_MS = 30 * 60 * 1000;
/** The app has settled by then, so the request does not compete with startup. */
const REFRESH_AHEAD_IDLE_DELAY_MS = 5_000;

/** Resume and transport retry must not turn access expiry into manual login. */
export function useSessionRefresh(
  apiBaseUrl: string,
  tokens: TokenView | null,
  restoring: boolean,
  onTokens: (tokens: TokenView) => void,
  onRejected: () => void,
): void {
  const lastRefreshAheadAt = useRef(0);
  useEffect(() => {
    if (!tokens || restoring) return;
    const owner = captureSessionOwner(tokens.accessToken);
    if (!owner) return;
    let cancelled = false;
    let refreshing = false;
    let rejected = false;
    let timer: ReturnType<typeof setTimeout>;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
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

    const refresh = (ahead = false) => {
      if (cancelled || refreshing) return;
      clearTimeout(timer);
      const currentTokens = currentSessionTokens(owner);
      if (!currentTokens) return;
      if (!ahead && isAccessTokenValid(currentTokens)) {
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
    // A token that has half a day or less left gets a fresh one in the
    // background. A failure leaves the valid token in place and retries
    // through the normal path.
    const refreshAhead = () => {
      if (cancelled || refreshing) return;
      const current = currentSessionTokens(owner);
      if (!current) return;
      const remaining =
        new Date(current.accessExpiresAt).getTime() - Date.now();
      if (
        remaining <= REFRESH_AHEAD_FLOOR_MS ||
        remaining >= REFRESH_AHEAD_WINDOW_MS ||
        Date.now() - lastRefreshAheadAt.current < REFRESH_AHEAD_MIN_INTERVAL_MS
      )
        return;
      lastRefreshAheadAt.current = Date.now();
      refresh(true);
    };
    const resume = () => {
      refresh();
      refreshAhead();
    };
    const visibility = () => {
      if (document.visibilityState === 'visible') resume();
    };
    function schedule(current: TokenView) {
      timer = setTimeout(
        refresh,
        Math.min(
          MAX_TIMER_DELAY_MS,
          Math.max(
            0,
            new Date(current.accessExpiresAt).getTime() -
              Date.now() -
              DEFAULT_ACCESS_TOKEN_REFRESH_BUFFER_MS,
          ),
        ),
      );
    }
    schedule(currentSessionTokens(owner) ?? tokens);
    idleTimer = setTimeout(refreshAhead, REFRESH_AHEAD_IDLE_DELAY_MS);
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelled = true;
      unsubscribe();
      clearTimeout(timer);
      clearTimeout(idleTimer);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [apiBaseUrl, onRejected, onTokens, restoring, tokens]);
}
