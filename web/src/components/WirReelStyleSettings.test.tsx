// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AppearanceApi } from '../api/generated/apis/AppearanceApi';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import { ClientProblemError } from '../client/problemDetails';
import { proPaywallPath } from '../client/routes';
import { WirReelStyleProvider } from '../client/wirReelStyleContext';
import copy from '../i18n/locales/wirReelStyleSettings';
import { WirReelStyleSettings } from './WirReelStyleSettings';

function view(styleId: string, version: number) {
  return {
    raw: new Response(JSON.stringify({ styleId, version }), {
      status: 200,
      headers: { ETag: `"${version}"`, 'Content-Type': 'application/json' },
    }),
  };
}

function renderSettings(
  api: Record<string, unknown>,
  options: { pro?: boolean } = {},
) {
  const entitlements = {
    getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet: vi.fn(async () => ({
      capabilities: options.pro === false ? [] : ['theme.bespoke_packs'],
    })),
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <WirReelStyleProvider
        api={api as unknown as AppearanceApi}
        entitlementsApi={entitlements as unknown as EntitlementsApi}
        instance="https://api.example.test"
        accountId="account-1"
        spaceId="space-1"
      >
        <MemoryRouter>
          <Routes>
            <Route path="/" element={<WirReelStyleSettings />} />
            <Route path={proPaywallPath()} element={<p>paywall</p>} />
          </Routes>
        </MemoryRouter>
      </WirReelStyleProvider>
    </QueryClientProvider>,
  );
}

async function openSheet() {
  fireEvent.click(await screen.findByText(copy.change));
  await screen.findByRole('group', { name: copy.choices });
}

const named = (template: string, name: string) =>
  template.replace('{{name}}', name);

beforeEach(() => {
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
  localStorage.clear();
  vi.unstubAllGlobals();
});

it('waits for the read, then shows circles as free and tiles and chips as Pro', async () => {
  let answer: (value: ReturnType<typeof view>) => void = () => {};
  renderSettings({
    getWirReelStylePreferenceRaw: vi.fn(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    ),
  });
  expect(screen.queryByText(copy.title)).toBeNull();
  await waitFor(() => answer(view('circles', 0)));
  await screen.findByText(copy.title);
  await openSheet();
  const circles = screen.getByRole('radio', { name: /Kreise/ });
  expect(circles.closest('label')?.textContent).toContain(copy.free);
  for (const name of ['Kacheln', 'Chips'])
    expect(
      screen.getByRole('radio', { name: new RegExp(name) }).closest('label')
        ?.textContent,
    ).toContain(copy.pro);
});

it('saves tiles with Pro and says so', async () => {
  const update = vi.fn(async () => view('tiles', 1));
  renderSettings({
    getWirReelStylePreferenceRaw: vi.fn(async () => view('circles', 0)),
    updateWirReelStylePreferenceRaw: update,
  });
  await openSheet();
  fireEvent.click(screen.getByRole('radio', { name: /Kacheln/ }));
  const choose = await screen.findByRole('button', {
    name: named(copy.choose, copy.styles.tiles.name),
  });
  await waitFor(() => expect(choose).not.toHaveProperty('disabled', true));
  fireEvent.click(choose);
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith({
      spaceId: 'space-1',
      ifMatch: '"0"',
      wirReelStylePreferencePatch: { styleId: 'tiles' },
    }),
  );
  await screen.findByText(named(copy.saved, copy.styles.tiles.name));
});

it('notes a kept Pro style for a Free person', async () => {
  renderSettings(
    { getWirReelStylePreferenceRaw: vi.fn(async () => view('chips', 3)) },
    { pro: false },
  );
  await openSheet();
  fireEvent.click(screen.getByRole('button', { name: copy.close }));
  await screen.findByText(named(copy.kept, copy.styles.chips.name));
});

it('leads a Free person who picks a Pro style to the paywall', async () => {
  renderSettings(
    { getWirReelStylePreferenceRaw: vi.fn(async () => view('circles', 0)) },
    { pro: false },
  );
  await openSheet();
  fireEvent.click(screen.getByRole('radio', { name: /Chips/ }));
  await screen.findByText(named(copy.proHint, copy.styles.chips.name));
  fireEvent.click(screen.getByRole('button', { name: copy.discover }));
  await screen.findByText('paywall');
});

it('keeps the style and says so when offline', async () => {
  renderSettings({
    getWirReelStylePreferenceRaw: vi.fn(async () => view('circles', 0)),
    updateWirReelStylePreferenceRaw: vi.fn(async () => {
      throw new ClientProblemError('offline');
    }),
  });
  await openSheet();
  fireEvent.click(screen.getByRole('radio', { name: /Kacheln/ }));
  const choose = await screen.findByRole('button', {
    name: named(copy.choose, copy.styles.tiles.name),
  });
  await waitFor(() => expect(choose).not.toHaveProperty('disabled', true));
  fireEvent.click(choose);
  await screen.findByText(copy.offline);
  fireEvent.click(screen.getByRole('button', { name: copy.close }));
  expect(
    document.querySelector('.wir-reel-style-summary strong')?.textContent,
  ).toBe(copy.styles.circles.name);
});

it('says when the style changed on another device', async () => {
  renderSettings({
    getWirReelStylePreferenceRaw: vi.fn(async () => view('circles', 0)),
    updateWirReelStylePreferenceRaw: vi.fn(async () => {
      throw new ClientProblemError(
        'conflict',
        409,
        'RESOURCE_VERSION_CONFLICT',
      );
    }),
  });
  await openSheet();
  fireEvent.click(screen.getByRole('radio', { name: /Chips/ }));
  const choose = await screen.findByRole('button', {
    name: named(copy.choose, copy.styles.chips.name),
  });
  await waitFor(() => expect(choose).not.toHaveProperty('disabled', true));
  fireEvent.click(choose);
  await screen.findByText(copy.conflict);
});
