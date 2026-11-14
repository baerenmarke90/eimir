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
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppearanceApi } from '../api/generated/apis/AppearanceApi';
import { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { WirDesignId } from '../api/generated/models/WirDesignId';
import { Configuration } from '../api/generated/runtime';
import { EDITOR_HISTORY_STATE_KEY } from '../client/useEditorHistoryEntry';
import {
  useWirDesign,
  WirDesignProvider,
  wirDesignQueryKey,
} from '../client/wirDesign';
import { clearWirDesignPreferences } from '../client/wirDesignPreferenceStore';
import { i18n } from '../i18n';
import { WirDesignSettings } from './WirDesignSettings';

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
const preferenceTimeout = { timeout: 5_000 };
function fixture(
  options: {
    pro?: boolean;
    initial?: WirDesignId;
    failWrite?: number;
    failRead?: boolean;
    deferred?: () => Promise<Response>;
  } = {},
) {
  let selected = options.initial ?? 'warm';
  let version = 1;
  const writes: { value: string; token: string | null }[] = [];
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
        writes.push({
          value: JSON.parse(String(init.body)).designId,
          token: new Headers(init.headers).get('If-Match'),
        });
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
        selected = JSON.parse(String(init.body)).designId;
        version++;
      } else if (options.failRead) return new Response(null, { status: 503 });
      return new Response(JSON.stringify({ designId: selected, version }), {
        headers: { ETag: `"appearance:${version}"` },
      });
    },
  );
  const config = new Configuration({
    basePath: 'https://example.test/api/v1',
    fetchApi: transport,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({
    children,
    owner = 'owner',
  }: {
    children: ReactNode;
    owner?: string;
  }) {
    return (
      <QueryClientProvider client={client}>
        <WirDesignProvider
          key={owner}
          api={new AppearanceApi(config)}
          entitlementsApi={new EntitlementsApi(config)}
          instance="instance"
          accountId={owner}
          spaceId="space"
        >
          <MemoryRouter>{children}</MemoryRouter>
        </WirDesignProvider>
      </QueryClientProvider>
    );
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Wrapper>{children}</Wrapper>
  );
  return {
    writes,
    transport,
    client,
    wrapper,
    Wrapper,
    setReadFailure: (v: boolean) => {
      options.failRead = v;
    },
    setWriteFailure: (v: number) => {
      options.failWrite = v;
    },
  };
}
async function open() {
  await waitFor(
    () => expect(screen.queryByText(t('loading'))).toBeNull(),
    preferenceTimeout,
  );
  fireEvent.click(screen.getByRole('button', { name: t('change') }));
  await waitFor(
    () => expect(screen.queryByText(t('proLoading'))).toBeNull(),
    preferenceTimeout,
  );
}
it.each(['shared_album', 'quiet_together'] as const)(
  'previews %s without writing, cancels, and saves once only after confirmation',
  async (designId) => {
    const f = fixture();
    render(<WirDesignSettings />, { wrapper: f.wrapper });
    await screen.findByText(
      t('names.warm'),
      { selector: '.wir-design-summary strong' },
      preferenceTimeout,
    );
    await open();
    fireEvent.click(
      screen.getByRole('radio', { name: new RegExp(t(`names.${designId}`)) }),
    );
    expect(f.writes).toHaveLength(0);
    // Model the browser's Back completion without relying on JSDOM traversal timing.
    await waitFor(
      () =>
        expect(window.history.state?.[EDITOR_HISTORY_STATE_KEY]).toEqual(
          expect.any(String),
        ),
      preferenceTimeout,
    );
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {
      const state = { ...window.history.state };
      delete state[EDITOR_HISTORY_STATE_KEY];
      window.history.replaceState(state, '');
      window.dispatchEvent(new PopStateEvent('popstate', { state }));
    });
    try {
      fireEvent.click(screen.getByRole('button', { name: t('close') }));
      await waitFor(
        () => expect(screen.queryByRole('dialog')).toBeNull(),
        preferenceTimeout,
      );
      expect(back).toHaveBeenCalledOnce();
    } finally {
      back.mockRestore();
    }
    expect(
      screen.getByText(t('names.warm'), {
        selector: '.wir-design-summary strong',
      }),
    ).toBeTruthy();
    await open();
    fireEvent.click(
      screen.getByRole('radio', { name: new RegExp(t(`names.${designId}`)) }),
    );
    const save = screen.getByRole('button', { name: t('save') });
    fireEvent.click(save);
    fireEvent.click(save);
    await screen.findByText(t('saved'), undefined, preferenceTimeout);
    expect(f.writes).toEqual([{ value: designId, token: '"appearance:1"' }]);
  },
  15_000,
);
it('keeps a saved paid choice after downgrade and permits the Free reset', async () => {
  const f = fixture({ pro: false, initial: 'quiet_together' });
  render(<WirDesignSettings />, { wrapper: f.wrapper });
  await open();
  expect(
    (
      screen.getByRole('radio', {
        name: new RegExp(t('names.quiet_together')),
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
it('offers a Pro path instead of writing when Free selects Zu zweit', async () => {
  const f = fixture({ pro: false });
  render(<WirDesignSettings />, { wrapper: f.wrapper });
  await open();
  fireEvent.click(
    screen.getByRole('radio', { name: new RegExp(t('names.quiet_together')) }),
  );
  expect(screen.getByRole('button', { name: t('discover') })).toBeTruthy();
  expect(screen.queryByRole('button', { name: t('save') })).toBeNull();
  expect(f.writes).toHaveLength(0);
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
