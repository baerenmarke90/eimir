import type { AccountView } from '../api/generated/models/AccountView';
import type { SessionView } from '../api/generated/models/SessionView';
import type { TokenView } from '../api/generated/models/TokenView';
import * as referenceFlow from './referenceFlow';
import {
  LEGACY_SESSION_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  clearStoredSession,
  hasStoredSession,
  isAccessTokenValid,
  isRefreshTokenValid,
  loadStoredSession,
  refreshSessionTokens,
  storeSession,
} from './sessionPersistence';

const mockAccount: AccountView = {
  id: 'acc-123',
  displayName: 'Test User',
};

const mockTokens: TokenView = {
  accessToken: 'access-token-1',
  refreshToken: 'refresh-token-1',
  accessExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
  refreshExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
};

const mockSession: SessionView = {
  account: mockAccount,
  tokens: mockTokens,
};

const secondAccount: AccountView = {
  id: 'acc-456',
  displayName: 'Second User',
};

const secondTokens: TokenView = {
  accessToken: 'access-token-b',
  refreshToken: 'refresh-token-b',
  accessExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
  refreshExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
};

const storageMap = new Map<string, string>();
const mockSessionStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storageMap.set(key, String(value));
  },
  removeItem: (key: string) => {
    storageMap.delete(key);
  },
  clear: () => {
    storageMap.clear();
  },
  get length() {
    return storageMap.size;
  },
  key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
};

