// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppearanceApi } from '../api/generated/apis/AppearanceApi';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { Configuration } from '../api/generated/runtime';
import {
  useWirDesign,
  WirDesignProvider,
  wirDesignQueryKey,
} from '../client/wirDesign';
import { clearWirDesignPreferences } from '../client/wirDesignPreferenceStore';
import { i18n } from '../i18n';
import { DesignPaletteSettings, WirDesignSettings } from './WirDesignSettings';

beforeEach(() => {
  clearWirDesignPreferences();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const t = (key: string) => i18n.t(`wirDesign.${key}`);
function fixture(
  options: {
    pro?: boolean;
    initial?: 'warm' | 'modern' | 'classic';
    failWrite?: number;
    failRead?: boolean;
    deferred?: () => Promise<Response>;
  } = {},
) {
  let selected = options.initial ?? 'warm';
  let palette: string | undefined;
  let version = 1;
  const writes: { value: string; token: string | null }[] = [];
  const paletteWrites: { value: string | null; token: string | null }[] = [];
  const transport = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/entitlements'))
        return new Response(
          JSON.stringify({
            capabilities: options.pro === false ? [] : ['theme.bespoke_packs'],
          }),
        );
      if (init?.method === 'PATCH') {
        const change = JSON.parse(String(init.body));
        const token = new Headers(init.headers).get('If-Match');
        if ('designId' in change)
          writes.push({ value: change.designId, token });
        if ('paletteId' in change)
          paletteWrites.push({ value: change.paletteId, token });
        if (options.deferred) return options.deferred();
        if (options.failWrite)
          return new Response(
            JSON.stringify({
              title: 'Synthetic outage',
              status: options.failWrite,
              code:
                options.failWrite === 409
                  ? 'RESOURCE_VERSION_CONFLICT'
                  : 'SERVICE_UNAVAILABLE',
            }),
            {
              status: options.failWrite,
              headers: { 'Content-Type': 'application/problem+json' },
            },
          );
        if ('designId' in change) selected = change.designId;
        if ('paletteId' in change) palette = change.paletteId ?? undefined;
        version++;
      } else if (options.failRead) return new Response(null, { status: 503 });
      return new Response(
        JSON.stringify({ designId: selected, paletteId: palette, version }),
        {
          headers: { ETag: `"appearance:${version}"` },
        },
      );
    },
  );
  const config = new Configuration({
    basePath: 'https://example.test/api/v1',
    fetchApi: transport,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <WirDesignProvider
        api={new AppearanceApi(config)}
        entitlementsApi={new EntitlementsApi(config)}
        instance="instance"
        accountId="owner"
        spaceId="space"
      >
        <MemoryRouter>{children}</MemoryRouter>
      </WirDesignProvider>
    </QueryClientProvider>
  );
  return {
    writes,
    paletteWrites,
    transport,
    client,
    wrapper,
    setReadFailure: (v: boolean) => {
      options.failRead = v;
    },
    setWriteFailure: (v: number) => {
      options.failWrite = v;
    },
  };
}
async function open() {
  await waitFor(() => expect(screen.queryByText(t('loading'))).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: new RegExp(t('title')) }));
  await waitFor(() => expect(screen.queryByText(t('proLoading'))).toBeNull());
}
it('saves and resets the palette independently of the layout', async () => {
  const f = fixture({ initial: 'modern' });
  render(<DesignPaletteSettings />, { wrapper: f.wrapper });
  const root = document.documentElement;
  await waitFor(() => expect(root.dataset.appPalette).toBe('modern'));

  fireEvent.click(
    screen.getByRole('button', {
      name: [t('palette.title'), t('palette.followDesign')].join(' '),
    }),
  );
  const sheet = within(
    screen.getByRole('dialog', { name: t('palette.choices') }),
  );
  expect(sheet.queryByRole('radio', { name: t('names.classic') })).toBeNull();
  fireEvent.click(sheet.getByRole('radio', { name: t('names.warm') }));
  expect(root.dataset.appPalette).toBe('modern');
  fireEvent.click(sheet.getByRole('button', { name: t('save') }));
  await sheet.findByText(t('palette.saved'));
  expect(root.dataset.appDesign).toBe('modern');
  expect(root.dataset.wirLayout).toBe('compact');
  expect(root.dataset.appPalette).toBe('warm');
  expect(f.writes).toEqual([]);
  expect(f.paletteWrites).toEqual([{ value: 'warm', token: '"appearance:1"' }]);

  fireEvent.click(
    sheet.getByRole('radio', { name: t('palette.followDesign') }),
  );
  fireEvent.click(sheet.getByRole('button', { name: t('save') }));
  await waitFor(() => expect(root.dataset.appPalette).toBe('modern'));
  expect(root.dataset.wirLayout).toBe('compact');
  expect(f.paletteWrites[1]).toEqual({ value: null, token: '"appearance:2"' });
});

