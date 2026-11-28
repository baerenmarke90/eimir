// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AppearanceApi } from '../api/generated/apis/AppearanceApi';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { Configuration } from '../api/generated/runtime';
import { rememberWirReelStyle, wirReelStyleStorageKey } from './wirReelStyle';
import {
  useWirReelStyle,
  useWirReelStyleId,
  WirReelStyleProvider,
} from './wirReelStyleContext';

const INSTANCE = 'https://example.test';
const STYLE_PATH = '/api/v1/spaces/space/appearance/wir-reels';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

type Route = (request: {
  method: string;
  url: string;
  init?: RequestInit;
}) => Response | Promise<Response> | undefined;

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...init.headers },
    ...init,
  });
}

interface ReaderState {
  full?: ReturnType<typeof useWirReelStyle>;
  id?: ReturnType<typeof useWirReelStyleId>;
}

function Reader({ state }: { state: ReaderState }) {
  state.full = useWirReelStyle();
  state.id = useWirReelStyleId();
  return null;
}

function setup(route: Route, capabilities: string[] = []) {
  const calls: { method: string; url: string; init?: RequestInit }[] = [];
  const fetchApi = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ method, url, init });
      if (url.endsWith('/api/v1/spaces/space/entitlements'))
        return json({
          tier: capabilities.length ? 'PREMIUM' : 'FREE',
          capabilities,
        });
      const answer = await route({ method, url, init });
      return answer ?? new Promise<Response>(() => {});
    },
  );
  const configuration = new Configuration({ basePath: INSTANCE, fetchApi });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const state: ReaderState = {};
  const api = new AppearanceApi(configuration);
  const entitlementsApi = new EntitlementsApi(configuration);
  render(
    <QueryClientProvider client={client}>
      <WirReelStyleProvider
        api={api}
        entitlementsApi={entitlementsApi}
        instance={INSTANCE}
        accountId="account"
        spaceId="space"
      >
        <Reader state={state} />
      </WirReelStyleProvider>
    </QueryClientProvider>,
  );
  return { state, calls, invalidate, client };
}

const styleView = (styleId: string, version = 1, etag = '"t1"') =>
  json({ styleId, version }, { headers: { ETag: etag } });

it('is pending without a remembered style until the read returns', async () => {
  let answer: (value: Response) => void = () => {};
  const { state, calls } = setup(({ url }) =>
    url.endsWith(STYLE_PATH)
      ? new Promise<Response>((resolve) => {
          answer = resolve;
        })
      : undefined,
  );
  expect(state.id).toEqual({ style: 'circles', pending: true });
  await waitFor(() => expect(calls).toHaveLength(1));
  await act(async () => answer(styleView('tiles')));
  await waitFor(() =>
    expect(state.id).toEqual({ style: 'tiles', pending: false }),
  );
});

it('renders a remembered style at once', () => {
  rememberWirReelStyle(
    wirReelStyleStorageKey(INSTANCE, 'account', 'space'),
    'chips',
  );
  const { state } = setup(() => undefined);
  expect(state.id).toEqual({ style: 'chips', pending: false });
});

it('resolves an unknown style to circles and keeps the setting usable', async () => {
  rememberWirReelStyle(
    wirReelStyleStorageKey(INSTANCE, 'account', 'space'),
    'tiles',
  );
  const { state } = setup(({ url }) =>
    url.endsWith(STYLE_PATH) ? styleView('stripes', 4, '"t4"') : undefined,
  );
  await waitFor(() => expect(state.full?.ready).toBe(true));
  expect(state.id).toEqual({ style: 'circles', pending: false });
});

it('reads the style again after a conflict, so the next save can succeed', async () => {
  const { state, invalidate } = setup(
    ({ method, url }) =>
      url.endsWith(STYLE_PATH)
        ? method === 'PATCH'
          ? json(
              {
                type: 'about:blank',
                detail: 'Changed.',
                code: 'RESOURCE_VERSION_CONFLICT',
                status: 409,
                title: 'Conflict',
              },
              {
                status: 409,
                headers: { 'Content-Type': 'application/problem+json' },
              },
            )
          : styleView('circles')
        : undefined,
    ['theme.bespoke_packs'],
  );
  await waitFor(() => expect(state.full?.ready).toBe(true));
  await act(async () => {
    await state.full?.save('tiles').catch(() => undefined);
  });
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ['wir-reel-style', INSTANCE, 'account', 'space'],
    exact: true,
  });
});

it('stays shown while it reads again, so the settings do not jump', async () => {
  const { state, client } = setup(({ url }) =>
    url.endsWith(STYLE_PATH) ? styleView('chips') : undefined,
  );
  await waitFor(() => expect(state.full?.shown).toBe(true));
  await act(async () => {
    void client.invalidateQueries({ queryKey: ['wir-reel-style'] });
  });
  expect(state.full?.shown).toBe(true);
});

it('keeps a saved Pro style after Pro ends', async () => {
  const { state } = setup(
    ({ url }) => (url.endsWith(STYLE_PATH) ? styleView('tiles') : undefined),
    [],
  );
  await waitFor(() => expect(state.full?.ready).toBe(true));
  act(() => state.full?.inspectCapability());
  await waitFor(() => expect(state.full?.capability.data).toBe(false));
  expect(state.id).toEqual({ style: 'tiles', pending: false });
});

it('saves with If-Match and refreshes the other appearance tokens', async () => {
  const { state, calls, invalidate } = setup(
    ({ method, url }) =>
      url.endsWith(STYLE_PATH)
        ? method === 'PATCH'
          ? styleView('chips', 2, '"t2"')
          : styleView('circles', 1, '"t1"')
        : undefined,
    ['theme.bespoke_packs'],
  );
  await waitFor(() => expect(state.full?.ready).toBe(true));
  await act(async () => {
    await state.full?.save('chips');
  });
  const patch = calls.find((call) => call.method === 'PATCH');
  expect(new Headers(patch?.init?.headers).get('If-Match')).toBe('"t1"');
  expect(JSON.parse(String(patch?.init?.body))).toEqual({ styleId: 'chips' });
  await waitFor(() =>
    expect(state.id).toEqual({ style: 'chips', pending: false }),
  );
  for (const sibling of [
    'app-icon',
    'wir-design',
    'person-colours',
    'memory-world',
  ])
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [sibling] });
});

it('withdraws the Pro capability when the server refuses a Pro style', async () => {
  const { state, client } = setup(
    ({ method, url }) =>
      url.endsWith(STYLE_PATH)
        ? method === 'PATCH'
          ? json(
              {
                type: 'about:blank',
                detail: 'Pro required.',
                code: 'PREMIUM_ENTITLEMENT_REQUIRED',
                status: 403,
                title: 'Pro',
              },
              {
                status: 403,
                headers: { 'Content-Type': 'application/problem+json' },
              },
            )
          : styleView('circles')
        : undefined,
    ['theme.bespoke_packs'],
  );
  await waitFor(() => expect(state.full?.ready).toBe(true));
  act(() => state.full?.inspectCapability());
  await waitFor(() => expect(state.full?.capability.data).toBe(true));
  await act(async () => {
    await state.full?.save('tiles').catch(() => undefined);
  });
  await waitFor(() => expect(state.full?.capability.data).toBe(false));
  expect(state.id?.style).toBe('circles');
  client.clear();
});
