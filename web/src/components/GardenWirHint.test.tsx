// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardModulePreferenceList } from '../api/generated/models/DashboardModulePreferenceList';
import { dashboardPreferencesQueryKey } from '../client/dashboardPreferences';
import {
  quietHintKey,
  quietHintRetired,
  resetQuietHintsForTests,
} from '../client/quietHints';
import games from '../i18n/locales/games';
import {
  GARDEN_WIR_HINT_ACTIVE_MS,
  GARDEN_WIR_HINT_ID,
  GARDEN_WIR_HINT_SETTLE_MS,
  GardenWirHint,
  type GardenWirHintServices,
} from './GardenWirHint';

const ME = 'me';
const SPACE = 'space';
const copy = games.garden.wirHint;

function services({
  capabilities = ['games.couple'],
  preferences = { items: [] } as DashboardModulePreferenceList,
  showOnWir,
}: {
  capabilities?: string[];
  preferences?: DashboardModulePreferenceList;
  showOnWir?: GardenWirHintServices['showOnWir'];
} = {}) {
  return {
    loadEntitlement: vi.fn(async () => ({
      spaceId: SPACE,
      tier: capabilities.length ? 'PREMIUM' : 'FREE',
      status: 'ACTIVE',
      capabilities,
    })),
    loadPreferences: vi.fn(async () => preferences),
    showOnWir: vi.fn(
      showOnWir ??
        (async () => ({ moduleKey: 'shared_garden', visible: true })),
    ),
  } as unknown as GardenWirHintServices & {
    loadPreferences: ReturnType<typeof vi.fn>;
    showOnWir: ReturnType<typeof vi.fn>;
  };
}

function setup(api: GardenWirHintServices, moment = 0, quiet = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const element = (nextMoment: number, nextQuiet: boolean): ReactElement => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <p>
          <button type="button">garden</button>
        </p>
        <GardenWirHint
          apiBaseUrl="http://api.example.test"
          accessToken="token"
          accountId={ME}
          spaceId={SPACE}
          moment={nextMoment}
          quiet={nextQuiet}
          services={api}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(element(moment, quiet));
  return {
    client,
    ...view,
    update: (nextMoment: number, nextQuiet = false) =>
      view.rerender(element(nextMoment, nextQuiet)),
  };
}

const offer = () => screen.queryByText(copy.text, { selector: 'aside p' });

beforeEach(() => {
  localStorage.clear();
  resetQuietHintsForTests();
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('GardenWirHint', () => {
  it('waits for a garden moment, then offers once without taking focus', async () => {
    const api = services();
    const { update } = setup(api);
    await waitFor(() => expect(api.loadPreferences).toHaveBeenCalled());
    expect(offer()).toBeNull();

    // Not while something else runs.
    update(1, true);
    await new Promise((resolve) =>
      setTimeout(resolve, GARDEN_WIR_HINT_SETTLE_MS + 100),
    );
    expect(offer()).toBeNull();

    update(1, false);
    await waitFor(() => expect(offer()).not.toBeNull(), { timeout: 3_000 });
    expect(screen.getByRole('status').textContent).toBe(copy.text);
    expect(screen.getByRole('button', { name: copy.accept })).not.toBeNull();
    expect(screen.getByRole('button', { name: copy.later })).not.toBeNull();
    expect(document.activeElement).toBe(document.body);
    // Shown once: it is already retired for this account and device.
    expect(quietHintRetired(ME, SPACE, GARDEN_WIR_HINT_ID)).toBe(true);
    expect(localStorage.getItem(quietHintKey(ME, SPACE))).toContain(
      GARDEN_WIR_HINT_ID,
    );
  });

  it('appears after about 20 s of active time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = services();
    setup(api);
    await waitFor(() => expect(api.loadPreferences).toHaveBeenCalled());
    await act(async () => {
      vi.advanceTimersByTime(GARDEN_WIR_HINT_ACTIVE_MS - 2_000);
    });
    expect(offer()).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(3_000);
    });
    await waitFor(() => expect(offer()).not.toBeNull());
  });

  it('stays away when the garden is already on Wir', async () => {
    const api = services({
      preferences: {
        items: [{ moduleKey: 'shared_garden', visible: true }],
      } as DashboardModulePreferenceList,
    });
    setup(api, 1);
    await waitFor(() => expect(api.loadPreferences).toHaveBeenCalled());
    await new Promise((resolve) =>
      setTimeout(resolve, GARDEN_WIR_HINT_SETTLE_MS + 100),
    );
    expect(offer()).toBeNull();
  });

  it('never reaches Free: no preference read and no offer', async () => {
    const api = services({ capabilities: ['core'] });
    setup(api, 1);
    await waitFor(() => expect(api.loadEntitlement).toHaveBeenCalled());
    await new Promise((resolve) =>
      setTimeout(resolve, GARDEN_WIR_HINT_SETTLE_MS + 100),
    );
    expect(api.loadPreferences).not.toHaveBeenCalled();
    expect(offer()).toBeNull();
  });

  it('retires for good after the decline action', async () => {
    const api = services();
    setup(api, 1);
    await waitFor(() => expect(offer()).not.toBeNull(), { timeout: 3_000 });
    fireEvent.click(screen.getByRole('button', { name: copy.later }));
    await waitFor(() => expect(offer()).toBeNull());
    cleanup();
    resetQuietHintsForTests();
    const again = services();
    setup(again, 1);
    await new Promise((resolve) =>
      setTimeout(resolve, GARDEN_WIR_HINT_SETTLE_MS + 100),
    );
    expect(offer()).toBeNull();
    // A retired hint does not even read the preferences again.
    expect(again.loadPreferences).not.toHaveBeenCalled();
  });

  it('accepting writes the Wir preference and confirms with a way to Wir', async () => {
    const api = services();
    const { client } = setup(api, 1);
    await waitFor(() => expect(offer()).not.toBeNull(), { timeout: 3_000 });
    fireEvent.click(screen.getByRole('button', { name: copy.accept }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(copy.done),
    );
    expect(api.showOnWir).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: copy.toWir })).toHaveProperty(
      'pathname',
      '/today',
    );
    expect(
      client
        .getQueryData<DashboardModulePreferenceList>(
          dashboardPreferencesQueryKey(ME, SPACE),
        )
        ?.items.find((item) => item.moduleKey === 'shared_garden')?.visible,
    ).toBe(true);
    expect(quietHintRetired(ME, SPACE, GARDEN_WIR_HINT_ID)).toBe(true);
  });

  it('keeps the offer after a failed save, for now and a later visit', async () => {
    const api = services({
      showOnWir: async () => {
        throw new Error('offline');
      },
    });
    setup(api, 1);
    await waitFor(() => expect(offer()).not.toBeNull(), { timeout: 3_000 });
    fireEvent.click(screen.getByRole('button', { name: copy.accept }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(copy.failed),
    );
    expect(screen.getByRole('button', { name: copy.accept })).not.toBeNull();
    expect(quietHintRetired(ME, SPACE, GARDEN_WIR_HINT_ID)).toBe(false);
  });
});
