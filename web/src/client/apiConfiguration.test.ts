// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Configuration } from './apiConfiguration';
import {
  clearStoredSession,
  loadStoredSession,
  refreshSessionTokens,
  storeSession,
  subscribeSessionRefresh,
} from './sessionPersistence';

const api = 'https://instance.example';
const account = { id: 'alex', displayName: 'Alex' };
const tokens = () => ({
  accessToken: 'access-a',
  refreshToken: 'refresh-a',
  accessExpiresAt: new Date(Date.now() + 900_000),
  refreshExpiresAt: new Date(Date.now() + 86_400_000),
});
const rotated = () => ({
  ...tokens(),
  accessToken: 'access-b',
  refreshToken: 'refresh-b',
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function client(accessToken = 'access-a') {
  const configuration = new Configuration({
    basePath: api,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const transport = configuration.fetchApi;
  if (!transport) throw new Error('Expected a session-bound transport');
  return (
    init: RequestInit = {},
    url = `${api}/api/v1/spaces/shared/memories`,
  ) => transport(url, init);
}

beforeEach(async () => {
  await clearStoredSession();
  await storeSession({ account, tokens: tokens(), spaceId: 'shared' });
});
afterEach(async () => {
  await clearStoredSession();
  vi.unstubAllGlobals();
});

describe('session-bound API transport', () => {
  it('never replays a consumed refresh generation after its single-flight promise settles', async () => {
    const fetch = vi.fn(async () =>
      fetch.mock.calls.length === 1 ? json(rotated()) : json({}, 401),
    );
    vi.stubGlobal('fetch', fetch);
    const first = await refreshSessionTokens(api, 'refresh-a');
    // A queued focus/timer callback can still hold the previous render here.
    const resumed = await refreshSessionTokens(api, 'refresh-a');
    expect(resumed).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(loadStoredSession()?.tokens.accessToken).toBe('access-b');
  });

  it('updates existing clients and previous-render clients after rotation without a second refresh', async () => {
    const send = client();
    const fetch = vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith('/auth/refresh') ? json(rotated()) : json({}),
    );
    vi.stubGlobal('fetch', fetch);
    await refreshSessionTokens(api, 'refresh-a');
    await send();
    await client('access-a')();
    expect(fetch).toHaveBeenCalledTimes(3);
    for (const call of fetch.mock.calls.slice(1)) {
      expect(
        new Headers((call as unknown as [unknown, RequestInit])[1].headers).get(
          'Authorization',
        ),
      ).toBe('Bearer access-b');
    }
  });

  it('deduplicates expired-request refreshes and preserves the mutation body and conditional headers', async () => {
    await storeSession({
      account,
      tokens: { ...tokens(), accessExpiresAt: new Date(0) },
    });
    const response = deferred<Response>();
    const fetch = vi.fn((url: RequestInfo | URL) =>
      String(url).endsWith('/auth/refresh')
        ? response.promise
        : Promise.resolve(json({})),
    );
    vi.stubGlobal('fetch', fetch);
    const send = client();
    const init = {
      method: 'POST',
      body: '{"body":"draft"}',
      headers: { 'If-Match': '3', 'Idempotency-Key': 'one-save' },
    };
    const requests = [send(init), send(init), send(init)];
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    response.resolve(json(rotated()));
    await Promise.all(requests);
    expect(fetch).toHaveBeenCalledTimes(4);
    for (const call of fetch.mock.calls.slice(1)) {
      const request = (call as unknown as [unknown, RequestInit])[1];
      expect(request.body).toBe(init.body);
      expect(new Headers(request.headers).get('If-Match')).toBe('3');
      expect(new Headers(request.headers).get('Idempotency-Key')).toBe(
        'one-save',
      );
      expect(new Headers(request.headers).get('Authorization')).toBe(
        'Bearer access-b',
      );
    }
  });

  it('waits for an already-running proactive rotation even with unexpired access', async () => {
    const response = deferred<Response>();
    const fetch = vi.fn((url: RequestInfo | URL) =>
      String(url).endsWith('/auth/refresh')
        ? response.promise
        : Promise.resolve(json({})),
    );
    vi.stubGlobal('fetch', fetch);
    const send = client();
    const refresh = refreshSessionTokens(api, 'refresh-a');
    const request = send();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    response.resolve(json(rotated()));
    await Promise.all([refresh, request]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('recovers a late old-access 401 with the current generation without rotating again', async () => {
    const rejected = deferred<Response>();
    let calls = 0;
    const fetch = vi.fn((url: RequestInfo | URL) => {
      if (String(url).endsWith('/auth/refresh'))
        return Promise.resolve(json(rotated()));
      return ++calls === 1 ? rejected.promise : Promise.resolve(json({}));
    });
    vi.stubGlobal('fetch', fetch);
    const request = client()({ method: 'PATCH', body: 'same draft' });
    await vi.waitFor(() => expect(calls).toBe(1));
    await refreshSessionTokens(api, 'refresh-a');
    rejected.resolve(json({}, 401));
    expect((await request).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('tries authentication recovery at most once for a rejected request', async () => {
    const fetch = vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith('/auth/refresh') ? json(rotated()) : json({}, 401),
    );
    vi.stubGlobal('fetch', fetch);
    expect((await client()()).status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it.each([403, 409, 429, 500, 503])(
    'does not retry status %i',
    async (status) => {
      const fetch = vi.fn(async () => json({}, status));
      vi.stubGlobal('fetch', fetch);
      expect((await client()({ method: 'POST', body: 'draft' })).status).toBe(
        status,
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it('does not retry an uncertain network outcome', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Connection lost'));
    vi.stubGlobal('fetch', fetch);
    await expect(client()({ method: 'POST', body: 'draft' })).rejects.toThrow(
      'Connection lost',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('clears a definitively rejected refresh without resubmitting the operation', async () => {
    const fetch = vi.fn(async () => json({}, 401));
    vi.stubGlobal('fetch', fetch);
    await expect(
      client()({ method: 'POST', body: 'draft' }),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(loadStoredSession()).toBeNull();
  });

  it.each(['logout', 'same-account-login', 'account-switch'])(
    'does not move pending work into %s',
    async (replacement) => {
      const response = deferred<Response>();
      const fetch = vi.fn(() => response.promise);
      vi.stubGlobal('fetch', fetch);
      const request = client()();
      const rejected = expect(request).rejects.toMatchObject({ status: 401 });
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      if (replacement === 'logout') await clearStoredSession();
      else
        await storeSession({
          account:
            replacement === 'account-switch'
              ? { id: 'sam', displayName: 'Sam' }
              : account,
          tokens: rotated(),
        });
      response.resolve(json({}, 401));
      await rejected;
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(loadStoredSession()?.tokens.refreshToken ?? null).toBe(
        replacement === 'logout' ? null : 'refresh-b',
      );
    },
  );

  it('does not send a cancelled mutation after waiting for refresh', async () => {
    const response = deferred<Response>();
    const fetch = vi.fn(() => response.promise);
    vi.stubGlobal('fetch', fetch);
    const send = client();
    const refresh = refreshSessionTokens(api, 'refresh-a');
    const abort = new AbortController();
    const request = send({ method: 'POST', signal: abort.signal });
    const rejected = expect(request).rejects.toMatchObject({
      name: 'AbortError',
    });
    abort.abort();
    response.resolve(json(rotated()));
    await Promise.all([refresh, rejected]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not send credentials to another origin', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(
      client()({}, 'https://foreign.example/api/v1/memories'),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not attach stored credentials to a public client', () => {
    expect(new Configuration({ basePath: api }).fetchApi).toBeUndefined();
  });

  it('keeps rotated tokens when a previous render updates Space metadata and publishes the rotation once', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSessionRefresh(listener);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(rotated())),
    );
    try {
      await refreshSessionTokens(api, 'refresh-a');
      await storeSession({
        account,
        tokens: tokens(),
        spaceId: 'other-shared',
      });
      expect(loadStoredSession()).toMatchObject({
        spaceId: 'other-shared',
        tokens: { refreshToken: 'refresh-b' },
      });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ refreshToken: 'refresh-b' }),
        'refresh-a',
      );
    } finally {
      unsubscribe();
    }
  });
});
