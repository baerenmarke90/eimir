// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EntitlementsApi } from '../api/generated/apis/EntitlementsApi';
import type { GamesApi } from '../api/generated/apis/GamesApi';
import type { WaitingGames } from '../api/generated/models/WaitingGames';
import { dashboardQueryKey } from '../client/dashboardQueries';
import { ClientProblemError } from '../client/problemDetails';
import {
  GAMES_GARDEN_ROUTE,
  GAMES_HEART_HUNT_ROUTE,
  GAMES_WHO_OF_US_ROUTE,
} from '../client/routes';
import { spaceEntitlementQueryKey } from '../client/spaceEntitlement';
import { i18n } from '../i18n';
import {
  WirWaitingGamesModule,
  waitingGamesQueryKey,
} from './WirWaitingGamesModule';

const ME = 'me';
const SPACE = 'space';
const SINCE = new Date('2026-11-21T10:00:00Z');

function renderModule({
  capabilities = ['games.couple'],
  waiting = { items: [] },
  visible = true,
  load,
}: {
  capabilities?: string[];
  waiting?: WaitingGames;
  visible?: boolean;
  load?: GamesApi['getWaitingGames'];
} = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const getWaitingGames = vi.fn(load ?? (async () => waiting));
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
        <WirWaitingGamesModule
          gamesApi={{ getWaitingGames } as unknown as GamesApi}
          entitlementApi={entitlementApi}
          accountId={ME}
          spaceId={SPACE}
          partnerName="Alex"
          visible={visible}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, client, getWaitingGames, getEntitlement };
}

afterEach(() => {
  cleanup();
});

describe('WirWaitingGamesModule', () => {
  it('renders nothing and reads nothing without the games capability', async () => {
    const { container, getWaitingGames, getEntitlement } = renderModule({
      capabilities: ['daily.quote'],
    });
    await waitFor(() => expect(getEntitlement).toHaveBeenCalledTimes(1));
    expect(getWaitingGames).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing and reads nothing when hidden in Settings', async () => {
    const { container, getWaitingGames } = renderModule({ visible: false });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getWaitingGames).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe('');
  });

  it('stays hidden while nothing waits', async () => {
    const { container, getWaitingGames } = renderModule();
    await waitFor(() => expect(getWaitingGames).toHaveBeenCalledTimes(1));
    expect(container.innerHTML).toBe('');
  });

  it('shows one row per waiting game, each a single way into its game', async () => {
    renderModule({
      waiting: {
        items: [
          { game: 'HEART_HUNT', reason: 'SEEK', since: SINCE },
          { game: 'WHO_OF_US', reason: 'ANSWER', since: SINCE },
          { game: 'GARDEN_BOUQUET', reason: 'OPEN_BOUQUET', since: SINCE },
        ],
      },
    });
    const section = await screen.findByRole('region', {
      name: i18n.t('games.waiting.title'),
    });
    const links = section.querySelectorAll('a');
    expect([...links].map((link) => link.getAttribute('href'))).toEqual([
      GAMES_HEART_HUNT_ROUTE,
      GAMES_WHO_OF_US_ROUTE,
      GAMES_GARDEN_ROUTE,
    ]);
    const heartHunt = screen.getByRole('link', {
      name: new RegExp(i18n.t('games.entries.heartHunt.title')),
    });
    expect(heartHunt.textContent).toContain(
      i18n.t('games.waiting.reasons.HEART_HUNT', { name: 'Alex' }),
    );
    expect(section.textContent).toContain(
      i18n.t('games.waiting.reasons.GARDEN_BOUQUET', { name: 'Alex' }),
    );
  });

  it('refreshes with every Wir refresh because it lives under the Dashboard key', async () => {
    const { client, getWaitingGames } = renderModule({
      waiting: {
        items: [{ game: 'PICTURE_PING_PONG', reason: 'DRAW', since: SINCE }],
      },
    });
    await screen.findByRole('region', { name: i18n.t('games.waiting.title') });
    expect(waitingGamesQueryKey(ME, SPACE).slice(0, 3)).toEqual(
      dashboardQueryKey(SPACE),
    );
    getWaitingGames.mockResolvedValueOnce({ items: [] });
    await client.invalidateQueries({ queryKey: dashboardQueryKey(SPACE) });
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: i18n.t('games.waiting.title') }),
      ).toBeNull(),
    );
    expect(getWaitingGames).toHaveBeenCalledTimes(2);
  });

  it('is quietly omitted after a failed read and withdraws a denied capability', async () => {
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
