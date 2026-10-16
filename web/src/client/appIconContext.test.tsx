// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AppearanceApi } from '../api/generated/apis/AppearanceApi';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { AppIconPreferenceView } from '../api/generated/models/AppIconPreferenceView';
import { AppIconProvider, useAppIcon } from './appIconContext';
import { appIconQueryKey } from './appIcon';
import { applyResolvedTheme } from '../theme';

function response(iconId: AppIconPreferenceView['iconId'], version = 0) {
  return {
    raw: new Response(null, { headers: { ETag: `"icon:${version}"` } }),
    value: async () => ({ iconId, version }),
  };
}

function fixture() {
  const read = vi.fn().mockResolvedValue(response('original'));
  const write = vi.fn().mockResolvedValue(response('sage', 1));
  const grants = vi
    .fn()
    .mockResolvedValue({ capabilities: ['theme.bespoke_packs'] });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const api = {
    getAppIconPreferenceRaw: read,
    updateAppIconPreferenceRaw: write,
  } as unknown as AppearanceApi;
  const entitlementsApi = {
    getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet: grants,
  } as unknown as EntitlementsApi;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <AppIconProvider
        api={api}
        entitlementsApi={entitlementsApi}
        instance="instance"
        accountId="account"
        spaceId="space"
      >
        {children}
      </AppIconProvider>
    </QueryClientProvider>
  );
  return { read, write, grants, client, wrapper };
}

beforeEach(() => {
  document.head.innerHTML =
    '<link id="app-favicon" rel="icon" href="/identity/app-icon-light.png">';
  document.documentElement.dataset.theme = 'light';
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('loads personal preference while keeping capability work lazy until selection opens', async () => {
  const { wrapper, grants } = fixture();
  const { result } = renderHook(useAppIcon, { wrapper });
  await waitFor(() => expect(result.current?.preference.isSuccess).toBe(true));
  expect(grants).not.toHaveBeenCalled();
  act(() => result.current?.inspectCapability());
  await waitFor(() => expect(result.current?.capability.data).toBe(true));
  expect(grants).toHaveBeenCalledTimes(1);
});

it('keeps a fixed saved icon across theme changes and restores adaptive Original on teardown', async () => {
  const { wrapper, read } = fixture();
  read.mockResolvedValue(response('sage', 2));
  const { result, unmount } = renderHook(useAppIcon, { wrapper });
  await waitFor(() => expect(result.current?.preference.isSuccess).toBe(true));
  expect(document.getElementById('app-favicon')?.getAttribute('href')).toBe(
    '/identity/app-icons/v1/sage.png',
  );
  applyResolvedTheme('dark');
  expect(document.getElementById('app-favicon')?.getAttribute('href')).toBe(
    '/identity/app-icons/v1/sage.png',
  );
  unmount();
  expect(document.getElementById('app-favicon')?.getAttribute('href')).toBe(
    '/identity/app-icon-dark.png',
  );
});

it('requires the last strong ETag and ignores a late write after its query ownership is cleared', async () => {
  const { wrapper, write, client } = fixture();
  let complete!: (value: ReturnType<typeof response>) => void;
  write.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const { result } = renderHook(useAppIcon, { wrapper });
  await waitFor(() => expect(result.current?.preference.isSuccess).toBe(true));
  let pending!: Promise<unknown>;
  act(() => {
    if (!result.current) throw new Error('App-icon provider is missing.');
    pending = result.current.save('sage');
  });
  const rejected = pending.catch((error: unknown) => error);
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
  expect(write.mock.calls[0][0]).toMatchObject({
    spaceId: 'space',
    ifMatch: '"icon:0"',
    appIconPreferencePatch: { iconId: 'sage' },
  });
  act(() =>
    client.removeQueries({
      queryKey: appIconQueryKey('instance', 'account', 'space'),
      exact: true,
    }),
  );
  await act(async () => {
    complete(response('sage', 1));
    await rejected;
  });
  expect(
    client.getQueryData(appIconQueryKey('instance', 'account', 'space')),
  ).toBeUndefined();
  expect(document.getElementById('app-favicon')?.getAttribute('href')).toBe(
    '/identity/app-icon-light.png',
  );
});

it('aborts a pending write on owner teardown and does not apply its late result', async () => {
  const { wrapper, write } = fixture();
  let complete!: (value: ReturnType<typeof response>) => void;
  write.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const { result, unmount } = renderHook(useAppIcon, { wrapper });
  await waitFor(() => expect(result.current?.preference.isSuccess).toBe(true));
  let pending!: Promise<unknown>;
  act(() => {
    if (!result.current) throw new Error('App-icon provider is missing.');
    pending = result.current.save('sage');
  });
  const rejected = pending.catch((error: unknown) => error);
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
  const signal = write.mock.calls[0][1].signal as AbortSignal;
  unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => {
    complete(response('sage', 1));
    await rejected;
  });
  expect(document.getElementById('app-favicon')?.getAttribute('href')).toBe(
    '/identity/app-icon-light.png',
  );
});
