import { describe, expect, it } from 'vitest';
import {
  LIVE_GAME_QUIET_AFTER_MS,
  LIVE_GAME_QUIET_REFRESH_MS,
  LIVE_GAME_REFRESH_MS,
  liveGameQueryOptions,
  liveGameRefetchInterval,
} from './liveGameSync';

describe('live game sync', () => {
  it('reads on the live cadence while answers keep arriving', () => {
    const query = { state: { data: { turn: 1 } as unknown } };
    expect(liveGameRefetchInterval(query, 0)).toBe(LIVE_GAME_REFRESH_MS);
    expect(liveGameRefetchInterval(query, 60_000)).toBe(LIVE_GAME_REFRESH_MS);
  });

  it('relaxes after a quiet stretch and returns at once on a change', () => {
    const query = { state: { data: { turn: 1 } as unknown } };
    liveGameRefetchInterval(query, 0);
    expect(liveGameRefetchInterval(query, LIVE_GAME_QUIET_AFTER_MS)).toBe(
      LIVE_GAME_QUIET_REFRESH_MS,
    );
    query.state.data = { turn: 2 };
    expect(liveGameRefetchInterval(query, LIVE_GAME_QUIET_AFTER_MS + 1)).toBe(
      LIVE_GAME_REFRESH_MS,
    );
  });

  it('keeps each observed query on its own clock', () => {
    const quiet = { state: { data: 'same' as unknown } };
    const busy = { state: { data: 'same' as unknown } };
    liveGameRefetchInterval(quiet, 0);
    liveGameRefetchInterval(busy, LIVE_GAME_QUIET_AFTER_MS);
    expect(liveGameRefetchInterval(quiet, LIVE_GAME_QUIET_AFTER_MS)).toBe(
      LIVE_GAME_QUIET_REFRESH_MS,
    );
    expect(liveGameRefetchInterval(busy, LIVE_GAME_QUIET_AFTER_MS)).toBe(
      LIVE_GAME_REFRESH_MS,
    );
  });

  it('never reads in the background and holds the timer while paused', () => {
    const live = liveGameQueryOptions();
    expect(live.refetchIntervalInBackground).toBe(false);
    expect(live.refetchOnWindowFocus).toBe('always');
    expect(live.refetchOnReconnect).toBe('always');
    expect(typeof live.refetchInterval).toBe('function');
    expect(liveGameQueryOptions({ paused: true }).refetchInterval).toBe(false);
  });
});