it('previews without writing, cancels, and saves once only after server confirmation', async () => {
  const f = fixture();
  render(<WirDesignSettings />, { wrapper: f.wrapper });
  await open();
  fireEvent.click(
    screen.getByRole('radio', { name: new RegExp(t('names.shared_album')) }),
  );
  expect(f.writes).toHaveLength(0);
  // Model the browser's Back completion without relying on JSDOM traversal timing.
  const back = vi.spyOn(window.history, 'back').mockImplementation(() => {
    window.history.replaceState(null, '');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  fireEvent.click(screen.getByRole('button', { name: t('close') }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(back).toHaveBeenCalledOnce();
  back.mockRestore();
  expect(
    screen.getByText(t('names.warm'), {
      selector: '.wir-design-trigger strong',
    }),
  ).toBeTruthy();
  await open();
  fireEvent.click(
    screen.getByRole('radio', { name: new RegExp(t('names.shared_album')) }),
  );
  const save = screen.getByRole('button', { name: t('save') });
  fireEvent.click(save);
  fireEvent.click(save);
  await waitFor(() => expect(screen.getByText(t('saved'))).toBeTruthy());
  expect(f.writes).toEqual([
    { value: 'shared_album', token: '"appearance:1"' },
  ]);
});
it('keeps a saved paid choice after downgrade and permits the Free reset', async () => {
  const f = fixture({ pro: false, initial: 'classic' });
  render(<WirDesignSettings />, { wrapper: f.wrapper });
  await open();
  expect(
    (
      screen.getByRole('radio', {
        name: new RegExp(t('names.classic')),
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  fireEvent.click(
    screen.getByRole('radio', { name: new RegExp(t('names.modern')) }),
  );
  expect(screen.getByRole('button', { name: t('discover') })).toBeTruthy();
  expect(f.writes).toHaveLength(0);
  fireEvent.click(
    screen.getByRole('radio', { name: new RegExp(t('names.warm')) }),
  );
  fireEvent.click(screen.getByRole('button', { name: t('save') }));
  await waitFor(() => expect(f.writes[0]?.value).toBe('warm'));
});
it('retains a failed draft and retries the same explicit choice', async () => {
  const f = fixture({ failWrite: 503 });
  render(<WirDesignSettings />, { wrapper: f.wrapper });
  await open();
  fireEvent.click(
    screen.getByRole('radio', { name: new RegExp(t('names.modern')) }),
  );
  fireEvent.click(screen.getByRole('button', { name: t('save') }));
  await waitFor(() => expect(screen.getByText(t('error'))).toBeTruthy());
  expect(screen.queryByText(t('saved'))).toBeNull();
  f.setWriteFailure(0);
  fireEvent.click(screen.getByRole('button', { name: t('save') }));
  await waitFor(() => expect(screen.getByText(t('saved'))).toBeTruthy());
  expect(f.writes.map((w) => w.value)).toEqual(['modern', 'modern']);
});
it('requires a successful authoritative reload after a conflict and retains the draft', async () => {
  const f = fixture({ failWrite: 409 });
  render(<WirDesignSettings />, { wrapper: f.wrapper });
  await open();
  fireEvent.click(
    screen.getByRole('radio', { name: new RegExp(t('names.modern')) }),
  );
  fireEvent.click(screen.getByRole('button', { name: t('save') }));
  await waitFor(() => expect(screen.getByText(t('conflict'))).toBeTruthy());
  expect(
    (screen.getByRole('button', { name: t('save') }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: t('reload') }));
  await waitFor(() => expect(screen.queryByText(t('conflict'))).toBeNull());
  expect(
    (
      screen.getByRole('radio', {
        name: new RegExp(t('names.modern')),
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
});
it('blocks writes when preference read is unavailable', async () => {
  const f = fixture({ failRead: true });
  render(<WirDesignSettings />, { wrapper: f.wrapper });
  await open();
  fireEvent.click(
    screen.getByRole('radio', { name: new RegExp(t('names.modern')) }),
  );
  expect(
    (screen.getByRole('button', { name: t('save') }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(f.writes).toHaveLength(0);
});
it('rejects offline writes and keeps the current design', async () => {
  const f = fixture();
  const { result } = renderHook(useWirDesign, { wrapper: f.wrapper });
  await waitFor(() => expect(result.current?.preference.isSuccess).toBe(true));
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  await act(async () => {
    await expect(result.current?.save('modern')).rejects.toBeTruthy();
  });
  expect(f.writes).toHaveLength(0);
  expect(result.current?.current).toBe('warm');
});
it('cannot recreate a removed owner query from a late successful write', async () => {
  let finish!: (response: Response) => void;
  const f = fixture({
    deferred: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const { result } = renderHook(useWirDesign, { wrapper: f.wrapper });
  await waitFor(() => expect(result.current?.preference.isSuccess).toBe(true));
  let write!: Promise<unknown>;
  act(() => {
    const state = result.current;
    if (!state) throw new Error('Missing test provider');
    write = state.save('modern').catch(() => undefined);
  });
  await waitFor(() => expect(f.writes).toHaveLength(1));
  f.client.removeQueries({
    queryKey: wirDesignQueryKey('instance', 'owner', 'space'),
    exact: true,
  });
  await act(async () => {
    finish(
      new Response(JSON.stringify({ designId: 'modern', version: 2 }), {
        headers: { ETag: '"appearance:2"' },
      }),
    );
    await write;
  });
  expect(
    f.client.getQueryData(wirDesignQueryKey('instance', 'owner', 'space')),
  ).toBeUndefined();
});
