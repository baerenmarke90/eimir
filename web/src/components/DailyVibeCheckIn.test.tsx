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
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DailyCheckInsApi } from '../api/generated/apis/DailyCheckInsApi';
import type { DailyCheckInTodayView } from '../api/generated/models/DailyCheckInTodayView';
import type { DailyVibe } from '../api/generated/models/DailyVibe';
import { ClientProblemError } from '../client/problemDetails';
import dailyVibe from '../i18n/locales/dailyVibe';
import { DailyVibeCheckIn } from './DailyVibeCheckIn';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: true,
  });
});

type VibePartner =
  | { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' }
  | { state: 'NO_CHECK_IN' }
  | { state: 'VISIBLE'; value: DailyVibe };

function projection({
  ownVibe = null,
  ownEnergy = 60,
  partner = { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' } as const,
  vibeEnabled = true,
  vibeVisibilityMode = 'MUTUAL_REVEAL' as const,
  energyPartner = { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' } as const,
}: {
  ownVibe?: DailyVibe | null;
  ownEnergy?: number | null;
  partner?: VibePartner;
  vibeEnabled?: boolean;
  vibeVisibilityMode?: 'IMMEDIATE' | 'MUTUAL_REVEAL';
  energyPartner?:
    | { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' }
    | { state: 'NO_CHECK_IN' }
    | { state: 'VISIBLE'; value: number };
} = {}): DailyCheckInTodayView {
  return {
    checkedOn: new Date('2026-09-21T00:00:00.000Z'),
    dailyContextTimezone: 'Europe/Berlin',
    own: {
      energyLevel: ownEnergy,
      vibe: ownVibe,
      version: ownVibe === null && ownEnergy === null ? 0 : 1,
    },
    energy: {
      visibilityMode: 'MUTUAL_REVEAL',
      partner: energyPartner,
    },
    vibe: vibeEnabled
      ? {
          visibilityMode: vibeVisibilityMode,
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

function renderVibe(
  api: DailyCheckInsApi,
  {
    accountId = 'account-1',
    spaceId = 'space-1',
    configuredEnabled = true,
  }: {
    accountId?: string;
    spaceId?: string;
    configuredEnabled?: boolean;
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <DailyVibeCheckIn
        api={api}
        accountId={accountId}
        spaceId={spaceId}
        partnerName="Marie"
        configuredEnabled={configuredEnabled}
      />
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

async function openVibeSheet(name: string = dailyVibe.chooseAria) {
  fireEvent.click(await screen.findByRole('button', { name }));
  return screen.getByRole('dialog', { name: dailyVibe.sheetTitle });
}

function changeAria(value: string): string {
  return dailyVibe.changeAria.replace('{{value}}', value);
}

describe('DailyVibeCheckIn', () => {
  it('offers all six semantic values and keeps Mutual Reveal structurally neutral', async () => {
    const api = {
      getDailyCheckInTodayRaw: vi
        .fn()
        .mockResolvedValue(rawResponse(projection(), '"today:1"')),
    } as unknown as DailyCheckInsApi;

    renderVibe(api);
    const partner = await screen.findByTestId('daily-vibe-partner');
    expect(partner.getAttribute('data-state')).toBe(
      'HIDDEN_UNTIL_SELF_CHECK_IN',
    );
    expect(within(partner).getByText(dailyVibe.partnerHidden)).not.toBeNull();
    expect(partner.textContent).not.toContain('Anstrengender Tag');

    const dialog = await openVibeSheet();
    for (const label of Object.values(dailyVibe.values)) {
      expect(
        within(dialog).getByRole('button', { name: label }),
      ).not.toBeNull();
    }
  });

  it('sets Vibe with the shared full-owner ETag and never patches Energy', async () => {
    const update = vi.fn().mockResolvedValue(
      rawResponse(
        projection({
          ownVibe: 'GOOD',
          ownEnergy: 60,
          partner: { state: 'VISIBLE', value: 'STRESSED' },
          energyPartner: { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' },
        }),
        '"today:2"',
      ),
    );
    const api = {
      getDailyCheckInTodayRaw: vi
        .fn()
        .mockResolvedValue(
          rawResponse(projection({ ownEnergy: 60 }), '"today:1"'),
        ),
      updateDailyCheckInTodayRaw: update,
    } as unknown as DailyCheckInsApi;

    renderVibe(api);
    const dialog = await openVibeSheet();
    fireEvent.click(
      within(dialog).getByRole('button', { name: dailyVibe.values.GOOD }),
    );

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        spaceId: 'space-1',
        ifMatch: '"today:1"',
        dailyCheckInUpdate: { vibe: 'GOOD' },
      }),
    );
    expect(
      await screen.findByRole('button', {
        name: changeAria(dailyVibe.values.GOOD),
      }),
    ).not.toBeNull();
    expect(
      within(screen.getByTestId('daily-vibe-partner')).getByText(
        dailyVibe.values.STRESSED,
      ),
    ).not.toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Marie');
  });

  it('changes and removes only the Vibe dimension', async () => {
    const update = vi
      .fn()
      .mockResolvedValueOnce(
        rawResponse(
          projection({
            ownVibe: 'NEEDS_SPACE',
            partner: { state: 'VISIBLE', value: 'GOOD' },
          }),
          '"today:2"',
        ),
      )
      .mockResolvedValueOnce(
        rawResponse(
          projection({
            ownVibe: null,
            partner: { state: 'HIDDEN_UNTIL_SELF_CHECK_IN' },
          }),
          '"today:3"',
        ),
      );
    const api = {
      getDailyCheckInTodayRaw: vi.fn().mockResolvedValue(
        rawResponse(
          projection({
            ownVibe: 'OKAY',
            partner: { state: 'VISIBLE', value: 'GOOD' },
          }),
          '"today:1"',
        ),
      ),
      updateDailyCheckInTodayRaw: update,
    } as unknown as DailyCheckInsApi;

    renderVibe(api);
    let dialog = await openVibeSheet(changeAria(dailyVibe.values.OKAY));
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: dailyVibe.values.NEEDS_SPACE,
      }),
    );
    await screen.findByRole('button', {
      name: changeAria(dailyVibe.values.NEEDS_SPACE),
    });

    dialog = await openVibeSheet(changeAria(dailyVibe.values.NEEDS_SPACE));
    fireEvent.click(
      within(dialog).getByRole('button', { name: dailyVibe.remove }),
    );

    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[0][0].dailyCheckInUpdate).toEqual({
      vibe: 'NEEDS_SPACE',
    });
    expect(update.mock.calls[1][0].dailyCheckInUpdate).toEqual({ vibe: null });
    expect(
      await screen.findByRole('button', { name: dailyVibe.chooseAria }),
    ).not.toBeNull();
  });

  it('refetches a stale ETag conflict without retrying the mutation', async () => {
    const getToday = vi
      .fn()
      .mockResolvedValueOnce(
        rawResponse(projection({ ownVibe: 'GOOD' }), '"today:1"'),
      )
      .mockResolvedValue(
        rawResponse(projection({ ownVibe: 'SAD' }), '"today:2"'),
      );
    const update = vi
      .fn()
      .mockRejectedValue(
        new ClientProblemError('conflict', 409, 'RESOURCE_VERSION_CONFLICT'),
      );
    const api = {
      getDailyCheckInTodayRaw: getToday,
      updateDailyCheckInTodayRaw: update,
    } as unknown as DailyCheckInsApi;

    renderVibe(api);
    const dialog = await openVibeSheet(changeAria(dailyVibe.values.GOOD));
    fireEvent.click(
      within(dialog).getByRole('button', { name: dailyVibe.values.STRESSED }),
    );

    await waitFor(() => expect(getToday).toHaveBeenCalledTimes(2));
    expect(update).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole('button', {
        name: changeAria(dailyVibe.values.SAD),
      }),
    ).not.toBeNull();
  });

  it('shows a save error without weakening the current snapshot', async () => {
    const api = {
      getDailyCheckInTodayRaw: vi
        .fn()
        .mockResolvedValue(rawResponse(projection(), '"today:1"')),
      updateDailyCheckInTodayRaw: vi
        .fn()
        .mockRejectedValue(new ClientProblemError('server', 500, 'BROKEN')),
    } as unknown as DailyCheckInsApi;

    renderVibe(api);
    const dialog = await openVibeSheet();
    fireEvent.click(
      within(dialog).getByRole('button', { name: dailyVibe.values.SAD }),
    );
    expect(await screen.findByText(dailyVibe.saveError)).not.toBeNull();
    expect(
      screen.getByTestId('daily-vibe-partner').getAttribute('data-state'),
    ).toBe('HIDDEN_UNTIL_SELF_CHECK_IN');
  });

  it('renders IMMEDIATE NO_CHECK_IN and VISIBLE projections without technical enums', async () => {
    const apiNo = {
      getDailyCheckInTodayRaw: vi.fn().mockResolvedValue(
        rawResponse(
          projection({
            partner: { state: 'NO_CHECK_IN' },
            vibeVisibilityMode: 'IMMEDIATE',
          }),
          '"today:1"',
        ),
      ),
    } as unknown as DailyCheckInsApi;
    const first = renderVibe(apiNo);
    expect(
      within(await screen.findByTestId('daily-vibe-partner')).getByText(
        dailyVibe.noCheckIn,
      ),
    ).not.toBeNull();
    first.unmount();

    const apiVisible = {
      getDailyCheckInTodayRaw: vi.fn().mockResolvedValue(
        rawResponse(
          projection({
            partner: { state: 'VISIBLE', value: 'NEEDS_CONNECTION' },
            vibeVisibilityMode: 'IMMEDIATE',
          }),
          '"today:1"',
        ),
      ),
    } as unknown as DailyCheckInsApi;
    renderVibe(apiVisible);
    expect(
      within(await screen.findByTestId('daily-vibe-partner')).getByText(
        dailyVibe.values.NEEDS_CONNECTION,
      ),
    ).not.toBeNull();
    expect(document.body.textContent).not.toContain('NEEDS_CONNECTION');
  });

  it('does not query or render when Vibe is disabled by configuration', () => {
    const getDailyCheckInTodayRaw = vi.fn();
    const api = {
      getDailyCheckInTodayRaw,
    } as unknown as DailyCheckInsApi;

    renderVibe(api, { configuredEnabled: false });

    expect(screen.queryByTestId('daily-vibe-checkin')).toBeNull();
    expect(screen.queryByTestId('daily-vibe-disabled-clear')).toBeNull();
    expect(getDailyCheckInTodayRaw).not.toHaveBeenCalled();
  });

  it('drops the partner projection while offline instead of replaying it as today', async () => {
    const api = {
      getDailyCheckInTodayRaw: vi.fn().mockResolvedValue(
        rawResponse(
          projection({
            ownVibe: 'GOOD',
            partner: { state: 'VISIBLE', value: 'STRESSED' },
          }),
          '"today:1"',
        ),
      ),
    } as unknown as DailyCheckInsApi;

    renderVibe(api);
    await screen.findByText(dailyVibe.values.STRESSED);
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    fireEvent(window, new Event('offline'));

    await waitFor(() => {
      expect(screen.queryByTestId('daily-vibe-partner')).toBeNull();
      expect(screen.getByText(dailyVibe.unavailableOffline)).not.toBeNull();
    });
  });
});
