// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppearanceApi } from '../api/generated/apis/AppearanceApi';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { Configuration } from '../api/generated/runtime';
import { useWirDesign, WirDesignProvider } from './wirDesign';
import {
  clearWirDesignPreferences,
  readWirDesign,
  rememberWirDesign,
  wirDesignStorageKey,
} from './wirDesignPreferenceStore';

const key = wirDesignStorageKey('https://example.test', 'account', 'space');
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function fixture() {
  let finish!: (response: Response) => void;
  const fetchApi = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  const configuration = new Configuration({
    basePath: 'https://example.test',
    fetchApi,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const api = new AppearanceApi(configuration);
  const entitlementsApi = new EntitlementsApi(configuration);
  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <WirDesignProvider
          api={api}
          entitlementsApi={entitlementsApi}
          instance="https://example.test"
          accountId="account"
          spaceId="space"
        >
          {children}
        </WirDesignProvider>
      </QueryClientProvider>
    );
  }
  return {
    wrapper,
    client,
    fetchApi,
    finish: (response: Response) => finish(response),
  };
}

it('holds the first composition until design is known and restores the confirmed choice on a cold mount', async () => {
  const first = fixture();
  const view = renderHook(useWirDesign, { wrapper: first.wrapper });
  expect(view.result.current?.presentationReady).toBe(false);
  await waitFor(() => expect(first.fetchApi).toHaveBeenCalledOnce());
  await act(async () =>
    first.finish(
      new Response(JSON.stringify({ designId: 'modern', version: 1 }), {
        headers: { ETag: '"appearance:1"' },
      }),
    ),
  );
  await waitFor(() => expect(readWirDesign(key)).toBe('modern'));
  expect(view.result.current?.presentationReady).toBe(true);
  view.unmount();
  first.client.clear();
  const next = fixture();
  const restored = renderHook(useWirDesign, { wrapper: next.wrapper });
  expect(restored.result.current?.current).toBe('modern');
  expect(restored.result.current?.presentationReady).toBe(true);
  expect(restored.result.current?.preference.isPlaceholderData).toBe(true);
  await expect(restored.result.current?.save('classic')).rejects.toBeTruthy();
  await waitFor(() => expect(next.fetchApi).toHaveBeenCalledOnce());
  await act(async () => next.finish(new Response(null, { status: 503 })));
  await waitFor(() =>
    expect(restored.result.current?.preference.isError).toBe(true),
  );
  expect(restored.result.current?.current).toBe('modern');
  restored.unmount();
  next.client.clear();
});

it('a denied read discards the remembered choice and cannot use it for writes', async () => {
  rememberWirDesign(key, 'classic');
  const f = fixture();
  const view = renderHook(useWirDesign, { wrapper: f.wrapper });
  await waitFor(() => expect(f.fetchApi).toHaveBeenCalledOnce());
  await act(async () => f.finish(new Response(null, { status: 403 })));
  await waitFor(() => expect(view.result.current?.current).toBe('warm'));
  expect(readWirDesign(key)).toBeUndefined();
  await expect(view.result.current?.save('classic')).rejects.toBeTruthy();
  view.unmount();
  f.client.clear();
});

it('isolates presentation by API/account/Space and clears it without touching unrelated storage', () => {
  rememberWirDesign(key, 'modern');
  for (const other of [
    wirDesignStorageKey('other', 'account', 'space'),
    wirDesignStorageKey('https://example.test', 'other', 'space'),
    wirDesignStorageKey('https://example.test', 'account', 'other'),
  ])
    expect(readWirDesign(other)).toBeUndefined();
  localStorage.setItem('unrelated', 'keep');
  clearWirDesignPreferences();
  expect(readWirDesign(key)).toBeUndefined();
  expect(localStorage.getItem('unrelated')).toBe('keep');
});

it.each([
  'broken',
  JSON.stringify({ schema: 1, designId: 'unknown', savedAt: Date.now() }),
  JSON.stringify({
    schema: 1,
    designId: 'modern',
    savedAt: Date.now() + 86_400_000,
  }),
  JSON.stringify({
    schema: 1,
    designId: 'modern',
    savedAt: Date.now() - 31 * 86_400_000,
  }),
])('ignores corrupt or expired metadata: %s', (raw) => {
  localStorage.setItem(key, raw);
  expect(readWirDesign(key)).toBeUndefined();
});
