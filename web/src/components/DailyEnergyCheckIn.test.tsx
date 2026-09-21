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
    own: { energyLevel: own, vibe: null, version: own === null ? 0 : 1 },
    energy: energyEnabled
      ? {
          visibilityMode: 'MUTUAL_REVEAL',
          partner,
        }
      : null,
    vibe: null,
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

async function openUnsetEnergy() {
  const badge = await screen.findByRole('button', {
    name: dailyEnergy.badgeAriaEmpty,
  });
  fireEvent.click(badge);
  return screen.getByRole('slider', { name: dailyEnergy.selectLegend });
}

function energyBadgeAriaValue(value: number): string {
  return dailyEnergy.badgeAriaValue.replace('{{value}}', String(value));
}

async function openSetEnergy(value: number) {
  const badge = await screen.findByRole('button', {
    name: energyBadgeAriaValue(value),
  });
  fireEvent.click(badge);
  return screen.getByRole('slider', { name: dailyEnergy.changeLegend });
}

function setSlider(slider: HTMLElement, value: number) {
  fireEvent.change(slider, { target: { value: String(value) } });
  fireEvent.blur(slider);
}

describe('DailyEnergyCheckIn', () => {
  it('keeps Daily Energy compact until the avatar battery is opened', async () => {
    const api = {
      getDailyCheckInTodayRaw: vi
        .fn()
        .mockResolvedValue(rawResponse(projection(), '"2026-09-21:absent"')),
    } as unknown as DailyCheckInsApi;

    renderEnergy(api);

    expect(
      await screen.findByRole('button', { name: dailyEnergy.badgeAriaEmpty }),
    ).not.toBeNull();
    expect(screen.queryByRole('slider')).toBeNull();

    const slider = await openUnsetEnergy();
    expect(slider.getAttribute('min')).toBe('10');
    expect(slider.getAttribute('max')).toBe('100');
    expect(slider.getAttribute('step')).toBe('10');
    expect((slider as HTMLInputElement).value).toBe('50');

    const partnerState = screen.getByTestId('daily-energy-partner');
    expect(
      within(partnerState).getByText(dailyEnergy.hiddenTitle),
    ).not.toBeNull();
    expect(within(partnerState).queryByText('20 %')).toBeNull();
  });

  it('does not save the neutral slider position if the user only opens and leaves', async () => {
    const updateDailyCheckInTodayRaw = vi.fn();
    const api = {
      getDailyCheckInTodayRaw: vi
        .fn()
        .mockResolvedValue(rawResponse(projection(), '"2026-09-21:absent"')),
      updateDailyCheckInTodayRaw,
    } as unknown as DailyCheckInsApi;

    const slider = await (async () => {
      renderEnergy(api);
      return openUnsetEnergy();
    })();

    fireEvent.blur(slider);
    expect(updateDailyCheckInTodayRaw).not.toHaveBeenCalled();
  });

  it('renders NO_CHECK_IN neutrally inside the popover without inventing partner state', async () => {
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
    await openSetEnergy(60);

    const partnerState = screen.getByTestId('daily-energy-partner');
    expect(
      within(partnerState).getByText(dailyEnergy.noCheckIn),
    ).not.toBeNull();
    expect(within(partnerState).queryByText(/\d+ %/)).toBeNull();
  });

  it('writes one slider selection with the current ETag and adopts the reveal response', async () => {
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
    const slider = await openUnsetEnergy();
    setSlider(slider, 70);

    await waitFor(() =>
      expect(updateDailyCheckInTodayRaw).toHaveBeenCalledWith({
        spaceId: 'space-1',
        ifMatch: '"2026-09-21:absent"',
        dailyCheckInUpdate: { energyLevel: 70 },
      }),
    );
    expect(updateDailyCheckInTodayRaw).toHaveBeenCalledTimes(1);

    expect(
      await screen.findByRole('button', {
        name: energyBadgeAriaValue(70),
      }),
    ).not.toBeNull();
    expect(
      within(screen.getByTestId('daily-energy-partner')).getByText('20 %'),
    ).not.toBeNull();
  });

  it('changes an existing value using the compact slider', async () => {
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
    const slider = await openSetEnergy(60);
    setSlider(slider, 80);

    await waitFor(() =>
      expect(updateDailyCheckInTodayRaw).toHaveBeenCalledWith({
        spaceId: 'space-1',
        ifMatch: '"2026-09-21:check-in-1:3"',
        dailyCheckInUpdate: { energyLevel: 80 },
      }),
    );
    expect(
      await screen.findByRole('button', {
        name: energyBadgeAriaValue(80),
      }),
    ).not.toBeNull();
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
    await openSetEnergy(60);
    fireEvent.click(screen.getByRole('button', { name: dailyEnergy.remove }));

    await waitFor(() =>
      expect(updateDailyCheckInTodayRaw).toHaveBeenCalledWith({
        spaceId: 'space-1',
        ifMatch: '"2026-09-21:check-in-1:3"',
        dailyCheckInUpdate: { energyLevel: null },
      }),
    );
    expect(
      await screen.findByRole('button', { name: dailyEnergy.badgeAriaEmpty }),
    ).not.toBeNull();
  });

  it('refetches a conflict instead of retrying the stale slider write', async () => {
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
    const slider = await openSetEnergy(60);
    setSlider(slider, 70);

    await waitFor(() =>
      expect(getDailyCheckInTodayRaw).toHaveBeenCalledTimes(2),
    );
    expect(updateDailyCheckInTodayRaw).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole('button', {
        name: energyBadgeAriaValue(80),
      }),
    ).not.toBeNull();
  });

  it('fails closed and refreshes DailyCheckIn when a slider write reports the module disabled', async () => {
    const getDailyCheckInTodayRaw = vi
      .fn()
      .mockResolvedValueOnce(rawResponse(projection(), '"2026-09-21:absent"'))
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
    const slider = await openUnsetEnergy();
    setSlider(slider, 60);

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: dailyEnergy.badgeAriaEmpty }),
      ).toBeNull();
      expect(getDailyCheckInTodayRaw).toHaveBeenCalledTimes(2);
    });
  });

  it('never offers participation when the authoritative projection says Energy is disabled', async () => {
    const api = {
      getDailyCheckInTodayRaw: vi
        .fn()
        .mockResolvedValue(
          rawResponse(
            projection({ own: 60, energyEnabled: false }),
            '"2026-09-21:check-in-1:3"',
          ),
        ),
    } as unknown as DailyCheckInsApi;

    renderEnergy(api);

    await waitFor(() => {
      expect(screen.queryByRole('slider')).toBeNull();
      expect(document.querySelector('.daily-energy-badge')).toBeNull();
      expect(screen.queryByTestId('daily-energy-partner')).toBeNull();
    });
  });

  it('drops the partner projection while offline instead of replaying stale energy', async () => {
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
    await openSetEnergy(60);
    expect(
      within(screen.getByTestId('daily-energy-partner')).getByText('40 %'),
    ).not.toBeNull();

    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    fireEvent(window, new Event('offline'));

    await waitFor(() => {
      expect(screen.queryByTestId('daily-energy-partner')).toBeNull();
      expect(screen.queryByTestId('daily-energy-popover')).toBeNull();
    });
    const offlineBadge = screen.getByRole('button', {
      name: dailyEnergy.unavailableOffline,
    }) as HTMLButtonElement;
    expect(offlineBadge.disabled).toBe(true);
  });
});
