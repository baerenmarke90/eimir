// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { GamesApi } from '../api/generated/apis/GamesApi';
import type { GardenView } from '../api/generated/models/GardenView';
import { gardenQueryKey } from '../client/garden';
import { ClientProblemError } from '../client/problemDetails';
import { spaceEntitlementQueryKey } from '../client/spaceEntitlement';
import games from '../i18n/locales/games';
import { WirGardenModule, wirGardenStatus } from './WirGardenModule';

const ME = 'me';
const PARTNER = 'partner';
const SPACE = 'space';
const copy = games.garden;
const DAY = new Date('2026-07-16T00:00:00Z');

function view(overrides: Partial<GardenView> = {}): GardenView {
  return {
    localDate: DAY,
    plants: [],
    incoming: null,
    sentToday: null,
    partnerSentToday: false,
    sharedToday: false,
    wateredToday: null,
    partnerWateredToday: null,
    offer: ['POPPY', 'BELLFLOWER', 'STARFLOWER'],
    sleeping: false,
    reunionOn: null,
    reunionToday: false,
    form: 'MEADOW',
    ...overrides,
  };
}

const plant = (
  id: string,
  slot: number,
  stage: number,
  senderId = PARTNER,
): GardenView['plants'][number] => ({
  id,
  species: 'STARFLOWER',
  words: null,
  senderId,
  sentOn: new Date('2026-07-08T00:00:00Z'),
  stage,
  slot,
});

function fill(template: string, values: Record<string, string> = {}) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, value),
    template,
  );
}

function setReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function renderModule({
  capabilities = ['games.couple'],
  garden = view(),
  visible = true,
  load,
}: {
  capabilities?: string[];
  garden?: GardenView;
  visible?: boolean;
  load?: GamesApi['getGarden'];
} = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const getGarden = vi.fn(load ?? (async () => garden));
  const getEntitlement = vi.fn(async () => ({
    tier: capabilities.length ? 'PREMIUM' : 'FREE',
    capabilities,
  }));
  const entitlementApi = {
    getSpaceEntitlementsApiV1SpacesSpaceIdEntitlementsGet: getEntitlement,
  } as unknown as EntitlementsApi;
  const result = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <WirGardenModule
          gamesApi={{ getGarden } as unknown as GamesApi}
          entitlementApi={entitlementApi}
          accountId={ME}
          spaceId={SPACE}
          partnerName="Alex"
          visible={visible}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, client, getGarden, getEntitlement };
}

afterEach(() => {
  cleanup();
});

