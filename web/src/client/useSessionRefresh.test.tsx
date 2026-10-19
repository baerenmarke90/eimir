// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as sessions from './sessionPersistence';
import { useSessionRefresh } from './useSessionRefresh';

vi.mock('./sessionPersistence', () => ({
  captureSessionOwner: vi.fn(),
  currentSessionTokens: vi.fn(),
  isAccessTokenValid: (tokens: { accessExpiresAt: Date }) =>
    tokens.accessExpiresAt.getTime() > Date.now() + 60_000,
  loadStoredSession: vi.fn(),
  refreshSessionTokens: vi.fn(),
  subscribeSessionRefresh: vi.fn(() => () => {}),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
  vi.resetAllMocks();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function setup(restoring = false) {
  const tokens = {
    accessToken: 'access-a',
    refreshToken: 'refresh-a',
    accessExpiresAt: new Date(Date.now() + 120_000),
    refreshExpiresAt: new Date(Date.now() + 86_400_000),
  };
  const next = {
    ...tokens,
    accessToken: 'access-b',
    refreshToken: 'refresh-b',
  };
  const accepted = vi.fn();
  const rejected = vi.fn();
  vi.mocked(sessions.loadStoredSession).mockReturnValue({
    account: { id: 'a', displayName: 'Alex' },
    tokens,
  });
  const owner = { accountId: 'a', tokens };
  vi.mocked(sessions.captureSessionOwner).mockReturnValue(owner);
  vi.mocked(sessions.currentSessionTokens).mockImplementation((candidate) => {
    const stored = sessions.loadStoredSession();
    return candidate === owner && stored?.account.id === owner.accountId
      ? stored.tokens
      : null;
  });
  vi.mocked(sessions.refreshSessionTokens).mockImplementation(async () => {
    vi.mocked(sessions.loadStoredSession).mockReturnValue({
      account: { id: 'a', displayName: 'Alex' },
      tokens: next,
    });
    return next;
  });
  const hook = renderHook(() =>
    useSessionRefresh(
      'https://instance.example',
      tokens,
      restoring,
      accepted,
      rejected,
    ),
  );
  return { ...hook, tokens, next, accepted, rejected };
}

describe('real session refresh lifecycle', () => {
  it('does not replay a stale timer or resume after request-driven rotation before React commits', async () => {
    const { next, rejected } = setup();
    vi.setSystemTime(new Date(Date.now() + 20 * 60_000));
    vi.mocked(sessions.loadStoredSession).mockReturnValue({
      account: { id: 'a', displayName: 'Alex' },
      tokens: { ...next, accessExpiresAt: new Date(Date.now() + 900_000) },
    });
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
    });
    expect(sessions.refreshSessionTokens).not.toHaveBeenCalled();
    expect(rejected).not.toHaveBeenCalled();
  });

  it('refreshes the current generation rather than its old render after suspension', async () => {
    const { next } = setup();
    vi.setSystemTime(new Date(Date.now() + 20 * 60_000));
    vi.mocked(sessions.loadStoredSession).mockReturnValue({
      account: { id: 'a', displayName: 'Alex' },
      tokens: next,
    });
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(sessions.refreshSessionTokens).toHaveBeenCalledWith(
      'https://instance.example',
      'refresh-b',
    );
  });

  it('receives request-triggered rotations without waiting for its timer', () => {
    const { next, accepted } = setup();
    act(() =>
      vi
        .mocked(sessions.subscribeSessionRefresh)
        .mock.calls[0][0](next, 'refresh-a'),
    );
    expect(accepted).toHaveBeenCalledWith(next);
  });
  it('ends the session when request-triggered refresh is definitively rejected', () => {
    const { rejected } = setup();
    vi.mocked(sessions.loadStoredSession).mockReturnValue(null);
    act(() =>
      vi
        .mocked(sessions.subscribeSessionRefresh)
        .mock.calls[0][0](null, 'refresh-a'),
    );
    expect(rejected).toHaveBeenCalledTimes(1);
  });
  it('refreshes proactively before expiry', async () => {
    const { next, accepted, rejected } = setup();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(accepted).toHaveBeenCalledWith(next);
    expect(rejected).not.toHaveBeenCalled();
  });
  it('retries a temporary network failure without signing out', async () => {
    const { accepted, rejected } = setup();
    vi.mocked(sessions.refreshSessionTokens).mockRejectedValueOnce({
      status: 503,
    });
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(rejected).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(accepted).toHaveBeenCalledTimes(1);
  });
  it('refreshes once on resume/reconnect after background suspension', async () => {
    const { next, accepted } = setup();
    vi.setSystemTime(new Date(Date.now() + 20 * 60_000));
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
    });
    expect(sessions.refreshSessionTokens).toHaveBeenCalledTimes(1);
    expect(accepted).toHaveBeenCalledWith(next);
  });
  it('ends the current session on definitive rejection', async () => {
    const { rejected } = setup();
    vi.mocked(sessions.refreshSessionTokens).mockRejectedValue({ status: 401 });
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(rejected).toHaveBeenCalledTimes(1);
  });
  it('does not terminate a replacement session after an old refresh fails', async () => {
    const { tokens, rejected } = setup();
    vi.mocked(sessions.refreshSessionTokens).mockImplementation(async () => {
      vi.mocked(sessions.loadStoredSession).mockReturnValue({
        account: { id: 'b', displayName: 'Sam' },
        tokens: { ...tokens, refreshToken: 'other-generation' },
      });
      throw { status: 401 };
    });
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(rejected).not.toHaveBeenCalled();
  });
  it('does not start another refresh during initial restoration', async () => {
    setup(true);
    await act(() => vi.advanceTimersByTimeAsync(180_000));
    expect(sessions.refreshSessionTokens).not.toHaveBeenCalled();
  });
});
