import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as native from './nativeSessionStorage';
import * as reference from './referenceFlow';
import {
  SESSION_STORAGE_KEY,
  clearStoredSession,
  loadStoredSession,
  refreshSessionTokens,
  restoreNativeSession,
  storeSession,
} from './sessionPersistence';

vi.mock('./nativeSessionStorage', () => ({
  isNativeSessionStorageAvailable: vi.fn(),
  readNativeSessionSnapshot: vi.fn(),
  writeNativeSessionSnapshot: vi.fn(),
}));

const memory = new Map<string, string>();
let encrypted: string | null = null;
const originalWindow = globalThis.window;
const session = {
  account: { id: 'account-a', displayName: 'Alex' },
  tokens: {
    accessToken: 'expired-access',
    refreshToken: 'current-refresh',
    accessExpiresAt: new Date(Date.now() - 60_000),
    refreshExpiresAt: new Date(Date.now() + 86_400_000),
  },
  spaceId: 'space-a',
};

beforeEach(async () => {
  await clearStoredSession();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  encrypted = null;
  memory.clear();
  vi.stubGlobal('window', {
    sessionStorage: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    },
    localStorage: {
      setItem: vi.fn(() => {
        throw new Error('No plaintext persistence');
      }),
    },
  });
  vi.mocked(native.isNativeSessionStorageAvailable).mockReturnValue(true);
  vi.mocked(native.readNativeSessionSnapshot).mockImplementation(
    async () => encrypted,
  );
  vi.mocked(native.writeNativeSessionSnapshot).mockImplementation(
    async (value) => {
      encrypted = value;
    },
  );
});

afterEach(async () => {
  await clearStoredSession();
  vi.stubGlobal('window', originalWindow);
});

describe('native session retention', () => {
  it('restores an expired access token with a valid refresh credential after a cold WebView restart', async () => {
    await storeSession(session);
    memory.clear();
    expect(loadStoredSession()).toBeNull();
    await restoreNativeSession();
    expect(loadStoredSession()?.tokens.refreshToken).toBe('current-refresh');
    expect(loadStoredSession()?.spaceId).toBe('space-a');
    expect(window.localStorage.setItem).not.toHaveBeenCalled();
  });

  it('removes durable credentials on logout so a later launch stays signed out', async () => {
    await storeSession(session);
    await clearStoredSession();
    memory.clear();
    await restoreNativeSession();
    expect(loadStoredSession()).toBeNull();
    expect(encrypted).toBeNull();
  });

  it.each([
    '{malformed',
    JSON.stringify({
      ...session,
      tokens: { ...session.tokens, refreshExpiresAt: '2000-01-01' },
    }),
  ])(
    'rejects and clears malformed or expired durable snapshots',
    async (raw) => {
      encrypted = raw;
      await restoreNativeSession();
      expect(loadStoredSession()).toBeNull();
      expect(encrypted).toBeNull();
    },
  );

  it('does not replace a new login with an older native read that finishes late', async () => {
    let finish: ((value: string) => void) | undefined;
    vi.mocked(native.readNativeSessionSnapshot).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const restoring = restoreNativeSession();
    await vi.waitFor(() => expect(finish).toBeDefined());
    await storeSession({
      ...session,
      account: { id: 'account-b', displayName: 'Sam' },
    });
    finish?.(JSON.stringify(session));
    await restoring;
    expect(loadStoredSession()?.account.id).toBe('account-b');
  });

  it('serializes writes and logout, preventing a delayed write from restoring credentials', async () => {
    let finish: (() => void) | undefined;
    vi.mocked(native.writeNativeSessionSnapshot).mockImplementationOnce(
      (value) =>
        new Promise((resolve) => {
          finish = () => {
            encrypted = value;
            resolve();
          };
        }),
    );
    const writing = storeSession(session);
    await vi.waitFor(() => expect(finish).toBeDefined());
    const clearing = clearStoredSession();
    finish?.();
    await Promise.all([writing, clearing]);
    expect(encrypted).toBeNull();
    expect(loadStoredSession()).toBeNull();
  });

  it('persists a rotated token before returning refresh and restores that generation after restart', async () => {
    await storeSession(session);
    const rotated = {
      ...session.tokens,
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    };
    vi.spyOn(reference, 'createReferenceApis').mockReturnValue({
      auth: {
        refreshApiV1AuthRefreshPost: vi.fn().mockResolvedValue(rotated),
      },
    } as unknown as ReturnType<typeof reference.createReferenceApis>);
    await refreshSessionTokens(
      'https://instance.example',
      session.tokens.refreshToken,
    );
    expect(encrypted).toContain('new-refresh');
    memory.clear();
    await restoreNativeSession();
    expect(loadStoredSession()?.tokens.refreshToken).toBe('new-refresh');
  });

  it('keeps Web sessions tab-scoped and never reads or writes native credentials', async () => {
    vi.mocked(native.isNativeSessionStorageAvailable).mockReturnValue(false);
    await storeSession(session);
    await restoreNativeSession();
    expect(memory.has(SESSION_STORAGE_KEY)).toBe(true);
    expect(native.readNativeSessionSnapshot).not.toHaveBeenCalled();
    expect(native.writeNativeSessionSnapshot).not.toHaveBeenCalled();
  });

  it.each([401, 403])(
    'clears durable credentials before returning a definitive %s refresh rejection',
    async (status) => {
      await storeSession(session);
      vi.spyOn(reference, 'createReferenceApis').mockReturnValue({
        auth: {
          refreshApiV1AuthRefreshPost: vi.fn().mockRejectedValue({ status }),
        },
      } as unknown as ReturnType<typeof reference.createReferenceApis>);
      await expect(
        refreshSessionTokens(
          'https://instance.example',
          session.tokens.refreshToken,
        ),
      ).rejects.toMatchObject({ status });
      expect(encrypted).toBeNull();
      expect(loadStoredSession()).toBeNull();
    },
  );

  it('clears an obsolete durable generation after a storage write failure without plaintext fallback', async () => {
    encrypted = 'obsolete-generation';
    vi.mocked(native.writeNativeSessionSnapshot).mockRejectedValueOnce(
      new Error('Storage unavailable'),
    );
    await storeSession(session);
    expect(encrypted).toBeNull();
    expect(loadStoredSession()?.account.id).toBe('account-a');
    expect(window.localStorage.setItem).not.toHaveBeenCalled();
  });
});
