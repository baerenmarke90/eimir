// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Configuration } from './apiConfiguration';
import {
  clearFailureReference,
  lastFailureReference,
} from './failureReference';
import { clearStoredSession, storeSession } from './sessionPersistence';

const api = 'https://instance.example';
const json = (body: unknown, status: number, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

async function authenticated(transport: typeof fetch) {
  await storeSession({
    account: { id: 'alex', displayName: 'Alex' },
    tokens: {
      accessToken: 'access-a',
      refreshToken: 'refresh-a',
      accessExpiresAt: new Date(Date.now() + 900_000),
      refreshExpiresAt: new Date(Date.now() + 86_400_000),
    },
    spaceId: 'shared',
  });
  const configuration = new Configuration({
    basePath: api,
    headers: { Authorization: 'Bearer access-a' },
    fetchApi: transport,
  });
  if (!configuration.fetchApi) throw new Error('Expected a transport');
  return configuration.fetchApi;
}

beforeEach(async () => {
  clearFailureReference();
  await clearStoredSession();
});
afterEach(async () => {
  await clearStoredSession();
  vi.unstubAllGlobals();
});

describe('request failure recording in the shared API transport', () => {
  it('records_a_failing_request_with_template_code_and_request_id', async () => {
    const transport = vi.fn(async () =>
      json({ code: 'ATTACHMENT_TOO_LARGE' }, 413, { 'x-request-id': 'req-77' }),
    );
    const send = await authenticated(transport as unknown as typeof fetch);
    const response = await send(
      `${api}/api/v1/attachments/9f3e1c7a-0d6b-4f4e-8a39-0c5d4f2b7a11/content?x=1`,
      { method: 'PUT' },
    );
    // The caller still receives the response untouched, body included.
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      code: 'ATTACHMENT_TOO_LARGE',
    });
    expect(lastFailureReference()).toEqual({
      reference:
        'PUT:/api/v1/attachments/{id}/content:413:ATTACHMENT_TOO_LARGE:web',
      requestId: 'req-77',
    });
  });

  it('records_a_transport_failure_without_a_response', async () => {
    const transport = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const send = await authenticated(transport as unknown as typeof fetch);
    await expect(send(`${api}/api/v1/spaces/shared/memories`)).rejects.toThrow(
      TypeError,
    );
    expect(lastFailureReference()?.reference).toBe(
      'GET:/api/v1/spaces/shared/memories:network:web',
    );
  });

  it('leaves_a_public_client_without_a_session_transport', () => {
    // Failures before sign-in are not reportable; the public client keeps its
    // contract of carrying no stored credentials and no wrapper.
    expect(new Configuration({ basePath: api }).fetchApi).toBeUndefined();
  });

  it('does_not_record_successes_or_not_modified', async () => {
    const send = await authenticated((async () =>
      json({}, 200)) as unknown as typeof fetch);
    await send(`${api}/api/v1/spaces/shared/memories`);
    const conditional = await authenticated(
      (async () =>
        new Response(null, { status: 304 })) as unknown as typeof fetch,
    );
    await conditional(`${api}/api/v1/spaces/shared/memories`);
    expect(lastFailureReference()).toBeUndefined();
  });

  it('does_not_record_failures_of_the_support_report_endpoints', async () => {
    const send = await authenticated((async () =>
      json({ code: 'RATE_LIMITED' }, 429)) as unknown as typeof fetch);
    await send(`${api}/api/v1/support-reports`, { method: 'POST' });
    await send(
      `${api}/api/v1/support-reports/9f3e1c7a-0d6b-4f4e-8a39-0c5d4f2b7a11/reply`,
    );
    expect(lastFailureReference()).toBeUndefined();
  });

  it('does_not_record_the_support_endpoints_under_an_api_sub_path', async () => {
    const send = await authenticated((async () =>
      json({ code: 'RATE_LIMITED' }, 429)) as unknown as typeof fetch);
    await send(`${api}/eimir/api/v1/support-reports`, { method: 'POST' });
    expect(lastFailureReference()).toBeUndefined();
  });

  it('does_not_record_a_cancelled_request', async () => {
    const send = await authenticated((async () => {
      throw new DOMException('aborted', 'AbortError');
    }) as unknown as typeof fetch);
    await expect(
      send(`${api}/api/v1/spaces/shared/memories`),
    ).rejects.toThrow();
    expect(lastFailureReference()).toBeUndefined();
  });
});