describe('sessionPersistence', () => {
  beforeEach(() => {
    (globalThis as unknown as { window: unknown }).window = {
      sessionStorage: mockSessionStorage,
    };
    mockSessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('stores and restores session with Date objects intact', () => {
    storeSession(mockSession);

    expect(hasStoredSession()).toBe(true);
    const restored = loadStoredSession();
    expect(restored).not.toBeNull();
    expect(restored?.account.id).toBe('acc-123');
    expect(restored?.account.displayName).toBe('Test User');
    expect(restored?.tokens.accessToken).toBe('access-token-1');
    expect(restored?.tokens.refreshToken).toBe('refresh-token-1');
    expect(restored?.tokens.accessExpiresAt).toBeInstanceOf(Date);
    expect(restored?.tokens.refreshExpiresAt).toBeInstanceOf(Date);
    expect(restored?.tokens.accessExpiresAt.getTime()).toBe(
      mockTokens.accessExpiresAt.getTime(),
    );
  });

  it('migrates an existing legacy session without signing the user out', () => {
    storeSession(mockSession);
    const serialized = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    expect(serialized).not.toBeNull();
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    window.sessionStorage.setItem(
      LEGACY_SESSION_STORAGE_KEY,
      serialized as string,
    );

    expect(loadStoredSession()?.account.id).toBe(mockAccount.id);
    expect(window.sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe(serialized);
    expect(
      window.sessionStorage.getItem(LEGACY_SESSION_STORAGE_KEY),
    ).toBeNull();
  });

  it('clears stored session properly', () => {
    storeSession(mockSession);
    expect(hasStoredSession()).toBe(true);

    clearStoredSession();
    expect(hasStoredSession()).toBe(false);
    expect(loadStoredSession()).toBeNull();
    expect(window.sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(
      window.sessionStorage.getItem(LEGACY_SESSION_STORAGE_KEY),
    ).toBeNull();
  });

  it('correctly assesses access token validity', () => {
    const freshTokens: TokenView = {
      ...mockTokens,
      accessExpiresAt: new Date(Date.now() + 120_000),
    };
    expect(isAccessTokenValid(freshTokens)).toBe(true);

    // Token in 30-60s window (e.g. 45s remaining) is invalid by default (triggers proactive refresh)
    const tokenInWindow: TokenView = {
      ...mockTokens,
      accessExpiresAt: new Date(Date.now() + 45_000),
    };
    expect(isAccessTokenValid(tokenInWindow)).toBe(false);

    const expiringSoonTokens: TokenView = {
      ...mockTokens,
      accessExpiresAt: new Date(Date.now() + 10_000),
    };
    expect(isAccessTokenValid(expiringSoonTokens)).toBe(false);

    const expiredTokens: TokenView = {
      ...mockTokens,
      accessExpiresAt: new Date(Date.now() - 5_000),
    };
    expect(isAccessTokenValid(expiredTokens)).toBe(false);
  });

  it('correctly assesses refresh token validity', () => {
    const validTokens: TokenView = {
      ...mockTokens,
      refreshExpiresAt: new Date(Date.now() + 100_000),
    };
    expect(isRefreshTokenValid(validTokens)).toBe(true);

    const expiredTokens: TokenView = {
      ...mockTokens,
      refreshExpiresAt: new Date(Date.now() - 5_000),
    };
    expect(isRefreshTokenValid(expiredTokens)).toBe(false);
  });

  it('deduplicates concurrent refresh calls and rotates stored tokens', async () => {
    storeSession(mockSession);

    const rotatedTokens: TokenView = {
      accessToken: 'rotated-access-2',
      refreshToken: 'rotated-refresh-2',
      accessExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      refreshExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };

    let callCount = 0;
    const mockRefresh = vi.fn(async () => {
      callCount += 1;
      // Simulate network latency
      await new Promise((resolve) => setTimeout(resolve, 20));
      return rotatedTokens;
    });

    vi.spyOn(referenceFlow, 'createReferenceApis').mockReturnValue({
      auth: {
        refreshApiV1AuthRefreshPost: mockRefresh,
      },
    } as unknown as ReturnType<typeof referenceFlow.createReferenceApis>);

    // Trigger two concurrent refresh calls
    const [result1, result2] = await Promise.all([
      refreshSessionTokens('http://localhost:8000', 'refresh-token-1'),
      refreshSessionTokens('http://localhost:8000', 'refresh-token-1'),
    ]);

    // Deduplication check: only 1 network call occurred
    expect(callCount).toBe(1);
    expect(result1.accessToken).toBe('rotated-access-2');
    expect(result2.accessToken).toBe('rotated-access-2');

    // Storage is updated with the rotated generation
    const updated = loadStoredSession();
    expect(updated?.tokens.accessToken).toBe('rotated-access-2');
    expect(updated?.tokens.refreshToken).toBe('rotated-refresh-2');
  });

  it('keeps concurrent refreshes from different token generations independent', async () => {
    let resolveFirst!: (tokens: TokenView) => void;
    let resolveSecond!: (tokens: TokenView) => void;
    const firstResult = new Promise<TokenView>((resolve) => {
      resolveFirst = resolve;
    });
    const secondResult = new Promise<TokenView>((resolve) => {
      resolveSecond = resolve;
    });
    const mockRefresh = vi
      .fn()
      .mockReturnValueOnce(firstResult)
      .mockReturnValueOnce(secondResult);

    vi.spyOn(referenceFlow, 'createReferenceApis').mockReturnValue({
      auth: {
        refreshApiV1AuthRefreshPost: mockRefresh,
      },
    } as unknown as ReturnType<typeof referenceFlow.createReferenceApis>);

    const first = refreshSessionTokens(
      'http://localhost:8000',
      'refresh-token-a',
    );
    const second = refreshSessionTokens(
      'http://localhost:8000',
      'refresh-token-b',
    );

    expect(mockRefresh).toHaveBeenCalledTimes(2);

    resolveSecond({
      ...secondTokens,
      accessToken: 'rotated-access-b',
      refreshToken: 'rotated-refresh-b',
    });
    resolveFirst({
      ...mockTokens,
      accessToken: 'rotated-access-a',
      refreshToken: 'rotated-refresh-a',
    });

    await expect(first).resolves.toMatchObject({
      accessToken: 'rotated-access-a',
    });
    await expect(second).resolves.toMatchObject({
      accessToken: 'rotated-access-b',
    });
  });

  it('does not let a late refresh overwrite a newer stored session', async () => {
    storeSession(mockSession);

    let resolveRefresh!: (tokens: TokenView) => void;
    const pendingRefresh = new Promise<TokenView>((resolve) => {
      resolveRefresh = resolve;
    });
    vi.spyOn(referenceFlow, 'createReferenceApis').mockReturnValue({
      auth: {
        refreshApiV1AuthRefreshPost: vi.fn().mockReturnValue(pendingRefresh),
      },
    } as unknown as ReturnType<typeof referenceFlow.createReferenceApis>);

    const refresh = refreshSessionTokens(
      'http://localhost:8000',
      mockTokens.refreshToken,
    );
    storeSession({ account: secondAccount, tokens: secondTokens });

    resolveRefresh({
      ...mockTokens,
      accessToken: 'late-access-a',
      refreshToken: 'late-refresh-a',
    });
    await refresh;

    const current = loadStoredSession();
    expect(current?.account.id).toBe(secondAccount.id);
    expect(current?.tokens.accessToken).toBe(secondTokens.accessToken);
    expect(current?.tokens.refreshToken).toBe(secondTokens.refreshToken);
  });

  it('does not let a stale refresh rejection clear a newer stored session', async () => {
    storeSession(mockSession);

    let rejectRefresh!: (error: unknown) => void;
    const pendingRefresh = new Promise<TokenView>((_resolve, reject) => {
      rejectRefresh = reject;
    });
    vi.spyOn(referenceFlow, 'createReferenceApis').mockReturnValue({
      auth: {
        refreshApiV1AuthRefreshPost: vi.fn().mockReturnValue(pendingRefresh),
      },
    } as unknown as ReturnType<typeof referenceFlow.createReferenceApis>);

    const refresh = refreshSessionTokens(
      'http://localhost:8000',
      mockTokens.refreshToken,
    );
    storeSession({ account: secondAccount, tokens: secondTokens });

    rejectRefresh({
      status: 401,
      json: async () => ({
        detail: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Session revoked or expired.',
        },
      }),
    });

    await expect(refresh).rejects.toMatchObject({ status: 401 });
    expect(loadStoredSession()).toMatchObject({
      account: secondAccount,
      tokens: secondTokens,
    });
  });

  it('clears stored session on 401 unauthenticated refresh response', async () => {
    storeSession(mockSession);

    vi.spyOn(referenceFlow, 'createReferenceApis').mockReturnValue({
      auth: {
        refreshApiV1AuthRefreshPost: vi.fn().mockRejectedValue({
          status: 401,
          json: async () => ({
            detail: {
              code: 'AUTHENTICATION_REQUIRED',
              message: 'Session revoked or expired.',
            },
          }),
        }),
      },
    } as unknown as ReturnType<typeof referenceFlow.createReferenceApis>);

    await expect(
      refreshSessionTokens('http://localhost:8000', 'refresh-token-1'),
    ).rejects.toMatchObject({ status: 401 });

    // Session is purged so next reload stays logged out
    expect(hasStoredSession()).toBe(false);
  });
});
