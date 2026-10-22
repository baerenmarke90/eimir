// @vitest-environment jsdom
import { signOutSession, SIGN_OUT_CLEANUP_TIMEOUT_MS } from './signOutSession';
import {
  clearStoredSession,
  loadStoredSession,
  refreshSessionTokens,
  storeSession,
  type StoredSession,
} from './sessionPersistence';

const native = vi.hoisted(() => ({ disable: vi.fn(async () => undefined) }));
vi.mock('@capacitor/core', () => ({
  registerPlugin: () => native,
  Capacitor: { getPlatform: () => 'web' },
}));
vi.mock('../pwa', () => ({ isCapacitorNative: () => true }));

const apiBaseUrl = 'https://instance.example';
const session: StoredSession = {
  account: { id: 'account-a', displayName: 'Alex' },
  tokens: {
    accessToken: 'access-a',
    refreshToken: 'refresh-a',
    accessExpiresAt: new Date('2099-01-01'),
    refreshExpiresAt: new Date('2099-02-01'),
  },
};
const endpointKey = `eimir-unifiedpush-endpoint-v1:${apiBaseUrl}:${session.account.id}`;

beforeEach(async () => {
  vi.clearAllMocks();
  window.localStorage.clear();
  await clearStoredSession();
  await storeSession(session);
  window.localStorage.setItem(endpointKey, 'endpoint-a');
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await clearStoredSession();
});

it.each([false, true])(
  'revokes Push and the session before local cleanup, including token rotation: %s',
  async (rotate) => {
    let finishRevoke: ((value: Response) => void) | undefined;
    const events: string[] = [];
    const transport = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        if (path === '/api/v1/push-endpoints/endpoint-a') {
          events.push('endpoint');
          expect(new Headers(init?.headers).get('Authorization')).toBe(
            'Bearer access-a',
          );
          return new Promise<Response>((resolve) => {
            finishRevoke = resolve;
          });
        }
        if (path === '/api/v1/auth/refresh') {
          return new Response(
            JSON.stringify({
              accessToken: 'access-rotated',
              refreshToken: 'refresh-rotated',
              accessExpiresAt: '2099-01-01T00:00:00Z',
              refreshExpiresAt: '2099-02-01T00:00:00Z',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        expect(path).toBe('/api/v1/auth/sign-out');
        expect(loadStoredSession()).not.toBeNull();
        expect(new Headers(init?.headers).get('Authorization')).toBe(
          rotate ? 'Bearer access-rotated' : 'Bearer access-a',
        );
        events.push('session');
        return new Response(null, { status: 204 });
      },
    );
    vi.stubGlobal('fetch', transport);
    const clear = vi.fn(() => {
      events.push('local');
      void clearStoredSession();
    });
    const signingOut = signOutSession(
      apiBaseUrl,
      session.tokens.accessToken,
      clear,
    );
    expect(native.disable).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(finishRevoke).toBeTypeOf('function'));
    expect(clear).not.toHaveBeenCalled();
    if (rotate)
      await refreshSessionTokens(apiBaseUrl, session.tokens.refreshToken);
    finishRevoke?.(new Response(null, { status: 204 }));
    await signingOut;
    expect(events).toEqual(['endpoint', 'session', 'local']);
    expect(loadStoredSession()).toBeNull();
    expect(window.localStorage.getItem(endpointKey)).toBeNull();
  },
);

it.each([false, true])(
  'preserves a replacement login while cleanup is pending, same Account: %s',
  async (sameAccount) => {
    let finishRevoke: ((value: Response) => void) | undefined;
    const transport = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finishRevoke = resolve;
        }),
    );
    vi.stubGlobal('fetch', transport);
    const clear = vi.fn(() => {
      void clearStoredSession();
    });
    const signingOut = signOutSession(
      apiBaseUrl,
      session.tokens.accessToken,
      clear,
    );
    await vi.waitFor(() => expect(finishRevoke).toBeTypeOf('function'));
    const replacement: StoredSession = {
      account: sameAccount
        ? session.account
        : { id: 'account-b', displayName: 'Sam' },
      tokens: {
        ...session.tokens,
        accessToken: 'access-new',
        refreshToken: 'refresh-new',
      },
    };
    await storeSession(replacement);
    finishRevoke?.(new Response(null, { status: 204 }));
    await signingOut;
    expect(transport).toHaveBeenCalledOnce();
    expect(clear).not.toHaveBeenCalled();
    expect(loadStoredSession()).toEqual({ ...replacement, spaceId: null });
  },
);

it('bounds an unreachable endpoint cleanup, aborts its transport and preserves the retry ID', async () => {
  vi.useFakeTimers();
  let requestSignal: AbortSignal | null | undefined;
  const transport = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    requestSignal = init?.signal;
    return new Promise<Response>((_resolve, reject) => {
      requestSignal?.addEventListener(
        'abort',
        () => reject(new DOMException('Aborted', 'AbortError')),
        { once: true },
      );
    });
  });
  vi.stubGlobal('fetch', transport);
  const clear = vi.fn(() => {
    void clearStoredSession();
  });
  const signingOut = signOutSession(
    apiBaseUrl,
    session.tokens.accessToken,
    clear,
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(transport).toHaveBeenCalledOnce();
  expect(clear).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(SIGN_OUT_CLEANUP_TIMEOUT_MS);
  await signingOut;
  expect(requestSignal?.aborted).toBe(true);
  expect(clear).toHaveBeenCalledOnce();
  expect(loadStoredSession()).toBeNull();
  expect(window.localStorage.getItem(endpointKey)).toBe('endpoint-a');
});

it('continues server sign-out after endpoint failure without losing the deferred cleanup ID', async () => {
  const transport = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes('/push-endpoints/'))
      throw new TypeError('Network unavailable');
    expect(String(input)).toBe(`${apiBaseUrl}/api/v1/auth/sign-out`);
    expect(loadStoredSession()).not.toBeNull();
    return new Response(null, { status: 204 });
  });
  vi.stubGlobal('fetch', transport);
  const clear = vi.fn(() => {
    void clearStoredSession();
  });
  await signOutSession(apiBaseUrl, session.tokens.accessToken, clear);
  expect(transport).toHaveBeenCalledTimes(2);
  expect(clear).toHaveBeenCalledOnce();
  expect(window.localStorage.getItem(endpointKey)).toBe('endpoint-a');
});

it('waits for encrypted local-session cleanup before completing document sign-out', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 204 })),
  );
  let finishLocalClear: (() => void) | undefined;
  let settled = false;
  const clear = vi.fn(() => {
    void clearStoredSession();
    return new Promise<void>((resolve) => {
      finishLocalClear = resolve;
    });
  });
  const signingOut = signOutSession(
    apiBaseUrl,
    session.tokens.accessToken,
    clear,
  ).then(() => {
    settled = true;
  });
  await vi.waitFor(() => expect(clear).toHaveBeenCalledOnce());
  expect(loadStoredSession()).toBeNull();
  expect(settled).toBe(false);
  finishLocalClear?.();
  await signingOut;
  expect(settled).toBe(true);
});
