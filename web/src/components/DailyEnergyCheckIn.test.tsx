// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DailyCheckInsApi } from '../api/generated/apis/DailyCheckInsApi';
import type { DailyCheckInTodayView } from '../api/generated/models/DailyCheckInTodayView';
import { ClientProblemError } from '../client/problemDetails';
import dailyEnergy from '../i18n/locales/dailyEnergy';
import { DailyEnergyCheckIn } from './DailyEnergyCheckIn';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: true,
  });
});

function projection({
  own = null,
  partner = { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' } as const,
  energyEnabled = true,
}: {
  own?: number | null;
  partner?:
    | { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' }
    | { state: 'NO_CHECK_IN' }
    | { state: 'VISIBLE'; value: number };
  energyEnabled?: boolean;
} = {}): DailyCheckInTodayView {
  return {
    checkedOn: new Date('2026-09-21T00:00:00.000Z'),
    dailyContextTimezone: 'Europe/Berlin',
    own: { energyLevel: own, version: own === null ? 0 : 1 },
    energy: energyEnabled
      ? {
          visibilityMode: 'MUTUAL_REVEAL',
          partner,
        }
      : null,
  };
}

function rawResponse(value: DailyCheckInTodayView, etag: string) {
  return {
    raw: new Response(null, { status: 200, headers: { ETag: etag } }),
    value: async () => value,
  };
}

function renderEnergy(api: DailyCheckInsApi, spaceId = 'space-1') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <DailyEnergyCheckIn
        api={api}
        accountId="account-1"
        spaceId={spaceId}
        partnerName="Marie"
      />
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

describe('DailyEnergyCheckIn', () => {
  it('offers all ten discrete values and keeps a hidden partner value out of the partner state', async () => {
    const api = {
      getDailyCheckInTodayRaw: vi
        .fn()
        .mockResolvedValue(rawResponse(projection(), '"2026-09-21:absent"')),
    } as unknown as DailyCheckInsApi;

    renderEnergy(api);

    expect(await screen.findAllByRole('radio')).toHaveLength(10);
    expect(screen.getByRole('radio', { name: '10 Prozent' })).not.toBeNull();
    expect(screen.getByRole('radio', { name: '100 Prozent' })).not.toBeNull();

    const partnerState = screen.getByTestId('daily-energy-partner');
    expect(
      within(partnerState).getByText(dailyEnergy.hiddenTitle),
    ).not.toBeNull();
    expect(within(partnerState).queryByText('20 %')).toBeNull();
  });

  it('renders NO_CHECK_IN neutrally without inventing partner state', async () => {
    const api = {
      getDailyCheckInTodayRaw: vi.fn().mockResolvedValue(
        rawResponse(
          projection({
            own: 60,
            partner: { state: 'NO_CHECK_IN' },
          }),
          '"2026-09-21:check-in-1:1"',
        ),
      ),
    } as unknown as DailyCheckInsApi;

    renderEnergy(api);

    const partnerState = await screen.findByTestId('daily-energy-partner');
    expect(
      within(partnerState).getByText(dailyEnergy.noCheckIn),
    ).not.toBeNull();
    expect(within(partnerState).queryByText(/\d+ %/)).toBeNull();
  });

  it('writes with the current ETag and adopts the authoritative reveal response', async () => {
    const getDailyCheckInTodayRaw = vi
      .fn()
      .mockResolvedValue(rawResponse(projection(), '"2026-09-21:absent"'));
    const updateDailyCheckInTodayRaw = vi.fn().mockResolvedValue(
      rawResponse(
        projection({
          own: 70,
          partner: { state: 'VISIBLE', value: 20 },
        }),
        '"2026-09-21:check-in-1:1"',
      ),
    );
    const api = {
      getDailyCheckInTodayRaw,
      updateDailyCheckInTodayRaw,
    } as unknown as DailyCheckInsApi;

    renderEnergy(api);
    fireEvent.click(await screen.findByRole('radio', { name: '70 Prozent' }));

    await waitFor(() =>
      expect(updateDailyCheckInTodayRaw).toHaveBeenCalledWith({
        spaceId: 'space-1',
        ifMatch: '"2026-09-21:absent"',
        dailyCheckInUpdate: { energyLevel: 70 },
      }),
    );

    expect(await screen.findByText(dailyEnergy.ownLabel)).not.toBeNull();
    expect(screen.getByText('70 %')).not.toBeNull();
    expect(
      within(screen.getByTestId('daily-energy-partner')).getByText('20 %'),
    ).not.toBeNull();
  });

  it('changes an existing value and adopts the returned snapshot', async () => {
    const updateDailyCheckInTodayRaw = vi.fn().mockResolvedValue(
      rawResponse(
        projection({
          own: 80,
          partner: { state: 'VISIBLE', value: 40 },
        }),
        '"2026-09-21:check-in-1:4"',
      ),
    );
    const api = {
      getDailyCheckInTodayRaw: vi.fn().mockResolvedValue(
        rawResponse(
          projection({
            own: 60,
            partner: { state: 'VISIBLE', value: 40 },
          }),
          '"2026-09-21:check-in-1:3"',
        ),
      ),
      updateDailyCheckInTodayRaw,
    } as unknown as DailyCheckInsApi;

    renderEnergy(api);
    fireEvent.click(
      await screen.findByRole('button', { name: dailyEnergy.change }),
    );
    fireEvent.click(screen.getByRole('radio', { name: '80 Prozent' }));

    await waitFor(() =>
      expect(updateDailyCheckInTodayRaw).toHaveBeenCalledWith({
        spaceId: 'space-1',
        ifMatch: '"2026-09-21:check-in-1:3"',
        dailyCheckInUpdate: { energyLevel: 80 },
      }),
    );
    expect(await screen.findByText('80 %')).not.toBeNull();
  });

  it('clears an existing value using the latest validator', async () => {
    const updateDailyCheckInTodayRaw = vi.fn().mockResolvedValue(
      rawResponse(
        projection({
          own: null,
          partner: { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' },
        }),
        '"2026-09-21:absent"',
      ),
    );
    const api = {
      getDailyCheckInTodayRaw: vi.fn().mockResolvedValue(
        rawResponse(
          projection({
            own: 60,
            partner: { state: 'VISIBLE', value: 40 },
          }),
          '"2026-09-21:check-in-1:3"',
        ),
      ),
      updateDailyCheckInTodayRaw,
    } as unknown as DailyCheckInsApi;

    renderEnergy(api);
    fireEvent.click(
      await screen.findByRole('button', { name: dailyEnergy.remove }),
    );

    await waitFor(() =>
      expect(updateDailyCheckInTodayRaw).toHaveBeenCalledWith({
        spaceId: 'space-1',
        ifMatch: '"2026-09-21:check-in-1:3"',
        dailyCheckInUpdate: { energyLevel: null },
      }),
    );
    expect(await screen.findAllByRole('radio')).toHaveLength(10);
  });

  it('refetches a conflict instead of retrying the stale write', async () => {
    const getDailyCheckInTodayRaw = vi
      .fn()
      .mockResolvedValueOnce(
        rawResponse(
          projection({
            own: 60,
            partner: { state: 'VISIBLE', value: 40 },
          }),
          '"2026-09-21:check-in-1:1"',
        ),
      )
      .mockResolvedValue(
        rawResponse(
          projection({
            own: 80,
            partner: { state: 'VISIBLE', value: 40 },
          }),
          '"2026-09-21:check-in-1:2"',
        ),
      );
    const updateDailyCheckInTodayRaw = vi
      .fn()
      .mockRejectedValue(
        new ClientProblemError('conflict', 409, 'RESOURCE_VERSION_CONFLICT'),
      );
    const api = {
      getDailyCheckInTodayRaw,
      updateDailyCheckInTodayRaw,
    } as unknown as DailyCheckInsApi;

    renderEnergy(api);
    fireEvent.click(
      await screen.findByRole('button', { name: dailyEnergy.change }),
    );
    fireEvent.click(screen.getByRole('radio', { name: '70 Prozent' }));

    await waitFor(() =>
      expect(getDailyCheckInTodayRaw).toHaveBeenCalledTimes(2),
    );
    expect(updateDailyCheckInTodayRaw).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('80 %')).not.toBeNull();
  });

  it('fails closed and refreshes DailyCheckIn when a write reports the module disabled', async () => {
    const getDailyCheckInTodayRaw = vi
      .fn()
      .mockResolvedValueOnce(
        rawResponse(projection(), '"2026-09-21:absent"'),
      )
      .mockResolvedValue(
        rawResponse(
          projection({ energyEnabled: false }),
          '"2026-09-21:absent"',
        ),
      );
    const api = {
      getDailyCheckInTodayRaw,
      updateDailyCheckInTodayRaw: vi
        .fn()
        .mockRejectedValue(
          new ClientProblemError('permission', 403, 'SPACE_MODULE_DISABLED'),
        ),
    } as unknown as DailyCheckInsApi;

    renderEnergy(api);
    fireEvent.click(await screen.findByRole('radio', { name: '50 Prozent' }));

    await waitFor(() => {
      expect(screen.queryAllByRole('radio')).toHaveLength(0);
      expect(getDailyCheckInTodayRaw).toHaveBeenCalledTimes(2);
    });
  });

  it('never offers participation when the authoritative projection says Energy is disabled', async () => {
    const api = {
      getDailyCheckInTodayRaw: vi.fn().mockResolvedValue(
        rawResponse(
          projection({ own: 60, energyEnabled: false }),
          '"2026-09-21:check-in-1:3"',
        ),
      ),
    } as unknown as DailyCheckInsApi;

    renderEnergy(api);

    await waitFor(() => {
      expect(screen.queryAllByRole('radio')).toHaveLength(0);
      expect(screen.queryByRole('button', { name: dailyEnergy.change })).toBeNull();
      expect(screen.queryByTestId('daily-energy-partner')).toBeNull();
    });
  });

  it('does not present the cached partner projection while offline', async () => {
    const api = {
      getDailyCheckInTodayRaw: vi.fn().mockResolvedValue(
        rawResponse(
          projection({
            own: 60,
            partner: { state: 'VISIBLE', value: 40 },
          }),
          '"2026-09-21:check-in-1:1"',
        ),
      ),
    } as unknown as DailyCheckInsApi;

    renderEnergy(api);
    expect(
      within(await screen.findByTestId('daily-energy-partner')).getByText(
        '40 %',
      ),
    ).not.toBeNull();

    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    fireEvent(window, new Event('offline'));

    await waitFor(() => {
      expect(screen.queryByTestId('daily-energy-partner')).toBeNull();
    });
    expect(screen.getByText(dailyEnergy.unavailableOffline)).not.toBeNull();
  });
});