describe('WirGardenModule', () => {
  it('renders nothing and reads no garden without the games capability', async () => {
    setReducedMotion(false);
    const { container, getGarden, getEntitlement } = renderModule({
      capabilities: ['daily.quote'],
    });
    await waitFor(() => expect(getEntitlement).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getGarden).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing and reads nothing while the person has not chosen it', async () => {
    setReducedMotion(false);
    const { container, getGarden, getEntitlement } = renderModule({
      visible: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getEntitlement).not.toHaveBeenCalled();
    expect(getGarden).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe('');
  });

  it('shows the live scene, one status line and a named link into the game', async () => {
    setReducedMotion(false);
    const { getGarden, client } = renderModule({
      garden: view({
        plants: [plant('p1', 0, 2), plant('p2', 1, 3, ME)],
        incoming: { ...plant('seed', 0, 0), slot: null },
      }),
    });
    const link = await screen.findByRole('link', {
      name: fill(copy.wir.openAria, { title: copy.title }),
    });
    expect(link.getAttribute('href')).toBe('/games/garden');
    expect(
      screen.getByRole('heading', { level: 2, name: copy.title }),
    ).not.toBeNull();
    const status = screen.getByText(fill(copy.arrivedTitle, { name: 'Alex' }));
    expect(link.getAttribute('aria-describedby')).toBe(status.id);

    const scene = screen.getByTestId('garden-scene-preview');
    expect(scene.getAttribute('aria-hidden')).toBe('true');
    expect(scene.classList.contains('is-lively')).toBe(true);
    expect(scene.classList.contains('is-preview')).toBe(true);
    // Read-only: no plant or visitor targets inside the link.
    expect(scene.querySelector('[role="button"]')).toBeNull();
    expect(scene.querySelector('[tabindex]')).toBeNull();
    // Shares the game's cache entry, without the game's live polling.
    expect(getGarden).toHaveBeenCalledWith(
      { spaceId: SPACE },
      expect.anything(),
    );
    const query = client
      .getQueryCache()
      .find({ queryKey: gardenQueryKey(ME, SPACE) });
    expect(query?.state.data).toBeDefined();
    expect(
      query?.observers.some(
        (observer) => observer.options.refetchInterval !== undefined,
      ),
    ).toBe(false);
  });

  it('uses the couple garden name as the title', async () => {
    setReducedMotion(false);
    renderModule({
      garden: view({ name: 'Unser Eck', plants: [plant('p1', 0, 1)] }),
    });
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Unser Eck' }),
    ).not.toBeNull();
    expect(
      screen.getByRole('link', {
        name: fill(copy.wir.openAria, { title: 'Unser Eck' }),
      }),
    ).not.toBeNull();
  });

  it('invites gently to the first seed in an empty garden', async () => {
    setReducedMotion(false);
    renderModule({ garden: view() });
    expect(await screen.findByText(copy.wir.empty)).not.toBeNull();
  });

  it('stops the idle scene motion with reduced motion', async () => {
    setReducedMotion(true);
    renderModule({ garden: view({ plants: [plant('p1', 0, 3)] }) });
    await screen.findByRole('link');
    const scene = screen.getByTestId('garden-scene-preview');
    expect(scene.classList.contains('is-lively')).toBe(false);
  });

  it('shows the module placeholder while the garden loads', async () => {
    setReducedMotion(false);
    const { container } = renderModule({
      load: () => new Promise<GardenView>(() => undefined),
    });
    await waitFor(() =>
      expect(
        container.querySelector(
          '.today-module-placeholder[data-kind="shared-garden"]',
        ),
      ).not.toBeNull(),
    );
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('is quietly omitted after a failed read and withdraws a denied capability', async () => {
    setReducedMotion(false);
    const { container, client } = renderModule({
      load: async () => {
        throw new ClientProblemError(
          'permission',
          403,
          'PREMIUM_ENTITLEMENT_REQUIRED',
        );
      },
    });
    await waitFor(() =>
      expect(
        client.getQueryData<{ capabilities: string[] }>(
          spaceEntitlementQueryKey(ME, SPACE),
        )?.capabilities,
      ).toEqual([]),
    );
    expect(container.innerHTML).toBe('');
  });
});

describe('wirGardenStatus', () => {
  const t = (key: string, values?: Record<string, string>) => {
    const path = key.replace(/^games\.garden\./, '').split('.');
    // biome-ignore lint/suspicious/noExplicitAny: walking the nested resource
    let value: any = copy;
    for (const segment of path) value = value?.[segment];
    return fill(String(value), values);
  };
  const status = (garden: GardenView) =>
    wirGardenStatus(garden, 'Alex', t as never);

  it('names what happened today without counters or reminders', () => {
    expect(status(view({ sharedToday: true }))).toBe(copy.sharedTitle);
    expect(
      status(
        view({
          plants: [plant('p1', 0, 1), plant('p2', 1, 1, ME)],
          wateredToday: 'p1',
          partnerWateredToday: 'p2',
        }),
      ),
    ).toBe(copy.wir.bothWatered);
    expect(
      status(view({ plants: [plant('p1', 0, 1)], partnerWateredToday: 'p1' })),
    ).toBe(
      fill(copy.partnerWatered, {
        name: 'Alex',
        species: copy.species.STARFLOWER.name,
      }),
    );
    expect(
      status(view({ sentToday: { ...plant('s', 0, 0, ME), slot: null } })),
    ).toBe(fill(copy.waitingTitle, { name: 'Alex' }));
    expect(status(view({ sleeping: true, plants: [plant('p1', 0, 1)] }))).toBe(
      copy.wir.resting,
    );
    expect(status(view({ plants: [plant('p1', 0, 1)] }))).toBe(
      copy.growth.forms.MEADOW,
    );
    for (const text of [
      copy.wir.bothWatered,
      copy.wir.resting,
      copy.wir.empty,
    ]) {
      expect(text).not.toMatch(/\d|verpasst|vergessen|Serie/);
    }
  });
});
