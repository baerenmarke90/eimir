/**
 * Live partner sync for the apart games (Herzversteck, Bild-Pingpong, Garten).
 *
 * While a game page is open, its single authorized state resource is re-read
 * on a short cadence, so a move the partner makes at the same time (a hidden
 * heart, a search tap, a handed-over turn, a sent seed or a watering) appears
 * without leaving or refocusing the page. There is no realtime transport in
 * the product (docs/product/design/1211-foreground-notification-arrival.md);
 * bounded polling of the existing read is the reuse decision, documented in
 * docs/product/design/references/1907-h3-live-sync/README.md.
 *
 * TanStack Query already pauses the timer while the document is hidden
 * (`refetchIntervalInBackground: false`) and while offline (network mode
 * `online`), and its structural sharing keeps an unchanged answer from
 * re-rendering. After a longer quiet stretch without any change the cadence
 * relaxes, and the next focus or reconnect reads at once again.
 */

/** Cadence while the game is open and something may happen any moment. */
export const LIVE_GAME_REFRESH_MS = 2_500;
/** Cadence once nothing has changed for {@link LIVE_GAME_QUIET_AFTER_MS}. */
export const LIVE_GAME_QUIET_REFRESH_MS = 10_000;
export const LIVE_GAME_QUIET_AFTER_MS = 10 * 60_000;

interface LiveQueryLike {
  state: { data: unknown };
}

const lastChange = new WeakMap<object, { data: unknown; at: number }>();

/**
 * Interval for one observed game query. A changed answer (a new reference
 * after structural sharing) restarts the live cadence.
 */
export function liveGameRefetchInterval(
  query: LiveQueryLike,
  now: number = Date.now(),
): number {
  const seen = lastChange.get(query);
  if (!seen || seen.data !== query.state.data) {
    lastChange.set(query, { data: query.state.data, at: now });
    return LIVE_GAME_REFRESH_MS;
  }
  return now - seen.at >= LIVE_GAME_QUIET_AFTER_MS
    ? LIVE_GAME_QUIET_REFRESH_MS
    : LIVE_GAME_REFRESH_MS;
}

/**
 * Query options shared by the three game pages. `paused` holds the timer
 * while a local write or a one-shot transition is running, so a read that
 * started earlier cannot briefly replace the newer local answer.
 */
export function liveGameQueryOptions({
  paused = false,
}: {
  paused?: boolean;
} = {}) {
  return {
    refetchOnWindowFocus: 'always' as const,
    refetchOnReconnect: 'always' as const,
    refetchInterval: paused
      ? (false as const)
      : (query: LiveQueryLike) => liveGameRefetchInterval(query),
    refetchIntervalInBackground: false,
  };
}
